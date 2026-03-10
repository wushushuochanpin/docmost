import { Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Readable } from 'stream';
import { EnvironmentService } from '../environment/environment.service';
import { S3Driver } from '../storage/drivers';
import { S3StorageConfig } from '../storage/interfaces';

export interface BackupArtifactLocalCopyMetadata {
  driver: 'local';
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupArtifactS3CopyMetadata {
  driver: 's3';
  bucket: string;
  key: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface BackupArtifactJobMetadata {
  artifactCopies?: {
    local?: BackupArtifactLocalCopyMetadata;
    s3?: BackupArtifactS3CopyMetadata;
  };
}

export interface BackupArtifactReadable {
  filename: string;
  source: 'local' | 's3';
  stream: Readable;
}

@Injectable()
export class BackupArtifactStorageService {
  private readonly logger = new Logger(BackupArtifactStorageService.name);

  constructor(private readonly environmentService: EnvironmentService) {}

  createMetadata(
    localArtifactPath: string,
    artifactSizeBytes: number,
  ): BackupArtifactJobMetadata {
    return {
      artifactCopies: {
        local: {
          driver: 'local',
          path: localArtifactPath,
          sizeBytes: artifactSizeBytes,
          createdAt: new Date().toISOString(),
        },
      },
    };
  }

  async attachRemoteReplica(
    metadata: BackupArtifactJobMetadata,
    localArtifactFullPath: string,
    workspaceId: string,
    artifactName: string,
    artifactSizeBytes: number,
  ): Promise<BackupArtifactJobMetadata> {
    const s3Copy = await this.uploadRemoteReplica(
      localArtifactFullPath,
      workspaceId,
      artifactName,
      artifactSizeBytes,
    );

    if (!s3Copy) {
      return metadata;
    }

    return {
      artifactCopies: {
        ...metadata.artifactCopies,
        s3: s3Copy,
      },
    };
  }

  async hasAvailableCopy(
    localArtifactPath: string,
    metadata: unknown,
  ): Promise<boolean> {
    if (
      await fs.pathExists(this.getLocalArtifactAbsolutePath(localArtifactPath))
    ) {
      return true;
    }

    const s3Copy = this.getS3Copy(metadata);
    if (!s3Copy) {
      return false;
    }

    const s3Driver = this.getS3Driver(false);
    if (!s3Driver) {
      return false;
    }

    try {
      return await s3Driver.exists(s3Copy.key);
    } catch (err) {
      this.logger.warn(
        `Failed to check remote backup artifact ${s3Copy.key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async openArtifact(
    localArtifactPath: string,
    metadata: unknown,
  ): Promise<BackupArtifactReadable | null> {
    const localArtifactFullPath =
      this.getLocalArtifactAbsolutePath(localArtifactPath);

    if (await fs.pathExists(localArtifactFullPath)) {
      return {
        filename: path.basename(localArtifactPath),
        source: 'local',
        stream: createReadStream(localArtifactFullPath),
      };
    }

    const s3Copy = this.getS3Copy(metadata);
    if (!s3Copy) {
      return null;
    }

    const s3Driver = this.getS3Driver(false);
    if (!s3Driver) {
      return null;
    }

    try {
      if (!(await s3Driver.exists(s3Copy.key))) {
        return null;
      }

      return {
        filename: path.posix.basename(s3Copy.key),
        source: 's3',
        stream: await s3Driver.readStream(s3Copy.key),
      };
    } catch (err) {
      this.logger.warn(
        `Failed to open remote backup artifact ${s3Copy.key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async deleteCopies(
    localArtifactPath: string,
    metadata: unknown,
  ): Promise<void> {
    const s3Copy = this.getS3Copy(metadata);
    if (s3Copy) {
      const s3Driver = this.getS3Driver(false);
      if (!s3Driver) {
        throw new Error(
          'Backup artifact has a remote COS/S3 replica, but S3 access is not configured.',
        );
      }

      if (await s3Driver.exists(s3Copy.key)) {
        await s3Driver.delete(s3Copy.key);
      }
    }

    await fs.remove(this.getLocalArtifactAbsolutePath(localArtifactPath));
  }

  private getLocalArtifactAbsolutePath(localArtifactPath: string): string {
    return path.join(
      this.environmentService.getBackupLocalPath(),
      localArtifactPath,
    );
  }

  private async uploadRemoteReplica(
    localArtifactFullPath: string,
    workspaceId: string,
    artifactName: string,
    artifactSizeBytes: number,
  ): Promise<BackupArtifactS3CopyMetadata | null> {
    if (!this.environmentService.isBackupS3Enabled()) {
      return null;
    }

    const s3Driver = this.getS3Driver(true);
    if (!s3Driver) {
      return null;
    }

    const key = this.buildRemoteArtifactKey(workspaceId, artifactName);
    const stream = createReadStream(localArtifactFullPath);

    try {
      await s3Driver.upload(key, stream);

      return {
        driver: 's3',
        bucket: this.environmentService.getAwsS3Bucket(),
        key,
        sizeBytes: artifactSizeBytes,
        uploadedAt: new Date().toISOString(),
      };
    } finally {
      stream.destroy();
    }
  }

  private buildRemoteArtifactKey(
    workspaceId: string,
    artifactName: string,
  ): string {
    const prefix = this.environmentService.getBackupS3Prefix();
    return [prefix, workspaceId, artifactName].filter(Boolean).join('/');
  }

  private getS3Driver(strict: boolean): S3Driver | null {
    const config = this.getS3Config(strict);
    return config ? new S3Driver(config) : null;
  }

  private getS3Config(strict: boolean): S3StorageConfig | null {
    const bucket = this.environmentService.getAwsS3Bucket();
    const endpoint = this.environmentService.getAwsS3Endpoint();
    const region = this.environmentService.getAwsS3Region();
    const accessKeyId = this.environmentService.getAwsS3AccessKeyId();
    const secretAccessKey = this.environmentService.getAwsS3SecretAccessKey();

    if (!bucket || !endpoint || !region) {
      if (!strict) {
        return null;
      }

      throw new Error(
        'BACKUP_S3_ENABLED requires AWS_S3_BUCKET, AWS_S3_ENDPOINT, and AWS_S3_REGION.',
      );
    }

    if (
      (accessKeyId && !secretAccessKey) ||
      (!accessKeyId && secretAccessKey)
    ) {
      if (!strict) {
        return null;
      }

      throw new Error(
        'AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY must be provided together for backup COS/S3 replicas.',
      );
    }

    const config: S3StorageConfig = {
      bucket,
      endpoint,
      region,
      baseUrl: this.environmentService.getAwsS3Url(),
      forcePathStyle: this.environmentService.getAwsS3ForcePathStyle(),
    };

    if (accessKeyId && secretAccessKey) {
      config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    return config;
  }

  private getS3Copy(metadata: unknown): BackupArtifactS3CopyMetadata | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const candidate = (metadata as BackupArtifactJobMetadata).artifactCopies
      ?.s3;
    if (
      !candidate ||
      typeof candidate.bucket !== 'string' ||
      typeof candidate.key !== 'string'
    ) {
      return null;
    }

    return candidate;
  }
}
