import { createBackupRuntime } from './backup-runtime';
import { redactBackupError } from './backup-error';

async function main() {
  const runtime = createBackupRuntime();
  try {
    const workspace = await runtime.db
      .selectFrom('workspaces')
      .select('id')
      .orderBy('createdAt')
      .executeTakeFirst();
    if (!workspace)
      throw new Error('Backup verification requires an existing workspace');
    const job = await runtime.jobs.createManualJob(workspace.id, null, 'api');
    console.log(JSON.stringify({ backupJobId: job.id, status: 'pending' }));
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const current = await runtime.jobs.getJobWithTriggerer(
        workspace.id,
        job.id,
      );
      if (current?.status === 'failed')
        throw new Error(current.errorMessage || 'Backup failed');
      if (current?.status === 'success') {
        if (!current.artifactPath)
          throw new Error('Successful backup has no artifact');
        const verified = await runtime.artifacts.verifyCopies(
          current.artifactPath,
          current.metadata,
        );
        console.log(
          JSON.stringify({
            backupJobId: job.id,
            status: 'success',
            ...verified,
          }),
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Backup verification timed out');
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(
    redactBackupError(error.message, process.env.BACKUP_DATABASE_URL),
  );
  process.exit(1);
});
