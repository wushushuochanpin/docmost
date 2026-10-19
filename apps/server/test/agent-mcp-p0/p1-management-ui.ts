import { resolve } from 'node:path';
export async function managementUi(
  tab: any,
  peer: any,
  origin: string,
  grant: string,
) {
  const root = '/settings/account/agent-connections',
    detail = root + '/' + grant;
  await tab.setViewport({ width: 1280, height: 900 });
  await tab.goto(origin + root);
  await tab.waitForSelector('a[href="' + detail + '"]');
  await tab.click('a[href="' + detail + '"]');
  await tab.waitForSelector('input[value="pages.edit"]');
  await tab.reload();
  await tab.waitForSelector('input[value="pages.edit"]');
  await tab.click('button::-p-text(撤销连接)');
  await tab.waitForSelector('[role="dialog"]');
  await tab.click('[role="dialog"] button::-p-text(取消)');
  await tab.waitForSelector('[role="dialog"]', { hidden: true });
  await tab.click('input[value="pages.edit"]');
  await tab.click('button::-p-text(保存访问范围)');
  await tab.waitForFunction(() =>
    document.body.innerText.includes('访问范围已更新'),
  );
  await tab.waitForFunction(
    () => !document.querySelector('input[value="pages.edit"]'),
  );
  await tab.waitForSelector('a[href="' + detail + '/activity"]');
  await tab.click('a[href="' + detail + '/activity"]');
  await tab.waitForFunction(() => document.body.innerText.includes('已保存'));
  await tab.reload();
  await tab.waitForFunction(() => document.body.innerText.includes('已保存'));
  await tab.goto(origin + '/settings/agent-policy');
  await tab.waitForSelector('input[type="checkbox"]');
  await tab.click('input[type="checkbox"]');
  await tab.click('button::-p-text(保存策略)');
  await tab.waitForSelector('[role="dialog"]');
  await tab.click('[role="dialog"] button::-p-text(取消)');
  await tab.waitForSelector('[role="dialog"]', { hidden: true });
  await tab.click('button::-p-text(重新加载)');
  await tab.waitForFunction(
    () =>
      !!document.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
  );
  await tab.click('input[type="checkbox"]');
  await tab.click('button::-p-text(保存策略)');
  await tab.waitForSelector('[role="dialog"] button::-p-text(确认关闭)');
  await tab.click('[role="dialog"] button::-p-text(确认关闭)');
  await tab.waitForFunction(() =>
    document.body.innerText.includes('策略已保存'),
  );
  await tab.goto(origin + '/settings/agent-audit');
  await tab.waitForFunction(() => document.body.innerText.includes('已保存'));
  await tab.screenshot({
    path: resolve(
      __dirname,
      '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p1-admin-audit.png',
    ),
    fullPage: false,
  });
  await peer.goto(origin + root);
  await peer.waitForFunction(() =>
    document.body.innerText.includes('暂无连接'),
  );
  const denied = await peer.evaluate(
    async (id: string) => ({
      policy: (await fetch('/api/agent-policy')).status,
      audit: (await fetch('/api/agent-audit')).status,
      detail: (await fetch('/api/agent-connections/' + id)).status,
    }),
    grant,
  );
  expect(denied).toEqual({ policy: 403, audit: 403, detail: 404 });
  expect(await peer.$('a[href="/settings/agent-policy"]')).toBeNull();
  await peer.goto(origin + '/settings/agent-policy');
  await peer.waitForFunction(() =>
    document.body.innerText.includes('没有管理 Agent 策略的权限'),
  );
  await tab.goto(origin + detail);
  await tab.waitForSelector('button::-p-text(撤销连接)');
  const csrfDenied = await tab.evaluate(
    async (id: string) =>
      (
        await fetch('/api/agent-connections/' + id + '/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_version: '2' }),
        })
      ).status,
    grant,
  );
  expect(csrfDenied).toBe(403);
  await tab.setRequestInterception(true);
  const fail = (request: any) =>
    request.url().includes('/api/agent-connections/')
      ? request.abort()
      : request.continue();
  tab.on('request', fail);
  await tab.reload();
  await tab.waitForFunction(() => document.body.innerText.includes('加载失败'));
  tab.off('request', fail);
  await tab.setRequestInterception(false);
  await tab.click('button::-p-text(重新加载)');
  await tab.waitForSelector('button::-p-text(撤销连接)');
  await tab.setViewport({ width: 375, height: 812 });
  await tab.click('button::-p-text(撤销连接)');
  await tab.waitForSelector('[role="dialog"] button::-p-text(确认撤销)');
  await tab.click('[role="dialog"] button::-p-text(确认撤销)');
  await tab.waitForFunction(() =>
    document.body.innerText.includes('此连接不可修改'),
  );
  expect(
    await tab.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await tab.screenshot({
    path: resolve(
      __dirname,
      '../../../../docs/iterations/20261018_01_agent-document-mcp/test/p1-connection-revoked-mobile.png',
    ),
    fullPage: false,
  });
  await tab.reload();
  await tab.waitForFunction(() =>
    document.body.innerText.includes('此连接不可修改'),
  );
}
