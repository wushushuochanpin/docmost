import { agentTelemetry } from '../agent-operations/agent-telemetry';
import {
  chargeEntrance,
  agentPolicy,
  chargeRate,
  quotaLock,
  reserveQuota,
  settleQuota,
} from './agent-quota';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { findHighestUserSpaceRole } from '../../database/repos/space/utils';
import {
  DocumentCandidate,
  DocumentVersion,
  TextBlockCommand,
} from './document-candidate';

export type DocumentActor = {
  workspaceId: string;
  userId: string;
  pageId: string;
};
export type DocumentPermit = DocumentActor & {
  id: string;
  sessionId: string;
  editEpoch: string;
  ownerEpoch: string;
};
export type AgentDocumentActor = DocumentActor & {
  grantId: string;
  clientId: string;
  tokenHash?: string;
};
export type AgentCreateRequest = {
  principal: Omit<AgentDocumentActor, 'pageId'>;
  key: string;
  tool: 'create_page' | 'create_folder';
  payload: unknown;
};
type Gate = {
  generation: string;
  revision: string;
  editEpoch: string;
  ownerEpoch: string;
  ownerId: string;
  ownerValid: boolean;
  mode: string;
  fence: string;
  operationId: string;
  agentValid: boolean;
};
const denied = () => {
  throw new ForbiddenException('RESOURCE_NOT_FOUND_OR_FORBIDDEN');
};
const conflict = (code: string): never => {
  throw new ConflictException(code);
};
const digest = (data: Uint8Array | string) =>
  createHash('sha256').update(data).digest('hex');

