import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v7 as uuid7 } from 'uuid';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import type { User } from '@docmost/db/types/entity.types';
import {
  EDITOR_SESSION_LEGACY_SESSION_ID,
  EDITOR_SESSION_GRANTED_EVENT,
  EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS,
  EDITOR_SESSION_REDIS_PREFIX,
  EDITOR_SESSION_REVOKED_EVENT,
  EDITOR_SESSION_SOCKET_TTL_MS,
  EDITOR_SESSION_STATE_TTL_MS,
  EDITOR_SESSION_TAKEOVER_GRACE_MS,
  EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT,
} from './editor-session.constants';
import {
  EditorSessionConflictException,
  EditorSessionForbiddenException,
  EditorSessionResourceNotFoundException,
} from './editor-session.errors';
import type {
  EditorSessionEventPayload,
  EditorSessionLeaseRecord,
  EditorSessionLeaseResponse,
  EditorSessionRef,
  EditorSessionResourceType,
  EditorSessionSocketRegistration,
  EditorSessionState,
  EditorSessionWriteIntent,
} from './editor-session.types';

type RealtimeEvent = {
  name: string;
  payload: EditorSessionEventPayload;
};

type StateMutationResult<T> = {
  nextState: EditorSessionState | null;
  response: T;
  events?: RealtimeEvent[];
};

type ValidateWriteOptions = {
  workspaceId: string;
  userId: string;
  resourceType: EditorSessionResourceType;
  resourceId: string;
  editSession?: EditorSessionRef | null;
  writeIntent?: EditorSessionWriteIntent;
  enforce: boolean;
};

@Injectable()
export class EditorSessionService {
  private readonly logger = new Logger(EditorSessionService.name);
  private readonly redis: Redis;

