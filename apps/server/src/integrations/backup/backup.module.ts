import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupJobService } from './backup-job.service';
import { CoreModule } from '../../core/core.module';
import { EnvironmentModule } from '../environment/environment.module';
import { BackupArtifactStorageService } from './backup-artifact-storage.service';

@Module({
  imports: [CoreModule, EnvironmentModule],
  controllers: [BackupController],
  providers: [BackupJobService, BackupArtifactStorageService],
  exports: [BackupJobService],
})
export class BackupModule {
  constructor() {
    if (process.env.BACKUP_DATABASE_URL) {
      throw new Error(
        'BACKUP_DATABASE_URL belongs only in the isolated backup worker',
      );
    }
  }
}
