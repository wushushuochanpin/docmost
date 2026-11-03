import { tiptapExtensions } from '../collaboration.util';
import { Injectable, Logger } from '@nestjs/common';
import {
  Extension,
  onLoadDocumentPayload,
  connectedPayload,
  beforeSyncPayload,
  onStatelessPayload,
  onDisconnectPayload,
  afterUnloadDocumentPayload,
} from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import {
  DocumentCommandService,
  DocumentPermit,
} from '../../core/document-command/document-command.service';

// Loading a durable document must not trigger the generic persistence hook:
// its authoritative state is already in document_updates/page.ydoc.
const DURABLE_LOAD_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
};

@Injectable()
export class DurableDocumentExtension implements Extension {
  private readonly logger = new Logger(DurableDocumentExtension.name);
  private readonly heartbeats = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  constructor(private readonly commands: DocumentCommandService) {}
  async onLoadDocument(data: onLoadDocumentPayload) {
    const user = data.context?.user;
    if (!user) return;
    const bytes = await this.commands
      .load(
        {
          workspaceId: user.workspaceId,
          userId: user.id,
          pageId: data.documentName.split('.')[1],
        },
        data.document,
      )
      .catch((error) => {
        // Hocuspocus has not registered this newly allocated document yet, so its unload path cannot dispose it on a failed load.
        data.document.destroy();
        throw error;
      });
    if (bytes) {
      Y.applyUpdate(data.document, bytes, DURABLE_LOAD_ORIGIN);
      data.context.durableDocument = true;
    }
  }
  async connected(data: connectedPayload) {
    if (data.requestParameters.get('documentEdit') === '0')
      data.connection.readOnly = true;
    if (data.connection.readOnly) return;
    const user = data.context?.user;
    const pageId = data.documentName.split('.')[1];
    if (
      !user ||
      !(await this.commands.isManaged({
        workspaceId: user.workspaceId,
        pageId,
      }))
    )
      return;
    if (
      data.requestParameters.get('documentProtocol') !== '1' ||
      !data.context.sessionId
    ) {
      data.connection.readOnly = true;
      data.connection.close({
        code: 4409,
        reason: 'DOCUMENT_PROTOCOL_REQUIRED',
      });
      return;
    }
    const permit = await this.commands.acquirePermit(
      { workspaceId: user.workspaceId, userId: user.id, pageId },
      data.context.sessionId,
    );
    if (!permit) {
      data.connection.readOnly = true;
      data.connection.close({
        code: 4409,
        reason: 'DOCUMENT_PERMIT_UNAVAILABLE',
      });
      return;
    }
    data.context.documentPermit = permit;
    data.connection.sendStateless(
      JSON.stringify({
        type: 'document_permit',
        editEpoch: permit.editEpoch,
        ownerEpoch: permit.ownerEpoch,
      }),
    );
    let renewing = false;
    const renew = async () => {
      if (renewing || data.connection.readOnly) return;
      renewing = true;
      try {
        await this.commands.heartbeat(permit);
        return;
      } catch {
        // A single database blip must not discard a valid 30s permit. Retry
        // once inside the remaining lifetime before ending the edit lease.
        try {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await this.commands.heartbeat(permit);
          return;
        } catch {
          // fall through to the single close path below
        }
      } finally {
        renewing = false;
      }
      clearInterval(timer);
      this.heartbeats.delete(data.socketId);
      data.connection.readOnly = true;
      data.connection.close({
        code: 4409,
        reason: 'DOCUMENT_PERMIT_EXPIRED',
      });
      this.logger.warn(
        { pageId, code: 'DOCUMENT_PERMIT_EXPIRED' },
        'Document permit renewal failed',
      );
    };
    const timer = setInterval(() => void renew(), 10000);
    timer.unref();
    this.heartbeats.set(data.socketId, timer);
  }
  async beforeSync(data: beforeSyncPayload) {
    if (data.type === 0 || data.connection.readOnly) return;
    const user = data.context?.user;
    const pageId = data.documentName.split('.')[1];
    if (
      !user ||
      !(await this.commands.isManaged({
        workspaceId: user.workspaceId,
        pageId,
      }))
    )
      return;
    // Raw sync payloads carry no edit epoch. Accepting them after reconnect could replay an offline draft over an Agent commit.
    data.connection.close({
      code: 4409,
      reason: 'DOCUMENT_UPDATE_ENVELOPE_REQUIRED',
    });
    throw new Error('DOCUMENT_UPDATE_ENVELOPE_REQUIRED');
  }
  async onStateless(data: onStatelessPayload) {
    const permit = data.connection.context?.documentPermit as
      | DocumentPermit
      | undefined;
    if (!permit || data.connection.readOnly) return;
    if (data.payload.length > 1500000) {
      this.rejectUpdate(data, undefined, 'CONTENT_TOO_LARGE');
      return;
    }
    let message: {
      type?: string;
      historyId?: string;
      versionToken?: string;
      updateId?: string;
      editEpoch?: string;
      update?: string;
    };
    try {
      message = JSON.parse(data.payload);
    } catch {
      this.rejectUpdate(data, undefined, 'INVALID_DOCUMENT_ENVELOPE');
      return;
    }
    if (message.type === 'document_restore') {
      if (
        !/^[0-9a-f-]{36}$/i.test(message.historyId ?? '') ||
        !message.updateId ||
        !/^[-a-zA-Z0-9_]{1,128}$/.test(message.updateId) ||
        typeof message.versionToken !== 'string' ||
        message.versionToken.length > 4096 ||
        message.editEpoch !== permit.editEpoch
      ) {
        data.connection.sendStateless(
          JSON.stringify({
            type: 'document_restore_result',
            updateId: message.updateId,
            error: 'INVALID_DOCUMENT_ENVELOPE',
          }),
        );
        return;
      }
      try {
        const result = await this.commands.restoreHistory(
          permit,
          message.historyId,
          message.versionToken,
          message.updateId,
          (content) =>
            TiptapTransformer.toYdoc(content, 'default', tiptapExtensions),
          (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
        );
        data.connection.sendStateless(
          JSON.stringify({
            type: 'document_restore_result',
            updateId: message.updateId,
            ...result,
          }),
        );
      } catch (error) {
        data.connection.sendStateless(
          JSON.stringify({
            type: 'document_restore_result',
            updateId: message.updateId,
            error:
              error instanceof Error &&
              [
                'REVISION_CONFLICT',
                'DOCUMENT_BUSY',
                'DOCUMENT_PERMIT_EXPIRED',
              ].includes(error.message)
                ? error.message
                : 'RESTORE_REJECTED',
          }),
        );
      }
      return;
    }
    if (message.type !== 'document_update') return;
    if (
      !message.updateId ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(message.updateId) ||
      message.editEpoch !== permit.editEpoch ||
      typeof message.update !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        message.update,
      )
    ) {
      this.rejectUpdate(data, message.updateId, 'INVALID_DOCUMENT_ENVELOPE');
      return;
    }
    let revision: string;
    try {
      revision = await this.commands.ingest(
        permit,
        Buffer.from(message.update, 'base64'),
        (doc) => TiptapTransformer.fromYdoc(doc, 'default'),
        message.updateId,
      );
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          'REVISION_CONFLICT',
          'DOCUMENT_BUSY',
          'DOCUMENT_PERMIT_EXPIRED',
          'DOCUMENT_OWNER_CHANGED',
        ].includes(error.message)
          ? error.message
          : 'DOCUMENT_UPDATE_REJECTED';
      this.rejectUpdate(data, message.updateId, code);
      return;
    }
    data.connection.sendStateless(
      JSON.stringify({
        type: 'durable_ack',
        updateId: message.updateId,
        revision,
        editEpoch: permit.editEpoch,
      }),
    );
  }

  /** Rejecting an update is normal backpressure, not an unhandled rejection.
   * The client keeps its local draft and must explicitly recover. */
  private rejectUpdate(
    data: onStatelessPayload,
    updateId: string | undefined,
    error: string,
  ) {
    data.connection.sendStateless(
      JSON.stringify({
        type: 'document_update_rejected',
        updateId,
        error,
      }),
    );
    data.connection.readOnly = true;
    data.connection.close({ code: 4409, reason: error });
  }

  async onDisconnect(data: onDisconnectPayload) {
    clearInterval(this.heartbeats.get(data.socketId));
    this.heartbeats.delete(data.socketId);
    if (data.context?.documentPermit)
      await this.commands.release(data.context.documentPermit);
  }
  async afterUnloadDocument(data: afterUnloadDocumentPayload) {
    this.commands.unload(data.documentName.split('.')[1]);
  }
}
