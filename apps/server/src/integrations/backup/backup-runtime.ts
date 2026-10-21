import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { CamelCasePlugin, Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { Queue } from 'bullmq';
import { KyselyDB } from '../../database/types/kysely.types';
import { EnvironmentService } from '../environment/environment.service';
import { BackupArtifactStorageService } from './backup-artifact-storage.service';
import { BackupJobService } from './backup-job.service';
import { BackupPackageService } from './backup-package.service';
import { BackupError } from './backup-error';
import { QueueName } from '../queue/constants';
import { normalizePostgresUrl, parseRedisUrl } from '../../common/helpers';

// No AppModule, HTTP routes, migrations, collaboration or unrelated consumers.
export function createBackupRuntime() {
  const environment = new EnvironmentService(new ConfigService());
  if (!environment.getDatabaseURL())
    throw new BackupError('BACKUP_CONFIGURATION', 'DATABASE_URL is required');
  const connection = parseRedisUrl(environment.getRedisUrl());
  const db: KyselyDB = new Kysely({
    dialect: new PostgresJSDialect({
      postgres: postgres(normalizePostgresUrl(environment.getDatabaseURL()), {
        max: 2,
        onnotice: () => {},
      }),
    }),
    plugins: [new CamelCasePlugin()],
  });
  const queue = new Queue(QueueName.BACKUP_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  const artifacts = new BackupArtifactStorageService(environment);
  const jobs = new BackupJobService(db, queue, environment, artifacts);
  const packager = new BackupPackageService(environment, artifacts);
  return {
    environment,
    db,
    queue,
    connection,
    artifacts,
    jobs,
    packager,
    async close() {
      await queue.close();
      await db.destroy();
    },
  };
}

export async function verifyBackupCredential(
  environment: EnvironmentService,
): Promise<void> {
  const backupUrl = environment.getBackupDatabaseURL();
  if (!backupUrl)
    throw new BackupError(
      'BACKUP_CONFIGURATION',
      'Backup worker requires a dedicated BACKUP_DATABASE_URL',
    );
  let backup: URL, runtime: URL;
  try {
    backup = new URL(backupUrl);
    runtime = new URL(environment.getDatabaseURL());
    if (!['postgres:', 'postgresql:'].includes(backup.protocol))
      throw new Error();
  } catch {
    throw new BackupError(
      'BACKUP_CONFIGURATION',
      'Invalid backup database configuration',
    );
  }
  if (
    backup.username === runtime.username ||
    backup.hostname !== runtime.hostname ||
    (backup.port || '5432') !== (runtime.port || '5432') ||
    backup.pathname !== runtime.pathname
  ) {
    throw new BackupError(
      'BACKUP_CONFIGURATION',
      'Backup must use a distinct role on the application database',
    );
  }
  const sql = postgres(normalizePostgresUrl(backupUrl), {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const [role] =
      await sql`SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user`;
    if (
      role.rolsuper ||
      !role.rolbypassrls ||
      role.rolcreatedb ||
      role.rolcreaterole
    ) {
      throw new BackupError(
        'BACKUP_DATABASE_PERMISSION',
        'Backup role must be non-superuser, BYPASSRLS, NOCREATEDB and NOCREATEROLE',
      );
    }
    const invalid =
      await sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','m','S')
      AND (NOT has_table_privilege(current_user,c.oid,'SELECT') OR
        (c.relkind <> 'S' AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))`;
    if (invalid.length)
      throw new BackupError(
        'BACKUP_DATABASE_PERMISSION',
        'Backup role needs SELECT-only access to all public tables and sequences',
      );
  } finally {
    await sql.end();
  }
}
