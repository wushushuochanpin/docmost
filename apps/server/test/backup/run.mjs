// Owns a disposable PostgreSQL 16 + Redis; never reads .env or accepts external URLs.
import { execFileSync, spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../package.json', import.meta.url));
const root = resolve(new URL('../..', import.meta.url).pathname);
const pgBin = process.env.BACKUP_TEST_PG_BIN;
const dir = mkdtempSync(join(tmpdir(), 'docmost-backup-test-'));
const pgName = `docmost-backup-pg-${process.pid}`,
  redisName = `docmost-backup-redis-${process.pid}`;
let pgStarted = false,
  redisChild,
  worker,
  runtime,
  admin,
  database;
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const freePort = async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
};
const until = async (check, message, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(message);
};
try {
  let pgPort, redisPort, dump, restore;
  if (pgBin) {
    pgPort = await freePort();
    redisPort = await freePort();
    const pg = (name) => join(pgBin, name);
    assert.match(
      execFileSync(pg('postgres'), ['--version'], { encoding: 'utf8' }),
      /16\./,
    );
    execFileSync(
      pg('initdb'),
      [
        '-D',
        join(dir, 'pg'),
        '-U',
        'backup_test_admin',
        '-A',
        'trust',
        '--no-locale',
        '--encoding=UTF8',
      ],
      { stdio: 'pipe' },
    );
    execFileSync(
      pg('pg_ctl'),
      [
        '-D',
        join(dir, 'pg'),
        '-l',
        join(dir, 'pg.log'),
        '-o',
        `-p ${pgPort} -h 127.0.0.1 -k ${dir}`,
        '-w',
        'start',
      ],
      { stdio: 'pipe' },
    );
    pgStarted = true;
    redisChild = spawn(
      process.env.BACKUP_TEST_REDIS_BIN,
      [
        '--bind',
        '127.0.0.1',
        '--port',
        String(redisPort),
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { stdio: 'ignore' },
    );
    dump = process.env.BACKUP_TEST_PG_DUMP || pg('pg_dump');
    restore = (sql) =>
      execFileSync(
        process.env.BACKUP_TEST_PSQL || pg('psql'),
        [
          '-h',
          '127.0.0.1',
          '-p',
          String(pgPort),
          '-U',
          'backup_test_admin',
          '-d',
          'backup_restored',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        {
          input: sql,
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 20 * 1024 * 1024,
        },
      );
  } else {
    docker(
      'run',
      '-d',
      '--name',
      pgName,
      '-e',
      'POSTGRES_USER=backup_test_admin',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p',
      '127.0.0.1::5432',
      'postgres:16-alpine',
    );
    docker(
      'run',
      '-d',
      '--name',
      redisName,
      '-p',
      '127.0.0.1::6379',
      'redis:7.2-alpine',
    );
    pgPort = Number(docker('port', pgName, '5432/tcp').split(':').pop());
    redisPort = Number(docker('port', redisName, '6379/tcp').split(':').pop());
    // Docker's client sees the same disposable database at its internal port.
    dump = join(dir, 'pg_dump');
    writeFileSync(
      dump,
      `#!${process.execPath}\nconst {spawn}=require('node:child_process');const c=spawn('docker',['exec','-i','-e','PGHOST=127.0.0.1','-e','PGPORT=5432','-e','PGDATABASE='+process.env.PGDATABASE,'-e','PGUSER='+process.env.PGUSER,'-e','PGPASSWORD='+(process.env.PGPASSWORD||''),${JSON.stringify(pgName)},'pg_dump',...process.argv.slice(2)],{stdio:'inherit'});c.on('exit',c=>process.exit(c??1));\n`,
      { mode: 0o700 },
    );
    restore = (sql) =>
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          pgName,
          'psql',
          '-U',
          'backup_test_admin',
          '-d',
          'backup_restored',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        {
          input: sql,
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 20 * 1024 * 1024,
        },
      );
  }
  const postgres = require('postgres');
  const { Kysely, CamelCasePlugin } = require('kysely');
  const { PostgresJSDialect } = require('kysely-postgres-js');
  const Y = require('yjs');
  const adminUrl = `postgresql://backup_test_admin@127.0.0.1:${pgPort}/postgres`;
  admin = postgres(adminUrl, { onnotice() {}, connect_timeout: 2 });
  await until(async () => {
    try {
      await admin`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }, 'Postgres not ready');
  await admin.unsafe('CREATE DATABASE backup_source');
  await admin.unsafe('CREATE DATABASE backup_restored');
  await admin.end();
  admin = postgres(adminUrl.replace('/postgres', '/backup_source'), {
    onnotice() {},
  });
  database = new Kysely({
    dialect: new PostgresJSDialect({ postgres: admin }),
    plugins: [new CamelCasePlugin()],
  });
  for (const name of readdirSync(join(root, 'dist/database/migrations'))
    .filter((n) => n.endsWith('.js'))
    .sort()) {
    await require(join(root, 'dist/database/migrations', name)).up(database);
  }
  await admin.unsafe(
    'CREATE ROLE backup_test_runtime LOGIN NOSUPERUSER NOBYPASSRLS',
  );
  await admin.unsafe(
    'CREATE ROLE backup_test_reader LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE',
  );
  await admin.unsafe(
    'GRANT USAGE ON SCHEMA public TO backup_test_runtime, backup_test_reader',
  );
  await admin.unsafe(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO backup_test_runtime',
  );
  await admin.unsafe(
    'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_test_runtime',
  );
  await admin.unsafe(
    'GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_test_reader',
  );
  await admin.unsafe(
    'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_test_reader',
  );
  await admin.unsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE backup_test_admin IN SCHEMA public GRANT SELECT ON TABLES TO backup_test_reader',
  );
  await admin.unsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE backup_test_admin IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_test_reader',
  );
  await admin.unsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE backup_test_admin IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO backup_test_runtime',
  );
  await admin.unsafe(
    'ALTER DEFAULT PRIVILEGES FOR ROLE backup_test_admin IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO backup_test_runtime',
  );
  await admin.unsafe(
    'CREATE TABLE backup_future_fixture(id bigserial PRIMARY KEY, proof text)',
  );
  await admin.unsafe(
    "INSERT INTO backup_future_fixture(proof) VALUES('default grant preserved')",
  );
  const fixtures = [];
  for (const label of ['first', 'second']) {
    const workspace = randomUUID(),
      space = randomUUID(),
      page = randomUUID();
    const ydoc = new Y.Doc();
    ydoc.getText('proof').insert(0, `${label} collaborative document`);
    const binary = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    ydoc.destroy();
    await admin`INSERT INTO workspaces(id,name) VALUES(${workspace},${label})`;
    await admin`INSERT INTO spaces(id,workspace_id,name,slug) VALUES(${space},${workspace},${label},${label})`;
    await admin`INSERT INTO pages(id,workspace_id,space_id,slug_id,title,ydoc,content,position) VALUES(${page},${workspace},${space},${label},${label},${binary},'{}','a0')`;
    await admin`INSERT INTO agent_maintenance_runs(workspace_id,counts) VALUES(${workspace},'{"proof":1}')`;
    fixtures.push({ workspace, page, binary });
  }
  const cwd = join(dir, 'run/server');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(dir, 'data/storage'), { recursive: true });
  writeFileSync(
    join(dir, 'data/storage/attachment.txt'),
    'attachment roundtrip',
  );
  process.chdir(cwd);
  // Set only disposable connection strings. Compiled services do not load .env.
  delete process.env.npm_package_version;
  process.env.DATABASE_URL = adminUrl
    .replace('backup_test_admin', 'backup_test_runtime')
    .replace('/postgres', '/backup_source');
  process.env.BACKUP_DATABASE_URL = process.env.DATABASE_URL.replace(
    'backup_test_runtime',
    'backup_test_reader',
  );
  process.env.REDIS_URL = `redis://127.0.0.1:${redisPort}`;
  process.env.PG_DUMP_PATH = dump;
  process.env.BACKUP_LOCAL_PATH = join(dir, 'data/storage/backups');
  process.env.BACKUP_S3_ENABLED = 'false';
  process.env.STORAGE_DRIVER = 'local';
  const { createBackupRuntime, verifyBackupCredential } = require(
    join(root, 'dist/integrations/backup/backup-runtime'),
  );
  const { gzipProcess, backupDatabaseEnvironment } = require(
    join(root, 'dist/integrations/backup/backup-process'),
  );
  const { BackupProcessor } = require(
    join(root, 'dist/integrations/backup/processors/backup.processor'),
  );
  const { BackupError } = require(
    join(root, 'dist/integrations/backup/backup-error'),
  );
  const pathProbe = `const {EnvironmentService}=require(${JSON.stringify(join(root, 'dist/integrations/environment/environment.service'))});const {ConfigService}=require(${JSON.stringify(require.resolve('@nestjs/config'))});process.stdout.write(new EnvironmentService(new ConfigService()).getBackupLocalPath());`;
  const appPath = execFileSync(process.execPath, ['-e', pathProbe], {
    cwd: root,
    env: { ...process.env, BACKUP_LOCAL_PATH: '' },
    encoding: 'utf8',
  });
  const cliPath = execFileSync(process.execPath, ['-e', pathProbe], {
    cwd: resolve(root, '../..'),
    env: { ...process.env, BACKUP_LOCAL_PATH: '' },
    encoding: 'utf8',
  });
  assert.equal(appPath, cliPath);
  assert.equal(cliPath, resolve(root, '../../data/storage/backups'));
  console.log(
    'PASS persistent backup path is identical across application and CLI working directories',
  );
  runtime = createBackupRuntime();
  await verifyBackupCredential(runtime.environment);
  await admin.unsafe(
    'REVOKE SELECT ON agent_maintenance_runs FROM backup_test_reader',
  );
  await assert.rejects(
    verifyBackupCredential(runtime.environment),
    /SELECT-only access/,
  );
  await admin.unsafe(
    'GRANT SELECT ON agent_maintenance_runs TO backup_test_reader',
  );
  await admin.unsafe('ALTER ROLE backup_test_reader NOBYPASSRLS');
  await assert.rejects(
    verifyBackupCredential(runtime.environment),
    /BYPASSRLS/,
  );
  await admin.unsafe('ALTER ROLE backup_test_reader BYPASSRLS');
  console.log('PASS dedicated read-only backup role preflight');
  // Reproduce the incident with the actual runtime role and pg_dump.
  await assert.rejects(
    gzipProcess(
      dump,
      [],
      join(dir, 'denied.gz'),
      'BACKUP_DATABASE_EXPORT',
      backupDatabaseEnvironment(process.env.DATABASE_URL),
    ),
    /row-level security/,
  );
  console.log('PASS original runtime-role/RLS failure reproduced');
  const originalBackupUrl = process.env.BACKUP_DATABASE_URL;
  delete process.env.BACKUP_DATABASE_URL;
  await assert.rejects(
    runtime.packager.runBackup(fixtures[0].workspace, randomUUID()),
    /dedicated BACKUP_DATABASE_URL/,
  );
  process.env.BACKUP_DATABASE_URL = process.env.DATABASE_URL;
  await assert.rejects(
    verifyBackupCredential(runtime.environment),
    /distinct role/,
  );
  await assert.rejects(
    runtime.packager.runBackup(fixtures[0].workspace, randomUUID()),
    /row-level security/,
  );
  assert.equal(
    readdirSync(join(dir, 'data/storage')).includes('backups'),
    false,
  );
  process.env.BACKUP_DATABASE_URL = originalBackupUrl;
  const reader = postgres(originalBackupUrl, { onnotice() {} });
  await assert.rejects(reader`DELETE FROM pages`, /permission denied/);
  await reader.end();
  console.log(
    'PASS missing credential, shared account and backup write access rejected',
  );
  await assert.rejects(
    gzipProcess(
      process.execPath,
      [
        '-e',
        "process.stdout.end('partial');setTimeout(()=>process.exit(1),100)",
      ],
      join(dir, 'partial.gz'),
      'TEST',
    ),
    /exited 1/,
  );
  await assert.rejects(
    gzipProcess(
      '/missing-backup-executable',
      [],
      join(dir, 'missing.gz'),
      'TEST',
    ),
    /could not be started/,
  );
  await assert.rejects(
    gzipProcess(
      process.execPath,
      ['-e', "process.stdout.write('data')"],
      join(dir, 'absent/out.gz'),
      'TEST',
    ),
    /ENOENT/,
  );
  execFileSync(
    process.execPath,
    [
      '-e',
      `require(${JSON.stringify(join(root, 'dist/integrations/backup/backup-process'))}).gzipProcess('/missing-backup-executable', [], ${JSON.stringify(join(dir, 'missing-child.gz'))}, 'TEST').catch(() => {})`,
    ],
    { timeout: 3000, stdio: 'pipe' },
  );
  console.log(
    'PASS stdout EOF before failure, missing executable and output write failure',
  );
  const statuses = [];
  const processor = new BackupProcessor(
    { updateJobStatus: async (...args) => statuses.push(args) },
    {
      runBackup: async () => {
        throw new BackupError('BACKUP_DATABASE_PERMISSION', 'denied');
      },
    },
  );
  await assert.rejects(
    processor.process({
      name: 'backup-job',
      data: { jobId: 'test', workspaceId: fixtures[0].workspace },
      opts: { attempts: 3 },
      attemptsMade: 0,
    }),
    /denied/,
  );
  assert.equal(statuses.at(-1)[1], 'failed');
  console.log('PASS permission errors fail immediately without retries');
  await assert.rejects(
    runtime.jobs.createManualJob(fixtures[0].workspace, null),
    /worker is unavailable/,
  );
  let logs = '';
  worker = spawn(
    process.execPath,
    [join(root, 'dist/integrations/backup/backup-worker.js')],
    { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  worker.stdout.on('data', (c) => (logs += c));
  worker.stderr.on('data', (c) => (logs += c));
  await until(
    () => logs.includes('Backup worker ready'),
    'Worker failed to start: ' + logs,
  );
  const job = await runtime.jobs.createManualJob(
    fixtures[0].workspace,
    null,
    'api',
  );
  let result;
  await until(
    async () => {
      result = await runtime.jobs.getJobWithTriggerer(
        fixtures[0].workspace,
        job.id,
      );
      if (result.status === 'failed') throw Error(result.errorMessage);
      return result.status === 'success';
    },
    'Queue backup did not complete',
    60000,
  );
  const verified = await runtime.artifacts.verifyCopies(
    result.artifactPath,
    result.metadata,
  );
  assert.ok(verified.sizeBytes > 0);
  const unpack = join(dir, 'unpack');
  mkdirSync(unpack);
  execFileSync('tar', [
    '-xzf',
    join(process.env.BACKUP_LOCAL_PATH, result.artifactPath),
    '-C',
    unpack,
  ]);
  assert.equal(
    readFileSync(join(unpack, 'storage/attachment.txt'), 'utf8'),
    'attachment roundtrip',
  );
  assert.equal(
    JSON.parse(readFileSync(join(unpack, 'manifest.json'))).scope,
    'database',
  );
  assert.equal(
    JSON.parse(readFileSync(join(unpack, 'manifest.json'))).docmostVersion,
    require(join(root, 'package.json')).version,
  );
  restore(gunzipSync(readFileSync(join(unpack, 'db/docmost.sql.gz'))));
  const restored = postgres(adminUrl.replace('/postgres', '/backup_restored'), {
    onnotice() {},
  });
  assert.equal(
    Number(
      (await restored`SELECT count(*) FROM agent_maintenance_runs`)[0].count,
    ),
    2,
  );
  for (const fixture of fixtures) {
    const [row] =
      await restored`SELECT ydoc FROM pages WHERE id=${fixture.page}`;
    assert.deepEqual(row.ydoc, fixture.binary);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, row.ydoc);
    assert.match(doc.getText('proof').toString(), /collaborative document/);
    doc.destroy();
  }
  assert.equal(
    (await restored`SELECT proof FROM backup_future_fixture`)[0].proof,
    'default grant preserved',
  );
  const originalTables =
    await admin`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const restoredTables =
    await restored`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  assert.deepEqual(restoredTables, originalTables);
  await restored.end();
  console.log(
    'PASS real worker queue -> archive -> fresh PostgreSQL restore; both workspaces, RLS table, Y.Doc bytes and attachment intact',
  );
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((r) => worker.once('exit', r));
  }
  if (runtime) await runtime.close();
  if (database) await database.destroy();
  else if (admin) await admin.end();
  if (redisChild) {
    redisChild.kill();
    await new Promise((r) => redisChild.once('exit', r));
  }
  if (pgBin && pgStarted)
    execFileSync(
      join(pgBin, 'pg_ctl'),
      ['-D', join(dir, 'pg'), '-m', 'immediate', '-w', 'stop'],
      { stdio: 'pipe' },
    );
  if (!pgBin)
    for (const name of [pgName, redisName]) {
      try {
        docker('rm', '-f', name);
      } catch {}
    }
  process.chdir(root);
  rmSync(dir, { recursive: true, force: true });
}
