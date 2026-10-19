import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import {
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import postgres from 'postgres';
import { CamelCasePlugin, Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { hashPassword } from '../../src/common/helpers';
import { db } from './store';

test('complete application: login, OAuth, collaborative editing, history conflict/restore, mobile, recovery and existing write paths', async () => {
  const admin = db('p0_fullapp');
  await admin.unsafe('CREATE DATABASE p0_application');
  await admin.unsafe(
    'CREATE ROLE p0_application LOGIN NOSUPERUSER NOBYPASSRLS',
  );
  const url = new URL(process.env.P0_DATABASE_URL!);
  url.pathname = '/p0_application';
  const pg = postgres(url.toString(), { onnotice: () => {} });
  const database = new Kysely<any>({
    dialect: new PostgresJSDialect({ postgres: pg }),
    plugins: [new CamelCasePlugin()],
  });
  const workspace = randomUUID(),
    user = randomUUID(),
    peerUser = randomUUID(),
    space = randomUUID(),
    folder = randomUUID(),
    page = randomUUID();
  const temp = mkdtempSync(join(tmpdir(), 'docmost-fullapp-'));
  mkdirSync(join(temp, 'run', 'server'), { recursive: true });
  let child: ChildProcess | undefined,
    browser: any,
    peer: any,
    tab: any,
    logs = '';
  const ydoc = new Y.Doc();
  const p = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  text.insert(0, 'Existing P0 document');
  p.insert(0, [text]);
  ydoc.getXmlFragment('default').insert(0, [p]);
  try {
    const directory = resolve(__dirname, '../../src/database/migrations');
    for (const file of readdirSync(directory)
      .filter((f) => f.endsWith('.ts'))
      .sort())
      await (await import(join(directory, file))).up(database);
    await pg`INSERT INTO workspaces(id,name,settings) VALUES(${workspace},'P0 isolated workspace',${pg.json({ ai: { mcp: true } })})`;
    await pg`INSERT INTO agent_policies(workspace_id,enabled,max_grant_days) VALUES(${workspace},true,90)`;
    await pg`INSERT INTO users(id,workspace_id,name,email,password,role,locale) VALUES(${user},${workspace},'P0 Browser','browser@example.test',${await hashPassword('P0-test-password-2026!')},'owner','en-US')`;
    await pg`INSERT INTO users(id,workspace_id,name,email,password,role,locale) VALUES(${peerUser},${workspace},'P0 Peer','peer@example.test',${await hashPassword('P0-test-password-2026!')},'member','en-US')`;
    await pg`INSERT INTO spaces(id,workspace_id,name,slug,creator_id) VALUES(${space},${workspace},'P0 Space','p0-space',${user})`;
    await pg`UPDATE workspaces SET default_space_id=${space} WHERE id=${workspace}`;
    await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${user},'admin')`;
    await pg`INSERT INTO space_members(space_id,user_id,role) VALUES(${space},${peerUser},'writer')`;
    for (const [id, slug, title, parent, nodeType] of [
      [folder, 'p0folder', 'P0 folder', null, 'folder'],
      [page, 'p0document', 'P0 document', folder, 'file'],
    ] as const) {
      await pg`INSERT INTO pages(id,workspace_id,space_id,slug_id,title,parent_page_id,creator_id,ydoc,content,position) VALUES(${id},${workspace},${space},${slug},${title},${parent},${user},${Buffer.from(Y.encodeStateAsUpdate(ydoc))},${pg.json(TiptapTransformer.fromYdoc(ydoc, 'default'))},'a0')`;
      await pg`INSERT INTO page_node_meta(page_id,workspace_id,space_id,node_type) VALUES(${id},${workspace},${space},${nodeType})`;
    }
    await pg.unsafe(
      'GRANT ALL ON ALL TABLES IN SCHEMA public TO p0_application',
    );
    await pg.unsafe(
      'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO p0_application',
    );
    await pg.unsafe('GRANT USAGE ON SCHEMA public TO p0_application');
    const socket = createServer();
    await new Promise<void>((r) => socket.listen(0, '127.0.0.1', r));
    const port = (socket.address() as any).port;
    await new Promise<void>((r) => socket.close(() => r()));
    url.username = 'p0_application';
    const origin = 'http://127.0.0.1:' + port;
    child = spawn(
      process.execPath,
      [resolve(__dirname, '../../dist/main.js')],
      {
        cwd: join(temp, 'run', 'server'),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'test',
          ...(process.env.P2_ACCEPTANCE === 'true'
            ? {
                NODE_OPTIONS:
                  '--require ' + resolve(__dirname, 'p2-protocol-observer.cjs'),
              }
            : {}),
          PORT: String(port),
          HOST: '127.0.0.1',
          DATABASE_URL: url.toString(),
          REDIS_URL: process.env.P0_REDIS_URL,
          APP_URL: origin,
          APP_SECRET: 'p0-isolated-full-app-secret-at-least-32-characters',
          DISABLE_TELEMETRY: 'true',
          BACKUP_ENABLED: 'false',
          STORAGE_DRIVER: 'local',
          COLLAB_ENABLED: 'true',
          EDITOR_SESSION_ENABLED: 'true',
          DOCUMENT_COMMAND_ENABLED:
            process.env.P2_LEGACY === 'true' ? 'false' : 'true',
          DOCUMENT_COMMAND_SIGNING_KEY: Buffer.alloc(32, 9).toString('base64'),
          AGENT_OAUTH_ENABLED: 'true',
          AGENT_OAUTH_ORIGIN: origin,
          AGENT_OAUTH_RESPONSE_KEY: Buffer.alloc(32, 4).toString('base64'),
          AGENT_OAUTH_ADMIN_USER_IDS: user,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout!.on('data', (c) => (logs += c.toString()));
    child.stderr!.on('data', (c) => (logs += c.toString()));
    await new Promise<void>((res, rej) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (logs.includes('Listening on')) {
          clearInterval(timer);
          res();
        } else if (child!.exitCode !== null || Date.now() - started > 30000) {
          clearInterval(timer);
          rej(Error('Application startup failed: ' + logs.slice(-12000)));
        }
      }, 100);
    });
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({
      executablePath:
        process.env.P0_CHROME_BIN ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox'],
    });
    tab = await browser.newPage();
    await tab.setViewport({ width: 1440, height: 1000 });
    tab.setDefaultTimeout(15000);
    tab.on('request', (r: any) => {
      if (r.url().includes('/history/info'))
        logs += '\nHISTORY REQUEST ' + r.postData();
    });
    tab.on('pageerror', (e: any) => (logs += '\nBROWSER: ' + e.message));
    tab.on('response', async (r: any) => {
      if (r.status() >= 400)
        logs +=
          '\nHTTP ' +
          r.status() +
          ' ' +
          r.url() +
          ' ' +
          (await r.text()).slice(0, 1000);
    });
    await tab.goto(origin + '/login');
    await tab.waitForSelector('input[type="email"]');
    await tab.type('input[type="email"]', 'browser@example.test');
    await tab.type('input[type="password"]', 'P0-test-password-2026!');
    await tab.click('button[type="submit"]');
    await tab.waitForFunction(() => !location.pathname.includes('/login'));
    for (let i = 0; i < 5; i++)
      expect(
        await tab.evaluate(
          async () =>
            (await fetch('/api/auth/collab-token', { method: 'POST' })).status,
        ),
      ).toBe(200);
    if (process.env.P2_LEGACY === 'true') {
      // Delay the websocket only, after runtime discovery. Loading must never
      // mount the JSON writer while the authoritative Y.Doc is connecting.
      await tab.evaluateOnNewDocument(() => {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(
              String(url).includes('/collab') &&
                sessionStorage.getItem('delay-collab') !== 'off'
                ? 'ws://127.0.0.1:1/collab'
                : url,
              protocols,
            );
          }
        };
      });
      const contentWrites: string[] = [];
      tab.on('request', (r: any) => {
        if (
          r.url().includes('/pages/update') &&
          r.postData()?.includes('"content"')
        )
          contentWrites.push(r.postData());
      });
      await tab.goto(origin + '/s/p0-space/p/p0document');
      await tab.waitForFunction(() =>
        document.body.innerText.includes('Existing P0 document'),
      );
      await new Promise((r) => setTimeout(r, 2500));
      // Navigating away also exercises unmount normalization/autosave.
      await tab.goto(origin + '/home');
      await new Promise((r) => setTimeout(r, 1500));
      expect(contentWrites).toEqual([]);
      const stored = (await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0]
        .ydoc;
      expect(Buffer.from(stored)).toEqual(
        Buffer.from(Y.encodeStateAsUpdate(ydoc)),
      );
      await tab.evaluate(() => sessionStorage.setItem('delay-collab', 'off'));
      for (let i = 0; i < 2; i++) {
        await tab.goto(origin + '/s/p0-space/p/p0document');
        await tab.waitForSelector('.ProseMirror[contenteditable="true"]');
        await new Promise((r) => setTimeout(r, 1500));
        expect(await tab.evaluate(() => document.body.innerText)).not.toContain(
          '页面加载失败',
        );
        const saved = (await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0]
          .ydoc;
        const merged = new Y.Doc();
        Y.applyUpdate(merged, saved);
        Y.applyUpdate(merged, Y.encodeStateAsUpdate(ydoc));
        expect(merged.getXmlFragment('default').length).toBe(1);
        merged.destroy();
        await tab.goto(origin + '/home');
      }
      expect(contentWrites).toEqual([]);
      return;
    }
    await tab.goto(origin + '/s/p0-space/p/p0document');
    await tab.waitForSelector('.ProseMirror[contenteditable="true"]');
    expect(await tab.evaluate(() => document.body.innerText)).not.toContain(
      '页面加载失败',
    );
    await tab.screenshot({
      path: '/tmp/docmost-full-app.png',
      fullPage: false,
    });
    const editors = await tab.$$('.ProseMirror[contenteditable="true"]');
    let bodyEditor: any;
    for (const editor of editors)
      if (
        await editor.evaluate((el: any) =>
          el.textContent.includes('Existing P0 document'),
        )
      )
        bodyEditor = editor;
    expect(bodyEditor).toBeDefined();
    await bodyEditor.click();
    await tab.keyboard.press('End');
    await tab.keyboard.type(' P0 real UI durable typing');
    await tab.waitForFunction(() =>
      document.body.innerText.includes('修改已可靠保存'),
    );
    await tab.reload();
    await tab.waitForFunction(() =>
      Array.from(document.querySelectorAll('.ProseMirror')).some((el) =>
        el.textContent?.includes('P0 real UI durable typing'),
      ),
    );
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${page}`)[0].content,
      ),
    ).toContain('P0 real UI durable typing');
    if (
      process.env.P1_CODEX_PROBE === 'true' ||
      process.env.P2_ACCEPTANCE === 'true'
    ) {
      // Leaving the editor releases the human permit before the real Codex client writes.
      await tab.goto(origin + '/home');
      for (let i = 0; i < 100; i++) {
        if (
          !(
            await pg`SELECT 1 FROM document_human_permits WHERE page_id=${page} AND expires_at>clock_timestamp()`
          ).length
        )
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const codexReport = await (
        await import('./codex-probe')
      ).probeCodex(tab, origin, space, page);
      if (process.env.P2_ACCEPTANCE === 'true') {
        const protocols = [
          ...new Set(
            [...logs.matchAll(/P2_MCP_PROTOCOL=(\d{4}-\d{2}-\d{2})/g)].map(
              (match) => match[1],
            ),
          ),
        ];
        expect(protocols.length).toBeGreaterThan(0);
        writeFileSync(
          resolve(
            __dirname,
            '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p2-codex-probe.json',
          ),
          JSON.stringify(
            { ...codexReport, observed_protocol_headers: protocols },
            null,
            2,
          ) + '\n',
        );
        await (await import('./p2-clients')).publicExample(tab, origin, space);
        await (
          await import('./p2-operations')
        ).operationsProbe(
          pg,
          url.toString(),
          workspace,
          user,
          page,
          tab,
          origin,
        );
      }
      return;
    }
    // Register through the authenticated production administration API; no seeded OAuth grant.
    const redirect = origin + '/agent-callback',
      verifier = 'v'.repeat(43);
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
        name: 'P0 UI Agent',
        type: 'public',
        redirect_uris: [redirect],
        scopes: ['knowledge.read', 'pages.edit', 'pages.create'],
        origins: [],
      },
    );
    expect(registered.status).toBe(200);
    const client = registered.body.data.client_id;
    await tab.goto(
      origin +
        '/oauth/authorize?' +
        new URLSearchParams({
          client_id: client,
          redirect_uri: redirect,
          response_type: 'code',
          resource: origin + '/mcp',
          scope: 'knowledge.read pages.edit pages.create',
          state: 'p0-ui',
          code_challenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
          code_challenge_method: 'S256',
        }),
    );
    await tab.waitForSelector('input[value="' + space + '"]');
    await tab.click('input[value="' + space + '"]');
    await tab.click('input[value="pages.edit"]');
    await tab.click('input[value="pages.create"]');
    await Promise.all([
      tab.waitForNavigation(),
      tab.click('button::-p-text(允许连接)'),
    ]);
    const code = new URL(tab.url()).searchParams.get('code');
    expect(code).toBeTruthy();
    const tokenResponse = await fetch(origin + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client,
        code: code!,
        redirect_uri: redirect,
        code_verifier: verifier,
        resource: origin + '/mcp',
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const token = ((await tokenResponse.json()) as any).access_token;
    const mcp = async (name: string, args: any) => {
      const response = await fetch(origin + '/mcp', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      return ((await response.json()) as any).result;
    };
    // Wait for the real page unmount to release its human permit.
    for (let i = 0; i < 100; i++) {
      if (
        !(
          await pg`SELECT 1 FROM document_human_permits WHERE page_id=${page} AND expires_at>clock_timestamp()`
        ).length
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const context = await mcp('get_edit_context', { page_id: page });
    const changed = await mcp('edit_page', {
      page_id: page,
      version_token: context.structuredContent.version_token,
      idempotency_key: 'full-ui-agent',
      ops: [{ type: 'append', markdown: 'Agent text to restore' }],
    });
    expect(changed.isError).not.toBe(true);
    expect(changed.structuredContent.status).toBe('committed');
    await tab.goto(origin + '/s/p0-space/p/p0document');
    await tab.waitForFunction(() =>
      Array.from(
        document.querySelectorAll('.ProseMirror[contenteditable="true"]'),
      ).some((el) => el.textContent?.includes('Agent text to restore')),
    );
    const editorIdentity = await tab.evaluateHandle(() =>
      Array.from(
        document.querySelectorAll('.ProseMirror[contenteditable="true"]'),
      ).find((el) => el.textContent?.includes('Agent text to restore')),
    );
    const peerContext = await browser.createBrowserContext();
    peer = await peerContext.newPage();
    await peer.bringToFront();
    peer.on(
      'console',
      (message: any) => (logs += '\nPEER CONSOLE ' + message.text()),
    );
    peer.on('response', async (r: any) => {
      if (r.status() >= 400)
        logs +=
          '\nPEER HTTP ' +
          r.status() +
          ' ' +
          r.url() +
          ' ' +
          (await r.text()).slice(0, 1000);
    });
    const peerCDP = await peer.createCDPSession();
    await peerCDP.send('Network.enable');
    peerCDP.on('Network.webSocketFrameReceived', (e: any) => {
      if (e.response.opcode === 8 || e.response.opcode === 1)
        logs += '\nPEER WS ' + e.response.payloadData;
    });
    await peer.setViewport({ width: 1440, height: 1000 });
    await peer.goto(origin + '/login');
    await peer.waitForSelector('input[type="email"]');
    await peer.type('input[type="email"]', 'peer@example.test');
    await peer.type('input[type="password"]', 'P0-test-password-2026!');
    await peer.click('button[type="submit"]');
    await peer.waitForFunction(() => !location.pathname.includes('/login'));
    await peer.goto(origin + '/s/p0-space/p/p0document');
    await peer.waitForFunction(() =>
      Array.from(
        document.querySelectorAll('.ProseMirror[contenteditable="true"]'),
      ).some((el) => el.textContent?.includes('Agent text to restore')),
    );
    expect(
      (
        await pg`SELECT DISTINCT user_id FROM document_human_permits WHERE page_id=${page} AND expires_at>clock_timestamp()`
      ).length,
    ).toBe(2);
    const busyContext = await mcp('get_edit_context', { page_id: page });
    const busy = await mcp('edit_page', {
      page_id: page,
      version_token: busyContext.structuredContent.version_token,
      idempotency_key: 'human-busy',
      ops: [{ type: 'append', markdown: 'must not appear' }],
    });
    expect(busy.isError).toBe(true);
    expect(JSON.stringify(busy)).toContain('DOCUMENT_BUSY');
    await tab.bringToFront();
    await tab.click('button[aria-label="Page actions"]');
    await tab.waitForSelector('[role="menuitem"]::-p-text(Page history)');
    await tab.click('[role="menuitem"]::-p-text(Page history)');
    await tab.waitForSelector('[role="dialog"]');
    await tab.waitForFunction(() =>
      document.body.innerText.includes('P0 UI Agent'),
    );
    const beforeButtons = await tab.$$('button');
    for (const button of beforeButtons)
      if (
        await button.evaluate((el: any) =>
          el.textContent.includes('应用修改前'),
        )
      ) {
        await button.asLocator().click();
        break;
      }
    await tab.waitForFunction(() =>
      Array.from(document.querySelectorAll('button[aria-pressed="true"]')).some(
        (el) => el.textContent?.includes('应用修改前'),
      ),
    );
    await tab.waitForFunction(() =>
      Array.from(
        document.querySelectorAll('[role="dialog"] .ProseMirror'),
      ).some(
        (el) =>
          el.textContent?.includes('P0 real UI durable typing') &&
          !el.textContent?.includes('Agent text to restore'),
      ),
    );
    await tab.setViewport({ width: 375, height: 812 });
    await tab.waitForFunction(() =>
      (
        document.querySelector(
          'input[placeholder="Select version"]',
        ) as HTMLInputElement
      )?.value.includes('应用修改前'),
    );
    await tab.setViewport({ width: 1440, height: 1000 });
    await tab.waitForFunction(() =>
      Array.from(document.querySelectorAll('button[aria-pressed="true"]')).some(
        (el) => el.textContent?.includes('应用修改前'),
      ),
    );
    await tab.waitForSelector('button::-p-text(Restore)');
    logs +=
      '\nBEFORE SCREEN ' +
      JSON.stringify(
        await tab.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          buttons: Array.from(
            document.querySelectorAll('button[aria-pressed]'),
          ).map((el) => ({
            text: el.textContent,
            pressed: el.getAttribute('aria-pressed'),
          })),
        })),
      );
    await tab.screenshot({
      path: '/tmp/docmost-full-app-history.png',
      fullPage: false,
    });
    logs +=
      '\nBEFORE RESTORE ' +
      JSON.stringify(
        await tab.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .filter((el) => el.textContent?.includes('应用修改'))
            .map((el) => ({
              text: el.textContent,
              pressed: el.getAttribute('aria-pressed'),
            })),
        ),
      );
    await tab.locator('button::-p-text(Restore)').click();
    await tab.waitForSelector('button::-p-text(Confirm)', { visible: true });
    const dialogs = await tab.$$('[role="dialog"]');
    let cancelled = false;
    for (const dialog of dialogs) {
      if (
        !(await dialog.evaluate((el: any) =>
          el.textContent.includes('Please confirm your action'),
        ))
      )
        continue;
      for (const button of await dialog.$$('button'))
        if (
          await button.evaluate((el: any) => el.textContent.trim() === 'Cancel')
        ) {
          await button.asLocator().click();
          cancelled = true;
          break;
        }
    }
    expect(cancelled).toBe(true);
    await tab.waitForSelector('button::-p-text(Confirm)', { hidden: true });
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${page}`)[0].content,
      ),
    ).toContain('Agent text to restore');
    logs +=
      '\nBEFORE RESTORE ' +
      JSON.stringify(
        await tab.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .filter((el) => el.textContent?.includes('应用修改'))
            .map((el) => ({
              text: el.textContent,
              pressed: el.getAttribute('aria-pressed'),
            })),
        ),
      );
    await tab.locator('button::-p-text(Restore)').click();
    await tab.waitForSelector('button::-p-text(Confirm)', { visible: true });
    await peer.bringToFront();
    const peerEditors = await peer.$$('.ProseMirror[contenteditable="true"]');
    for (const editor of peerEditors)
      if (
        await editor.evaluate((el: any) =>
          el.textContent.includes('Agent text to restore'),
        )
      ) {
        await editor.click();
        break;
      }
    await peer.keyboard.press('End');
    await peer.keyboard.type(' Later human edit');
    await peer.waitForFunction(() =>
      document.body.innerText.includes('修改已可靠保存'),
    );
    const afterPeer = (
      await pg`SELECT revision::text FROM document_gates WHERE page_id=${page}`
    )[0].revision;
    await tab.bringToFront();
    await tab.locator('button::-p-text(Confirm)').click();
    await tab.waitForFunction(() =>
      document.body.innerText.includes('请核对最新文档后重新确认'),
    );
    await tab.waitForSelector('button::-p-text(Confirm)', { hidden: true });
    expect(
      (
        await pg`SELECT revision::text FROM document_gates WHERE page_id=${page}`
      )[0].revision,
    ).toBe(afterPeer);
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${page}`)[0].content,
      ),
    ).toContain('Later human edit');
    expect(
      await tab.evaluate((el: any) => document.contains(el), editorIdentity),
    ).toBe(true);
    await tab.screenshot({
      path: '/tmp/docmost-full-app-conflict.png',
      fullPage: false,
    });
    logs +=
      '\nBEFORE RESTORE ' +
      JSON.stringify(
        await tab.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .filter((el) => el.textContent?.includes('应用修改'))
            .map((el) => ({
              text: el.textContent,
              pressed: el.getAttribute('aria-pressed'),
            })),
        ),
      );
    await tab.locator('button::-p-text(Restore)').click();
    await tab.waitForSelector('button::-p-text(Confirm)', { visible: true });
    await tab.locator('button::-p-text(Confirm)').click();
    await tab.waitForFunction(() =>
      document.body.innerText.includes('Successfully restored'),
    );
    await tab.reload();
    await tab.waitForFunction(() =>
      Array.from(document.querySelectorAll('.ProseMirror')).some((el) =>
        el.textContent?.includes('P0 real UI durable typing'),
      ),
    );
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${page}`)[0].content,
      ),
    ).not.toContain('Agent text to restore');
    await tab.waitForFunction(() =>
      document.body.innerText.includes('修改已可靠保存'),
    );
    await tab.screenshot({
      path: '/tmp/docmost-full-app-restored.png',
      fullPage: false,
    });
    await peer.bringToFront();
    await peer.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('.ProseMirror')).some((el) =>
          el.textContent?.includes('Agent text to restore'),
        ),
    );
    await peer.goto(origin + '/home');
    await tab.bringToFront();
    await tab.setViewport({ width: 375, height: 812 });
    await tab.click('button[aria-label="Page actions"]');
    await tab.waitForSelector('[role="menuitem"]::-p-text(Page history)');
    await tab.click('[role="menuitem"]::-p-text(Page history)');
    await tab.waitForFunction(() => {
      const dialog = Array.from(
        document.querySelectorAll('[role="dialog"]'),
      ).find((el) => el.textContent?.includes('Page history'));
      const close = dialog?.querySelector('button[aria-label="Close"]');
      if (!close) return false;
      const rect = close.getBoundingClientRect();
      return close.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      );
    });
    await tab.waitForSelector('input[placeholder="Select version"]');
    await tab.click('input[placeholder="Select version"]');
    await tab.waitForFunction(() =>
      document.body.innerText.includes('P0 UI Agent'),
    );
    await tab.screenshot({
      path: '/tmp/docmost-full-app-mobile-history.png',
      fullPage: false,
    });
    await tab.goto(origin + '/s/p0-space/p/p0document');
    await tab.waitForFunction(() =>
      document.body.innerText.includes('修改已可靠保存'),
    );
    await tab.locator('button::-p-text(查看恢复草稿)').click();
    await tab.waitForFunction(
      () =>
        (
          document.querySelector(
            'textarea[aria-label="本机恢复草稿"]',
          ) as HTMLTextAreaElement
        )?.value === '没有待恢复的本机草稿。',
    );
    // Inject only a transport failure, keeping the real editor/runtime/permission handlers.
    await tab.setRequestInterception(true);
    let failRuntime = true;
    const intercept = (request: any) =>
      request.url().includes('/api/document-runtime/') && failRuntime
        ? request.abort('failed')
        : request.continue();
    tab.on('request', intercept);
    await tab.reload();
    await tab.waitForFunction(() =>
      document.body.innerText.includes('无法确认文档编辑状态，请重试。'),
    );
    expect(await tab.$$('.ProseMirror[contenteditable="true"]')).toHaveLength(
      0,
    );
    failRuntime = false;
    await tab.locator('button::-p-text(重试编辑)').click();
    await tab.waitForFunction(() =>
      document.body.innerText.includes('修改已可靠保存'),
    );
    expect(
      (await tab.$$('.ProseMirror[contenteditable="true"]')).length,
    ).toBeGreaterThan(0);
    await tab.setRequestInterception(false);
    tab.off('request', intercept);
    // Password recovery keeps its independent three-attempt budget.
    const forgotStatuses = await tab.evaluate(async () => {
      const statuses = [];
      for (let i = 0; i < 4; i++)
        statuses.push(
          (
            await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: 'invalid' }),
            })
          ).status,
        );
      return statuses;
    });
    expect(forgotStatuses).toEqual([400, 400, 400, 429]);
    const originalBytes = Buffer.from(
      (await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0].ydoc,
    );
    const api = async (path: string, payload: object) =>
      tab.evaluate(
        async ({ path, payload }: any) => {
          const r = await fetch('/api/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return { status: r.status, body: await r.json() };
        },
        { path, payload },
      );
    const copy = await api('pages/duplicate', { pageId: page });
    expect(copy.status).toBe(200);
    const copyId = copy.body.data.id;
    expect(copyId).not.toBe(page);
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${copyId}`)[0].content,
      ),
    ).toContain('P0 real UI durable typing');
    const imported = await tab.evaluate(async (space: string) => {
      const form = new FormData();
      form.append('spaceId', space);
      form.append(
        'file',
        new Blob(['# P0 Imported\n\nImported durable content'], {
          type: 'text/markdown',
        }),
        'p0.md',
      );
      const r = await fetch('/api/pages/import', {
        method: 'POST',
        body: form,
      });
      return { status: r.status, body: await r.json() };
    }, space);
    expect(imported.status).toBe(200);
    const importedId = imported.body.data.id;
    expect(
      JSON.stringify(
        (await pg`SELECT content FROM pages WHERE id=${importedId}`)[0].content,
      ),
    ).toContain('Imported durable content');
    // Imported and copied documents can enter the same authoritative command boundary.
    for (const id of [copyId, importedId]) {
      const ctx = await mcp('get_edit_context', { page_id: id });
      expect(ctx.isError).not.toBe(true);
      const edited = await mcp('edit_page', {
        page_id: id,
        version_token: ctx.structuredContent.version_token,
        idempotency_key: 'post-existing-path-' + id,
        ops: [{ type: 'append', markdown: 'Agent after existing path' }],
      });
      expect(edited.structuredContent.status).toBe('committed');
      const rebuilt = new Y.Doc();
      try {
        Y.applyUpdate(
          rebuilt,
          new Uint8Array(
            (await pg`SELECT ydoc FROM pages WHERE id=${id}`)[0].ydoc,
          ),
        );
        expect(rebuilt.getXmlFragment('default').toString()).toContain(
          'Agent after existing path',
        );
      } finally {
        rebuilt.destroy();
      }
    }
    const target = await api('pages/create', {
      spaceId: space,
      title: 'P0 batch target',
      nodeType: 'folder',
    });
    expect(target.status).toBe(200);
    const moved = await api('pages/batch-move', {
      spaceId: space,
      selectionMode: 'ids',
      pageIds: [copyId, importedId],
      targetFolderId: target.body.data.id,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.movedCount).toBe(2);
    for (const id of [copyId, importedId])
      expect(
        (await pg`SELECT parent_page_id FROM pages WHERE id=${id}`)[0]
          .parent_page_id,
      ).toBe(target.body.data.id);
    const invalidMove = await api('pages/batch-move', {
      spaceId: space,
      selectionMode: 'ids',
      pageIds: [copyId, importedId],
      targetFolderId: page,
    });
    expect(invalidMove.status).toBe(400);
    for (const id of [copyId, importedId])
      expect(
        (await pg`SELECT parent_page_id FROM pages WHERE id=${id}`)[0]
          .parent_page_id,
      ).toBe(target.body.data.id);
    expect(
      Buffer.from((await pg`SELECT ydoc FROM pages WHERE id=${page}`)[0].ydoc),
    ).toEqual(originalBytes);
    await tab.setViewport({ width: 1440, height: 1000 });
    const agentCreated = await mcp('create_page', {
      space_id: space,
      parent_id: folder,
      title: 'P1 Agent document',
      markdown: '## Created by Agent\n\nPersisted through MCP',
      idempotency_key: 'p1-ui-created',
    });
    expect(agentCreated.isError).not.toBe(true);
    const agentPage = (
      await pg`SELECT slug_id FROM pages WHERE id=${agentCreated.structuredContent.page_id}`
    )[0];
    await tab.goto(origin + '/s/p0-space/p/' + agentPage.slug_id);
    await tab.waitForSelector('.ProseMirror');
    await tab.waitForFunction(() =>
      Array.from(document.querySelectorAll('[role="treeitem"]')).some((node) =>
        node.textContent?.includes('P1 Agent document'),
      ),
    );
    await tab.screenshot({
      path: resolve(
        __dirname,
        '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p1-created-sidebar.png',
      ),
      fullPage: false,
      animations: 'disabled',
    });
    const managementGrant = (
      await pg`SELECT id FROM document_agent_grants WHERE user_id=${user}`
    )[0].id;
    await (
      await import('./p1-management-ui')
    ).managementUi(tab, peer, origin, managementGrant);
  } catch (error) {
    if (tab && !tab.isClosed()) {
      writeFileSync(
        '/tmp/docmost-main-body.txt',
        await tab.evaluate(() => document.body.innerText),
      );
      await tab.screenshot({ path: '/tmp/docmost-main.png', fullPage: false });
    }
    if (peer && !peer.isClosed())
      logs +=
        '\nPEER BODY ' + (await peer.evaluate(() => document.body.innerText));
    logs +=
      '\nHISTORIES ' +
      JSON.stringify(
        await pg`SELECT id,agent_source,content FROM page_history`,
      );
    logs += '\nGATES ' + JSON.stringify(await pg`SELECT * FROM document_gates`);
    logs +=
      '\nPERMITS ' +
      JSON.stringify(await pg`SELECT * FROM document_human_permits`);
    writeFileSync('/tmp/docmost-full-app.log', logs);
    if (browser) {
      const tabs = await browser.pages();
      await tabs[tabs.length - 1].screenshot({
        path: '/tmp/docmost-full-app-failure.png',
        fullPage: false,
      });
      writeFileSync(
        '/tmp/docmost-full-app-body.txt',
        await tabs[tabs.length - 1].evaluate(() => document.body.innerText),
      );
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      const exited = new Promise((r) => child!.once('exit', r));
      child.kill('SIGKILL');
      await exited;
    }
    ydoc.destroy();
    await database.destroy();
    await admin.unsafe('DROP DATABASE p0_application');
    await admin.unsafe('DROP ROLE p0_application');
    await admin.end();
    rmSync(temp, { recursive: true, force: true });
  }
}, 90000);
