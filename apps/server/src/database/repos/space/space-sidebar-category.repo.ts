import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertableSpaceSidebarCategory,
  SpaceSidebarCategory,
  UpdatableSpaceSidebarCategory,
} from '@docmost/db/types/entity.types';

@Injectable()
export class SpaceSidebarCategoryRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    categoryId: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<SpaceSidebarCategory | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('spaceSidebarCategories')
      .selectAll()
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('id', '=', categoryId)
      .executeTakeFirst();
  }

  async listBySpace(
    spaceId: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<SpaceSidebarCategory[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('spaceSidebarCategories')
      .selectAll()
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('spaceId', '=', spaceId)
      .orderBy('sortKey', (ob) => ob.collate('C').asc())
      .orderBy('id', 'asc')
      .execute();
  }

  async countBySpace(
    spaceId: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const result = await dbOrTx(this.db, trx)
      .selectFrom('spaceSidebarCategories')
      .select((eb) => eb.fn.count('id').as('count'))
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('spaceId', '=', spaceId)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async nameExists(
    spaceId: string,
    name: string,
    workspaceId?: string,
    excludeCategoryId?: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const result = await dbOrTx(this.db, trx)
      .selectFrom('spaceSidebarCategories')
      .select((eb) => eb.fn.count('id').as('count'))
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('spaceId', '=', spaceId)
      .where(sql`LOWER(name)`, '=', sql`LOWER(${name.trim()})`)
      .$if(Boolean(excludeCategoryId), (qb) =>
        qb.where('id', '!=', excludeCategoryId!),
      )
      .executeTakeFirst();

    return Number(result?.count ?? 0) > 0;
  }

  async insertCategory(
    data: InsertableSpaceSidebarCategory,
    trx?: KyselyTransaction,
  ): Promise<SpaceSidebarCategory> {
    return dbOrTx(this.db, trx)
      .insertInto('spaceSidebarCategories')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateCategory(
    categoryId: string,
    data: UpdatableSpaceSidebarCategory,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<SpaceSidebarCategory | undefined> {
    return dbOrTx(this.db, trx)
      .updateTable('spaceSidebarCategories')
      .set({ ...data, updatedAt: new Date() })
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('id', '=', categoryId)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteCategory(
    categoryId: string,
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<SpaceSidebarCategory | undefined> {
    return dbOrTx(this.db, trx)
      .deleteFrom('spaceSidebarCategories')
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId!),
      )
      .where('id', '=', categoryId)
      .returningAll()
      .executeTakeFirst();
  }
}
