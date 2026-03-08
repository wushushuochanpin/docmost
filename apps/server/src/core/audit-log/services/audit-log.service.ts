import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  AuditLogContext,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { AuditLogPayload } from '../../../common/events/audit-events';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../../common/middlewares/audit-context.middleware';
import { AuditLogRepo } from '../repos/audit-log.repo';
import { ListAuditEventsDto } from '../dto/list-audit-events.dto';

@Injectable()
export class AuditLogService implements IAuditService {
  private static readonly DEFAULT_RETENTION_DAYS = 365;

  constructor(
    private readonly auditLogRepo: AuditLogRepo,
    private readonly cls: ClsService,
  ) {}

  async listEvents(workspaceId: string, filters: ListAuditEventsDto) {
    return this.auditLogRepo.listEvents(workspaceId, filters);
  }

  async getRetention(workspaceId: string) {
    const retention = await this.auditLogRepo.getRetention(workspaceId);
    return {
      retentionDays: Number(
        retention?.retentionDays ?? AuditLogService.DEFAULT_RETENTION_DAYS,
      ),
    };
  }

  async log(payload: AuditLogPayload): Promise<void> {
    const context = this.getContext();
    if (!context?.workspaceId) return;
    await this.logWithContext(payload, context);
  }

  async logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
  ): Promise<void> {
    if (!context.workspaceId) return;

    await this.auditLogRepo.insertEvent({
      workspaceId: context.workspaceId,
      actorId: context.actorId ?? null,
      actorType: context.actorType ?? 'user',
      event: payload.event,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId ?? null,
      spaceId: payload.spaceId ?? null,
      changes: payload.changes ?? null,
      metadata: payload.metadata ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
  }

  async logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): Promise<void> {
    for (const payload of payloads) {
      await this.logWithContext(payload, context);
    }
  }

  setActorId(actorId: string): void {
    const context = this.getContext();
    if (!context) return;
    context.actorId = actorId;
    this.cls.set(AUDIT_CONTEXT_KEY, context);
  }

  setActorType(actorType: 'user' | 'system' | 'api_key'): void {
    const context = this.getContext();
    if (!context) return;
    context.actorType = actorType;
    this.cls.set(AUDIT_CONTEXT_KEY, context);
  }

  async updateRetention(
    workspaceId: string,
    retentionDays: number,
  ): Promise<void> {
    const context = this.getContext();
    await this.auditLogRepo.upsertRetention({
      workspaceId,
      retentionDays,
      updatedBy: context?.actorId ?? null,
      updatedAt: new Date(),
    });
  }

  async pruneExpiredEvents(): Promise<number> {
    const policies = await this.auditLogRepo.listRetentionPolicies(
      AuditLogService.DEFAULT_RETENTION_DAYS,
    );
    let deletedCount = 0;

    for (const policy of policies) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - policy.retentionDays);
      deletedCount += await this.auditLogRepo.deleteEventsOlderThan(
        policy.workspaceId,
        cutoff,
      );
    }

    return deletedCount;
  }

  private getContext(): AuditContext | undefined {
    return this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
  }
}
