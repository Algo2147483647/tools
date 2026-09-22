import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '../../src/model';

const test = base.extend<{ workspaceFolder: string }>({
  workspaceFolder: async ({}, use) => {
    const root = path.resolve(tmpdir());
    const temporary = await mkdtemp(path.join(root, 'service-atlas-e2e-'));
    try {
      await use(path.join(temporary, 'workspace'));
    } finally {
      const target = path.resolve(temporary);
      if (path.dirname(target) !== root || !path.basename(target).startsWith('service-atlas-e2e-')) {
        throw new Error(`Refusing to remove an unexpected test folder: ${target}`);
      }
      await rm(target, { recursive: true, force: true });
    }
  },
});

const disk = async (folder: string): Promise<Workspace> =>
  JSON.parse(await readFile(path.join(folder, 'workspace.json'), 'utf8'));

async function saved(page: Page) {
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('All changes saved');
}

async function create(page: Page, folder: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Workspace name').fill('Integration architecture');
  await dialog.getByLabel('Workspace folder').fill(folder);
  await dialog.getByRole('button', { name: 'Create workspace', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
}

async function open(page: Page, folder: string) {
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Workspace folder').fill(folder);
  await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
}

async function addService(page: Page, key: string) {
  await page.locator('.heading-actions').getByRole('button', { name: 'Add service', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Service key').fill(key);
  await dialog.getByRole('button', { name: 'Create service', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId(`node-${key}`)).toBeVisible();
  await saved(page);
}

async function addFlow(page: Page, source: string, target: string, weights: string[]) {
  await page.getByRole('button', { name: 'Add flow', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Source service').selectOption(source);
  await dialog.getByLabel('Destination service').selectOption(target);
  await dialog.getByLabel(/Weights/).fill(weights.join('\n'));
  await dialog.getByRole('button', { name: 'Create flow', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
}

async function enter(page: Page, key: string) {
  await page.getByTestId(`node-${key}`).dblclick();
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText(key);
}

async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('The drag target is not visible.');
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function selectEdge(page: Page, edgeId: string) {
  const edge = page.getByTestId(`edge-${edgeId}`);
  // Labels may legitimately overlap services after custom routing. Select an
  // exposed path segment using a real pointer rather than forcing a DOM event.
  const point = await edge.locator('.edge-hit').evaluate((element) => {
    const path = element as SVGPathElement,
      transform = path.getScreenCTM();
    if (!transform) return null;
    const length = path.getTotalLength();
    for (let index = 1; index < 40; index++) {
      const local = path.getPointAtLength((length * index) / 40);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(transform);
      const top = document.elementFromPoint(screen.x, screen.y);
      if (top?.closest('.flow-edge') === path.parentElement) return { x: screen.x, y: screen.y };
    }
    return null;
  });
  if (!point) throw new Error('The edge has no visible segment to select.');
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('Flow weights')).toBeVisible();
}

function assertOrthogonal(workspace: Workspace) {
  for (const edge of workspace.edges) {
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    edge.points.slice(1).forEach((point, index) => {
      const previous = edge.points[index];
      expect(point.x === previous.x || point.y === previous.y).toBeTruthy();
    });
  }
}

test('SVG geometry, editable paths, weights, documents, and renamed references survive reopening', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'Orders');
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const documentText = '# Orders\n\nConsumes **OrderCreated** events.\n';
  await page.getByRole('textbox', { name: 'Service Markdown document' }).fill(documentText);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await saved(page);
  await expect.poll(() => readFile(path.join(workspaceFolder, 'Orders.md'), 'utf8')).toBe(documentText);

  await addService(page, 'Ledger');
  await addFlow(page, 'Orders', 'Ledger', ['POST /entries', 'OrderCreated', 'application/json']);
  const before = await disk(workspaceFolder);
  const original = before.nodes.find((node) => node.key === 'Orders')!;
  await drag(page, page.getByTestId('node-Orders').locator('.node-body'), -10, 140);
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue(
    String(original.y + 140),
  );
  await drag(page, page.getByTestId('resize-handle'), 30, 35);
  await saved(page);
  const moved = await disk(workspaceFolder);
  expect(moved.nodes.find((node) => node.key === 'Orders')).toMatchObject({
    x: original.x - 10,
    y: original.y + 140,
    width: original.width + 30,
    height: original.height + 35,
  });
  expect(moved.edges[0].points).not.toEqual(before.edges[0].points);
  assertOrthogonal(moved);

  const edgeId = moved.edges[0].id;
  await selectEdge(page, edgeId);
  await page.getByLabel('Flow weights').fill('POST /entries\nOrderAccepted\napplication/json');
  await page.getByLabel('Path segment').selectOption('1');
  await page.getByRole('button', { name: 'Add bend', exact: true }).click();
  await saved(page);
  const bent = await disk(workspaceFolder);
  expect(bent.edges[0].points.length).toBeGreaterThan(moved.edges[0].points.length);
  const points = bent.edges[0].points;
  const candidates = points
    .slice(1, -2)
    .map((point, offset) => ({ index: offset + 1, point, next: points[offset + 2] }));
  candidates.sort(
    (a, b) =>
      Math.abs(b.point.x - b.next.x) +
      Math.abs(b.point.y - b.next.y) -
      (Math.abs(a.point.x - a.next.x) + Math.abs(a.point.y - a.next.y)),
  );
  const segment = candidates[0];
  await drag(
    page,
    page.getByTestId(`segment-${segment.index}`),
    segment.point.y === segment.next.y ? 0 : 24,
    segment.point.y === segment.next.y ? 24 : 0,
  );
  await saved(page);
  const rerouted = await disk(workspaceFolder);
  expect(rerouted.edges[0].points).not.toEqual(bent.edges[0].points);
  assertOrthogonal(rerouted);

  await page.getByTestId('node-Orders').locator('.node-body').click();
  await page.getByRole('textbox', { name: 'Service key', exact: true }).fill('OrderService');
  await page.getByRole('textbox', { name: 'Service key', exact: true }).press('Enter');
  await expect(page.getByTestId('node-OrderService')).toBeVisible();
  await saved(page);
  const persisted = await disk(workspaceFolder);
  expect(persisted.edges[0].source).toBe('OrderService');
  expect(persisted.edges[0].weights).toEqual(['POST /entries', 'OrderAccepted', 'application/json']);
  expect(await readFile(path.join(workspaceFolder, 'OrderService.md'), 'utf8')).toBe(documentText);
  expect(await readdir(workspaceFolder)).not.toContain('Orders.md');

  await page.reload();
  await open(page, workspaceFolder);
  await page.getByTestId('node-OrderService').locator('.node-body').click();
  await expect(page.getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue(
    String(original.width + 30),
  );
  await selectEdge(page, edgeId);
  await expect(page.getByLabel('Flow weights')).toHaveValue('POST /entries\nOrderAccepted\napplication/json');
  expect(await disk(workspaceFolder)).toEqual(persisted);
});

test('three nested levels retain full editing, global uniqueness, and recursive document deletion', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  // Existing documents are associated rather than replaced when a service is added.
  await writeFile(path.join(workspaceFolder, 'External.md'), '# Existing service notes\n');
  await addService(page, 'External');
  expect(await readFile(path.join(workspaceFolder, 'External.md'), 'utf8')).toBe(
    '# Existing service notes\n',
  );
  await addService(page, 'Platform');
  await enter(page, 'Platform');
  await addService(page, 'Worker');
  await enter(page, 'Worker');
  await addService(page, 'Processor');
  await enter(page, 'Processor');
  await addService(page, 'Parser');
  await addService(page, 'Validator');
  await addFlow(page, 'Parser', 'Validator', ['ParsedRecord']);
  await page.getByTestId('node-Parser').locator('.node-body').click();
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('270');
  await page.getByRole('spinbutton', { name: 'Y', exact: true }).fill('185');
  await saved(page);
  await expect(page.locator('.breadcrumbs .crumb')).toHaveCount(4);

  await page.locator('.heading-actions').getByRole('button', { name: 'Add service', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Service key').fill('platform');
  await dialog.getByRole('button', { name: 'Create service', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('unique across every level');
  await dialog.getByLabel('Service key').fill('invalid/name');
  await dialog.getByRole('button', { name: 'Create service', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('valid filenames');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const persisted = await disk(workspaceFolder);
  expect(persisted.nodes).toHaveLength(6);
  assertOrthogonal(persisted);

  for (let level = 0; level < 3; level++)
    await page.getByRole('button', { name: 'Up one level', exact: true }).click();
  await expect(page.getByTestId('node-Platform')).toBeVisible();
  await page.reload();
  await open(page, workspaceFolder);
  for (const key of ['Platform', 'Worker', 'Processor']) await enter(page, key);
  await page.getByTestId('node-Parser').locator('.node-body').click();
  await expect(page.getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue('270');
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue('185');
  expect(await disk(workspaceFolder)).toEqual(persisted);
  await page.locator('.breadcrumbs').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByTestId('node-Platform').locator('.node-body').click();
  await page.getByRole('button', { name: 'Delete service', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete service and documents', exact: true })
    .click();
  await saved(page);
  const remaining = await disk(workspaceFolder);
  expect(remaining.nodes.map((node) => node.key)).toEqual(['External']);
  expect(remaining.graphs).toHaveLength(2);
  expect(remaining.edges).toEqual([]);
  expect((await readdir(workspaceFolder)).filter((filename) => filename.endsWith('.md'))).toEqual([
    'External.md',
  ]);
});

test('save failure keeps further edits live and retries only when requested', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'ResilientService');
  let attempts = 0;
  await page.route('**/api/workspace/save', async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The test disk is temporarily unavailable.' }),
      });
    else await route.continue();
  });
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('123');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.notice-bar')).toContainText('The test disk is temporarily unavailable.');
  await expect(page.locator('.save-status')).toContainText('Save failed');
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('456');
  await expect(page.getByTestId('node-ResilientService')).toHaveAttribute('transform', 'translate(456 60)');
  await page.waitForTimeout(750);
  expect(attempts).toBe(1);
  expect((await disk(workspaceFolder)).nodes[0].x).toBe(40);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('All changes saved');
  expect(attempts).toBe(2);
  expect((await disk(workspaceFolder)).nodes[0].x).toBe(456);
  await page.reload();
  await open(page, workspaceFolder);
  await expect(page.getByTestId('node-ResilientService')).toHaveAttribute('transform', 'translate(456 60)');
});

test('switching folders flushes pending changes and restores a custom root graph', async ({
  page,
  workspaceFolder,
}) => {
  const otherFolder = path.join(path.dirname(workspaceFolder), 'imported-workspace');
  await mkdir(otherFolder);
  const imported: Workspace = {
    version: 1,
    name: 'Imported architecture',
    rootGraphId: 'custom-root',
    revision: 0,
    graphs: [{ id: 'custom-root', parentNodeId: null }],
    nodes: [],
    edges: [],
  };
  await writeFile(path.join(otherFolder, 'workspace.json'), JSON.stringify(imported));
  await create(page, workspaceFolder);
  await addService(page, 'BeforeSwitch');
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('177');
  await open(page, otherFolder);
  expect((await disk(workspaceFolder)).nodes[0].x).toBe(177);
  await addService(page, 'CustomRootService');
  expect((await disk(otherFolder)).nodes[0].graphId).toBe('custom-root');
  await page.getByRole('spinbutton', { name: 'Y', exact: true }).fill('230');
  await open(page, otherFolder);
  await expect(page.getByTestId('node-CustomRootService')).toHaveAttribute('transform', 'translate(40 230)');
  expect((await disk(otherFolder)).nodes[0].y).toBe(230);
});

test('expired sessions renew without losing dirty Markdown or graph edits', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'SessionService');
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const markdown = page.getByRole('textbox', { name: 'Service Markdown document' });
  await expect(markdown).toBeEnabled();
  let graphAttempts = 0,
    documentAttempts = 0;
  await page.route('**/api/workspace/save', async (route) => {
    graphAttempts++;
    if (graphAttempts === 1)
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Workspace session expired.', code: 'TOKEN_EXPIRED' }),
      });
    else await route.continue();
  });
  await page.route('**/api/document', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    documentAttempts++;
    if (documentAttempts === 1)
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Workspace session expired.', code: 'TOKEN_EXPIRED' }),
      });
    else await route.continue();
  });
  const content = '# Session service\n\nThis unsaved text must survive token renewal.\n';
  await markdown.fill(content);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('191');
  await page.keyboard.press('Control+s');
  await expect.poll(() => readFile(path.join(workspaceFolder, 'SessionService.md'), 'utf8')).toBe(content);
  await expect(page.locator('.save-status')).toContainText('All changes saved');
  expect(graphAttempts).toBe(2);
  expect(documentAttempts).toBe(2);
  expect((await disk(workspaceFolder)).nodes[0].x).toBe(191);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  await expect(markdown).toHaveValue(content);
});

test('document failures surface globally, preserve text, and block selection until retry succeeds', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'DraftOwner');
  await addService(page, 'OtherService');
  await page.getByTestId('node-DraftOwner').locator('.node-body').click();
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const markdown = page.getByRole('textbox', { name: 'Service Markdown document' });
  await expect(markdown).toBeEnabled();
  let unavailable = true;
  await page.route('**/api/document', async (route) => {
    if (unavailable && route.request().method() === 'PUT') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The document disk is temporarily unavailable.' }),
      });
    } else await route.continue();
  });
  const content = '# Draft owner\n\nRetain these notes when saving fails.\n';
  await markdown.fill(content);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('Save failed');
  await expect(page.locator('.notice-bar')).toContainText('The document disk is temporarily unavailable.');
  await page.getByTestId('node-OtherService').locator('.node-body').click();
  await expect(page.locator('.document-heading strong')).toHaveText('DraftOwner.md');
  await expect(markdown).toHaveValue(content);
  expect(await readFile(path.join(workspaceFolder, 'DraftOwner.md'), 'utf8')).not.toBe(content);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('All changes saved');
  expect(await readFile(path.join(workspaceFolder, 'DraftOwner.md'), 'utf8')).toBe(content);
  await page.getByTestId('node-OtherService').locator('.node-body').click();
  await expect(page.getByRole('textbox', { name: 'Service key', exact: true })).toHaveValue('OtherService');
});

