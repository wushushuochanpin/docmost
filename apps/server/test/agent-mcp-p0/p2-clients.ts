import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

export async function publicExample(tab: any, origin: string, space: string) {
  await tab.goto(origin + '/home');
  const registration = await tab.evaluate(async () => {
    const response = await fetch('/api/agent-oauth/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'P2 SDK public example',
        type: 'public',
        redirect_uris: ['http://127.0.0.1:1/callback'],
        scopes: [
          'knowledge.read',
          'pages.create',
          'folders.create',
          'pages.edit',
        ],
        origins: [],
      }),
    });
    if (!response.ok) throw Error('Registration failed');
    return (await response.json()).data.client_id;
  });
  const child = spawn(
    process.execPath,
    [
      resolve(__dirname, '../../../../scripts/mcp/client-example.mjs'),
      '--server',
      origin + '/mcp',
      '--client-id',
      registration,
      '--exercise-writes',
      '--space',
      space,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let report: any,
    diagnostic = '';
  const exit = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  child.stderr.on('data', (data) => (diagnostic += data.toString()));
  let resolveAuth: (url: string) => void;
  const authorization = new Promise<string>(
    (resolve) => (resolveAuth = resolve),
  );
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    const item = JSON.parse(line);
    if (item.event === 'authorize') resolveAuth(item.url);
    if (item.event === 'result') report = item;
    diagnostic += ' ' + (item.event === 'stage' ? item.stage : item.event);
  });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 45000);
  try {
    const url = await Promise.race([
      authorization,
      exit.then(() => {
        throw Error('Example exited before authorization: ' + diagnostic);
      }),
    ]);
    await tab.goto(url);
    await tab.waitForSelector('input[value="' + space + '"]');
    for (const value of [space, 'pages.create', 'folders.create', 'pages.edit'])
      await tab.click('input[value="' + value + '"]');
    await Promise.all([
      tab.waitForNavigation(),
      tab.click('button::-p-text(允许连接)'),
    ]);
    if ((await exit) !== 0 || report?.status !== 'passed')
      throw Error('SDK exercise failed: ' + diagnostic);
    writeFileSync(
      resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p2-sdk-probe.json',
      ),
      JSON.stringify(
        {
          ...report,
          executed_at: new Date().toISOString(),
          environment: 'isolated full application, loopback only',
        },
        null,
        2,
      ) + '\n',
    );
    return report;
  } finally {
    clearTimeout(timeout);
    lines.close();
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}
