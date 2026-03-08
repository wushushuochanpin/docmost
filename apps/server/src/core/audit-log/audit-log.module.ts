import { Module } from '@nestjs/common';
import { AuditLogController } from './controllers/audit-log.controller';
import { AuditLogService } from './services/audit-log.service';
import { AuditLogRepo } from './repos/audit-log.repo';
import { CaslModule } from '../casl/casl.module';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { AuditLogCleanupService } from './services/audit-log-cleanup.service';

@Module({
  imports: [CaslModule],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditLogRepo,
    AuditLogCleanupService,
    {
      provide: AUDIT_SERVICE,
      useExisting: AuditLogService,
    },
  ],
  exports: [AuditLogService, AUDIT_SERVICE],
})
export class AuditLogModule {}
