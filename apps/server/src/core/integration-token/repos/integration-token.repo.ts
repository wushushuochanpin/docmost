import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  CursorPaginationResult,
  executeWithCursorPagination,
} from '@docmost/db/pagination/cursor-pagination';
import { ListIntegrationTokensDto } from '../dto/list-integration-tokens.dto';
import {
  InsertableScApiToken,
  InsertableScApiTokenEvent,
  ScApiToken,
  UpdatableScApiToken,
} from '@docmost/db/types/entity.types';

export type IntegrationTokenListItem = {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  isWorkspaceManaged: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string | null;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string | null;
};

@Injectable()
export class IntegrationTokenRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertToken(
    data: InsertableScApiToken,
    trx?: KyselyTransaction,
  ): Promise<ScApiToken> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('scApiTokens')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertTokenEvent(
    data: InsertableScApiTokenEvent,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db.insertInto('scApiTokenEvents').values(data).execute();
  }

  async findTokenById(
    tokenId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ScApiToken | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('scApiTokens')
      .selectAll()
      .where('id', '=', tokenId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async updateToken(
    tokenId: string,
    workspaceId: string,
    data: UpdatableScApiToken,
    trx?: KyselyTransaction,
  ): Promise<ScApiToken | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('scApiTokens')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', tokenId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async listPersonalTokens(
    workspaceId: string,
    ownerUserId: string,
    pagination: ListIntegrationTokensDto,
  ): Promise<CursorPaginationResult<IntegrationTokenListItem>> {
    let query = this.baseListQuery(workspaceId)
      .where('scApiTokens.ownerUserId', '=', ownerUserId)
      .where('scApiTokens.isWorkspaceManaged', '=', false);

    if (pagination.query) {
      query = query.where('scApiTokens.name', 'ilike', `%${pagination.query}%`);
    }

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'scApiTokens.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async listWorkspaceTokens(
    workspaceId: string,
    pagination: ListIntegrationTokensDto,
  ): Promise<CursorPaginationResult<IntegrationTokenListItem>> {
    let query = this.baseListQuery(workspaceId).where(
      'scApiTokens.isWorkspaceManaged',
      '=',
      true,
    );

    if (pagination.query) {
      query = query.where('scApiTokens.name', 'ilike', `%${pagination.query}%`);
    }

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'scApiTokens.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  private baseListQuery(workspaceId: string) {
    return this.db
      .selectFrom('scApiTokens')
      .leftJoin('users as creator', 'creator.id', 'scApiTokens.creatorUserId')
      .leftJoin('users as owner', 'owner.id', 'scApiTokens.ownerUserId')
      .select([
        'scApiTokens.id as id',
        'scApiTokens.name as name',
        'scApiTokens.tokenPrefix as tokenPrefix',
        'scApiTokens.status as status',
        'scApiTokens.isWorkspaceManaged as isWorkspaceManaged',
        'scApiTokens.expiresAt as expiresAt',
        'scApiTokens.lastUsedAt as lastUsedAt',
        'scApiTokens.createdAt as createdAt',
        'scApiTokens.creatorUserId as creatorId',
        'creator.name as creatorName',
        'creator.email as creatorEmail',
        'scApiTokens.ownerUserId as ownerUserId',
        'owner.name as ownerName',
        'owner.email as ownerEmail',
      ])
      .where('scApiTokens.workspaceId', '=', workspaceId);
  }
}
