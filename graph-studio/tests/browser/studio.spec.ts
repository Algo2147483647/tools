import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeDagInput } from '../../src/graph/normalize';

test('one studio retains graph edits, flushes service documents on home, and reopens service recents', async ({ page }) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'graph-studio-integration-'));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    const graphFont = await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily);
    await page.getByRole('button', { name: '+ Create a graph', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save JSON', exact: true })).toBeEnabled();
    await expect(page.locator('.dag-node').first()).toBeVisible();
    await page.getByRole('button', { name: 'Service architecture', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Service architecture', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Workspace name').fill('Unified architecture');
    await dialog.getByLabel('Workspace folder').fill(folder);
    await dialog.getByRole('button', { name: 'Create workspace', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    await page.locator('.heading-actions').getByRole('button', { name: 'Add service', exact: true }).click();
    await dialog.getByLabel('Service key').fill('Gateway');
    await dialog.getByRole('button', { name: 'Create service', exact: true }).click();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    const content = '# Gateway\n\nNotes saved before returning to the graph.\n';
    await page.getByRole('textbox', { name: 'Service Markdown document' }).fill(content);
    await page.getByRole('button', { name: 'Graph Studio home', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-studio-mode', 'graphs');
    expect(await readFile(path.join(folder, 'Gateway.md'), 'utf8')).toBe(content);
    await expect(page.locator('.dag-node').first()).toBeVisible();
    expect(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily)).toBe(graphFont);
    // Service keyboard listeners are gone, and the graph's own undo history survived.
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Go to home', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(path.basename(folder)) }).click();
    await expect(page.getByTestId('node-Gateway')).toBeVisible();
    await page.getByTestId('node-Gateway').locator('.node-body').click();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Service Markdown document' })).toHaveValue(content);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/graph-studio-services.png' });
  } finally {
    expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
    expect(path.basename(folder)).toMatch(/^graph-studio-integration-/);
    await rm(folder, { recursive: true, force: true });
  }
});

test('legacy nested workspace opens without rewriting and exports a valid graph snapshot', async ({ page }) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'graph-studio-integration-'));
  try {
    await cp(path.resolve('examples/commerce-platform'), folder, { recursive: true });
    const original = await readFile(path.join(folder, 'workspace.json'), 'utf8');
    await page.goto('/');
    await page.getByRole('button', { name: /^Service architecture/ }).click();
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Workspace folder').fill(folder);
    await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
    await expect(page.getByTestId('node-API Gateway')).toBeVisible();
    expect(await readFile(path.join(folder, 'workspace.json'), 'utf8')).toBe(original);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Graph Studio JSON', exact: true }).click();
    const file = await download;
    const graph = normalizeDagInput(JSON.parse(await readFile((await file.path())!, 'utf8')));
    expect(Object.keys(graph.nodes)).toHaveLength(8);
    expect(graph.edges).toHaveLength(9);
    expect(graph.metadata?.serviceArchitecture).toBeTruthy();
    expect(await readFile(path.join(folder, 'workspace.json'), 'utf8')).toBe(original);
    await page.screenshot({ path: 'test-results/graph-studio-commerce.png' });
    await page.getByRole('button', { name: 'Graph Studio home', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Your graphs/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/graph-studio-home.png' });
  } finally {
    expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
    expect(path.basename(folder)).toMatch(/^graph-studio-integration-/);
    await rm(folder, { recursive: true, force: true });
  }
});

test('returning home is blocked by a failed document save and succeeds after retry without losing text', async ({ page }) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'graph-studio-integration-'));
  try {
    await cp(path.resolve('examples/commerce-platform'), folder, { recursive: true });
    await page.goto('/?workspace=services');
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Workspace folder').fill(folder);
    await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
    await page.getByTestId('node-API Gateway').locator('.node-body').click();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Service Markdown document' });
    await expect(editor).toBeEditable();
    const original = await readFile(path.join(folder, 'API Gateway.md'), 'utf8');
    await page.route('**/api/services/document', route => route.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated disk unavailable' }),
    }));
    const content = '# Gateway\n\nRecover this pending note.\n';
    await editor.fill(content);
    await page.getByRole('button', { name: 'Graph Studio home', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-studio-mode', 'services');
    await expect(editor).toHaveValue(content);
    expect(await readFile(path.join(folder, 'API Gateway.md'), 'utf8')).toBe(original);
    await page.unroute('**/api/services/document');
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(page.locator('.save-status')).toContainText('All changes saved');
    await page.getByRole('button', { name: 'Graph Studio home', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-studio-mode', 'graphs');
    expect(await readFile(path.join(folder, 'API Gateway.md'), 'utf8')).toBe(content);
  } finally {
    expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
    expect(path.basename(folder)).toMatch(/^graph-studio-integration-/);
    await rm(folder, { recursive: true, force: true });
  }
});
