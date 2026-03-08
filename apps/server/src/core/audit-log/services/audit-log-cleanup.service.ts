import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class AuditLogCleanupService {
  private readonly logger = new Logger(AuditLogCleanupService.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  @Interval('sc-audit-log-cleanup', 12 * 60 * 60 * 1000)
  async pruneExpiredEvents() {
    try {
      const deletedCount = await this.auditLogService.pruneExpiredEvents();
      if (deletedCount > 0) {
        this.logger.log(`Pruned ${deletedCount} expired audit events`);
      }
    } catch (error) {
      this.logger.warn('Failed to prune expired audit events');
    }
  }
}
