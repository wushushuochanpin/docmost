import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';

export interface IdentityTransaction {
  stateHash: string;
  browserHash: string;
  credentialHash?: string;
  workspaceId: string;
  purpose: 'login' | 'link';
  sealedParameters: string;
  userId?: string;
  sessionId?: string;
  expiresAt: Date;
}

@Injectable()
export class IdentityRepository {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async hasHandle(
    credentialHash: string,
    browserHash: string,
  ): Promise<boolean> {
    const result =
      await sql`SELECT 1 FROM identity_browser_handles WHERE credential_hash=${credentialHash}
      AND browser_hash=${browserHash} AND status='pending' AND expires_at>clock_timestamp()`.execute(
        this.db,
      );
    return result.rows.length > 0;
  }

  async registerHandle(credentialHash: string, browserHash: string) {
    await sql`DELETE FROM identity_browser_handles WHERE expires_at < clock_timestamp() - interval '1 day'`.execute(
      this.db,
    );
    await sql`INSERT INTO identity_browser_handles(credential_hash,browser_hash,expires_at)
      VALUES(${credentialHash},${browserHash},clock_timestamp()+interval '1 day')`.execute(
      this.db,
    );
  }

  async create(tx: IdentityTransaction) {
    await sql`DELETE FROM identity_login_transactions WHERE expires_at < now() - interval '1 day'`.execute(
      this.db,
    );
    await sql`INSERT INTO identity_login_transactions(state_hash,browser_hash,credential_hash,workspace_id,purpose,sealed_parameters,user_id,session_id,expires_at)
      VALUES(${tx.stateHash},${tx.browserHash},${tx.credentialHash ?? null},${tx.workspaceId}::uuid,${tx.purpose},${tx.sealedParameters},${tx.userId ?? null}::uuid,${tx.sessionId ?? null}::uuid,${tx.expiresAt})`.execute(
      this.db,
    );
  }

  async consume(stateHash: string, browserHash: string, workspaceId: string) {
    const result =
      await sql<IdentityTransaction>`UPDATE identity_login_transactions SET status='consumed'
      WHERE state_hash=${stateHash} AND browser_hash=${browserHash} AND workspace_id=${workspaceId}::uuid AND status='pending' AND expires_at>clock_timestamp()
      RETURNING *`.execute(this.db);
    if (!result.rows[0]) throw new UnauthorizedException('invalid_transaction');
    return result.rows[0];
  }

  async linkedUser(
    workspaceId: string,
    issuer: string,
    subject: string,
  ): Promise<string | undefined> {
    const result = await sql<{
      userId: string;
    }>`SELECT user_id FROM identity_accounts
      WHERE workspace_id=${workspaceId}::uuid AND issuer=${issuer} AND subject=${subject}`.execute(
      this.db,
    );
    return result.rows[0]?.userId;
  }

  async isLinked(
    workspaceId: string,
    issuer: string,
    userId: string,
  ): Promise<boolean> {
    const result = await sql`SELECT 1 FROM identity_accounts
      WHERE workspace_id=${workspaceId}::uuid AND issuer=${issuer} AND user_id=${userId}::uuid`.execute(
      this.db,
    );
    return result.rows.length > 0;
  }

