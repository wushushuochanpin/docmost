// Creates a fresh loopback-only cluster. Never reads .env or accepts a database URL.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(resolve(here, '../../package.json'));
if (Number(process.versions.node.split('.')[0]) !== 22)
  throw Error('P0 baseline requires Node 22');
if (
  !process.env.P0_PG_BIN ||
  !process.env.P0_OAUTH_MODULE ||
  !process.env.P0_REDIS_BIN
)
  throw Error(
    'Set P0_PG_BIN, P0_OAUTH_MODULE and P0_REDIS_BIN to isolated test tools',
  );
const oauthVersion = require(
  join(process.env.P0_OAUTH_MODULE, 'package.json'),
).version;
if (oauthVersion !== '5.3.1') throw Error('P0 OAuth baseline requires 5.3.1');
const hocuspocusVersion = require(
  join(dirname(require.resolve('@hocuspocus/server')), '../package.json'),
).version;
if (hocuspocusVersion !== '4.0.0')
  throw Error('P0 Hocuspocus baseline requires 4.0.0');
const pg = (name) => join(process.env.P0_PG_BIN, name);
const pgVersion = execFileSync(pg('postgres'), ['--version'], {
  encoding: 'utf8',
}).trim();
if (!pgVersion.includes('16.'))
  throw Error('P0 baseline requires PostgreSQL 16');
const dir = await mkdtemp(join(tmpdir(), 'docmost-p0-'));
const data = join(dir, 'data');
let started = false;
let redisChild;
let exitCode = 1;
try {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  execFileSync(
    pg('initdb'),
    ['-D', data, '-U', 'p0', '-A', 'trust', '--no-locale', '--encoding=UTF8'],
    { stdio: 'pipe' },
  );
  execFileSync(
    pg('pg_ctl'),
    [
      '-D',
      data,
      '-l',
      join(dir, 'postgres.log'),
      '-o',
      `-p ${port} -h 127.0.0.1 -k ${dir} -c synchronous_commit=on -c fsync=on`,
      '-w',
      'start',
    ],
    { stdio: 'pipe' },
  );
  started = true;
  const redisPortServer = createServer();
  await new Promise((r) => redisPortServer.listen(0, '127.0.0.1', r));
  const redisPort = redisPortServer.address().port;
  await new Promise((r) => redisPortServer.close(r));
  redisChild = spawn(
    process.env.P0_REDIS_BIN,
    [
      '--bind',
      '127.0.0.1',
      '--port',
      String(redisPort),
      '--save',
      '',
      '--appendonly',
      'no',
      '--dir',
      dir,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error('Isolated Redis did not start')),
      10000,
    );
    redisChild.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Ready to accept connections')) {
        clearTimeout(timer);
        resolve();
      }
    });
    redisChild.once('error', reject);
    redisChild.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error('Redis exited ' + code));
    });
  });

  const report = resolve(
    here,
    '../../../../docs/iterations/20261018_01_agent-document-mcp/test/' +
      (process.env.P2_RETENTION === 'true'
        ? process.env.P2_ACCEPTANCE === 'true'
          ? 'p2-retention-clients-jest-results.json'
          : 'p2-retention-jest-results.json'
        : process.env.P2_ACCEPTANCE === 'true'
          ? 'p2-jest-results.json'
          : process.env.P1_CODEX_PROBE === 'true'
            ? 'p1-codex-jest-results.json'
            : process.env.P1_ACCEPTANCE === 'true'
              ? 'p1-jest-results.json'
              : 'p0-jest-results.json'),
  );
  await rm(report, { force: true });
  const child = spawn(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      ...(process.env.P0_DETECT_HANDLES ? ['--detectOpenHandles'] : []),
      '--config',
      join(here, 'jest.config.cjs'),
      '--runInBand',
      ...(process.env.P1_CODEX_PROBE === 'true' ||
      process.env.P2_CLIENTS_ONLY === 'true'
        ? ['--runTestsByPath', join(here, 'full-app.spec.ts')]
        : []),
      '--json',
      '--outputFile',
      report,
    ],
    {
      cwd: resolve(here, '../..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        P0_DATABASE_URL: `postgres://p0@127.0.0.1:${port}/postgres`,
        P0_PG_DATA: data,
        P0_REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
      },
    },
  );
  const stop = () => child.kill('SIGTERM');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const deadline = setTimeout(() => child.kill('SIGKILL'), 120000);
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once('exit', (code) => resolve(code ?? 1));
      child.once('error', reject);
    });
  } finally {
    clearTimeout(deadline);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
  await writeFile(
    report.replace('jest-results.json', 'runtime.json'),
    JSON.stringify(
      {
        node: process.version,
        postgres: pgVersion,
        redis: execFileSync(process.env.P0_REDIS_BIN, ['--version'], {
          encoding: 'utf8',
        }).trim(),
        oauth: oauthVersion,
        hocuspocus: hocuspocusVersion,
        database: 'fresh disposable loopback cluster',
        fsync: true,
        synchronous_commit: 'on',
        executed_at: new Date().toISOString(),
        exitCode,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (redisChild && redisChild.exitCode === null) {
    const closed = new Promise((r) => redisChild.once('exit', r));
    redisChild.kill('SIGTERM');
    await closed;
  }
  if (started)
    execFileSync(pg('pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], {
      stdio: 'pipe',
    });
  await rm(dir, { recursive: true, force: true });
}
process.exitCode = exitCode;