@Injectable()
export class DocumentCommandService {
  private readonly logger = new Logger(DocumentCommandService.name);
  private effectConsumer?: (
    id: string,
    payload: {
      pageId: string;
      workspaceId: string;
      userId: string;
      oldContent: unknown;
      content: unknown;
    },
  ) => Promise<void>;
  setEffectConsumer(consumer: DocumentCommandService['effectConsumer']) {
    this.effectConsumer = consumer;
  }
  async deliverEffects(workspaceId: string) {
    if (!this.effectConsumer) return;
    // Queue effects run outside the authority/page commit transaction. At-least-once with stable job IDs.
    await this.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.workspace_id',${workspaceId},true)`.execute(
        trx,
      );
      const rows = (
        await sql<{
          id: string;
          payload: Parameters<
            NonNullable<DocumentCommandService['effectConsumer']>
          >[1];
        }>`select id,payload from document_outbox where kind='content' and delivered_at is null order by created_at,id for update skip locked limit 10`.execute(
          trx,
        )
      ).rows;
      for (const row of rows) {
        await this.effectConsumer(row.id, row.payload);
        await sql`update document_outbox set delivered_at=clock_timestamp() where id=${row.id}::uuid`.execute(
          trx,
        );
      }
    });
  }
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private recoveryActive = false;
  private workspaceCursor = '';
  async onModuleInit() {
    if (process.env.DOCUMENT_COMMAND_ENABLED === 'true') {
      this.engine();
      const role = (
        await sql<{
          unsafe: boolean;
        }>`select rolsuper or rolbypassrls as unsafe from pg_roles where rolname=current_user`.execute(
          this.db,
        )
      ).rows[0];
      if (!role || role.unsafe)
        throw new Error('DOCUMENT_COMMAND_REQUIRES_NON_BYPASSRLS_ROLE');
    }
    this.recoveryTimer = setInterval(() => {
      void this.recoverBatch().catch(() => {
        this.logger.error('DOCUMENT_RECOVERY_BATCH_FAILED');
      });
    }, 5000);
    this.recoveryTimer.unref();
  }
  async recoverBatch() {
    if (this.recoveryActive) return;
    this.recoveryActive = true;
    try {
      const workspaces = await this.db
        .selectFrom('workspaces')
        .select('id')
        .$if(!!this.workspaceCursor, (q) =>
          q.where('id', '>', this.workspaceCursor),
        )
        .orderBy('id')
        .limit(100)
        .execute();
      this.workspaceCursor =
        workspaces.length === 100 ? workspaces[workspaces.length - 1].id : '';
      for (const workspace of workspaces) {
        const pages = await this.transaction(
          workspace.id,
          async (trx) =>
            (
              await sql<{
                pageId: string;
              }>`select page_id from document_gates where mode<>'open' order by page_id limit 100`.execute(
                trx,
              )
            ).rows,
        );
        for (const page of pages)
          await this.recoverPage({
            workspaceId: workspace.id,
            pageId: page.pageId,
          }).catch(() => {});
        await this.transaction(workspace.id, async (trx) => {
          await sql`delete from agent_quota_buckets where id in (select id from agent_quota_buckets where workspace_id=${workspace.id}::uuid and kind in ('entrance','read','write','query','preview') and bucket_end<clock_timestamp()-interval '1 hour' order by bucket_end limit 5000)`.execute(
            trx,
          );
        });
        await this.deliverEffects(workspace.id).catch(() => {
          this.logger.warn({
            workspaceId: workspace.id,
            code: 'DOCUMENT_OUTBOX_RETRY',
          });
        });
      }
    } finally {
      this.recoveryActive = false;
    }
  }
  async recoverPage(
    ...args: Parameters<DocumentCommandService['recoverPageInternal']>
  ) {
    return agentTelemetry.measure('recovery', () =>
      this.recoverPageInternal(...args),
    );
  }
  private async recoverPageInternal(
    actor: Pick<DocumentActor, 'workspaceId' | 'pageId'>,
  ) {
    const committed = await this.transaction(actor.workspaceId, async (trx) => {
      await this.lockPage(trx, actor);
      const gate = await this.gate(trx, actor.pageId);
      if (!gate || gate.mode === 'open' || !gate.operationId) return null;
      const operation = (
        await sql<{
          status: string;
          userId: string;
        }>`select status,user_id from document_operations where id=${gate.operationId}::uuid for update`.execute(
          trx,
        )
      ).rows[0];
      if (operation?.status === 'committed')
        return { operationId: gate.operationId, userId: operation.userId };
      if (gate.agentValid || !operation) return null;
      // Holding page + gate proves that no final commit can race this decision.
      await settleQuota(trx, gate.operationId, false);
      await sql`update document_operations set status='rejected' where id=${gate.operationId}::uuid and status<>'committed'`.execute(
        trx,
      );
      await sql`update document_gates set mode='open',operation_id=null,agent_until=null,fence=fence+1 where page_id=${actor.pageId}::uuid`.execute(
        trx,
      );
      return null;
    });
    if (committed)
      await this.syncCommitted(
        { ...actor, userId: committed.userId },
        committed.operationId,
      );
  }
  private readonly ownerId = randomUUID();
  private readonly live = new Map<
    string,
    { doc: Y.Doc; ownerEpoch: string; workspaceId: string }
  >();
  private readonly ownerTimers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly permissions: PagePermissionRepo,
    private readonly members: SpaceMemberRepo,
  ) {}

  private async transaction<T>(
    workspaceId: string,
    fn: (trx: KyselyTransaction) => Promise<T>,
    agent?: AgentCreateRequest,
  ): Promise<T> {
    return agentTelemetry.measure('document_transaction', () =>
      this.db.transaction().execute(async (trx) => {
        await sql`select set_config('app.workspace_id',${workspaceId},true), set_config('lock_timeout','2s',true), set_config('statement_timeout','5s',true)`.execute(
          trx,
        );
        await sql`select pg_advisory_xact_lock_shared(20261018,1)`.execute(trx);
        await quotaLock(trx, workspaceId);
        return fn(trx);
      }),
    );
  }

  /** No permission cache inside a write transaction. Includes current account state and all ancestors. */
  async assertCanEdit(trx: KyselyTransaction, actor: DocumentActor) {
    const user = await trx
      .selectFrom('users')
      .select(['id', 'workspaceId', 'deletedAt', 'deactivatedAt'])
      .where('id', '=', actor.userId)
      .where('workspaceId', '=', actor.workspaceId)
      .executeTakeFirst();
    const page = await trx
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', actor.pageId)
      .where('workspaceId', '=', actor.workspaceId)
      .executeTakeFirst();
    if (
      !user ||
      user.deletedAt ||
      user.deactivatedAt ||
      !page ||
      page.deletedAt
    )
      return denied();
    const roles = await this.members.getUserSpaceRoles(
      actor.userId,
      page.spaceId,
      trx,
    );
    const role = findHighestUserSpaceRole(roles);
    if (!role) return denied();
    const access = await this.permissions.canUserEditPage(
      actor.userId,
      actor.pageId,
      trx,
    );
    if (
      !access.canAccess ||
      (access.hasAnyRestriction
        ? !access.canEdit
        : !['admin', 'writer'].includes(role))
    )
      return denied();
    return page;
  }

  async createTransaction<T>(
    actor: {
      workspaceId: string;
      userId: string;
      spaceId: string;
      parentPageId?: string;
    },
    fn: (trx: KyselyTransaction) => Promise<T>,
    agent?: AgentCreateRequest,
  ): Promise<T> {
    return agentTelemetry.measure('document_transaction', () =>
      this.db.transaction().execute(async (trx) => {
        await sql`select set_config('app.workspace_id',${actor.workspaceId},true),set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true)`.execute(
          trx,
        );
        // Structural writes take exclusive authority lock first, avoiding shared -> exclusive upgrades.
        await sql`select pg_advisory_xact_lock(20261018,1)`.execute(trx);
        await quotaLock(trx, actor.workspaceId);
        const space = await trx
          .selectFrom('spaces')
          .select('id')
          .where('id', '=', actor.spaceId)
          .where('workspaceId', '=', actor.workspaceId)
          .executeTakeFirst();
        const user = await trx
          .selectFrom('users')
          .select('id')
          .where('id', '=', actor.userId)
          .where('workspaceId', '=', actor.workspaceId)
          .where('deletedAt', 'is', null)
          .where('deactivatedAt', 'is', null)
          .executeTakeFirst();
        if (!space || !user) return denied();
        if (actor.parentPageId) {
          const parentActor = { ...actor, pageId: actor.parentPageId };
          await this.lockPage(trx, parentActor);
          const parent = await this.assertCanEdit(trx, parentActor);
          if (parent.spaceId !== actor.spaceId) return denied();
          const gate = await this.gate(trx, actor.parentPageId);
          if (gate && gate.mode !== 'open') return conflict('DOCUMENT_BUSY');
        } else {
          const role = findHighestUserSpaceRole(
            await this.members.getUserSpaceRoles(
              actor.userId,
              actor.spaceId,
              trx,
            ),
          );
          if (!['admin', 'writer'].includes(role)) return denied();
        }
        if (!agent) return fn(trx);
        if (process.env.DOCUMENT_COMMAND_ENABLED !== 'true')
          return conflict('MCP_DISABLED');
        if (
          !/^[\x21-\x7e]{1,128}$/.test(agent.key) ||
          agent.principal.workspaceId !== actor.workspaceId ||
          agent.principal.userId !== actor.userId
        )
          return conflict('INVALID_ARGUMENT');
        if (agent.tool === 'create_page' && !actor.parentPageId)
          return conflict('INVALID_ARGUMENT');
        if (actor.parentPageId) {
          const parentMeta = await trx
            .selectFrom('pageNodeMeta')
            .select('nodeType')
            .where('pageId', '=', actor.parentPageId)
            .executeTakeFirst();
          if (parentMeta?.nodeType !== 'folder')
            return conflict('INVALID_ARGUMENT');
        }
        const scope =
          agent.tool === 'create_folder' ? 'folders.create' : 'pages.create';
        await this.assertGrantScope(trx, agent.principal, actor.spaceId, scope);
        const requestHash = digest(
          JSON.stringify({
            spaceId: actor.spaceId,
            parentPageId: actor.parentPageId,
            payload: agent.payload,
          }),
        );
        const existing = (
          await sql<{
            requestHash: string;
            pageId: string;
            result: any;
            resultExpiredAt: Date | null;
          }>`select request_hash,page_id,result,result_expired_at from document_operations where workspace_id=${actor.workspaceId}::uuid and user_id=${actor.userId}::uuid and client_id=${agent.principal.clientId} and grant_id=${agent.principal.grantId}::uuid and tool=${agent.tool} and idempotency_key=${agent.key}`.execute(
            trx,
          )
        ).rows[0];
        if (existing) {
          await chargeRate(trx, agent.principal, ['query']);
          if (existing.requestHash !== requestHash)
            return conflict('IDEMPOTENCY_KEY_REUSED');
          const page = await this.assertCanEdit(trx, {
            ...actor,
            pageId: existing.pageId,
          });
          if (existing.resultExpiredAt)
            return conflict('OPERATION_RESULT_EXPIRED');
          return {
            ...page,
            agentOperation: existing.result,
            agentReplay: true,
          } as T;
        }
        const created = (await fn(trx)) as T & {
          id: string;
          ydoc: Uint8Array;
          content: unknown;
        };
        await this.assertGrantScope(trx, agent.principal, actor.spaceId, scope);
        await sql`insert into document_gates(page_id,workspace_id) values(${created.id}::uuid,${actor.workspaceId}::uuid)`.execute(
          trx,
        );
        const gate = await this.gate(trx, created.id);
        const id = randomUUID();
        const response = {
          operationId: id,
          status: 'committed',
          pageId: created.id,
          changed: true,
          versionToken: this.engine().versionToken({
            workspaceId: actor.workspaceId,
            pageId: created.id,
            generation: gate.generation,
            revision: gate.revision,
          }),
          persistedAt: (
            await sql<{ at: Date }>`select clock_timestamp() as at`.execute(trx)
          ).rows[0].at.toISOString(),
        };
        await sql`insert into document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status,result,committed_at)
        values(${id}::uuid,${actor.workspaceId}::uuid,${actor.userId}::uuid,${agent.principal.clientId},${agent.principal.grantId}::uuid,${created.id}::uuid,${agent.tool},${agent.key},${requestHash},'committed',${JSON.stringify(response)}::text::jsonb,clock_timestamp())`.execute(
          trx,
        );
        await reserveQuota(trx, agent.principal, id, 'create');
        await settleQuota(trx, id, true);
        const application =
          (
            await sql<{
              name: string;
            }>`select name from agent_oauth_clients where id=${agent.principal.clientId}::uuid`.execute(
              trx,
            )
          ).rows[0]?.name ?? agent.principal.clientId;
        const createdHistory = await this.saveHistory(
          trx,
          { ...actor, pageId: created.id },
          {
            operationId: id,
            side: 'after',
            application,
          },
        );
        await sql`insert into document_recovery_snapshots(operation_id,workspace_id,page_id,side,history_id,ydoc,title,revision)
        values(${id}::uuid,${actor.workspaceId}::uuid,${created.id}::uuid,'after',${createdHistory.id}::uuid,${created.ydoc},${(created as any).title},${gate.revision}::bigint)`.execute(
          trx,
        );
        await sql`insert into document_outbox(operation_id,workspace_id,page_id,kind,payload) values(${id}::uuid,${actor.workspaceId}::uuid,${created.id}::uuid,'content',${JSON.stringify({ pageId: created.id, workspaceId: actor.workspaceId, userId: actor.userId, oldContent: { type: 'doc', content: [] }, content: created.content })}::text::jsonb)`.execute(
          trx,
        );
        return { ...created, agentOperation: response } as T;
      }),
    );
  }

  async previewCreate(
    actor: {
      workspaceId: string;
      userId: string;
      spaceId: string;
      parentPageId?: string;
    },
    principal: Omit<AgentDocumentActor, 'pageId'>,
    scope: string,
  ) {
    return this.createTransaction(actor, async (trx) => {
      await this.assertGrantScope(trx, principal, actor.spaceId, scope);
      if (actor.parentPageId) {
        const meta = await trx
          .selectFrom('pageNodeMeta')
          .select('nodeType')
          .where('pageId', '=', actor.parentPageId)
          .executeTakeFirst();
        if (meta?.nodeType !== 'folder') return conflict('INVALID_ARGUMENT');
      }
      return true;
    });
  }

  private async lockPage(
    trx: KyselyTransaction,
    actor: Pick<DocumentActor, 'workspaceId' | 'pageId'>,
  ) {
    const page = await trx
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', actor.pageId)
      .where('workspaceId', '=', actor.workspaceId)
      .forUpdate()
      .executeTakeFirst();
    if (!page) return denied();
    return page;
  }
  private async gate(
    trx: KyselyTransaction,
    pageId: string,
  ): Promise<Gate | undefined> {
    return (
      await sql<Gate>`select generation,revision::text,edit_epoch::text,owner_epoch::text,owner_id,mode,fence::text,operation_id,
      coalesce(owner_until>clock_timestamp(),false) as owner_valid, coalesce(agent_until>clock_timestamp(),false) as agent_valid
      from document_gates where page_id=${pageId}::uuid for update`.execute(trx)
    ).rows[0];
  }
  async isManaged(
    actor: Pick<DocumentActor, 'workspaceId' | 'pageId'>,
  ): Promise<boolean> {
    return this.transaction(
      actor.workspaceId,
      async (trx) =>
        !!(
          await sql`select 1 from document_gates where page_id=${actor.pageId}::uuid`.execute(
            trx,
          )
        ).rows.length,
    );
  }

  async runtime(actor: DocumentActor, sessionId: string) {
    return this.transaction(actor.workspaceId, async (trx) => {
      const page = await this.lockPage(trx, actor);
      const session = await trx
        .selectFrom('userSessions')
        .select('id')
        .where('id', '=', sessionId)
        .where('userId', '=', actor.userId)
        .where('workspaceId', '=', actor.workspaceId)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', new Date())
        .executeTakeFirst();
      const user = await trx
        .selectFrom('users')
        .select('id')
        .where('id', '=', actor.userId)
        .where('workspaceId', '=', actor.workspaceId)
        .where('deletedAt', 'is', null)
        .where('deactivatedAt', 'is', null)
        .executeTakeFirst();
      if (!session || !user || page.deletedAt) return denied();
      const roles = await this.members.getUserSpaceRoles(
        actor.userId,
        page.spaceId,
        trx,
      );
      const access = await this.permissions.canUserEditPage(
        actor.userId,
        actor.pageId,
        trx,
      );
      if (!roles?.length || !access.canAccess) return denied();
      const gate = await this.gate(trx, actor.pageId);
      return {
        managed: !!gate || process.env.DOCUMENT_COMMAND_ENABLED === 'true',
        busy: !!gate && gate.mode !== 'open',
        generation: gate?.generation,
        revision: gate?.revision,
        versionToken: gate
          ? this.engine().versionToken({
              workspaceId: actor.workspaceId,
              pageId: actor.pageId,
              generation: gate.generation,
              revision: gate.revision,
            })
          : undefined,
      };
    });
  }

  /** Only called at document load. Enrolment is off by default; existing gates never bypassed. */
  async load(actor: DocumentActor, doc: Y.Doc): Promise<Uint8Array | null> {
    return this.serial(actor.pageId, async () => {
      await this.recoverPage(actor);
      const loaded = await this.transaction(actor.workspaceId, async (trx) => {
        const page = await this.lockPage(trx, actor);
        let gate = await this.gate(trx, actor.pageId);
        if (!gate && process.env.DOCUMENT_COMMAND_ENABLED !== 'true')
          return null;
        if (!page.ydoc) return conflict('DOCUMENT_BINARY_REQUIRED');
        if (!gate) {
          await sql`insert into document_gates(page_id,workspace_id) values(${actor.pageId}::uuid,${actor.workspaceId}::uuid)`.execute(
            trx,
          );
          gate = await this.gate(trx, actor.pageId);
        }
        if (gate.ownerValid && gate.ownerId !== this.ownerId)
          return conflict('DOCUMENT_OWNER_BUSY');
        if (gate.mode === 'agent' && gate.agentValid)
          return conflict('DOCUMENT_BUSY');
        if (gate.mode !== 'open') {
          const result = await sql<{
            status: string;
          }>`select status from document_operations where id=${gate.operationId}::uuid`.execute(
            trx,
          );
          if (result.rows[0]?.status !== 'committed')
            return conflict('OPERATION_RECONCILING');
        }
        await sql`update document_gates set owner_id=${this.ownerId}::uuid,owner_epoch=owner_epoch+1,edit_epoch=edit_epoch+1,
        owner_until=clock_timestamp()+interval '30 seconds',mode='open',operation_id=null,agent_until=null where page_id=${actor.pageId}::uuid`.execute(
          trx,
        );
        gate = await this.gate(trx, actor.pageId);
        return {
          binary: new Uint8Array(page.ydoc),
          ownerEpoch: gate.ownerEpoch,
        };
      });
      if (!loaded) return null;
      this.unload(actor.pageId);
      this.live.set(actor.pageId, {
        doc,
        ownerEpoch: loaded.ownerEpoch,
        workspaceId: actor.workspaceId,
      });
      const timer = setInterval(() => {
        void this.renewOwner(actor, loaded.ownerEpoch).catch(() => {
          clearInterval(timer);
          this.ownerTimers.delete(actor.pageId);
        });
      }, 10000);
      timer.unref();
      this.ownerTimers.set(actor.pageId, timer);
      return loaded.binary;
    });
  }

  private async renewOwner(actor: DocumentActor, ownerEpoch: string) {
    await this.transaction(actor.workspaceId, async (trx) => {
      await this.lockPage(trx, actor);
      const gate = await this.gate(trx, actor.pageId);
      if (
        !gate ||
        gate.ownerId !== this.ownerId ||
        gate.ownerEpoch !== ownerEpoch ||
        !gate.ownerValid
      )
        return conflict('DOCUMENT_OWNER_CHANGED');
      await sql`update document_gates set owner_until=clock_timestamp()+interval '30 seconds' where page_id=${actor.pageId}::uuid`.execute(
        trx,
      );
    });
  }

  async acquirePermit(
    actor: DocumentActor,
    sessionId: string,
  ): Promise<DocumentPermit | null> {
    return this.transaction(actor.workspaceId, async (trx) => {
      await this.lockPage(trx, actor);
      const gate = await this.gate(trx, actor.pageId);
      if (!gate) return null;
      await this.assertCanEdit(trx, actor);
      const session = await trx
        .selectFrom('userSessions')
        .select('id')
        .where('id', '=', sessionId)
        .where('userId', '=', actor.userId)
        .where('workspaceId', '=', actor.workspaceId)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', new Date())
        .executeTakeFirst();
      if (!session) return denied();
      if (
        gate.mode !== 'open' ||
        gate.ownerId !== this.ownerId ||
        !gate.ownerValid
      )
        return conflict('DOCUMENT_BUSY');
      const permit = {
        ...actor,
        id: randomUUID(),
        sessionId,
        editEpoch: gate.editEpoch,
        ownerEpoch: gate.ownerEpoch,
      };
      await sql`insert into document_human_permits(id,workspace_id,page_id,user_id,session_id,edit_epoch,owner_epoch,expires_at)
        values(${permit.id}::uuid,${actor.workspaceId}::uuid,${actor.pageId}::uuid,${actor.userId}::uuid,${sessionId}::uuid,${gate.editEpoch}::bigint,${gate.ownerEpoch}::bigint,clock_timestamp()+interval '30 seconds')`.execute(
        trx,
      );
      return permit;
    });
  }
  async heartbeat(permit: DocumentPermit): Promise<void> {
    await this.transaction(permit.workspaceId, async (trx) => {
      await this.lockPage(trx, permit);
      const gate = await this.gate(trx, permit.pageId);
      await this.assertPermit(trx, permit, gate);
      await sql`update document_human_permits set expires_at=clock_timestamp()+interval '30 seconds' where id=${permit.id}::uuid`.execute(
        trx,
      );
      await sql`update document_gates set owner_until=clock_timestamp()+interval '30 seconds' where page_id=${permit.pageId}::uuid`.execute(
        trx,
      );
    });
  }
  async release(permit: DocumentPermit): Promise<void> {
    await this.transaction(permit.workspaceId, async (trx) => {
      await this.lockPage(trx, permit);
      await sql`delete from document_human_permits where id=${permit.id}::uuid and user_id=${permit.userId}::uuid`.execute(
        trx,
      );
    });
  }
  private async assertPermit(
    trx: KyselyTransaction,
    permit: DocumentPermit,
    gate: Gate,
  ) {
    await this.assertCanEdit(trx, permit);
    const valid =
      await sql`select 1 from document_human_permits p join user_sessions s on s.id=p.session_id
      where p.id=${permit.id}::uuid and p.user_id=${permit.userId}::uuid and p.page_id=${permit.pageId}::uuid
      and p.session_id=${permit.sessionId}::uuid and p.expires_at>clock_timestamp()
      and s.user_id=p.user_id and s.workspace_id=p.workspace_id and s.revoked_at is null and s.expires_at>clock_timestamp()`.execute(
        trx,
      );
    if (
      !gate ||
      gate.mode !== 'open' ||
      gate.ownerId !== this.ownerId ||
      !gate.ownerValid ||
      gate.ownerEpoch !== permit.ownerEpoch ||
      gate.editEpoch !== permit.editEpoch ||
      !valid.rows.length
    )
      return conflict('DOCUMENT_PERMIT_EXPIRED');
  }

  private plainText(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const node = value as { text?: string; content?: unknown[] };
    return typeof node.text === 'string'
      ? node.text
      : (node.content ?? []).map((child) => this.plainText(child)).join(' ');
  }
  private async saveHistory(
    trx: KyselyTransaction,
    actor: DocumentActor,
    source?: { operationId: string; side: string; application: string },
  ) {
    const page = await trx
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', actor.pageId)
      .where('workspaceId', '=', actor.workspaceId)
      .executeTakeFirstOrThrow();
    return trx
      .insertInto('pageHistory')
      .values({
        pageId: page.id,
        agentSource: source ?? undefined,
        workspaceId: page.workspaceId,
        spaceId: page.spaceId,
        slugId: page.slugId,
        title: page.title,
        content: page.content,
        icon: page.icon,
        coverPhoto: page.coverPhoto,
        themeColor: page.themeColor,
        themePattern: page.themePattern,
        lastUpdatedById: actor.userId,
        contributorIds: [actor.userId],
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }
  private async writeBinary(
    ...args: Parameters<DocumentCommandService['persistBinary']>
  ) {
    try {
      return await this.persistBinary(...args);
    } catch (error) {
      agentTelemetry.increment('checkpoint_failure');
      throw error;
    }
  }
  private async persistBinary(
    trx: KyselyTransaction,
    actor: DocumentActor,
    binary: Uint8Array,
    content: unknown,
  ) {
    const previous = await trx
      .selectFrom('pages')
      .select(['content', 'contributorIds'])
      .where('id', '=', actor.pageId)
      .executeTakeFirstOrThrow();
    const payload = JSON.stringify({
      pageId: actor.pageId,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      oldContent: previous.content,
      content,
    });
    await sql`insert into document_outbox(workspace_id,page_id,kind,payload) values(${actor.workspaceId}::uuid,${actor.pageId}::uuid,'content',${payload}::text::jsonb)`.execute(
      trx,
    );
    await sql`select set_config('app.document_binary_writer',${actor.pageId},true)`.execute(
      trx,
    );
    await trx
      .updateTable('pages')
      .set({
        ydoc: Buffer.from(binary),
        content: content as any,
        textContent: this.plainText(content),
        contributorIds: Array.from(
          new Set([...(previous.contributorIds ?? []), actor.userId]),
        ),
        lastUpdatedById: actor.userId,
        updatedAt: new Date(),
      })
      .where('id', '=', actor.pageId)
      .where('workspaceId', '=', actor.workspaceId)
      .execute();
    await sql`update document_gates set checkpoint_revision=revision where page_id=${actor.pageId}::uuid`.execute(
      trx,
    );
  }
  /** Receives the original Yjs binary, not a lossy JSON round trip. */
  async ingest(
    permit: DocumentPermit,
    update: Uint8Array,
    materialize: (doc: Y.Doc) => unknown,
    updateId?: string,
  ): Promise<string> {
    if (update.byteLength > 1024 * 1024) return conflict('CONTENT_TOO_LARGE');
    return this.serial(permit.pageId, async () => {
      const revision = await this.transaction(
        permit.workspaceId,
        async (trx) => {
          const page = await this.lockPage(trx, permit);
          const gate = await this.gate(trx, permit.pageId);
          await this.assertPermit(trx, permit, gate);
          const hash = digest(update);
          const id = updateId ?? hash;
          if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
            return conflict('INVALID_DOCUMENT_ENVELOPE');
          const duplicate = await sql<{
            revision: string;
            updateHash: string;
          }>`select revision::text,update_hash from document_updates where page_id=${permit.pageId}::uuid and session_id=${permit.sessionId}::uuid and update_id=${id}`.execute(
            trx,
          );
          if (duplicate.rows.length) {
            if (duplicate.rows[0].updateHash !== hash)
              return conflict('UPDATE_ID_REUSED');
            return gate.revision;
          }
          const candidate = new Y.Doc();
          try {
            Y.applyUpdate(candidate, new Uint8Array(page.ydoc));
            Y.applyUpdate(candidate, update);
            const binary = Y.encodeStateAsUpdate(candidate);
            if (!Buffer.from(binary).equals(page.ydoc))
              await this.writeBinary(
                trx,
                permit,
                binary,
                materialize(candidate),
              );
            const current = await this.gate(trx, permit.pageId);
            await sql`insert into document_updates(workspace_id,page_id,update_id,session_id,update_hash,update_bytes,revision,user_id)
            values(${permit.workspaceId}::uuid,${permit.pageId}::uuid,${id},${permit.sessionId}::uuid,${hash},${Buffer.from(update)},${current.revision}::bigint,${permit.userId}::uuid)`.execute(
              trx,
            );
            await sql`update document_gates set checkpoint_revision=revision where page_id=${permit.pageId}::uuid`.execute(
              trx,
            );
            return current.revision;
          } finally {
            candidate.destroy();
          }
        },
      );
      const live = this.live.get(permit.pageId);
      if (!live || live.ownerEpoch !== permit.ownerEpoch)
        return conflict('DOCUMENT_OWNER_CHANGED');
      Y.applyUpdate(live.doc, update, 'durable-human');
      return revision;
    });
  }

  async restoreHistory(
    permit: DocumentPermit,
    historyId: string,
    versionToken: string,
    updateId: string,
    construct: (content: unknown) => Y.Doc,
    materialize: (doc: Y.Doc) => unknown,
  ) {
    return this.serial(permit.pageId, async () => {
      const result = await this.transaction(permit.workspaceId, async (trx) => {
        const page = await this.lockPage(trx, permit);
        const gate = await this.gate(trx, permit.pageId);
        await this.assertPermit(trx, permit, gate);
        this.engine().assertVersion(versionToken, {
          workspaceId: permit.workspaceId,
          pageId: permit.pageId,
          generation: gate.generation,
          revision: gate.revision,
        });
        const history = await trx
          .selectFrom('pageHistory')
          .select(['content', 'title'])
          .where('id', '=', historyId)
          .where('pageId', '=', permit.pageId)
          .where('workspaceId', '=', permit.workspaceId)
          .executeTakeFirst();
        if (!history) return denied();
        const requestHash = digest(JSON.stringify({ historyId, versionToken }));
        const old = (
          await sql<{
            updateHash: string;
          }>`select update_hash from document_updates where page_id=${permit.pageId}::uuid and session_id=${permit.sessionId}::uuid and update_id=${updateId}`.execute(
            trx,
          )
        ).rows[0];
        if (old)
          return conflict(
            old.updateHash === requestHash
              ? 'REVISION_CONFLICT'
              : 'UPDATE_ID_REUSED',
          );
        const candidate = new Y.Doc();
        const restored = construct(history.content);
        try {
          Y.applyUpdate(candidate, new Uint8Array(page.ydoc));
          const root = candidate.getXmlFragment('default');
          root.delete(0, root.length);
          Y.applyUpdate(candidate, Y.encodeStateAsUpdate(restored));
          await this.saveHistory(trx, permit);
          const binary = Y.encodeStateAsUpdate(candidate);
          await this.writeBinary(trx, permit, binary, materialize(candidate));
          await trx
            .updateTable('pages')
            .set({
              title: history.title,
              lastUpdatedById: permit.userId,
              updatedAt: new Date(),
            })
            .where('id', '=', permit.pageId)
            .execute();
          await this.saveHistory(trx, permit);
          const after = await this.gate(trx, permit.pageId);
          await sql`insert into document_updates(workspace_id,page_id,update_id,session_id,update_hash,update_bytes,revision,user_id) values(${permit.workspaceId}::uuid,${permit.pageId}::uuid,${updateId},${permit.sessionId}::uuid,${requestHash},${Buffer.from(binary)},${after.revision}::bigint,${permit.userId}::uuid)`.execute(
            trx,
          );
          await sql`update document_gates set checkpoint_revision=revision where page_id=${permit.pageId}::uuid`.execute(
            trx,
          );
          return { binary, title: history.title, revision: after.revision };
        } finally {
          candidate.destroy();
          restored.destroy();
        }
      });
      const live = this.live.get(permit.pageId);
      if (live && live.ownerEpoch === permit.ownerEpoch)
        Y.applyUpdate(live.doc, result.binary, 'durable-restore');
      return { title: result.title, revision: result.revision };
    });
  }

  /** REST/history/comment commands use an isolated candidate and current ACL in the same commit. */
  async mutate(
    actor: DocumentActor,
    mutator: (doc: Y.Doc) => void,
    materialize: (doc: Y.Doc) => unknown,
    patch?: {
      title?: string;
      icon?: string;
      themeColor?: string;
      themePattern?: string;
    },
  ): Promise<void> {
    await this.serial(actor.pageId, async () => {
      const binary = await this.transaction(actor.workspaceId, async (trx) => {
        const page = await this.lockPage(trx, actor);
        const gate = await this.gate(trx, actor.pageId);
        await this.assertCanEdit(trx, actor);
        if (!gate || gate.mode !== 'open') return conflict('DOCUMENT_BUSY');
        if (gate.ownerValid && gate.ownerId !== this.ownerId)
          return conflict('DOCUMENT_OWNER_BUSY');
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, new Uint8Array(page.ydoc));
          mutator(candidate);
          const bytes = Y.encodeStateAsUpdate(candidate);
          await this.writeBinary(trx, actor, bytes, materialize(candidate));
          if (patch && Object.keys(patch).length)
            await trx
              .updateTable('pages')
              .set(patch)
              .where('id', '=', actor.pageId)
              .execute();
          return bytes;
        } finally {
          candidate.destroy();
        }
      });
      const live = this.live.get(actor.pageId);
      if (live) Y.applyUpdate(live.doc, binary, 'durable-command');
    });
  }

  async waitForOperation(
    actor: AgentDocumentActor,
    selector: { key: string; tool: string },
    work: Promise<any>,
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Promise<any>((resolve, reject) => {
      timer = setTimeout(() => {
        this.findOperation(actor, selector)
          .then((op) =>
            resolve(
              op.status === 'committed' && 'result' in op
                ? op.result
                : {
                    operationId: op.id,
                    pageId: actor.pageId,
                    status: op.status === 'running' ? 'pending' : op.status,
                  },
            ),
          )
          .catch(reject);
      }, 15000);
    });
    try {
      return await Promise.race([work, pending]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async entranceQuota(actor: Omit<AgentDocumentActor, 'pageId'>) {
    return this.transaction(actor.workspaceId, (trx) =>
      chargeEntrance(trx, actor),
    );
  }
  async requestQuota(
    actor: Omit<AgentDocumentActor, 'pageId'>,
    kinds: ('read' | 'preview' | 'query')[],
  ) {
    return this.transaction(actor.workspaceId, (trx) =>
      chargeRate(trx, actor, kinds),
    );
  }
  async listAgentSpaces(
    actor: Omit<AgentDocumentActor, 'pageId'>,
    after: string,
    limit: number,
  ) {
    return this.transaction(actor.workspaceId, async (trx) => {
      const candidates = await trx
        .selectFrom('spaces')
        .select(['id', 'name'])
        .where('workspaceId', '=', actor.workspaceId)
        .where(
          sql<boolean>`id::text > ${after} and id=any(select unnest(space_ids) from document_agent_grants where id=${actor.grantId}::uuid)`,
        )
        .orderBy('id')
        .limit(100)
        .execute();
      const result: { id: string; name: string }[] = [];
      for (const space of candidates) {
        const roles = await this.members.getUserSpaceRoles(
          actor.userId,
          space.id,
          trx,
        );
        if (!roles.length) continue;
        await this.assertGrantScope(trx, actor, space.id, 'knowledge.read');
        result.push(space);
        if (result.length >= limit) break;
      }
      return result;
    });
  }
  async editContext(actor: AgentDocumentActor) {
    return this.transaction(actor.workspaceId, async (trx) => {
      const page = await this.lockPage(trx, actor);
      await this.assertGrant(trx, actor, page.spaceId);
      let gate = await this.gate(trx, actor.pageId);
      if (!gate && process.env.DOCUMENT_COMMAND_ENABLED === 'true') {
        await sql`insert into document_gates(page_id,workspace_id) values(${actor.pageId}::uuid,${actor.workspaceId}::uuid)`.execute(
          trx,
        );
        gate = await this.gate(trx, actor.pageId);
      }
      if (!gate) return conflict('DOCUMENT_NOT_ENROLLED');
      const version: DocumentVersion = {
        workspaceId: actor.workspaceId,
        pageId: actor.pageId,
        generation: gate.generation,
        revision: gate.revision,
      };
      return {
        version,
        token: this.engine().versionToken(version),
        busy:
          gate.mode !== 'open' ||
          (
            await sql`select 1 from document_human_permits where page_id=${actor.pageId}::uuid and expires_at>clock_timestamp() limit 1`.execute(
              trx,
            )
          ).rows.length > 0,
        binary: new Uint8Array(page.ydoc),
      };
    });
  }
  private engine() {
    const key = process.env.DOCUMENT_COMMAND_SIGNING_KEY;
    if (!key || Buffer.from(key, 'base64').length < 32)
      throw new Error(
        'DOCUMENT_COMMAND_SIGNING_KEY must contain at least 32 random bytes (base64)',
      );
    return new DocumentCandidate(Buffer.from(key, 'base64'));
  }
  private async assertGrant(
    trx: KyselyTransaction,
    actor: AgentDocumentActor,
    spaceId: string,
  ) {
    await this.assertCanEdit(trx, actor);
    return this.assertGrantScope(trx, actor, spaceId, 'pages.edit');
  }
  private async assertGrantScope(
    trx: KyselyTransaction,
    actor: Omit<AgentDocumentActor, 'pageId'>,
    spaceId: string,
    scope: string,
  ) {
    if (actor.tokenHash) {
      const valid =
        await sql`select 1 from agent_oauth_tokens t join agent_oauth_families f on f.id=t.family_id join agent_oauth_clients c on c.id=f.client_id
        where t.access_hash=${actor.tokenHash} and t.access_expires_at>clock_timestamp() and not f.revoked and c.active and ARRAY['knowledge.read',${scope}]::text[] <@ c.scopes
        and f.grant_id=${actor.grantId}::uuid and f.client_id=${actor.clientId}::uuid and f.workspace_id=${actor.workspaceId}::uuid
        and t.metadata->'scope' @> ${JSON.stringify(['knowledge.read', scope])}::text::jsonb`.execute(
          trx,
        );
      if (!valid.rows.length) return denied();
    }
    const grants =
      await sql`select 1 from document_agent_grants where id=${actor.grantId}::uuid and workspace_id=${actor.workspaceId}::uuid
      and user_id=${actor.userId}::uuid and client_id=${actor.clientId} and revoked_at is null and expires_at>clock_timestamp()
      and ${spaceId}::uuid=any(space_ids) and ARRAY['knowledge.read',${scope}]::text[] <@ scopes for share`.execute(
        trx,
      );
    if (!grants.rows.length) return denied();
  }
  async edit(
    actor: AgentDocumentActor,
    input: {
      key: string;
      versionToken: string;
      commands: TextBlockCommand[];
      title?: string;
      tool?: 'edit_page' | 'update_page_metadata';
    },
    materialize: (doc: Y.Doc) => unknown,
  ) {
    if (process.env.DOCUMENT_COMMAND_ENABLED !== 'true')
      return conflict('MCP_DISABLED');
    if (!/^[\x21-\x7e]{1,128}$/.test(input.key))
      return conflict('INVALID_ARGUMENT');
    const tool = input.tool ?? 'edit_page';
    if (
      tool === 'update_page_metadata' &&
      (typeof input.title !== 'string' ||
        !input.title.trim() ||
        Array.from(input.title).length > 200 ||
        input.commands.length)
    )
      return conflict('INVALID_ARGUMENT');
    if (
      tool === 'edit_page' &&
      (input.title !== undefined || !input.commands.length)
    )
      return conflict('INVALID_ARGUMENT');
    return this.serial(actor.pageId, async () => {
      const requestHash = digest(
        JSON.stringify({
          pageId: actor.pageId,
          versionToken: input.versionToken,
          commands: input.commands.map(({ fragment, ...command }) => command),
          title: input.title,
          tool,
        }),
      );
      const claim = await this.transaction(actor.workspaceId, async (trx) => {
        const page = await this.lockPage(trx, actor);
        await this.assertGrant(trx, actor, page.spaceId);
        const gate = await this.gate(trx, actor.pageId);
        if (!gate) return conflict('DOCUMENT_NOT_ENROLLED');
        const old = await sql<{
          id: string;
          requestHash: string;
          status: string;
          result: any;
          resultExpiredAt: Date | null;
        }>`select id,request_hash,status,result,result_expired_at from document_operations
          where workspace_id=${actor.workspaceId}::uuid and user_id=${actor.userId}::uuid and client_id=${actor.clientId} and grant_id=${actor.grantId}::uuid and tool=${tool} and idempotency_key=${input.key}`.execute(
          trx,
        );
        if (old.rows[0]) {
          await chargeRate(trx, actor, ['query']);
          if (old.rows[0].requestHash !== requestHash)
            return conflict('IDEMPOTENCY_KEY_REUSED');
          if (old.rows[0].resultExpiredAt)
            return conflict('OPERATION_RESULT_EXPIRED');
          if (old.rows[0].status === 'committed')
            return { result: old.rows[0].result };
          return {
            result: {
              operationId: old.rows[0].id,
              status:
                old.rows[0].status === 'rejected' ? 'rejected' : 'pending',
              pageId: actor.pageId,
            },
          };
        }
        if (gate.mode !== 'open') return conflict('DOCUMENT_BUSY');
        if (
          (
            await sql`select 1 from document_human_permits where page_id=${actor.pageId}::uuid and expires_at>clock_timestamp()`.execute(
              trx,
            )
          ).rows.length
        )
          return conflict('DOCUMENT_BUSY');
        const version: DocumentVersion = {
          workspaceId: actor.workspaceId,
          pageId: actor.pageId,
          generation: gate.generation,
          revision: gate.revision,
        };
        this.engine().assertVersion(input.versionToken, version);
        const id = randomUUID();
        await sql`insert into document_operations(id,workspace_id,user_id,client_id,grant_id,page_id,tool,idempotency_key,request_hash,status)
          values(${id}::uuid,${actor.workspaceId}::uuid,${actor.userId}::uuid,${actor.clientId},${actor.grantId}::uuid,${actor.pageId}::uuid,${tool},${input.key},${requestHash},'running')`.execute(
          trx,
        );
        await reserveQuota(trx, actor, id, 'edit');
        await sql`update document_gates set mode='agent',fence=fence+1,edit_epoch=edit_epoch+1,operation_id=${id}::uuid,agent_until=clock_timestamp()+interval '30 seconds' where page_id=${actor.pageId}::uuid`.execute(
          trx,
        );
        return {
          id,
          page,
          version,
          fence: (await this.gate(trx, actor.pageId)).fence,
        };
      });
      if ('result' in claim) {
        if (claim.result.status === 'committed')
          await this.syncCommitted(actor, claim.result.operationId).catch(
            () => {},
          );
        return claim.result;
      }
      // Parsing and candidate construction must not hold database or authority locks.
      try {
        const binary =
          tool === 'update_page_metadata'
            ? new Uint8Array(claim.page.ydoc)
            : this.engine().apply(
                new Uint8Array(claim.page.ydoc),
                claim.version,
                input.versionToken,
                input.commands,
              );
        const candidate = new Y.Doc();
        let content: unknown;
        try {
          Y.applyUpdate(candidate, binary);
          content = await materialize(candidate);
        } finally {
          candidate.destroy();
        }
        const result = await this.transaction(
          actor.workspaceId,
          async (trx) => {
            if (!(await agentPolicy(trx, actor.workspaceId)).enabled)
              return conflict('MCP_DISABLED');
            const page = await this.lockPage(trx, actor);
            await this.assertGrant(trx, actor, page.spaceId);
            const gate = await this.gate(trx, actor.pageId);
            if (
              !gate ||
              gate.mode !== 'agent' ||
              !gate.agentValid ||
              gate.operationId !== claim.id ||
              gate.fence !== claim.fence
            )
              return conflict('DOCUMENT_FENCE_EXPIRED');
            this.engine().assertVersion(input.versionToken, {
              workspaceId: actor.workspaceId,
              pageId: actor.pageId,
              generation: gate.generation,
              revision: gate.revision,
            });
            await sql`select set_config('app.document_ticket',${actor.pageId + ':' + claim.fence},true)`.execute(
              trx,
            );
            const application = actor.tokenHash
              ? ((
                  await sql<{
                    name: string;
                  }>`select name from agent_oauth_clients where id=${actor.clientId}::uuid`.execute(
                    trx,
                  )
                ).rows[0]?.name ?? actor.clientId)
              : actor.clientId;
            const changed =
              digest(binary) !== digest(new Uint8Array(page.ydoc)) ||
              (input.title !== undefined && input.title !== page.title);
            if (changed) {
              await sql`insert into document_recovery_snapshots(operation_id,workspace_id,page_id,side,ydoc,title,revision)
            values(${claim.id}::uuid,${actor.workspaceId}::uuid,${actor.pageId}::uuid,'before',${page.ydoc},${page.title},${gate.revision}::bigint)`.execute(
                trx,
              );
              const beforeHistory = await this.saveHistory(trx, actor, {
                operationId: claim.id,
                side: 'before',
                application,
              });
              await sql`update document_recovery_snapshots set history_id=${beforeHistory.id}::uuid where operation_id=${claim.id}::uuid and side='before'`.execute(
                trx,
              );
              if (tool === 'edit_page')
                await this.writeBinary(trx, actor, binary, content);
              if (input.title !== undefined)
                await trx
                  .updateTable('pages')
                  .set({
                    title: input.title,
                    lastUpdatedById: actor.userId,
                    updatedAt: new Date(),
                  })
                  .where('id', '=', actor.pageId)
                  .execute();
              const afterHistory = await this.saveHistory(trx, actor, {
                operationId: claim.id,
                side: 'after',
                application,
              });
              const afterSnapshot = await this.gate(trx, actor.pageId);
              await sql`insert into document_recovery_snapshots(operation_id,workspace_id,page_id,side,ydoc,title,revision)
            values(${claim.id}::uuid,${actor.workspaceId}::uuid,${actor.pageId}::uuid,'after',${Buffer.from(binary)},${input.title ?? page.title},${afterSnapshot.revision}::bigint)`.execute(
                trx,
              );
              await sql`update document_recovery_snapshots set history_id=${afterHistory.id}::uuid where operation_id=${claim.id}::uuid and side='after'`.execute(
                trx,
              );
            }
            const after = await this.gate(trx, actor.pageId);
            const response = {
              operationId: claim.id,
              status: 'committed',
              pageId: actor.pageId,
              revision: after.revision,
              versionToken: this.engine().versionToken({
                ...claim.version,
                revision: after.revision,
              }),
              changed,
              persistedAt: (
                await sql<{ at: Date }>`select clock_timestamp() as at`.execute(
                  trx,
                )
              ).rows[0].at.toISOString(),
            };
            await settleQuota(trx, claim.id, changed);
            await sql`update document_operations set status='committed',result=${JSON.stringify(response)}::text::jsonb,committed_at=clock_timestamp() where id=${claim.id}::uuid`.execute(
              trx,
            );
            await sql`insert into document_outbox(operation_id,workspace_id,page_id,kind) values(${claim.id}::uuid,${actor.workspaceId}::uuid,${actor.pageId}::uuid,'sync')`.execute(
              trx,
            );
            return response;
          },
        );
        try {
          await this.syncCommitted(actor, result.operationId);
        } catch {
          /* Commit is authoritative; recovery retries synchronization. */
        }
        return result;
      } catch (error) {
        // A lost commit response is ambiguous. Only reject if the persisted operation is still running.
        await this.transaction(actor.workspaceId, async (trx) => {
          await this.lockPage(trx, actor);
          const gate = await this.gate(trx, actor.pageId);
          const operation = (
            await sql<{
              status: string;
            }>`select status from document_operations where id=${claim.id}::uuid for update`.execute(
              trx,
            )
          ).rows[0];
          if (
            operation?.status === 'running' &&
            gate?.operationId === claim.id &&
            gate.fence === claim.fence
          ) {
            await settleQuota(trx, claim.id, false);
            await sql`update document_operations set status='rejected' where id=${claim.id}::uuid`.execute(
              trx,
            );
            await sql`update document_gates set mode='open',operation_id=null,agent_until=null,fence=fence+1 where page_id=${actor.pageId}::uuid`.execute(
              trx,
            );
          }
        }).catch(() => {});
        throw error;
      }
    });
  }
  async findOperation(
    actor: Omit<AgentDocumentActor, 'pageId'>,
    lookup: string | { tool: string; key: string },
  ) {
    const selector =
      typeof lookup === 'string'
        ? sql`id=${lookup}::uuid`
        : sql`tool=${lookup.tool} and idempotency_key=${lookup.key}`;
    return this.transaction(actor.workspaceId, async (trx) => {
      const row = (
        await sql<{
          id: string;
          pageId: string;
          status: string;
          result: unknown;
          resultExpiredAt: Date | null;
        }>`select id,page_id,status,result,result_expired_at from document_operations where ${selector} and workspace_id=${actor.workspaceId}::uuid and user_id=${actor.userId}::uuid and client_id=${actor.clientId} and grant_id=${actor.grantId}::uuid`.execute(
          trx,
        )
      ).rows[0];
      if (!row) return denied();
      const page = await trx
        .selectFrom('pages')
        .select(['id', 'spaceId', 'deletedAt'])
        .where('id', '=', row.pageId)
        .where('workspaceId', '=', actor.workspaceId)
        .executeTakeFirst();
      if (!page || page.deletedAt) return { id: row.id, status: row.status };
      try {
        await this.assertGrantScope(trx, actor, page.spaceId, 'knowledge.read');
      } catch (error) {
        if (error instanceof ForbiddenException)
          return { id: row.id, status: row.status };
        throw error;
      }
      const roles = await this.members.getUserSpaceRoles(
        actor.userId,
        page.spaceId,
        trx,
      );
      const access = await this.permissions.canUserEditPage(
        actor.userId,
        page.id,
        trx,
      );
      if (roles?.length && access.canAccess && row.resultExpiredAt)
        return conflict('OPERATION_RESULT_EXPIRED');
      return roles?.length && access.canAccess
        ? row
        : { id: row.id, status: row.status };
    });
  }
  async operation(actor: AgentDocumentActor, id: string) {
    return this.transaction(actor.workspaceId, async (trx) => {
      const page = await this.lockPage(trx, actor);
      await this.assertGrant(trx, actor, page.spaceId);
      const row = (
        await sql<{
          id: string;
          status: string;
          result: unknown;
          resultExpiredAt: Date | null;
        }>`select id,status,result,result_expired_at from document_operations
        where id=${id}::uuid and workspace_id=${actor.workspaceId}::uuid and page_id=${actor.pageId}::uuid
        and user_id=${actor.userId}::uuid and client_id=${actor.clientId} and grant_id=${actor.grantId}::uuid`.execute(
          trx,
        )
      ).rows[0];
      if (!row) return denied();
      if (row.resultExpiredAt) return conflict('OPERATION_RESULT_EXPIRED');
      return row;
    });
  }
  async syncCommitted(actor: DocumentActor, operationId: string) {
    await this.transaction(actor.workspaceId, async (trx) => {
      const page = await this.lockPage(trx, actor);
      const gate = await this.gate(trx, actor.pageId);
      if (gate?.operationId !== operationId) return;
      const operation = (
        await sql<{
          status: string;
        }>`select status from document_operations where id=${operationId}::uuid`.execute(
          trx,
        )
      ).rows[0];
      if (operation?.status !== 'committed')
        return conflict('OPERATION_RECONCILING');
      const live = this.live.get(actor.pageId);
      if (gate.ownerValid && (!live || live.ownerEpoch !== gate.ownerEpoch))
        return;
      if (live)
        Y.applyUpdate(live.doc, new Uint8Array(page.ydoc), 'durable-agent');
      await sql`update document_gates set mode='open',operation_id=null,agent_until=null where page_id=${actor.pageId}::uuid`.execute(
        trx,
      );
      await sql`update document_outbox set delivered_at=clock_timestamp() where operation_id=${operationId}::uuid and kind='sync'`.execute(
        trx,
      );
    });
  }
  unload(pageId: string) {
    clearInterval(this.ownerTimers.get(pageId));
    this.ownerTimers.delete(pageId);
    this.live.delete(pageId);
  }
  onModuleDestroy() {
    clearInterval(this.recoveryTimer);
    for (const pageId of this.live.keys()) this.unload(pageId);
  }
  private async serial<T>(pageId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(pageId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.queues.set(pageId, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(pageId) === next) this.queues.delete(pageId);
    }
  }
}
