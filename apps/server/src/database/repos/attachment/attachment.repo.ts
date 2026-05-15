import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Attachment,
  InsertableAttachment,
  UpdatableAttachment,
} from '@docmost/db/types/entity.types';
import { AttachmentType } from '../../../core/attachment/attachment.constants';

@Injectable()
export class AttachmentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof Attachment> = [
    'id',
    'fileName',
    'filePath',
    'fileSize',
    'fileExt',
    'mimeType',
    'type',
    'creatorId',
    'pageId',
    'spaceId',
    'aiChatId',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    attachmentId: string,
    opts?: {
      workspaceId?: string;
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select(this.baseFields)
      .$if(Boolean(opts?.workspaceId), (qb) =>
        qb.where('workspaceId', '=', opts!.workspaceId!),
      )
      .where('id', '=', attachmentId)
      .executeTakeFirst();
  }

  async findByIdWithContent(
    attachmentId: string,
    opts?: {
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select([...this.baseFields, 'textContent'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();
  }

  async insertAttachment(
    insertableAttachment: InsertableAttachment,
    trx?: KyselyTransaction,
  ): Promise<Attachment> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('attachments')
      .values(insertableAttachment)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async findBySpaceId(
    spaceId: string,
    opts?: {
      workspaceId?: string;
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment[]> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select(this.baseFields)
      .$if(Boolean(opts?.workspaceId), (qb) =>
        qb.where('workspaceId', '=', opts!.workspaceId!),
      )
      .where('spaceId', '=', spaceId)
      .execute();
  }

  async findByAiChatId(
    aiChatId: string,
    opts?: {
      workspaceId?: string;
      trx?: KyselyTransaction;
    },
  ): Promise<Attachment[]> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('attachments')
      .select(this.baseFields)
      .$if(Boolean(opts?.workspaceId), (qb) =>
        qb.where('workspaceId', '=', opts!.workspaceId!),
      )
      .where('aiChatId', '=', aiChatId)
      .execute();
  }

  updateAttachmentsByPageId(
    updatableAttachment: UpdatableAttachment,
    pageIds: string[],
    opts?: {
      workspaceId?: string;
      trx?: KyselyTransaction;
    },
  ) {
    return dbOrTx(this.db, opts?.trx)
      .updateTable('attachments')
      .set(updatableAttachment)
      .$if(Boolean(opts?.workspaceId), (qb) =>
        qb.where('workspaceId', '=', opts!.workspaceId!),
      )
      .where('pageId', 'in', pageIds)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateAttachment(
    updatableAttachment: UpdatableAttachment,
    attachmentId: string,
    workspaceId?: string,
  ): Promise<Attachment> {
    return await this.db
      .updateTable('attachments')
      .set(updatableAttachment)
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('id', '=', attachmentId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async claimAttachmentsForChat(
    attachmentIds: string[],
    aiChatId: string,
    creatorId: string,
    workspaceId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return;

    await this.db
      .updateTable('attachments')
      .set({ aiChatId })
      .where('id', 'in', attachmentIds)
      .where('creatorId', '=', creatorId)
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', AttachmentType.Chat)
      .where('aiChatId', 'is', null)
      .execute();
  }

  async deleteAttachmentById(
    attachmentId: string,
    workspaceId?: string,
  ): Promise<void> {
    await this.db
      .deleteFrom('attachments')
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('id', '=', attachmentId)
      .executeTakeFirst();
  }

  async deleteAttachmentByFilePath(
    attachmentFilePath: string,
    workspaceId?: string,
  ): Promise<void> {
    await this.db
      .deleteFrom('attachments')
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('filePath', '=', attachmentFilePath)
      .executeTakeFirst();
  }
}
