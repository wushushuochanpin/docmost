import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../environment/environment.service';
import { LOCAL_STORAGE_PATH } from '../../common/helpers';
import * as path from 'path';
import * as fs from 'fs-extra';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  BackupArtifactJobMetadata,
  BackupArtifactStorageService,
} from './backup-artifact-storage.service';

import { gzipProcess, backupDatabaseEnvironment } from './backup-process';
import { BackupError } from './backup-error';

const DOCMOST_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'),
).version as string;

// Prefer full path so backup works in containers where PATH may not include /usr/bin
const PG_DUMP_BIN = process.env.PG_DUMP_PATH || '/usr/bin/pg_dump';
const TAR_BIN = process.env.TAR_PATH || 'tar';

export interface BackupResult {
  artifactPath: string;
  artifactSizeBytes: number;
  metadata: BackupArtifactJobMetadata;
}

@Injectable()
export class BackupPackageService {
  private readonly logger = new Logger(BackupPackageService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly backupArtifactStorageService: BackupArtifactStorageService,
  ) {}

  async runBackup(workspaceId: string, jobId: string): Promise<BackupResult> {
    const backupRoot = this.environmentService.getBackupLocalPath();
    const databaseUrl = this.environmentService.getBackupDatabaseURL();
    const storageDriver = this.environmentService.getStorageDriver();

    if (!databaseUrl) {
      throw new BackupError(
        'BACKUP_CONFIGURATION',
        'Backup worker requires a dedicated BACKUP_DATABASE_URL',
      );
    }

    const tmpId = randomBytes(8).toString('hex');
    const workDir = path.join(tmpdir(), `docmost-backup-${tmpId}`);
    let artifactPathToCleanup: string | null = null;
    await fs.ensureDir(workDir);

    try {
      const dbDir = path.join(workDir, 'db');
      await fs.ensureDir(dbDir);
      const sqlGzPath = path.join(dbDir, 'docmost.sql.gz');

      await this.dumpDatabase(databaseUrl, sqlGzPath);

      if (storageDriver === 'local') {
        const storageDest = path.join(workDir, 'storage');
        await fs.ensureDir(storageDest);
        if (await fs.pathExists(LOCAL_STORAGE_PATH)) {
          await this.copyLocalStorage(LOCAL_STORAGE_PATH, storageDest);
        }
      }

      const metaDir = path.join(workDir, 'meta');
      await fs.ensureDir(metaDir);
      await fs.writeFile(
        path.join(metaDir, 'version.txt'),
        DOCMOST_VERSION,
        'utf8',
      );

      const manifest = {
        docmostVersion: DOCMOST_VERSION,
        createdAt: new Date().toISOString(),
        workspaceId,
        storageDriver,
        schemaVersion: 1,
        scope: 'database',
      };
      await fs.writeJson(path.join(workDir, 'manifest.json'), manifest, {
        spaces: 2,
      });

      const outDir = path.join(backupRoot, workspaceId);
      await fs.ensureDir(outDir);
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const artifactName = `backup-${workspaceId}-${timestamp}-${jobId}.tar.gz`;
      const artifactPath = path.join(outDir, artifactName);
      const artifactRelativePath = path.join(workspaceId, artifactName);
      artifactPathToCleanup = artifactPath;

      await this.createTarGz(workDir, artifactPath);

      const stat = await fs.stat(artifactPath);
      let metadata = this.backupArtifactStorageService.createMetadata(
        artifactRelativePath,
        stat.size,
      );

      metadata = await this.backupArtifactStorageService.attachRemoteReplica(
        metadata,
        artifactPath,
        workspaceId,
        artifactName,
        stat.size,
      );

      artifactPathToCleanup = null;
      return {
        artifactPath: artifactRelativePath,
        artifactSizeBytes: stat.size,
        metadata,
      };
    } catch (err) {
      if (artifactPathToCleanup) {
        await fs
          .remove(artifactPathToCleanup)
          .catch((cleanupErr) =>
            this.logger.warn(
              `Cleanup failed for incomplete backup artifact ${artifactPathToCleanup}: ${cleanupErr}`,
            ),
          );
      }
      throw err;
    } finally {
      await fs
        .remove(workDir)
        .catch((e) => this.logger.warn(`Cleanup temp dir failed: ${e}`));
    }
  }

  private async dumpDatabase(
    databaseUrl: string,
    outPath: string,
  ): Promise<void> {
    await gzipProcess(
      PG_DUMP_BIN,
      ['--format=plain', '--no-owner', '--no-privileges'],
      outPath,
      'BACKUP_DATABASE_EXPORT',
      backupDatabaseEnvironment(databaseUrl),
    );
  }

  private async copyLocalStorage(sourceDir: string, destDir: string) {
    const backupRoot = path.resolve(
      this.environmentService.getBackupLocalPath(),
    );

    await fs.copy(sourceDir, destDir, {
      filter: (src) => {
        const resolved = path.resolve(src);
        return (
          resolved !== backupRoot &&
          !resolved.startsWith(`${backupRoot}${path.sep}`)
        );
      },
    });
  }

  private async createTarGz(sourceDir: string, outPath: string): Promise<void> {
    await gzipProcess(
      TAR_BIN,
      ['-cf', '-', '-C', sourceDir, '.'],
      outPath,
      'BACKUP_ARCHIVE',
    );
  }
}