  constructor(
    private readonly redisService: RedisService,
    private readonly pageRepo: PageRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly environmentService: EnvironmentService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async acquire(opts: {
    workspaceId: string;
    user: User;
    sessionId?: string | null;
    resourceType: EditorSessionResourceType;
    resourceId: string;
    clientId: string;
  }): Promise<EditorSessionLeaseResponse> {
    await this.validateResourceCanEdit(
      opts.resourceType,
      opts.resourceId,
      opts.workspaceId,
      opts.user,
    );

    if (!this.environmentService.isEditorSessionEnabled()) {
      const lease = await this.createLease(opts);
      return this.buildResponse('active', true, opts, lease);
    }

    const key = this.stateKey(
      opts.workspaceId,
      opts.resourceType,
      opts.resourceId,
      opts.user.id,
    );

    const result = await this.mutateState(key, async (state, now) => {
      if (!state || this.isExpired(state.active, now)) {
        const active = await this.createLease(opts, now);
        const nextState = this.buildInitialState(opts, active, now);
        return {
          nextState,
          response: this.buildResponse('active', true, opts, active),
        };
      }

      if (this.isSameClient(state.active, opts.sessionId, opts.clientId)) {
        state.active = await this.refreshLease(state.active, opts, now);
        state.updatedAt = now;
        if (state.status === 'takeover_pending') {
          return {
            nextState: state,
            response: this.buildResponse(
              'takeover_requested',
              false,
              opts,
              state.active,
              state,
            ),
          };
        }

        return {
          nextState: state,
          response: this.buildResponse('active', true, opts, state.active),
        };
      }

      if (
        state.status === 'takeover_pending' &&
        state.pending &&
        this.isSameClient(state.pending, opts.sessionId, opts.clientId)
      ) {
        state.pending = await this.refreshLease(state.pending, opts, now);
        if (this.isPromotionDue(state, now)) {
          return this.promotePending(state, opts, now);
        }

        state.updatedAt = now;
        return {
          nextState: state,
          response: this.buildResponse(
            'pending_takeover',
            false,
            opts,
            state.pending,
            state,
          ),
        };
      }

      this.logger.warn(
        `Editor session blocked ${this.describeResource(
          opts.workspaceId,
          opts.user.id,
          opts.resourceType,
          opts.resourceId,
        )} requester=${this.describeClient(
          opts.sessionId,
          opts.clientId,
        )} active=${this.describeLease(state.active)} pending=${this.describeLease(
          state.pending,
        )}`,
      );
      return {
        nextState: state,
        response: this.buildResponse(
          'blocked_by_other',
          false,
          opts,
          null,
          state,
        ),
      };
    });

    this.emitRealtimeEvents(result.events);
    return result.response;
  }

  async takeover(opts: {
    workspaceId: string;
    user: User;
    sessionId?: string | null;
    resourceType: EditorSessionResourceType;
    resourceId: string;
    clientId: string;
  }): Promise<EditorSessionLeaseResponse> {
    await this.validateResourceCanEdit(
      opts.resourceType,
      opts.resourceId,
      opts.workspaceId,
      opts.user,
    );

    if (!this.environmentService.isEditorSessionEnabled()) {
      const lease = await this.createLease(opts);
      return this.buildResponse('active', true, opts, lease);
    }

    const key = this.stateKey(
      opts.workspaceId,
      opts.resourceType,
      opts.resourceId,
      opts.user.id,
    );

    const result = await this.mutateState(key, async (state, now) => {
      if (!state || this.isExpired(state.active, now)) {
        const active = await this.createLease(opts, now);
        const nextState = this.buildInitialState(opts, active, now);
        return {
          nextState,
          response: this.buildResponse('active', true, opts, active),
        };
      }

      if (this.isSameClient(state.active, opts.sessionId, opts.clientId)) {
        state.active = await this.refreshLease(state.active, opts, now);
        state.updatedAt = now;

        if (state.status === 'takeover_pending' && state.pending) {
          const cancelledPending = state.pending;
          const nextState: EditorSessionState = {
            ...state,
            status: 'active',
            pending: null,
            takeoverId: null,
            graceUntil: null,
            handoffFlushUsed: false,
            updatedAt: now,
          };

          return {
            nextState,
            response: this.buildResponse(
              'active',
              true,
              opts,
              nextState.active,
              nextState,
            ),
            events: [
              this.realtimeEvent(EDITOR_SESSION_REVOKED_EVENT, {
                state,
                lease: cancelledPending,
                status: 'revoked',
                writable: false,
              }),
              this.realtimeEvent(EDITOR_SESSION_GRANTED_EVENT, {
                state: nextState,
                lease: nextState.active,
                status: 'active',
                writable: true,
              }),
            ],
          };
        }

        return {
          nextState: state,
          response: this.buildResponse('active', true, opts, state.active),
        };
      }

      if (
        state.status === 'takeover_pending' &&
        state.pending &&
        this.isSameClient(state.pending, opts.sessionId, opts.clientId)
      ) {
        state.pending = await this.refreshLease(state.pending, opts, now);
        if (this.isPromotionDue(state, now)) {
          return this.promotePending(state, opts, now);
        }

        state.updatedAt = now;
        return {
          nextState: state,
          response: this.buildResponse(
            'pending_takeover',
            false,
            opts,
            state.pending,
            state,
          ),
        };
      }

      const pending = await this.createLease(opts, now);
      const takeoverId = uuid7();
      const active = await this.refreshLeaseSocket(state, state.active);
      const previousPending = state.pending ?? null;

      const nextState: EditorSessionState = {
        ...state,
        status: 'takeover_pending',
        active,
        pending: { ...pending, takeoverId },
        takeoverId,
        graceUntil: now + EDITOR_SESSION_TAKEOVER_GRACE_MS,
        handoffFlushUsed: false,
        updatedAt: now,
      };

      this.logger.warn(
        `Editor session takeover requested ${this.describeResource(
          opts.workspaceId,
          opts.user.id,
          opts.resourceType,
          opts.resourceId,
        )} requester=${this.describeClient(
          opts.sessionId,
          opts.clientId,
        )} active=${this.describeLease(active)} pending=${this.describeLease(
          nextState.pending,
        )}`,
      );
      const events: RealtimeEvent[] = [
        this.realtimeEvent(EDITOR_SESSION_TAKEOVER_REQUESTED_EVENT, {
          state: nextState,
          lease: active,
          status: 'takeover_requested',
          writable: false,
        }),
      ];

      if (previousPending) {
        events.push(
          this.realtimeEvent(EDITOR_SESSION_REVOKED_EVENT, {
            state,
            lease: previousPending,
            status: 'revoked',
            writable: false,
          }),
        );
      }

      return {
        nextState,
        response: this.buildResponse(
          'pending_takeover',
          false,
          opts,
          nextState.pending!,
          nextState,
        ),
        events,
      };
    });

    this.emitRealtimeEvents(result.events);
    return result.response;
  }

  async heartbeat(opts: {
    workspaceId: string;
    userId: string;
    resourceType: EditorSessionResourceType;
    resourceId: string;
    editSession: EditorSessionRef;
  }): Promise<EditorSessionLeaseResponse> {
    if (!this.environmentService.isEditorSessionEnabled()) {
      return this.buildResponse('active', true, opts, opts.editSession);
    }

    const key = this.stateKey(
      opts.workspaceId,
      opts.resourceType,
      opts.resourceId,
      opts.userId,
    );

    const result = await this.mutateState(key, async (state, now) => {
      if (!state || this.isExpired(state.active, now)) {
        throw new EditorSessionConflictException('Editor session expired');
      }

      if (this.matchesLease(state.active, opts.editSession)) {
        state.active = await this.refreshLease(
          state.active,
          {
            workspaceId: opts.workspaceId,
            user: { id: opts.userId } as User,
            sessionId: opts.editSession.sessionId,
            clientId: opts.editSession.clientId,
          },
          now,
        );
        state.updatedAt = now;

        if (state.status === 'takeover_pending') {
          return {
            nextState: state,
            response: this.buildResponse(
              'takeover_requested',
              false,
              opts,
              state.active,
              state,
            ),
          };
        }

        return {
          nextState: state,
          response: this.buildResponse('active', true, opts, state.active),
        };
      }

      if (state.pending && this.matchesLease(state.pending, opts.editSession)) {
        state.pending = await this.refreshLease(
          state.pending,
          {
            workspaceId: opts.workspaceId,
            user: { id: opts.userId } as User,
            sessionId: opts.editSession.sessionId,
            clientId: opts.editSession.clientId,
          },
          now,
        );

        if (this.isPromotionDue(state, now)) {
          return this.promotePending(state, opts, now);
        }

        state.updatedAt = now;
        return {
          nextState: state,
          response: this.buildResponse(
            'pending_takeover',
            false,
            opts,
            state.pending,
            state,
          ),
        };
      }

      this.logger.warn(
        `Editor session heartbeat conflict ${this.describeResource(
          opts.workspaceId,
          opts.userId,
          opts.resourceType,
          opts.resourceId,
        )} editSession=${this.describeEditSession(
          opts.editSession,
        )} active=${this.describeLease(state.active)} pending=${this.describeLease(
          state.pending,
        )}`,
      );
      throw new EditorSessionConflictException('Editor session is not active');
    });

    this.emitRealtimeEvents(result.events);
    return result.response;
  }

  async release(opts: {
    workspaceId: string;
    userId: string;
    resourceType: EditorSessionResourceType;
    resourceId: string;
    editSession: EditorSessionRef;
    reason?: 'unload' | 'takeover_ack' | 'manual';
  }): Promise<EditorSessionLeaseResponse> {
    if (!this.environmentService.isEditorSessionEnabled()) {
      return this.buildResponse('revoked', false, opts, opts.editSession);
    }

    const key = this.stateKey(
      opts.workspaceId,
      opts.resourceType,
      opts.resourceId,
      opts.userId,
    );

    const result = await this.mutateState(key, async (state, now) => {
      if (!state) {
        return {
          nextState: null,
          response: this.buildResponse(
            'revoked',
            false,
            opts,
            opts.editSession,
          ),
        };
      }

      if (this.matchesLease(state.active, opts.editSession)) {
        if (state.pending) {
          const takeoverMatches =
            opts.reason === 'takeover_ack' &&
            (!state.takeoverId ||
              state.takeoverId === opts.editSession.takeoverId);
          if (takeoverMatches || opts.reason !== 'manual') {
            const promoted = this.promotePending(state, opts, now);
            return {
              ...promoted,
              response: this.buildResponse(
                'revoked',
                false,
                opts,
                opts.editSession,
              ),
            };
          }
        }

        return {
          nextState: null,
          response: this.buildResponse(
            'revoked',
            false,
            opts,
            opts.editSession,
          ),
          events:
            opts.reason === 'unload'
              ? []
              : [
                  this.realtimeEvent(EDITOR_SESSION_REVOKED_EVENT, {
                    state,
                    lease: state.active,
                    status: 'revoked',
                    writable: false,
                  }),
                ],
        };
      }

      if (state.pending && this.matchesLease(state.pending, opts.editSession)) {
        const nextState: EditorSessionState = {
          ...state,
          status: 'active',
          pending: null,
          takeoverId: null,
          graceUntil: null,
          handoffFlushUsed: false,
          updatedAt: now,
        };

        return {
          nextState,
          response: this.buildResponse(
            'revoked',
            false,
            opts,
            opts.editSession,
          ),
          events: [
            this.realtimeEvent(EDITOR_SESSION_REVOKED_EVENT, {
              state,
              lease: state.pending,
              status: 'revoked',
              writable: false,
            }),
          ],
        };
      }

      return {
        nextState: state,
        response: this.buildResponse('revoked', false, opts, opts.editSession),
      };
    });

    this.emitRealtimeEvents(result.events);
    return result.response;
  }

  async registerClient(
    registration: Omit<EditorSessionSocketRegistration, 'updatedAt'>,
  ) {
    const value: EditorSessionSocketRegistration = {
      ...registration,
      updatedAt: Date.now(),
    };
    await this.redis.set(
      this.socketKey(
        registration.workspaceId,
        registration.userId,
        registration.clientId,
      ),
      JSON.stringify(value),
      'PX',
      EDITOR_SESSION_SOCKET_TTL_MS,
    );
  }

  async unregisterClientSocket(opts: {
    workspaceId: string;
    userId: string;
    clientId: string;
    socketId: string;
  }) {
    const key = this.socketKey(opts.workspaceId, opts.userId, opts.clientId);
    const raw = await this.redis.get(key);
    if (!raw) return;

    try {
      const registration = JSON.parse(raw) as EditorSessionSocketRegistration;
      if (registration.socketId === opts.socketId) {
        await this.redis.del(key);
      }
    } catch {
      await this.redis.del(key);
    }
  }

  async validatePageWrite(opts: {
    workspaceId: string;
    userId: string;
    pageId: string;
    editSession?: EditorSessionRef | null;
    writeIntent?: EditorSessionWriteIntent;
  }): Promise<void> {
    await this.validateWrite({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      resourceType: 'page',
      resourceId: opts.pageId,
      editSession: opts.editSession,
      writeIntent: opts.writeIntent ?? 'normal',
      enforce: this.environmentService.isEditorSessionStrictWrite(),
    });
  }

  async validateFileWrite(opts: {
    workspaceId: string;
    userId: string;
    attachmentId: string;
    editSession?: EditorSessionRef | null;
    writeIntent?: EditorSessionWriteIntent;
  }): Promise<void> {
    if (!this.environmentService.isEditorSessionFileEnabled()) {
      return;
    }

    await this.validateWrite({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      resourceType: 'file',
      resourceId: opts.attachmentId,
      editSession: opts.editSession,
      writeIntent: opts.writeIntent ?? 'normal',
      enforce: this.environmentService.isEditorSessionStrictWrite(),
    });
  }

  async validateCollabConnection(opts: {
    workspaceId: string;
    userId: string;
    pageId: string;
    editSession?: EditorSessionRef | null;
  }): Promise<void> {
    if (
      !this.environmentService.isEditorSessionEnabled() ||
      !this.environmentService.isEditorSessionCollabValidate()
    ) {
      return;
    }

    await this.validateWrite({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      resourceType: 'page',
      resourceId: opts.pageId,
      editSession: opts.editSession,
      writeIntent: 'normal',
      enforce: true,
    });
  }

  private async validateWrite(opts: ValidateWriteOptions): Promise<void> {
    if (!this.environmentService.isEditorSessionEnabled()) {
      return;
    }

    if (!opts.enforce) {
      try {
        await this.validateWrite({ ...opts, enforce: true });
      } catch (err) {
        this.logger.warn(
          `Editor session warn-only write user=${opts.userId} ` +
            `resource=${opts.resourceType}:${opts.resourceId} ` +
            `reason=${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    if (!opts.editSession) {
      throw new EditorSessionConflictException('Missing editor session');
    }

    if (opts.writeIntent === 'handoff_flush') {
      await this.consumeHandoffFlush(opts);
      return;
    }

    const state = this.parseState(
      await this.redis.get(
        this.stateKey(
          opts.workspaceId,
          opts.resourceType,
          opts.resourceId,
          opts.userId,
        ),
      ),
      Date.now(),
    );

    if (
      !state ||
      state.status !== 'active' ||
      !this.matchesLease(state.active, opts.editSession)
    ) {
      this.logger.warn(
        `Editor session write conflict ${this.describeResource(
          opts.workspaceId,
          opts.userId,
          opts.resourceType,
          opts.resourceId,
        )} editSession=${this.describeEditSession(
          opts.editSession,
        )} state=${state?.status ?? 'none'} active=${this.describeLease(
          state?.active,
        )} pending=${this.describeLease(state?.pending)}`,
      );
      throw new EditorSessionConflictException('Editor session is not active');
    }
  }

  private async consumeHandoffFlush(opts: ValidateWriteOptions): Promise<void> {
    const key = this.stateKey(
      opts.workspaceId,
      opts.resourceType,
      opts.resourceId,
      opts.userId,
    );

    await this.mutateState(key, async (state, now) => {
      if (
        !state ||
        !opts.editSession ||
        state.status !== 'takeover_pending' ||
        !this.matchesLease(state.active, opts.editSession) ||
        !state.takeoverId ||
        state.takeoverId !== opts.editSession.takeoverId ||
        state.handoffFlushUsed ||
        !state.graceUntil ||
        now > state.graceUntil + EDITOR_SESSION_TAKEOVER_GRACE_MS
      ) {
        throw new EditorSessionConflictException('Invalid handoff flush');
      }

      return {
        nextState: {
          ...state,
          handoffFlushUsed: true,
          updatedAt: now,
        },
        response: undefined,
      };
    });
  }

  private async validateResourceCanEdit(
    resourceType: EditorSessionResourceType,
    resourceId: string,
    workspaceId: string,
    user: User,
  ): Promise<void> {
    try {
      if (resourceType === 'page') {
        const page = await this.pageRepo.findById(resourceId, { workspaceId });
        if (!page || page.deletedAt) {
          throw new EditorSessionResourceNotFoundException();
        }
        await this.pageAccessService.validateCanEdit(page, user);
        return;
      }

      const attachment = await this.attachmentRepo.findById(resourceId, {
        workspaceId,
      });
      if (!attachment || attachment.deletedAt || !attachment.pageId) {
        throw new EditorSessionResourceNotFoundException();
      }

      const page = await this.pageRepo.findById(attachment.pageId, {
        workspaceId,
      });
      if (!page || page.deletedAt) {
        throw new EditorSessionResourceNotFoundException();
      }
      await this.pageAccessService.validateCanEdit(page, user);
    } catch (err) {
      if (err instanceof EditorSessionResourceNotFoundException) {
        throw err;
      }
      throw new EditorSessionForbiddenException();
    }
  }

  private async mutateState<T>(
    key: string,
    mutate: (
      state: EditorSessionState | null,
      now: number,
    ) => Promise<StateMutationResult<T>>,
  ): Promise<StateMutationResult<T>> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.redis.watch(key);
      const now = Date.now();
      const state = this.parseState(await this.redis.get(key), now);

      let result: StateMutationResult<T>;
      try {
        result = await mutate(state, now);
      } catch (err) {
        await this.redis.unwatch();
        throw err;
      }

      const transaction = this.redis.multi();
      if (result.nextState) {
        transaction.set(
          key,
          JSON.stringify(result.nextState),
          'PX',
          EDITOR_SESSION_STATE_TTL_MS,
        );
      } else {
        transaction.del(key);
      }

      const committed = await transaction.exec();
      if (committed) {
        return result;
      }
    }

    throw new EditorSessionConflictException('Editor session changed');
  }

  private parseState(
    raw: string | null,
    now: number,
  ): EditorSessionState | null {
    if (!raw) return null;

    try {
      const state = JSON.parse(raw) as EditorSessionState;
      if (!state?.active || this.isExpired(state.active, now)) {
        return null;
      }
      return state;
    } catch {
      return null;
    }
  }

  private async createLease(
    opts: {
      workspaceId: string;
      user: User;
      sessionId?: string | null;
      resourceType: EditorSessionResourceType;
      resourceId: string;
      clientId: string;
    },
    now = Date.now(),
  ): Promise<EditorSessionLeaseRecord> {
    const token = await this.redis.incr(
      this.seqKey(
        opts.workspaceId,
        opts.resourceType,
        opts.resourceId,
        opts.user.id,
      ),
    );

    return {
      sessionId: this.normalizeSessionId(opts.sessionId),
      clientId: opts.clientId,
      leaseId: uuid7(),
      token,
      socketId: await this.getRegisteredSocketId(
        opts.workspaceId,
        opts.user.id,
        opts.clientId,
      ),
      startedAt: now,
      lastHeartbeatAt: now,
    };
  }

  private buildInitialState(
    opts: {
      workspaceId: string;
      user: User;
      resourceType: EditorSessionResourceType;
      resourceId: string;
    },
    active: EditorSessionLeaseRecord,
    now: number,
  ): EditorSessionState {
    return {
      version: 1,
      workspaceId: opts.workspaceId,
      userId: opts.user.id,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      status: 'active',
      active,
      pending: null,
      takeoverId: null,
      graceUntil: null,
      handoffFlushUsed: false,
      updatedAt: now,
    };
  }

  private async refreshLease(
    lease: EditorSessionLeaseRecord,
    opts: {
      workspaceId: string;
      user: User;
      clientId: string;
      sessionId?: string | null;
    },
    now: number,
  ): Promise<EditorSessionLeaseRecord> {
    return {
      ...lease,
      sessionId: this.normalizeSessionId(opts.sessionId),
      socketId:
        (await this.getRegisteredSocketId(
          opts.workspaceId,
          opts.user.id,
          opts.clientId,
        )) ?? lease.socketId,
      lastHeartbeatAt: now,
    };
  }

  private async refreshLeaseSocket(
    state: EditorSessionState,
    lease: EditorSessionLeaseRecord,
  ): Promise<EditorSessionLeaseRecord> {
    return {
      ...lease,
      socketId:
        (await this.getRegisteredSocketId(
          state.workspaceId,
          state.userId,
          lease.clientId,
        )) ?? lease.socketId,
    };
  }

  private promotePending(
    state: EditorSessionState,
    opts: {
      workspaceId: string;
      userId?: string;
      user?: User;
      resourceType: EditorSessionResourceType;
      resourceId: string;
    },
    now: number,
  ): StateMutationResult<EditorSessionLeaseResponse> {
    if (!state.pending) {
      throw new EditorSessionConflictException('No pending editor session');
    }

    const oldActive = state.active;
    const promoted = {
      ...state.pending,
      takeoverId: undefined,
      lastHeartbeatAt: now,
    };
    const nextState: EditorSessionState = {
      ...state,
      status: 'active',
      active: promoted,
      pending: null,
      takeoverId: null,
      graceUntil: null,
      handoffFlushUsed: false,
      updatedAt: now,
    };

    return {
      nextState,
      response: this.buildResponse('active', true, opts, promoted, nextState),
      events: [
        this.realtimeEvent(EDITOR_SESSION_REVOKED_EVENT, {
          state,
          lease: oldActive,
          status: 'revoked',
          writable: false,
        }),
        this.realtimeEvent(EDITOR_SESSION_GRANTED_EVENT, {
          state: nextState,
          lease: promoted,
          status: 'active',
          writable: true,
        }),
      ],
    };
  }

  private realtimeEvent(
    name: string,
    opts: {
      state: EditorSessionState;
      lease: EditorSessionLeaseRecord;
      status: EditorSessionEventPayload['status'];
      writable: boolean;
    },
  ): RealtimeEvent {
    return {
      name,
      payload: {
        workspaceId: opts.state.workspaceId,
        userId: opts.state.userId,
        socketId: opts.lease.socketId,
        resourceType: opts.state.resourceType,
        resourceId: opts.state.resourceId,
        clientId: opts.lease.clientId,
        takeoverId: opts.state.takeoverId,
        lease: this.toEditSession(opts.lease, opts.state.takeoverId),
        status: opts.status,
        writable: opts.writable,
        graceUntil: opts.state.graceUntil,
      },
    };
  }

  private emitRealtimeEvents(events?: RealtimeEvent[]) {
    for (const event of events ?? []) {
      this.eventEmitter.emit(event.name, event.payload);
    }
  }

  private buildResponse(
    status: EditorSessionLeaseResponse['status'],
    writable: boolean,
    opts: {
      resourceType: EditorSessionResourceType;
      resourceId: string;
    },
    lease?: EditorSessionRef | EditorSessionLeaseRecord | null,
    state?: EditorSessionState | null,
  ): EditorSessionLeaseResponse {
    return {
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      status,
      writable,
      editSession: lease
        ? this.toEditSession(lease, state?.takeoverId)
        : undefined,
      takeoverId: state?.takeoverId ?? lease?.takeoverId ?? null,
      graceUntil: state?.graceUntil ?? null,
      activeClientId: state?.active?.clientId ?? null,
      pendingClientId: state?.pending?.clientId ?? null,
    };
  }

  private toEditSession(
    lease: EditorSessionRef | EditorSessionLeaseRecord,
    takeoverId?: string | null,
  ): EditorSessionRef {
    return {
      sessionId: lease.sessionId,
      clientId: lease.clientId,
      leaseId: lease.leaseId,
      token: lease.token,
      ...(takeoverId ? { takeoverId } : {}),
    };
  }

  private isSameClient(
    lease: EditorSessionLeaseRecord,
    sessionId: string | null | undefined,
    clientId: string,
  ): boolean {
    return (
      lease.clientId === clientId &&
      lease.sessionId === this.normalizeSessionId(sessionId)
    );
  }

  private matchesLease(
    lease: EditorSessionLeaseRecord,
    editSession: EditorSessionRef,
  ): boolean {
    return (
      lease.clientId === editSession.clientId &&
      lease.sessionId === this.normalizeSessionId(editSession.sessionId) &&
      lease.leaseId === editSession.leaseId &&
      lease.token === editSession.token
    );
  }

  private isExpired(lease: EditorSessionLeaseRecord, now: number): boolean {
    return now - lease.lastHeartbeatAt > EDITOR_SESSION_HEARTBEAT_TIMEOUT_MS;
  }

  private describeResource(
    workspaceId: string,
    userId: string,
    resourceType: EditorSessionResourceType,
    resourceId: string,
  ): string {
    return `workspace=${workspaceId} user=${userId} resource=${resourceType}:${resourceId}`;
  }

  private describeClient(
    sessionId: string | null | undefined,
    clientId: string,
  ): string {
    return `session=${this.normalizeSessionId(sessionId)},client=${clientId}`;
  }

  private describeEditSession(editSession?: EditorSessionRef | null): string {
    if (!editSession) return 'none';

    return [
      `session=${this.normalizeSessionId(editSession.sessionId)}`,
      `client=${editSession.clientId}`,
      `lease=${editSession.leaseId}`,
      `token=${editSession.token}`,
      `takeover=${editSession.takeoverId ?? 'none'}`,
    ].join(',');
  }

  private describeLease(lease?: EditorSessionLeaseRecord | null): string {
    if (!lease) return 'none';

    return [
      `session=${lease.sessionId}`,
      `client=${lease.clientId}`,
      `lease=${lease.leaseId}`,
      `token=${lease.token}`,
      `socket=${lease.socketId ?? 'none'}`,
      `lastHeartbeatAt=${lease.lastHeartbeatAt}`,
    ].join(',');
  }

  private isPromotionDue(state: EditorSessionState, now: number): boolean {
    return Boolean(state.graceUntil && now >= state.graceUntil);
  }

  private async getRegisteredSocketId(
    workspaceId: string,
    userId: string,
    clientId: string,
  ): Promise<string | null> {
    const raw = await this.redis.get(
      this.socketKey(workspaceId, userId, clientId),
    );
    if (!raw) return null;
    try {
      const registration = JSON.parse(raw) as EditorSessionSocketRegistration;
      return registration.socketId ?? null;
    } catch {
      return null;
    }
  }

  private normalizeSessionId(sessionId?: string | null): string {
    return sessionId?.trim() || EDITOR_SESSION_LEGACY_SESSION_ID;
  }

  private stateKey(
    workspaceId: string,
    resourceType: EditorSessionResourceType,
    resourceId: string,
    userId: string,
  ): string {
    return [
      EDITOR_SESSION_REDIS_PREFIX,
      'lease',
      workspaceId,
      resourceType,
      resourceId,
      userId,
    ].join(':');
  }

  private seqKey(
    workspaceId: string,
    resourceType: EditorSessionResourceType,
    resourceId: string,
    userId: string,
  ): string {
    return [
      EDITOR_SESSION_REDIS_PREFIX,
      'seq',
      workspaceId,
      resourceType,
      resourceId,
      userId,
    ].join(':');
  }

  private socketKey(
    workspaceId: string,
    userId: string,
    clientId: string,
  ): string {
    return [
      EDITOR_SESSION_REDIS_PREFIX,
      'socket',
      workspaceId,
      userId,
      clientId,
    ].join(':');
  }
}
