import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';

async function provider(handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    const output = await handler(request, requests.length);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: typeof output === 'string' ? output : JSON.stringify(output) } },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

const execute = (...calls) => ({ type: 'execute', calls });
const call = (tool, args = {}, scope) => ({ tool, arguments: args, ...(scope ? { scope } : {}) });
const format = () => execute(call('json.format', { indent: 2 }));

async function openConsole(page) {
  await page.locator('#source').click({ button: 'right', position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog', { name: 'AI console' })).toBeVisible();
}

async function configure(page, mock) {
  await openConsole(page);
  await page.getByRole('tab', { name: 'AI Settings' }).click();
  await page.getByLabel('API base URL', { exact: true }).fill(mock.url);
  await page.getByLabel('Model', { exact: true }).fill('integration-test');
  await page.getByLabel('API key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('#settings-status')).toContainText('saved');
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
}

async function ask(page, message) {
  await page.getByLabel('Message AI', { exact: true }).fill(message);
  await page.getByLabel('Message AI', { exact: true }).press('Enter');
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await expect(page.locator('#tool-count')).toHaveText(/tools · Protocol v1/);
});

test('page is one editor; console exposes registry tables and no command input', async ({
  page,
}) => {
  await expect(page.locator('button:visible')).toHaveCount(0);
  await expect(page.locator('textarea:visible')).toHaveCount(1);
  await expect(page.locator('#document-tabs')).toHaveCount(0);
  await page.locator('#source').fill('{"x":"<script>bad</script>","n":2}');
  await expect(page.locator('#highlight .token-key')).toHaveCount(2);
  await expect(page.locator('#editor script')).toHaveCount(0);
  await openConsole(page);
  await page.getByRole('tab', { name: 'Protocols' }).click();
  await expect(page.locator('#tool-reference tbody tr')).toHaveCount(39);
  await page.getByLabel('Search protocols').fill('json.format');
  await expect(page.locator('#tool-reference tbody tr')).toHaveCount(1);
  const table = page.locator('#tool-reference table');
  expect(await table.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('2px');
  expect(
    await table
      .locator('td')
      .first()
      .evaluate((el) => getComputedStyle(el).borderBottomWidth),
  ).toBe('0px');
  await page.keyboard.press('Escape');
  await expect(page.locator('#console')).toBeHidden();
  await expect(page.locator('#source')).toBeFocused();
});

test('natural language executes real Python formatting, highlights, undo and redo', async ({
  page,
}) => {
  const mock = await provider(format);
  try {
    const raw = '{"id":9007199254740993,"n":0.12345678901234567890123456789}';
    await page.locator('#source').fill(raw);
    await configure(page, mock);
    await ask(page, '格式化 JSON');
    await expect(page.locator('#source')).toHaveValue(
      '{\n  "id": 9007199254740993,\n  "n": 0.12345678901234567890123456789\n}',
    );
    await expect(page.locator('#highlight .token-number')).toHaveCount(2);
    expect(JSON.stringify(mock.requests[0])).not.toContain('test-only-key');
    await page.keyboard.press('Escape');
    await page.locator('#source').press('Control+z');
    await expect(page.locator('#source')).toHaveValue(raw);
    await page.locator('#source').press('Control+Shift+z');
    await expect(page.locator('#source')).toHaveValue(/\n/);
    await openConsole(page);
    await page.screenshot({ path: 'test-results/console-desktop.png' });
  } finally {
    await mock.close();
  }
});

test('multi-tool pipeline updates once and switches to YAML highlighting', async ({ page }) => {
  const mock = await provider(() =>
    execute(
      call('json.array_unique', { by: 'id' }),
      call('json.array_sort', { by: 'name' }),
      call('json.to_yaml'),
    ),
  );
  try {
    const raw = '[{"id":1,"name":"Z"},{"id":2,"name":"A"},{"id":1,"name":"B"}]';
    await page.locator('#source').fill(raw);
    await configure(page, mock);
    await ask(page, '去重、排序并转成 YAML');
    await expect(page.locator('#source')).toHaveValue(/name: A[\s\S]*name: Z/);
    await expect(page.locator('#editor')).toHaveAttribute('data-language', 'yaml');
    await page.keyboard.press('Escape');
    await page.locator('#source').press('Control+z');
    await expect(page.locator('#source')).toHaveValue(raw);
  } finally {
    await mock.close();
  }
});

test('right click retains Unicode selection and modifies only selected text', async ({ page }) => {
  const mock = await provider(() => execute(call('text.case', { mode: 'upper' }, 'selection')));
  try {
    await configure(page, mock);
    await page.keyboard.press('Escape');
    await page.locator('#source').fill('😀 hello world');
    await page.locator('#source').evaluate((el) => {
      el.focus();
      el.setSelectionRange(3, 8);
      el.dispatchEvent(new Event('select'));
    });
    await openConsole(page);
    await expect(page.locator('#scope-hint')).toContainText('5 selected');
    await ask(page, '把选中内容改成大写');
    await expect(page.locator('#source')).toHaveValue('😀 HELLO world');
    expect(JSON.parse(mock.requests[0].messages.at(-1).content).context.selection.text).toBe(
      'hello',
    );
  } finally {
    await mock.close();
  }
});

test('report-only tool loop answers without changing text', async ({ page }) => {
  const mock = await provider((request, index) =>
    index === 1
      ? execute(call('text.stats'))
      : { type: 'answer', message: 'The input has 5 characters.' },
  );
  try {
    await page.locator('#source').fill('hello');
    await configure(page, mock);
    await ask(page, '统计字符');
    await expect(page.locator('#conversation')).toContainText('The input has 5 characters.');
    await expect(page.locator('#source')).toHaveValue('hello');
    expect(mock.requests).toHaveLength(2);
    expect(mock.requests[1].messages.at(-1).content).toContain('toolResults');
  } finally {
    await mock.close();
  }
});

test('failed batch retains original text and exposes error details', async ({ page }) => {
  const mock = await provider(() => execute(call('text.trim'), call('json.format')));
  try {
    await page.locator('#source').fill('  {"bad":}  ');
    await configure(page, mock);
    await ask(page, '格式化');
    await expect(page.locator('#conversation')).toContainText('six-round limit', {
      timeout: 20000,
    });
    await expect(page.locator('#source')).toHaveValue('  {"bad":}  ');
    await expect(page.locator('#source')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#send')).toBeVisible();
  } finally {
    await mock.close();
  }
});

test('late AI result cannot overwrite text edited during execution', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const mock = await provider(async () => {
    await gate;
    return format();
  });
  try {
    await page.locator('#source').fill('{"old":1}');
    await configure(page, mock);
    await ask(page, 'format');
    await expect.poll(() => mock.requests.length).toBe(1);
    await page.locator('#source').fill('{"new":2}');
    release();
    await expect(page.locator('#conversation')).toContainText('result was not applied');
    await expect(page.locator('#source')).toHaveValue('{"new":2}');
  } finally {
    release();
    await mock.close();
  }
});

test('stop discards pending results', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const mock = await provider(async () => {
    await gate;
    return format();
  });
  try {
    await page.locator('#source').fill('{"x":1}');
    await configure(page, mock);
    await ask(page, 'format');
    await expect.poll(() => mock.requests.length).toBe(1);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    release();
    await expect(page.locator('#conversation')).toContainText('Stopped.');
    await expect(page.locator('#source')).toHaveValue('{"x":1}');
    await expect(page.locator('#send')).toBeVisible();
  } finally {
    release();
    await mock.close();
  }
});

test('settings connection test, memory-only key, and mobile bounds', async ({ page }) => {
  const mock = await provider(() => ({ ok: true }));
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await configure(page, mock);
    await page.getByRole('tab', { name: 'AI Settings' }).click();
    await page.getByRole('button', { name: 'Save & test', exact: true }).click();
    await expect(page.locator('#settings-status')).toContainText('Connected.');
    const state = await page.evaluate(async () => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      bootstrap: await (await fetch('/api/bootstrap')).json(),
    }));
    expect(JSON.stringify(state)).not.toContain('test-only-key');
    expect(state.bootstrap.settings.hasKey).toBe(true);
    const box = await page.locator('#console').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.getByRole('tab', { name: 'Protocols' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: 'test-results/console-mobile.png' });
    await page.reload();
    await openConsole(page);
    await page.getByRole('tab', { name: 'AI Settings' }).click();
    await expect(page.locator('#api-model')).toHaveValue('integration-test');
    await expect(page.locator('#api-key')).toHaveValue('');
  } finally {
    await mock.close();
  }
});

test('keyboard find and editor history commands', async ({ page }) => {
  const mock = await provider(() => execute(call('editor.undo')));
  try {
    await page.locator('#source').fill('first');
    await page.locator('#source').fill('second');
    await page.locator('#source').press('Control+f');
    await page.getByLabel('Find text', { exact: true }).fill('second');
    await page.getByLabel('Find text', { exact: true }).press('Enter');
    expect(
      await page.locator('#source').evaluate((el) => el.selectionEnd - el.selectionStart),
    ).toBe(6);
    await page.getByLabel('Find text', { exact: true }).press('Escape');
    await configure(page, mock);
    await ask(page, '撤销');
    await expect(page.locator('#source')).toHaveValue('first');
  } finally {
    await mock.close();
  }
});
