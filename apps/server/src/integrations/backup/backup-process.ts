import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { BackupError, redactBackupError } from './backup-error';

export function backupDatabaseEnvironment(
  databaseUrl: string,
): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '10',
  };
  for (const [parameter, variable] of Object.entries({
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
    application_name: 'PGAPPNAME',
    options: 'PGOPTIONS',
  })) {
    if (url.searchParams.has(parameter))
      env[variable] = url.searchParams.get(parameter);
  }
  return env;
}

// EOF on stdout can precede a failing process exit. Both must succeed.
export async function gzipProcess(
  binary: string,
  args: string[],
  outPath: string,
  stage: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const child = spawn(binary, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15 * 60 * 1000,
  });
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr = (stderr + data.toString()).slice(-8000);
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', () =>
      reject(
        new BackupError(
          `${stage}_START_FAILED`,
          `${stage}: executable could not be started`,
        ),
      ),
    );
    child.once('close', (code, signal) => {
      if (code === 0) return resolve();
      let detail = redactBackupError(stderr.trim(), env.BACKUP_DATABASE_URL);
      if (env.PGPASSWORD)
        detail = detail.split(env.PGPASSWORD).join('[redacted]');
      const permission =
        /row-level security|permission denied|authentication failed/i.test(
          detail,
        );
      reject(
        new BackupError(
          permission ? 'BACKUP_DATABASE_PERMISSION' : `${stage}_FAILED`,
          `${stage} exited ${code ?? signal}: ${detail || 'no error output'}`,
          !permission,
        ),
      );
    });
  });
  const gzip = createGzip();
  const out = createWriteStream(outPath, { mode: 0o600 });
  const streamed = pipeline(child.stdout, gzip, out);
  try {
    await Promise.all([exited, streamed]);
  } catch (error) {
    child.kill();
    child.stdout.destroy();
    gzip.destroy();
    out.destroy();
    await Promise.allSettled([exited, streamed]);
    throw error;
  }
}
