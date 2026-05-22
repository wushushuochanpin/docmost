import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../queue/constants';
import { BackupJobService } from '../backup-job.service';
import { BackupPackageService } from '../backup-package.service';

interface IBackupJobPayload {
  jobId: string;
  workspaceId: string;
}

@Processor(QueueName.BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(
    private readonly backupJobService: BackupJobService,
    private readonly backupPackageService: BackupPackageService,
  ) {
    super();
  }

  private getAttempts(job: Job<IBackupJobPayload>): number {
    return typeof job.opts.attempts === 'number' && job.opts.attempts > 0
      ? job.opts.attempts
      : 1;
  }

  async process(job: Job<IBackupJobPayload>): Promise<void> {
    if (job.name !== QueueJob.BACKUP_JOB) return;

    const { jobId, workspaceId } = job.data;
    const startedAt = new Date();

    try {
      await this.backupJobService.updateJobStatus(jobId, 'running', {
        startedAt,
      });

      const result = await this.backupPackageService.runBackup(
        workspaceId,
        jobId,
      );

      const endedAt = new Date();
      await this.backupJobService.updateJobStatus(jobId, 'success', {
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        artifactPath: result.artifactPath,
        artifactSizeBytes: result.artifactSizeBytes,
        metadata: result.metadata,
      });
    } catch (err) {
      const attempts = this.getAttempts(job);
      const attemptNumber = job.attemptsMade + 1;
      const willRetry = attemptNumber < attempts;
      this.logger.warn(
        `Backup job ${jobId} attempt ${attemptNumber}/${attempts} failed${
          willRetry ? ' and will retry' : ''
        }: ${err}`,
      );

      if (willRetry) {
        await this.backupJobService.updateJobStatus(jobId, 'pending');
        throw err;
      }

      await this.backupJobService.updateJobStatus(jobId, 'failed', {
        endedAt: new Date(),
        errorCode: 'BACKUP_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