  async finish(
    tx: IdentityTransaction,
    issuer: string,
    subject: string,
    userId: string,
    activate: (
      credentialHash: string,
      db: KyselyTransaction,
    ) => Promise<{ sessionId: string; expiresAt: Date }>,
  ) {
    return this.db.transaction().execute(async (db) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${tx.browserHash}, 0))`.execute(
        db,
      );
      const current =
        await sql`SELECT 1 FROM identity_login_transactions WHERE state_hash=${tx.stateHash}
        AND status='consumed' AND expires_at>clock_timestamp() FOR UPDATE`.execute(
          db,
        );
      if (!current.rows.length)
        throw new UnauthorizedException('invalid_transaction');
      const activeUser =
        await sql`SELECT 1 FROM users WHERE id=${userId}::uuid AND workspace_id=${tx.workspaceId}::uuid
        AND deleted_at IS NULL AND deactivated_at IS NULL FOR SHARE`.execute(
          db,
        );
      if (!activeUser.rows.length)
        throw new UnauthorizedException('identity_not_linked');
      if (tx.purpose === 'link') {
        const active =
          await sql`SELECT 1 FROM user_sessions s WHERE s.id=${tx.sessionId}::uuid AND s.user_id=${userId}::uuid AND s.workspace_id=${tx.workspaceId}::uuid
          AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE`.execute(
            db,
          );
        if (!active.rows.length)
          throw new UnauthorizedException('session_changed');
        await sql`INSERT INTO identity_accounts(workspace_id,user_id,issuer,subject)
          VALUES(${tx.workspaceId}::uuid,${userId}::uuid,${issuer},${subject}) ON CONFLICT DO NOTHING`.execute(
          db,
        );
        const mapping =
          await sql`SELECT 1 FROM identity_accounts WHERE workspace_id=${tx.workspaceId}::uuid
          AND user_id=${userId}::uuid AND issuer=${issuer} AND subject=${subject}`.execute(
            db,
          );
        if (!mapping.rows.length)
          throw new UnauthorizedException('identity_conflict');
        await sql`UPDATE identity_login_transactions SET sealed_parameters='' WHERE state_hash=${tx.stateHash}`.execute(
          db,
        );
        return;
      }
      const handles = await sql<{
        status: string;
        sessionId: string;
        expiresAt: Date;
      }>`SELECT * FROM identity_browser_handles
        WHERE credential_hash=${tx.credentialHash} AND browser_hash=${tx.browserHash} AND expires_at>clock_timestamp() FOR UPDATE`.execute(
        db,
      );
      const handle = handles.rows[0];
      if (!handle || handle.status === 'revoked')
        throw new UnauthorizedException('session_changed');
      let session: { sessionId: string; expiresAt: Date };
      if (handle.status === 'active') {
        // Independent tabs may complete independently for the same account. Never switch
        // the shared browser handle to a different account on a delayed callback.
        const active = await sql<{
          expiresAt: Date;
        }>`SELECT expires_at FROM user_sessions WHERE id=${handle.sessionId}::uuid
          AND user_id=${userId}::uuid AND workspace_id=${tx.workspaceId}::uuid AND revoked_at IS NULL AND expires_at>clock_timestamp()`.execute(
          db,
        );
        if (!active.rows[0]) throw new UnauthorizedException('session_changed');
        session = {
          sessionId: handle.sessionId,
          expiresAt: active.rows[0].expiresAt,
        };
      } else {
        session = await activate(tx.credentialHash!, db);
        await sql`UPDATE identity_browser_handles SET status='active',session_id=${session.sessionId}::uuid,expires_at=${session.expiresAt}
          WHERE credential_hash=${tx.credentialHash}`.execute(db);
      }
      await sql`UPDATE identity_login_transactions SET result_session_id=${session.sessionId}::uuid,sealed_parameters=''
        WHERE state_hash=${tx.stateHash}`.execute(db);
      return session;
    });
  }

  async cancelBrowser(browserHash: string) {
    await this.db.transaction().execute(async (db) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${browserHash},0))`.execute(
        db,
      );
      await sql`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp())
        WHERE id IN (SELECT session_id FROM identity_browser_handles WHERE browser_hash=${browserHash})`.execute(
        db,
      );
      await sql`UPDATE identity_browser_handles SET status='revoked' WHERE browser_hash=${browserHash}`.execute(
        db,
      );
      await sql`UPDATE identity_login_transactions SET status='cancelled',sealed_parameters=''
        WHERE browser_hash=${browserHash}`.execute(db);
    });
  }
}
