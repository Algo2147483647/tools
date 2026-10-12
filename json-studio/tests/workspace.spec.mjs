import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await expect(page.locator('#document-tabs [role="tab"]')).toHaveCount(1);
});

test('format, undo, error recovery and table view preserve exact data', async ({ page }) => {
  const source = page.locator('#source');
  const input = '[{"id":9007199254740993,"label":"你好"}]';
  await source.fill(input);
  await page.locator('[data-action="format"]').click();
  await expect(source).toHaveValue(
    '[\n  {\n    "id": 9007199254740993,\n    "label": "你好"\n  }\n]',
  );
  await page.locator('#undo').click();
  await expect(source).toHaveValue(input);
  await page.locator('#table-tab').click();
  await expect(page.locator('.data-table')).toContainText('9007199254740993');
  await source.fill('{"id":}');
  await expect(page.locator('#error-state')).toBeVisible();
  await source.fill(input);
  await expect(page.locator('#error-state')).toBeHidden();
  await expect(page.locator('.data-table')).toContainText('你好');
});

test('module workers execute diff, JSONPath and schema analysis', async ({ page }) => {
  await page.locator('#source').fill('{"id":9007199254740993,"name":"Alice"}');
  await page.locator('[data-mode="diff"]').click();
  await page.locator('#diff-right').fill('{"id":9007199254740994,"name":"Alice"}');
  await page.locator('#compare').click();
  await expect(page.locator('#diff-status')).toContainText('1 differences');
  await expect(page.locator('#diff-results')).toContainText('9007199254740994');
  await page.locator('[data-mode="path"]').click();
  await page.locator('#path-expression').fill('$.id');
  await page.locator('#run-query').click();
  await expect(page.locator('#query-status')).toContainText('1 results');
  await expect(page.locator('#query-results')).toContainText('9007199254740993');
  await page.locator('[data-mode="schema"]').click();
  await page.locator('#schema-source').fill('{"type":"object","required":["missing"]}');
  await page.locator('#validate-schema').click();
  await expect(page.locator('#schema-status')).toContainText('1 validation errors');
  await page.locator('#schema-source').fill('{"type":"object","required":["id"]}');
  await page.locator('#validate-schema').click();
  await expect(page.locator('#schema-status')).toHaveText('Valid against this schema.');
});

test('documents keep separate content and imported JSON can be downloaded', async ({ page }) => {
  await page.locator('#source').fill('{"original":true}');
  await page.locator('#new-document').click();
  await expect(page.locator('#source')).toHaveValue('');
  await page.locator('#file-input').setInputFiles({
    name: 'example.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"imported":9007199254740993}'),
  });
  await expect(page.locator('#source')).toHaveValue('{"imported":9007199254740993}');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain('9007199254740993');
  await page.getByRole('tab', { name: 'Document 1', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('{"original":true}');
});

test('mobile viewport keeps the source editor usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sample').click();
  await expect(page.locator('#source')).toHaveValue(/JSON Studio/);
  const box = await page.locator('#source').boundingBox();
  expect(box.width).toBeGreaterThan(150);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
