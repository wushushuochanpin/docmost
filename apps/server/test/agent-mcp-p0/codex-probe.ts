import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p2 = process.env.P2_ACCEPTANCE === 'true';
const scopes = p2
  ? ['knowledge.read', 'pages.edit', 'pages.create', 'folders.create']
  : ['knowledge.read', 'pages.edit'];
const name = p2 ? 'docmost_p2_probe' : 'docmost_p1_probe';
const binary =
  process.env.P1_CODEX_BIN ||
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

/** Real Codex app-server owns discovery, PKCE, tokens and MCP transport. No model inference. */
export async function probeCodex(
  tab: any,
  origin: string,
  space: string,
  page: string,
) {
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, '127.0.0.1', r));
  const port = (listener.address() as any).port;
  await new Promise<void>((r) => listener.close(() => r()));
  const configured = JSON.parse(
    execFileSync(binary, ['mcp', 'list', '--json'], { encoding: 'utf8' }),
  );
  const disabled = configured
    .filter((entry: any) => entry.name !== name)
    .flatMap((entry: any) => [
      '-c',
      `mcp_servers.${entry.name}.enabled=false`,
      '-c',
      entry.transport.type === 'streamable_http'
        ? `mcp_servers.${entry.name}.url=${JSON.stringify(entry.transport.url)}`
        : `mcp_servers.${entry.name}.command=${JSON.stringify(entry.transport.command)}`,
    ]);
  const start = (client: string, callback?: string) => {
    const args = [
      ...disabled,
      '-c',
      `mcp_servers.${name}.url="${origin}/mcp"`,
      '-c',
      `mcp_servers.${name}.oauth.client_id="${client}"`,
      '-c',
      `mcp_servers.${name}.oauth.callback_port=${port}`,
      '-c',
      `mcp_oauth_callback_url="http://127.0.0.1:${port}/callback"`,
      '-c',
      'mcp_oauth_credentials_store="file"',
    ];
    if (callback)
      args.push('-c', `mcp_servers.${name}.oauth.callback_url="${callback}"`);
    const child = spawn(binary, [...args, 'app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let next = 1,
      diagnostic = '';
    const pending = new Map<
      number,
      {
        resolve: (v: any) => void;
        reject: (e: any) => void;
        timer: NodeJS.Timeout;
      }
    >();
    const notices: any[] = [];
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          msg.error
            ? p.reject(Error(JSON.stringify(msg.error)))
            : p.resolve(msg.result);
        } else if (msg.method) {
          notices.push(msg);
          if (msg.id)
            child.stdin.write(
              JSON.stringify({
                id: msg.id,
                error: {
                  code: -32601,
                  message: 'No interactive requests in this probe',
                },
              }) + '\n',
            );
        }
      } catch {
        /* non-protocol diagnostics */
      }
    });
    child.stderr.on('data', (chunk) => (diagnostic += chunk.toString()));
    const rpc = (method: string, params: any = {}) =>
      new Promise<any>((resolve, reject) => {
        const id = next++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(
            Error('Codex timeout: ' + method + ' ' + diagnostic.slice(-1000)),
          );
        }, 25000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    const stop = async () => {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('Codex stopped'));
      }
      pending.clear();
      lines.close();
      if (child.exitCode === null) {
        const done = new Promise((r) => child.once('exit', r));
        child.kill('SIGTERM');
        await done;
      }
    };
    return {
      rpc,
      stop,
      notices,
      logout: () =>
        execFileSync(binary, [...args, 'mcp', 'logout', name], {
          stdio: 'pipe',
        }),
      initialize: () =>
        rpc('initialize', {
          clientInfo: { name: 'docmost-acceptance', version: '1.0' },
          capabilities: { experimentalApi: true },
        }),
    };
  };
  let codex = start(randomUUID());
  try {
    await codex.initialize();
    const initial = await codex.rpc('mcpServer/oauth/login', {
      name,
      scopes,
      timeoutSecs: 60,
    });
    const callback = new URL(initial.authorizationUrl).searchParams.get(
      'redirect_uri',
    )!;
    await codex.stop();
    const registered = await tab.evaluate(
      async (input: any) => {
        const r = await fetch('/api/agent-oauth/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        return { status: r.status, body: await r.json() };
      },
      {
        name: p2 ? 'Codex local P2' : 'Codex local P1',
        type: 'public',
        redirect_uris: [callback],
        scopes,
        origins: [],
      },
    );
    if (registered.status !== 200)
      throw Error('Codex client registration failed');
    const client = registered.body.data.client_id;
    codex = start(client, callback);
    await codex.initialize();
    const login = await codex.rpc('mcpServer/oauth/login', {
      name,
      scopes,
      timeoutSecs: 60,
    });
    const authUrl = new URL(login.authorizationUrl);
    console.info('Codex authorization contract', {
      keys: [...authUrl.searchParams.keys()],
      resource: authUrl.searchParams.get('resource'),
      callbackMatches: authUrl.searchParams.get('redirect_uri') === callback,
    });
    await tab.goto(login.authorizationUrl);
    try {
      await tab.waitForSelector('input[value="' + space + '"]');
    } catch {
      throw Error(
        'Consent page: ' + (await tab.evaluate(() => document.body.innerText)),
      );
    }
    await tab.click('input[value="' + space + '"]');
    for (const scope of scopes.filter((s) => s !== 'knowledge.read'))
      await tab.click('input[value="' + scope + '"]');
    await Promise.all([
      tab.waitForNavigation(),
      tab.click('button::-p-text(允许连接)'),
    ]);
    for (
      let i = 0;
      i < 200 &&
      !codex.notices.some((n) => n.method === 'mcpServer/oauthLogin/completed');
      i++
    )
      await new Promise((r) => setTimeout(r, 50));
    const completion = codex.notices.find(
      (n) => n.method === 'mcpServer/oauthLogin/completed',
    );
    if (!completion?.params.success)
      throw Error('Codex OAuth failed: ' + JSON.stringify(completion?.params));
    const thread = await codex.rpc('thread/start', {
      cwd: process.cwd(),
      ephemeral: true,
      approvalPolicy: 'never',
    });
    const threadId = thread.thread.id;
    const inventory = await codex.rpc('mcpServerStatus/list', {
      threadId,
      serverName: name,
      detail: 'toolsAndAuthOnly',
    });
    const discovered = inventory.data.find((entry: any) => entry.name === name);
    if (
      discovered?.toolsError ||
      !discovered?.tools?.edit_page ||
      !discovered?.tools?.get_edit_context
    )
      throw Error('Codex tool discovery failed');
    const call = (tool: string, args: any) =>
      codex.rpc('mcpServer/tool/call', {
        server: name,
        threadId,
        tool,
        arguments: args,
      });
    if (p2) {
      const folder = await call('create_folder', {
        space_id: space,
        title: 'Codex P2 folder',
        idempotency_key: randomUUID(),
      });
      if (folder.isError || folder.structuredContent.status !== 'committed')
        throw Error('Codex folder failed');
      const created = await call('create_page', {
        space_id: space,
        parent_id: folder.structuredContent.page_id,
        title: 'Codex P2 document',
        markdown: 'Created by real Codex transport',
        idempotency_key: randomUUID(),
      });
      if (created.isError || created.structuredContent.status !== 'committed')
        throw Error('Codex create failed');
      page = created.structuredContent.page_id;
    }
    const before = await call('get_page', { slug_id: page });
    if (before.isError)
      throw Error('Codex get_page failed ' + JSON.stringify(before));
    const context = await call('get_edit_context', { page_id: page });
    if (context.isError)
      throw Error('Codex context failed ' + JSON.stringify(context));
    const input = {
      page_id: page,
      version_token: context.structuredContent.version_token,
      idempotency_key: 'actual-codex-probe',
      ops: [
        {
          type: 'append',
          markdown: 'Written through real Codex MCP transport',
        },
      ],
    };
    const edited = await call('edit_page', input);
    if (edited.isError || edited.structuredContent.status !== 'committed')
      throw Error('Codex edit failed ' + JSON.stringify(edited));
    const retry = await call('edit_page', input);
    if (
      retry.structuredContent.operation_id !==
      edited.structuredContent.operation_id
    )
      throw Error('Codex replay duplicated operation');
    const after = await call('fetch', { id: page });
    if (
      !JSON.stringify(after).includes(
        'Written through real Codex MCP transport',
      )
    )
      throw Error('Codex read after write failed');
    const operation = await call('get_operation', {
      operation_id: edited.structuredContent.operation_id,
    });
    if (operation.structuredContent.status !== 'committed')
      throw Error('Codex durable operation missing');
    if (p2) {
      await tab.goto(origin + '/home');
      const toggle = async (enabled: boolean) =>
        tab.evaluate(async (value: boolean) => {
          const p = (await (await fetch('/api/agent-policy')).json()).data;
          const response = await fetch('/api/agent-policy', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': p.csrf_token,
            },
            body: JSON.stringify({
              expected_version: p.version,
              enabled: value,
              max_grant_days: p.maxGrantDays,
              timezone: p.timezone,
              quota_limits: p.quotaLimits,
            }),
          });
          if (!response.ok) throw Error('Policy toggle failed');
        }, enabled);
      await toggle(false);
      try {
        const preserved = await call('get_operation', {
          operation_id: edited.structuredContent.operation_id,
        });
        if (
          preserved.isError ||
          preserved.structuredContent.status !== 'committed'
        )
          throw Error('Disable lost operation');
        const readable = await call('fetch', { id: page });
        if (readable.isError) throw Error('Disable blocked reads');
        const denied = await call('create_folder', {
          space_id: space,
          title: 'Must not exist',
          idempotency_key: randomUUID(),
        });
        if (!denied.isError || denied.structuredContent.code !== 'MCP_DISABLED')
          throw Error('Disable allowed new write');
      } finally {
        await toggle(true);
      }

      const revoked = await tab.evaluate(async (clientId: string) => {
        const list = (await (await fetch('/api/agent-connections')).json())
          .data;
        const grant = list.items.find((g: any) => g.name === 'Codex local P2');
        if (!grant) throw Error('Missing Codex connection');
        const detail = (
          await (await fetch('/api/agent-connections/' + grant.id)).json()
        ).data;
        if (detail.clientId !== clientId) throw Error('Wrong grant');
        const response = await fetch(
          '/api/agent-connections/' + grant.id + '/revoke',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': detail.csrf_token,
            },
            body: JSON.stringify({ expected_version: detail.version }),
          },
        );
        return response.ok;
      }, client);
      if (!revoked) throw Error('Codex grant revoke failed');
      let denied = false;
      try {
        const result = await call('get_page', { slug_id: page });
        denied = !!result.isError;
      } catch (error) {
        denied = /401|unauthoriz|auth.*required|authentication/i.test(
          String(error),
        );
      }
      if (!denied) throw Error('Codex revoked connection still readable');
    }
    const report = {
      client: execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(),
      executed_at: new Date().toISOString(),
      registration:
        'pre-registered public client, exact loopback callback; temporary Codex runtime config, no persistent desktop connection',
      oauth: 'real Codex PKCE + browser consent + Codex token exchange',
      transport: 'Codex app-server mcpServer/tool/call (no model inference)',
      tools: Object.keys(discovered.tools),
      checks: [
        'discovery',
        'OAuth',
        'get_page',
        'get_edit_context',
        'edit_page committed',
        'idempotent replay',
        'fetch read-after-write',
        'get_operation',
        ...(p2
          ? [
              'create_folder',
              'create_page',
              'write disable denies new writes',
              'write disable preserves reads and committed operation',
              'grant revoke',
              'revoked Codex call denied',
            ]
          : []),
      ],
      status: 'passed',
      deployment: 'none',
    };
    writeFileSync(
      resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/' +
          (p2 ? 'p2-codex-probe.json' : 'p1-codex-probe.json'),
      ),
      JSON.stringify(report, null, 2) + '\n',
    );
    return report;
  } finally {
    await codex.stop();
    codex.logout();
  }
}
