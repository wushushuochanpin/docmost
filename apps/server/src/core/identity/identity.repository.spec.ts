import { randomUUID } from 'node:crypto';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { IdentityRepository, IdentityTransaction } from './identity.repository';
import { up } from '../../database/migrations/20261026T100100-identity-center';

// The disposable PostgreSQL instance is reached through SSH; retain a bounded timeout
// for serialized multi-statement transactions rather than treating network RTT as a failure.
jest.setTimeout(30000);
const connection = process.env.IDENTITY_TEST_DATABASE_URL;
const describeDatabase = connection ? describe : describe.skip;

describeDatabase(
  'Identity PostgreSQL 16 transactions (disposable schema)',
  () => {
    const schema = `identity_test_${randomUUID().replaceAll('-', '')}`;
    const workspace = randomUUID(),
      otherWorkspace = randomUUID(),
      user = randomUUID(),
      otherUser = randomUUID(),
      localSession = randomUUID();
    const browser = 'a'.repeat(64),
      credential = 'b'.repeat(64),
      issuer = 'https://center.test';
    let db: Kysely<any>;
    let admin: postgres.Sql;
    let repository: IdentityRepository;
    let n = 0;
    const transaction = (
      purpose: 'login' | 'link' = 'login',
    ): IdentityTransaction => ({
      stateHash: String(++n).padStart(64, '0'),
      browserHash: browser,
      credentialHash: purpose === 'login' ? credential : undefined,
      workspaceId: workspace,
      purpose,
      sealedParameters: 'encrypted',
      userId: purpose === 'link' ? user : undefined,
      sessionId: purpose === 'link' ? localSession : undefined,
      expiresAt: new Date(Date.now() + 300000),
    });

    beforeAll(async () => {
      admin = postgres(connection!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      const client = postgres(connection!, {
        max: 10,
        onnotice: () => {},
        connection: { search_path: schema },
      });
      db = new Kysely({
        dialect: new PostgresJSDialect({ postgres: client }),
        plugins: [new CamelCasePlugin()],
      });
      await sql`CREATE FUNCTION gen_uuid_v7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE TABLE workspaces(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,deleted_at timestamptz,deactivated_at timestamptz);
      CREATE TABLE user_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,workspace_id uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz);
    `.execute(db);
      await up(db);
      repository = new IdentityRepository(db as any);
    });
    beforeEach(async () => {
      await sql`TRUNCATE identity_login_transactions,identity_browser_handles,identity_accounts,user_sessions,users,workspaces CASCADE`.execute(
        db,
      );
      await sql`INSERT INTO workspaces VALUES(${workspace}::uuid),(${otherWorkspace}::uuid)`.execute(
        db,
      );
      await sql`INSERT INTO users(id,workspace_id) VALUES(${user}::uuid,${workspace}::uuid),(${otherUser}::uuid,${workspace}::uuid)`.execute(
        db,
      );
      await sql`INSERT INTO user_sessions(id,user_id,workspace_id,expires_at) VALUES(${localSession}::uuid,${user}::uuid,${workspace}::uuid,now()+interval '1 hour')`.execute(
        db,
      );
      await repository.registerHandle(credential, browser);
    });
    afterAll(async () => {
      await db?.destroy();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      }
    });

    async function consume(tx: IdentityTransaction) {
      await repository.create(tx);
      return repository.consume(tx.stateHash, tx.browserHash, tx.workspaceId);
    }
    const activate = jest.fn(async (_hash: string, trx: any) => {
      const sessionId = randomUUID(),
        expiresAt = new Date(Date.now() + 60000);
      await sql`INSERT INTO user_sessions(id,user_id,workspace_id,expires_at) VALUES(${sessionId}::uuid,${user}::uuid,${workspace}::uuid,${expiresAt})`.execute(
        trx,
      );
      return { sessionId, expiresAt };
    });
    beforeEach(() => activate.mockClear());

    it('requires a registered browser AND credential pair, not arbitrary cookie values', async () => {
      expect(await repository.hasHandle(credential, browser)).toBe(true);
      expect(await repository.hasHandle('c'.repeat(64), browser)).toBe(false);
      expect(await repository.hasHandle(credential, 'c'.repeat(64))).toBe(
        false,
      );
    });
    it('atomically consumes a login once under competing callbacks', async () => {
      const tx = transaction();
      await repository.create(tx);
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          repository.consume(tx.stateHash, browser, workspace),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('does not consume a transaction for another workspace or browser', async () => {
      const tx = transaction();
      await repository.create(tx);
      await expect(
        repository.consume(tx.stateHash, browser, otherWorkspace),
      ).rejects.toThrow('invalid_transaction');
      await expect(
        repository.consume(tx.stateHash, 'c'.repeat(64), workspace),
      ).rejects.toThrow('invalid_transaction');
      await expect(
        repository.consume(tx.stateHash, browser, workspace),
      ).resolves.toMatchObject({ workspaceId: workspace });
    });
    it('preserves three independent transactions and activates one shared session', async () => {
      const transactions = await Promise.all(
        [transaction(), transaction(), transaction()].map(consume),
      );
      const results = await Promise.all(
        transactions.map((tx) =>
          repository.finish(tx, issuer, 'person', user, activate),
        ),
      );
      expect(activate).toHaveBeenCalledTimes(1);
      expect(new Set(results.map((r) => r!.sessionId)).size).toBe(1);
      const pending = await sql<{
        n: number;
      }>`SELECT count(*)::int AS n FROM identity_login_transactions WHERE status='consumed'`.execute(
        db,
      );
      expect(pending.rows[0].n).toBe(3);
    });
    it('cannot switch an activated browser to a different account on delayed callback', async () => {
      const a = await consume(transaction()),
        b = await consume(transaction());
      await repository.finish(a, issuer, 'person', user, activate);
      await expect(
        repository.finish(b, issuer, 'other', otherUser, activate),
      ).rejects.toThrow('session_changed');
      expect(activate).toHaveBeenCalledTimes(1);
    });
    it('cancel before callback blocks activation', async () => {
      const tx = await consume(transaction());
      await repository.cancelBrowser(browser);
      await expect(
        repository.finish(tx, issuer, 'person', user, activate),
      ).rejects.toThrow('invalid_transaction');
      expect(activate).not.toHaveBeenCalled();
    });
    it('logout racing activation always leaves resulting session revoked', async () => {
      const tx = await consume(transaction());
      await Promise.allSettled([
        repository.finish(tx, issuer, 'person', user, activate),
        repository.cancelBrowser(browser),
      ]);
      const result = await sql<{
        n: number;
      }>`SELECT count(*)::int AS n FROM user_sessions WHERE id<>${localSession}::uuid AND revoked_at IS NULL`.execute(
        db,
      );
      expect(result.rows[0].n).toBe(0);
      expect(await repository.hasHandle(credential, browser)).toBe(false);
    });
    it('binds only the verified local user without issuing a replacement session', async () => {
      const tx = await consume(transaction('link'));
      await repository.finish(tx, issuer, 'person', user, activate);
      expect(await repository.linkedUser(workspace, issuer, 'person')).toBe(
        user,
      );
      expect(activate).not.toHaveBeenCalled();
    });
    it('does not attach an already linked center subject to another local account', async () => {
      await sql`INSERT INTO identity_accounts(workspace_id,user_id,issuer,subject) VALUES(${workspace}::uuid,${otherUser}::uuid,${issuer},'person')`.execute(
        db,
      );
      const tx = await consume(transaction('link'));
      await expect(
        repository.finish(tx, issuer, 'person', user, activate),
      ).rejects.toThrow('identity_conflict');
      expect(await repository.linkedUser(workspace, issuer, 'person')).toBe(
        otherUser,
      );
    });
    it('rejects link after the local session was revoked', async () => {
      const tx = await consume(transaction('link'));
      await sql`UPDATE user_sessions SET revoked_at=now() WHERE id=${localSession}::uuid`.execute(
        db,
      );
      await expect(
        repository.finish(tx, issuer, 'person', user, activate),
      ).rejects.toThrow('session_changed');
      expect(
        await repository.linkedUser(workspace, issuer, 'person'),
      ).toBeUndefined();
    });
    it('allows session cleanup without historical transaction foreign key failures', async () => {
      const tx = await consume(transaction());
      const session = await repository.finish(
        tx,
        issuer,
        'person',
        user,
        activate,
      );
      await sql`DELETE FROM user_sessions WHERE id=${session!.sessionId}::uuid`.execute(
        db,
      );
      const result = await sql<{
        credentialHash: string | null;
      }>`SELECT credential_hash FROM identity_login_transactions WHERE state_hash=${tx.stateHash}`.execute(
        db,
      );
      expect(result.rows[0].credentialHash).toBeNull();
      expect(await repository.hasHandle(credential, browser)).toBe(false);
    });
  },
);
