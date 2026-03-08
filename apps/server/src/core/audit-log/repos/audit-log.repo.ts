import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  CursorPaginationResult,
  executeWithCursorPagination,
} from '@docmost/db/pagination/cursor-pagination';
import { sql } from 'kysely';
import {
  InsertableScAuditEvent,
  InsertableScAuditRetention,
  ScAuditRetention,
} from '@docmost/db/types/entity.types';
import { ListAuditEventsDto } from '../dto/list-audit-events.dto';

export type AuditEventListItem = {
  id: string;
  workspaceId: string;
  actorId: string | null;
  actorType: string;
  event: string;
  resourceType: string;
  resourceId: string | null;
  spaceId: string | null;
  changes: any;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
  actorAvatarUrl: string | null;
};

@Injectable()
export class AuditLogRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertEvent(
    data: InsertableScAuditEvent,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db.insertInto('scAuditEvents').values(data).execute();
  }

  async listEvents(
    workspaceId: string,
    filters: ListAuditEventsDto,
  ): Promise<CursorPaginationResult<AuditEventListItem>> {
    let query = this.db
      .selectFrom('scAuditEvents')
      .leftJoin('users as actor', 'actor.id', 'scAuditEvents.actorId')
      .select([
        'scAuditEvents.id as id',
        'scAuditEvents.workspaceId as workspaceId',
        'scAuditEvents.actorId as actorId',
        'scAuditEvents.actorType as actorType',
        'scAuditEvents.event as event',
        'scAuditEvents.resourceType as resourceType',
        'scAuditEvents.resourceId as resourceId',
        'scAuditEvents.spaceId as spaceId',
        'scAuditEvents.changes as changes',
        'scAuditEvents.metadata as metadata',
        'scAuditEvents.ipAddress as ipAddress',
        'scAuditEvents.userAgent as userAgent',
        'scAuditEvents.createdAt as createdAt',
        'actor.name as actorName',
        'actor.email as actorEmail',
        'actor.avatarUrl as actorAvatarUrl',
      ])
      .where('scAuditEvents.workspaceId', '=', workspaceId);

    if (filters.event) {
      query = query.where('scAuditEvents.event', '=', filters.event);
    }

    if (filters.resourceType) {
      query = query.where('scAuditEvents.resourceType', '=', filters.resourceType);
    }

    if (filters.actorId) {
      query = query.where('scAuditEvents.actorId', '=', filters.actorId);
    }

    if (filters.startDate) {
      query = query.where('scAuditEvents.createdAt', '>=', new Date(filters.startDate));
    }

    if (filters.endDate) {
      query = query.where('scAuditEvents.createdAt', '<=', new Date(filters.endDate));
    }

    return executeWithCursorPagination(query, {
      perPage: filters.limit,
      cursor: filters.cursor,
      beforeCursor: filters.beforeCursor,
      fields: [{ expression: 'scAuditEvents.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async getRetention(workspaceId: string): Promise<ScAuditRetention | undefined> {
    return this.db
      .selectFrom('scAuditRetention')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async upsertRetention(
    data: InsertableScAuditRetention,
    trx?: KyselyTransaction,
  ): Promise<ScAuditRetention> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('scAuditRetention')
      .values(data)
      .onConflict((oc) =>
        oc.column('workspaceId').doUpdateSet({
          retentionDays: data.retentionDays,
          updatedBy: data.updatedBy ?? null,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listRetentionPolicies(defaultRetentionDays: number): Promise<
    {
      workspaceId: string;
      retentionDays: number;
    }[]
  > {
    const rows = await this.db
      .selectFrom('workspaces')
      .leftJoin(
        'scAuditRetention',
        'scAuditRetention.workspaceId',
        'workspaces.id',
      )
      .select([
        'workspaces.id as workspaceId',
        sql<number>`coalesce(${sql.ref('scAuditRetention.retentionDays')}, ${defaultRetentionDays})`.as(
          'retentionDays',
        ),
      ])
      .execute();

    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      retentionDays: Number(row.retentionDays),
    }));
  }

  async deleteEventsOlderThan(
    workspaceId: string,
    cutoff: Date,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .deleteFrom('scAuditEvents')
      .where('workspaceId', '=', workspaceId)
      .where('createdAt', '<', cutoff)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }
}
