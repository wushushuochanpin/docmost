import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupJobService } from './backup-job.service';
import { BackupPackageService } from './backup-package.service';
import { BackupProcessor } from './processors/backup.processor';
import { CoreModule } from '../../core/core.module';
import { EnvironmentModule } from '../environment/environment.module';
import { BackupArtifactStorageService } from './backup-artifact-storage.service';

@Module({
  imports: [CoreModule, EnvironmentModule],
  controllers: [BackupController],
  providers: [
    BackupJobService,
    BackupPackageService,
    BackupProcessor,
    BackupArtifactStorageService,
  ],
  exports: [BackupJobService],
})
export class BackupModule {}