test('a filename collision can be corrected and retried without overwriting either document', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'A');
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const originalContent = '# A\n\nOriginal service documentation.\n';
  await page.getByRole('textbox', { name: 'Service Markdown document' }).fill(originalContent);
  await saved(page);
  await addService(page, 'B');
  await addFlow(page, 'A', 'B', ['CollisionRecovery']);
  const unrelatedContent = '# Target\n\nThis unrelated document must stay unchanged.\n';
  await writeFile(path.join(workspaceFolder, 'Target.md'), unrelatedContent);
  await page.getByTestId('node-A').locator('.node-body').click();
  const key = page.getByRole('textbox', { name: 'Service key', exact: true });
  await key.fill('Target');
  await key.press('Enter');
  await expect(page.getByTestId('node-Target')).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('Save failed');
  await expect(page.locator('.notice-bar')).toContainText('already exists and belongs to another document');
  expect(await readFile(path.join(workspaceFolder, 'A.md'), 'utf8')).toBe(originalContent);
  expect(await readFile(path.join(workspaceFolder, 'Target.md'), 'utf8')).toBe(unrelatedContent);
  expect((await disk(workspaceFolder)).edges[0].source).toBe('A');
  await key.fill('Renamed');
  await key.press('Enter');
  await expect(page.getByTestId('node-Renamed')).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('All changes saved');
  expect(await readFile(path.join(workspaceFolder, 'Renamed.md'), 'utf8')).toBe(originalContent);
  expect(await readFile(path.join(workspaceFolder, 'Target.md'), 'utf8')).toBe(unrelatedContent);
  expect(await readdir(workspaceFolder)).not.toContain('A.md');
  expect((await disk(workspaceFolder)).edges[0].source).toBe('Renamed');
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Service Markdown document' })).toHaveValue(originalContent);
});
