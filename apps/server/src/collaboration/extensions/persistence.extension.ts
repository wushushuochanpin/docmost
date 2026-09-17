import {
  afterUnloadDocumentPayload,
  Extension,
  onChangePayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';
import * as Y from 'yjs';
import { Injectable, Logger } from '@nestjs/common';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { getPageId, jsonToText, tiptapExtensions } from '../collaboration.util';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { Queue } from 'bullmq';
import {
  extractMentions,
  extractUserMentions,
} from '../../common/helpers/prosemirror/utils';
import { isDeepStrictEqual } from 'node:util';
import {
  IPageHistoryJob,
  IPageMentionNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import { Page } from '@docmost/db/types/entity.types';
import { CollabHistoryService } from '../services/collab-history.service';
import {
  HISTORY_FAST_INTERVAL,
  HISTORY_FAST_THRESHOLD,
  HISTORY_INTERVAL,
} from '../constants';
import { TransclusionService } from '../../core/page/transclusion/transclusion.service';

@Injectable()
export class PersistenceExtension implements Extension {
  private readonly logger = new Logger(PersistenceExtension.name);
  private contributors: Map<string, Set<string>> = new Map();
  // Track last onChange time per document for stale-contributor cleanup.
  // Keys older than 5 minutes without a store are considered stale.
  private contributorLastSeen: Map<string, number> = new Map();
  private static readonly CONTRIBUTOR_STALE_MS = 5 * 60 * 1000;

  constructor(
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @InjectQueue(QueueName.HISTORY_QUEUE) private historyQueue: Queue,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    private readonly collabHistory: CollabHistoryService,
    private readonly transclusionService: TransclusionService,
  ) {}

  async onLoadDocument(data: onLoadDocumentPayload) {
    const { documentName, document } = data;
    const pageId = getPageId(documentName);
    const workspaceId = data.context?.user?.workspaceId as string | undefined;

    if (!document.isEmpty('default')) {
      return;
    }

    if (!workspaceId) {
      this.logger.warn(`Missing workspace in collab context for ${pageId}`);
      return;
    }

    const page = await this.pageRepo.findById(pageId, {
      workspaceId,
      includeContent: true,
      includeYdoc: true,
    });

    if (!page) {
      this.logger.warn('page not found');
      return;
    }

    if (page.ydoc) {
      this.logger.debug(`ydoc loaded from db: ${pageId}`);

      const doc = new Y.Doc();
      const dbState = new Uint8Array(page.ydoc);

      Y.applyUpdate(doc, dbState);
      return doc;
    }

    // if no ydoc state in db convert json in page.content to Ydoc.
    if (page.content) {
      this.logger.debug(`converting json to ydoc: ${pageId}`);

      const ydoc = TiptapTransformer.toYdoc(
        page.content,
        'default',
        tiptapExtensions,
      );

      Y.encodeStateAsUpdate(ydoc);
      return ydoc;
    }

    this.logger.debug(`creating fresh ydoc: ${pageId}`);
    return new Y.Doc();
  }

  async onStoreDocument(data: onStoreDocumentPayload) {
    const { documentName, document, lastContext } = data;

    const pageId = getPageId(documentName);
    const workspaceId = lastContext?.user?.workspaceId as string | undefined;

    const tiptapJson = TiptapTransformer.fromYdoc(document, 'default');
    const ydocState = Buffer.from(Y.encodeStateAsUpdate(document));

    let textContent = null;

    try {
      textContent = jsonToText(tiptapJson);
    } catch (err) {
      this.logger.warn(
        `jsonToText failed for page ${pageId}: ${err?.['message']}. Falling back to plain-text extraction.`,
      );
      // Fallback: extract plain text by stripping JSON structure
      try {
        textContent = this.extractPlainTextFallback(tiptapJson);
      } catch (fallbackErr) {
        this.logger.error(
          `Plain-text fallback also failed for page ${pageId}: ${fallbackErr?.['message']}`,
        );
      }
    }

    let page: Page = null;
    const editingUserIds = this.captureContributors(documentName);

    if (!workspaceId) {
      this.logger.warn(`Missing workspace in collab store context for ${pageId}`);
      return;
    }

    try {
      await executeTx(this.db, async (trx) => {
        page = await this.pageRepo.findById(pageId, {
          workspaceId,
          withLock: true,
          includeContent: true,
          trx,
        });

        if (!page) {
          this.logger.error(`Page with id ${pageId} not found`);
          return;
        }

        if (isDeepStrictEqual(tiptapJson, page.content)) {
          page = null;
          return;
        }

        let contributorIds = undefined;
        try {
          const existingContributors = page.contributorIds || [];
          contributorIds = Array.from(
            new Set([
              ...existingContributors,
              ...editingUserIds,
              page.creatorId,
            ]),
          );
        } catch (err) {
          this.logger.debug(`Contributors merge failed: ${err?.['message']}`);
        }

        await this.pageRepo.updatePage(
          {
            content: tiptapJson,
            textContent: textContent,
            ydoc: ydocState,
            lastUpdatedById: lastContext?.user?.id ?? null,
            contributorIds: contributorIds,
          },
          pageId,
          trx,
          workspaceId,
        );

        this.logger.debug(`Page updated: ${pageId} - SlugId: ${page.slugId}`);
      });
    } catch (err) {
      this.logger.error(`Failed to update page ${pageId}`, err);
    }

    if (page) {
      // Only clear contributors after a successful save. If the save failed,
      // contributors stay in the map but will be cleaned up by the stale-
      // contributor check on the next onChange for this document.
      this.clearContributors(documentName);
      await this.syncTransclusion(pageId, page.workspaceId, tiptapJson);
    }

    if (page) {
      await this.collabHistory.addContributors(pageId, editingUserIds);

      const mentions = extractMentions(tiptapJson);

      const userMentions = extractUserMentions(mentions);
      const oldMentions = page.content ? extractMentions(page.content) : [];
      const oldMentionedUserIds = extractUserMentions(oldMentions).map(
        (m) => m.entityId,
      );

      if (userMentions.length > 0) {
        await this.notificationQueue.add(QueueJob.PAGE_MENTION_NOTIFICATION, {
          userMentions: userMentions.map((m) => ({
            userId: m.entityId,
            mentionId: m.id,
            creatorId: m.creatorId,
          })),
          oldMentionedUserIds,
          pageId,
          spaceId: page.spaceId,
          workspaceId: page.workspaceId,
        } as IPageMentionNotificationJob);
      }

      await this.aiQueue.add(QueueJob.PAGE_CONTENT_UPDATED, {
        pageIds: [pageId],
        workspaceId: page.workspaceId,
      });

      await this.enqueuePageHistory(page);
    }
  }

  async onChange(data: onChangePayload) {
    const documentName = data.documentName;
    const userId = data.context?.user?.id;

    if (!userId) return;

    if (!this.contributors.has(documentName)) {
      this.contributors.set(documentName, new Set());
    }

    this.contributors.get(documentName).add(userId);
    this.contributorLastSeen.set(documentName, Date.now());
  }

  async afterUnloadDocument(data: afterUnloadDocumentPayload) {
    const documentName = data.documentName;
    this.contributors.delete(documentName);
    this.contributorLastSeen.delete(documentName);
  }

  /**
   * Capture current contributors without removing them, and discard any
   * that have been idle beyond CONTRIBUTOR_STALE_MS.  Only
   * clearContributors() removes the tracked set (called after a successful
   * onStoreDocument).
   */
  private captureContributors(documentName: string): string[] {
    // Stale cleanup: discard contributors for documents that haven't seen
    // an onChange in over CONTRIBUTOR_STALE_MS.
    const now = Date.now();
    const lastSeen = this.contributorLastSeen.get(documentName);
    if (lastSeen !== undefined && now - lastSeen > PersistenceExtension.CONTRIBUTOR_STALE_MS) {
      this.contributors.delete(documentName);
      this.contributorLastSeen.delete(documentName);
      return [];
    }

    const contributorSet = this.contributors.get(documentName);
    if (!contributorSet) return [];
    return [...contributorSet];
  }

  private clearContributors(documentName: string): void {
    this.contributors.delete(documentName);
    this.contributorLastSeen.delete(documentName);
  }

  private async enqueuePageHistory(page: Page): Promise<void> {
    const pageAge = Date.now() - new Date(page.createdAt).getTime();
    const delay =
      pageAge < HISTORY_FAST_THRESHOLD
        ? HISTORY_FAST_INTERVAL
        : HISTORY_INTERVAL;

    await this.historyQueue.add(
      QueueJob.PAGE_HISTORY,
      { pageId: page.id, workspaceId: page.workspaceId },
      { jobId: page.id, delay },
    );
  }

  /**
   * Refresh `page_transclusions` and `page_transclusion_references` to match
   * the page's current content. Runs outside the page-write transaction and
   * isolates each call so a failure here cannot affect the page save itself.
   * The diff is idempotent — the next save converges if a round drops anything.
   */
  /**
   * Fallback plain-text extraction from Tiptap JSON when jsonToText fails.
   * Recursively walks the JSON tree and concatenates text nodes.
   */
  private extractPlainTextFallback(json: any): string {
    if (!json) return '';

    const parts: string[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (node.type === 'text' && typeof node.text === 'string') {
        parts.push(node.text);
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          walk(child);
        }
      }
    };
    walk(json);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  private async syncTransclusion(
    pageId: string,
    workspaceId: string,
    tiptapJson: unknown,
  ): Promise<void> {
    try {
      await this.transclusionService.syncPageTransclusions(
        pageId,
        workspaceId,
        tiptapJson,
      );
    } catch (err) {
      this.logger.error(
        { err, pageId },
        'Failed to sync transclusions for page',
      );
    }
    try {
      await this.transclusionService.syncPageReferences(
        pageId,
        workspaceId,
        tiptapJson,
      );
    } catch (err) {
      this.logger.error(
        { err, pageId },
        'Failed to sync transclusion references for page',
      );
    }
  }
}
