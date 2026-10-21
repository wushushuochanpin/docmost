import { Worker } from 'bullmq';
import { writeFile, rm } from 'node:fs/promises';
import { QueueName } from '../queue/constants';
import { BackupProcessor } from './processors/backup.processor';
import { createBackupRuntime, verifyBackupCredential } from './backup-runtime';
import { redactBackupError } from './backup-error';

async function main() {
  const runtime = createBackupRuntime();
  await verifyBackupCredential(runtime.environment);
  const processor = new BackupProcessor(runtime.jobs, runtime.packager);
  const worker = new Worker(
    QueueName.BACKUP_QUEUE,
    (job) => processor.process(job),
    {
      connection: runtime.connection,
      concurrency: 1,
    },
  );
  worker.on('error', (error) =>
    console.error(
      redactBackupError(error.message, process.env.BACKUP_DATABASE_URL),
    ),
  );
  await worker.waitUntilReady();
  const heartbeat = '/tmp/docmost-backup-worker-ready';
  let lastBackupHealth: string | undefined;
  let lastBackupHealthCheck = 0;
  const tick = async () => {
    try {
      await (await worker.client).ping();
      await runtime.db.selectFrom('backupJobs').select('id').limit(1).execute();
      await writeFile(heartbeat, String(Date.now()), { mode: 0o600 });
      if (Date.now() - lastBackupHealthCheck >= 60000) {
        const latest = await runtime.db
          .selectFrom('backupJobs')
          .select(['id', 'endedAt'])
          .where('status', '=', 'success')
          .where('artifactDeletedAt', 'is', null)
          .orderBy('endedAt', 'desc')
          .executeTakeFirst();
        const maxAge = Number(process.env.BACKUP_MAX_AGE_HOURS || 24);
        const overdue =
          !latest?.endedAt ||
          Date.now() - new Date(latest.endedAt).getTime() >
            (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 24) * 3600000;
        const health = overdue ? 'BACKUP_OVERDUE' : 'BACKUP_HEALTHY';
        if (health !== lastBackupHealth) {
          const event = JSON.stringify({
            level: overdue ? 'error' : 'info',
            event: health,
            lastSuccessfulJobId: latest?.id ?? null,
            lastSucceededAt: latest?.endedAt ?? null,
          });
          if (overdue) console.error(event);
          else console.log(event);
          lastBackupHealth = health;
        }
        lastBackupHealthCheck = Date.now();
      }
    } catch {
      await rm(heartbeat, { force: true });
      console.error('BACKUP_WORKER_DEPENDENCY_UNAVAILABLE');
    }
  };
  await tick();
  const timer = setInterval(() => void tick(), 15000);
  console.log('Backup worker ready');
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    await rm(heartbeat, { force: true });
    await worker.close();
    await runtime.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

main().catch((error) => {
  console.error(
    redactBackupError(error.message, process.env.BACKUP_DATABASE_URL),
  );
  process.exit(1);
});
