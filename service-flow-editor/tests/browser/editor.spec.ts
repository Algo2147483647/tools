import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NodeType, Workspace } from '../../src/model';

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

async function addService(page: Page, key: string, type: NodeType = 'service') {
  await page.locator('.heading-actions').getByRole('button', { name: 'Add service', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Service key').fill(key);
  await dialog.getByLabel('Node type').selectOption(type);
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
  await page.getByTestId(`node-${key}`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focus subgraph', exact: true }).click();
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

async function selectEdge(page: Page, edgeId: string, button: 'left' | 'right' = 'left') {
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
  await page.mouse.click(point.x, point.y, { button });
  if (button === 'left') await expect(page.getByLabel('Flow weights')).toBeVisible();
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
  await expect(page.getByRole('spinbutton', { name: 'Y', exact: true })).toHaveValue(
    String(persisted.nodes.find((node) => node.key === 'Parser')!.y),
  );
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

async function connectAnchors(page: Page, from: string, fromSide: string, to: string, toSide: string) {
  await page.getByTestId(`node-${from}`).hover();
  const a = await page.getByTestId(`port-${from}-${fromSide}`).boundingBox();
  const b = await page.getByTestId(`port-${to}-${toSide}`).boundingBox();
  if (!a || !b) throw new Error('Both connection anchors must be visible.');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await expect(page.getByTestId('connection-preview')).toBeAttached();
  await expect(page.getByTestId('connection-preview')).toHaveAttribute('d', /L|Q/);
  await page.mouse.up();
  await expect(page.getByTestId('connection-preview')).toHaveCount(0);
}

test('anchor dragging creates directed flows, counts degrees, cancels safely, and works in nested graphs', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await expect(page.locator('.graph-heading')).toHaveCount(0);
  await expect(
    page.locator('.topbar').getByRole('button', { name: 'Add service', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0);
  await addService(page, 'Source');
  await addService(page, 'Sink');
  await expect(page.getByTestId('node-Source').locator('.node-kind, .node-foot, line')).toHaveCount(0);
  await connectAnchors(page, 'Source', 'right', 'Sink', 'left');
  await saved(page);
  const linked = await disk(workspaceFolder);
  expect(linked.edges[0]).toMatchObject({
    source: 'Source',
    target: 'Sink',
    sourceSide: 'right',
    targetSide: 'left',
  });
  expect(linked.nodes.map((node) => [node.x, node.y])).toEqual([
    [40, 60],
    [340, 60],
  ]);
  await expect(page.getByTestId('port-Source-right').locator('.port-count')).toHaveText('1');
  await expect(page.getByTestId('port-Sink-left').locator('.port-count')).toHaveText('1');
  await expect(page.getByTestId('port-Source-left').locator('.port-count')).toHaveText('0');
  assertOrthogonal(linked);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await connectAnchors(page, 'Sink', 'bottom', 'Source', 'top');
  await connectAnchors(page, 'Source', 'bottom', 'Source', 'left');
  await saved(page);
  await expect(page.getByTestId('port-Source-right').locator('.port-count')).toHaveText('2');
  await expect(page.getByTestId('port-Source-left').locator('.port-count')).toHaveText('2');
  const beforeCancel = await disk(workspaceFolder);
  await page.getByTestId('node-Sink').hover();
  const port = await page.getByTestId('port-Sink-right').boundingBox();
  await page.mouse.move(port!.x + port!.width / 2, port!.y + port!.height / 2);
  await page.mouse.down();
  await page.mouse.move(port!.x + 70, port!.y + 230, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('connection-preview')).toHaveCount(0);
  await page.mouse.move(port!.x + port!.width / 2, port!.y + port!.height / 2);
  await page.mouse.down();
  await page.mouse.move(port!.x + 70, port!.y + 230, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await saved(page);
  expect((await disk(workspaceFolder)).edges).toEqual(beforeCancel.edges);
  await enter(page, 'Source');
  await addService(page, 'InsideA');
  await addService(page, 'InsideB');
  await connectAnchors(page, 'InsideA', 'right', 'InsideB', 'left');
  await saved(page);
  const complete = await disk(workspaceFolder);
  expect(complete.edges).toHaveLength(4);
  assertOrthogonal(complete);
  await page.reload();
  await open(page, workspaceFolder);
  await expect(page.getByTestId('port-Source-right').locator('.port-count')).toHaveText('3');
  await enter(page, 'Source');
  await expect(page.getByTestId('port-InsideB-left').locator('.port-count')).toHaveText('1');
  expect(await disk(workspaceFolder)).toEqual(complete);
});

test('contextual canvas actions and persistent sidebar collapse preserve workspace editing', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  const canvas = page.getByTestId('graph-canvas');
  const worldPoint = await canvas.evaluate((element) => {
    const matrix = element.querySelector<SVGGElement>('g[transform]')!.getScreenCTM()!;
    return { x: Math.round((340 - matrix.e) / matrix.a), y: Math.round((220 - matrix.f) / matrix.d) };
  });
  await canvas.click({ button: 'right', position: { x: 340, y: 220 } });
  const menu = page.getByRole('menu', { name: 'Canvas actions' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Add service here', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Service key').fill('ContextService');
  await page.getByRole('dialog').getByRole('button', { name: 'Create service' }).click();
  await saved(page);
  expect((await disk(workspaceFolder)).nodes[0]).toMatchObject(worldPoint);
  const node = page.getByTestId('node-ContextService');
  await node.locator('.node-body').click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: 'Open document' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Open document' }).click();
  await expect(page.getByLabel('Service Markdown document')).toBeVisible();
  await node.locator('.node-body').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Focus subgraph' }).click();
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText('ContextService');
  await canvas.click({ button: 'right', position: { x: 800, y: 600 } });
  await menu.getByRole('menuitem', { name: 'Up one level' }).click();
  await addService(page, 'OtherService');
  await connectAnchors(page, 'ContextService', 'right', 'OtherService', 'left');
  await saved(page);
  const edgeId = (await disk(workspaceFolder)).edges[0].id;
  await selectEdge(page, edgeId);
  await selectEdge(page, edgeId, 'right');
  await menu.getByRole('menuitem', { name: 'Reverse direction' }).click();
  await saved(page);
  expect((await disk(workspaceFolder)).edges[0].source).toBe('OtherService');
  await expect(page.getByTestId('port-ContextService-left').locator('.port-count')).toHaveText('1');
  await selectEdge(page, edgeId, 'right');
  await menu.getByRole('menuitem', { name: 'Delete flow', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete flow', exact: true }).click();
  await saved(page);
  expect((await disk(workspaceFolder)).edges).toHaveLength(0);
  await expect(page.getByTestId('port-ContextService-left').locator('.port-count')).toHaveText('0');
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await page.reload();
  await expect(page.locator('.sidebar-toggle')).toHaveAccessibleName('Expand sidebar');
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
  await open(page, workspaceFolder);
  await canvas.click({ button: 'right', position: { x: 800, y: 650 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('grid snapping, typography, and source / sink circles persist across nested graphs', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Canvas settings', exact: true });
  await settings.getByLabel('Snap to grid').check();
  await settings.getByLabel('Grid size (px)').fill('');
  await settings.getByLabel('Grid size (px)').pressSequentially('32');
  await expect(settings.getByLabel('Grid size (px)')).toHaveValue('32');
  await settings.getByLabel('Grid pattern').selectOption('lines');
  await settings.getByLabel('Default node font size (px)').fill('24');
  await settings.getByLabel('Grid pattern').press('Escape');
  await expect(page.getByTestId('grid-lines')).toBeAttached();
  await addService(page, 'Worker');
  const worker = page.getByTestId('node-Worker');
  await expect(worker.locator('.node-key')).toHaveCSS('font-size', '24px');
  await expect(worker.locator('.node-icon-bg')).toHaveCount(0);
  await drag(page, worker.locator('.node-body'), 31, 49);
  await drag(page, page.getByTestId('resize-handle'), 25, 28);
  await saved(page);
  expect((await disk(workspaceFolder)).nodes[0]).toMatchObject({ x: 64, y: 128, width: 256, height: 128 });
  await addService(page, 'Traffic', 'terminal');
  const traffic = page.getByTestId('node-Traffic');
  await expect(traffic.locator('circle.node-body')).toHaveCount(1);
  await page.getByRole('spinbutton', { name: 'Font size (px)', exact: true }).fill('28');
  await drag(page, page.getByTestId('resize-handle'), 29, 10);
  await connectAnchors(page, 'Traffic', 'left', 'Worker', 'right');
  await saved(page);
  const linked = await disk(workspaceFolder);
  expect(linked.nodes[1]).toMatchObject({ type: 'terminal', fontSize: 28, width: 192, height: 192 });
  expect(linked.edges[0].points[0]).toEqual({ x: linked.nodes[1].x, y: linked.nodes[1].y + 96 });
  await traffic.locator('.node-body').click();
  await page.getByRole('spinbutton', { name: 'Diameter', exact: true }).fill('224');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await drag(page, traffic.locator('.node-body'), 31, 61);
  await saved(page);
  const moved = await disk(workspaceFolder);
  expect(moved.nodes[1].width).toBe(moved.nodes[1].height);
  expect(moved.nodes[1].x % 32).toBe(0);
  expect(moved.nodes[1].y % 32).toBe(0);
  expect(moved.edges[0].points[0]).toEqual({ x: moved.nodes[1].x, y: moved.nodes[1].y + 112 });
  assertOrthogonal(moved);
  await enter(page, 'Worker');
  await addService(page, 'NestedInlet', 'terminal');
  await expect(page.getByTestId('node-NestedInlet').locator('.node-key')).toHaveCSS('font-size', '24px');
  await saved(page);
  const persisted = await disk(workspaceFolder);
  expect(persisted.canvas).toEqual({ gridSize: 32, gridStyle: 'lines', snapToGrid: true, nodeFontSize: 24 });
  await page.reload();
  await open(page, workspaceFolder);
  await expect(traffic.locator('circle.node-body')).toHaveAttribute('r', '112');
  await expect(traffic.locator('.node-key')).toHaveCSS('font-size', '28px');
  await traffic.locator('.node-body').click();
  await page.getByRole('button', { name: 'Use workspace font size' }).click();
  await expect(traffic.locator('.node-key')).toHaveCSS('font-size', '24px');
  await enter(page, 'Worker');
  await expect(page.getByTestId('node-NestedInlet').locator('circle.node-body')).toBeVisible();
  expect(await readFile(path.join(workspaceFolder, 'Traffic.md'), 'utf8')).toContain('# Traffic');
  expect((await disk(workspaceFolder)).edges).toEqual(persisted.edges);
});

test('floating panels leave a full viewport canvas and wheel gestures never zoom the browser', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  const canvas = page.getByTestId('graph-canvas');
  await expect(canvas).toHaveJSProperty('clientWidth', 1600);
  const bounds = await canvas.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1600, height: 1000 });
  for (const selector of ['.topbar', '.sidebar', '.inspector']) {
    const style = await page.locator(selector).evaluate((element) => {
      const css = getComputedStyle(element);
      return { blur: css.backdropFilter, background: css.backgroundColor, position: css.position };
    });
    expect(style.blur).toContain('blur(');
    expect(style.background).toMatch(/rgba\(/);
    expect(style.position).toBe('absolute');
  }
  await page.locator('.sidebar-toggle').click();
  await page.getByRole('button', { name: 'Toggle inspector' }).click();
  expect(await canvas.boundingBox()).toEqual(bounds);
  const browserBefore = await page.evaluate(() => ({
    ratio: devicePixelRatio,
    width: innerWidth,
    height: innerHeight,
    scale: visualViewport!.scale,
  }));
  await page.mouse.move(800, 500);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -180);
  await page.keyboard.up('Control');
  await expect(page.locator('.zoom-controls > span')).not.toHaveText('100%');
  expect(
    await page.evaluate(() => ({
      ratio: devicePixelRatio,
      width: innerWidth,
      height: innerHeight,
      scale: visualViewport!.scale,
    })),
  ).toEqual(browserBefore);
  const canceled = await canvas.evaluate((element) => {
    const event = new WheelEvent('wheel', {
      deltaY: 80,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      clientX: 800,
      clientY: 500,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(canceled).toBe(true);
  await canvas.click({ position: { x: 1000, y: 700 } });
  await page.keyboard.press('Control+0');
  await expect(page.locator('.zoom-controls > span')).toHaveText('100%');
  await page.keyboard.press('Control+=');
  await expect(page.locator('.zoom-controls > span')).toHaveText('115%');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(browserBefore.ratio);
  await page.setViewportSize({ width: 650, height: 720 });
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 650, height: 720 });
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Canvas settings', exact: true });
  await expect(settings).toBeInViewport();
  await settings.getByLabel('Grid pattern').selectOption('dots');
  await expect(page.getByTestId('grid-dots')).toBeAttached();
});

test('global collapsed-node appearance applies to rectangles, circles, nested graphs, and reopening', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'Worker');
  await addService(page, 'Traffic', 'terminal');
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Canvas settings', exact: true });
  await settings.getByLabel('Node fill color', { exact: true }).fill('#eff6ff');
  await settings.getByLabel('Node border color', { exact: true }).fill('#8b5cf6');
  await settings.getByLabel('Node border width (px)', { exact: true }).fill('4.5');
  await settings.getByLabel('Show node shadows', { exact: true }).uncheck();
  await settings.getByLabel('Corner radius (%)', { exact: true }).fill('50');
  await settings.getByLabel('Corner radius (%)', { exact: true }).press('Escape');
  const worker = page.getByTestId('node-Worker').locator('.node-body');
  const traffic = page.getByTestId('node-Traffic').locator('.node-body');
  for (const body of [worker, traffic]) {
    await expect(body).toHaveCSS('fill', 'rgb(239, 246, 255)');
    await expect(body).toHaveCSS('stroke', 'rgb(139, 92, 246)');
    await expect(body).toHaveCSS('stroke-width', '4.5px');
    await expect(body).not.toHaveAttribute('filter', /node-shadow/);
  }
  const data = await disk(workspaceFolder);
  const workerNode = data.nodes.find((node) => node.key === 'Worker')!;
  await expect(worker).toHaveAttribute('rx', String(Math.min(workerNode.width, workerNode.height) / 2));
  await enter(page, 'Worker');
  await addService(page, 'Nested');
  await expect(page.getByTestId('node-Nested').locator('.node-body')).toHaveCSS('stroke-width', '4.5px');
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  await settings.getByLabel('Show node borders', { exact: true }).uncheck();
  await settings.getByLabel('Show node borders', { exact: true }).press('Escape');
  await expect(page.getByTestId('node-Nested').locator('.node-body')).toHaveCSS('stroke', 'none');
  await expect(page.getByTestId('node-Nested').locator('.node-selection-ring')).toBeVisible();
  await saved(page);
  const persisted = await disk(workspaceFolder);
  expect(persisted.nodeAppearance).toMatchObject({
    fillColor: '#eff6ff',
    borderColor: '#8b5cf6',
    borderEnabled: false,
    borderWidth: 4.5,
    shadow: false,
    cornerRadius: 0.5,
  });
  await page.reload();
  await open(page, workspaceFolder);
  await expect(worker).toHaveCSS('stroke', 'none');
  await expect(traffic).toHaveCSS('stroke', 'none');
  await worker.dblclick();
  await expect(page.getByTestId('node-Worker')).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByTestId('node-Nested').locator('.node-body')).toHaveCSS('fill', 'rgb(239, 246, 255)');
  await expect(worker).toHaveCSS('fill', 'none');
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  await settings.getByRole('button', { name: 'Reset node appearance', exact: true }).click();
  await expect(settings.getByLabel('Show node borders')).toBeChecked();
  await expect(settings.getByLabel('Show node shadows')).toBeChecked();
  await settings.getByLabel('Show node borders').press('Escape');
  await expect(traffic).toHaveCSS('stroke-width', '1.3px');
  await expect(traffic).toHaveAttribute('filter', 'url(#node-shadow)');
  await saved(page);
});

test('visible black shadows and shared typography persist across nested graphs and reopening', async ({
  page,
  workspaceFolder,
}) => {
  await create(page, workspaceFolder);
  await addService(page, 'Worker');
  await enter(page, 'Worker');
  await addService(page, 'NestedProcessorWithLongName');
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('144');
  await page.locator('.breadcrumbs .crumb').first().click();
  await addService(page, 'Traffic', 'terminal');
  await page.getByRole('spinbutton', { name: 'Font size (px)', exact: true }).fill('28');
  const shadow = page.locator('#node-shadow feDropShadow');
  await expect(shadow).toHaveAttribute('flood-color', '#000000');
  await expect(shadow).toHaveAttribute('flood-opacity', '0.32');
  await page.mouse.move(1100, 800);
  await page.screenshot({ path: test.info().outputPath('default-shadow.png') });
  const settings = page.getByRole('dialog', { name: 'Canvas settings', exact: true });
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  await settings.getByLabel('Shadow opacity (%)', { exact: true }).fill('55');
  await settings.getByLabel('Shadow blur (px)', { exact: true }).fill('8');
  await settings.getByLabel('Shadow offset (px)', { exact: true }).fill('10');
  await settings.getByLabel('Show node shadows', { exact: true }).uncheck();
  await expect(page.getByTestId('node-Traffic').locator('.node-body')).not.toHaveAttribute(
    'filter',
    /node-shadow/,
  );
  await settings.getByLabel('Show node shadows', { exact: true }).check();
  await expect(settings.getByLabel('Shadow opacity (%)', { exact: true })).toHaveValue('55');
  await settings.getByRole('combobox', { name: 'Node font family', exact: true }).selectOption('mono');
  await settings.getByLabel('Default node font size (px)', { exact: true }).fill('24');
  await settings.getByLabel('Node font color', { exact: true }).fill('#7c3aed');
  await settings.getByRole('combobox', { name: 'Node font weight', exact: true }).selectOption('500');
  await settings.getByLabel('Italic node labels', { exact: true }).check();
  await settings.getByLabel('Node line height', { exact: true }).fill('1.5');
  await settings.getByLabel('Node line height', { exact: true }).press('Escape');
  await expect(shadow).toHaveAttribute('flood-opacity', '0.55');
  await expect(shadow).toHaveAttribute('stdDeviation', '8');
  await expect(shadow).toHaveAttribute('dy', '10');
  await page.getByTestId('node-Worker').locator('.node-body').dblclick();
  const nested = page.getByTestId('node-NestedProcessorWithLongName').locator('.node-key');
  for (const key of ['Worker', 'Traffic', 'NestedProcessorWithLongName']) {
    const label = page.getByTestId(`node-${key}`).locator('.node-key');
    await expect(label).toHaveCSS('font-family', /Consolas/);
    await expect(label).toHaveCSS('font-weight', '500');
    await expect(label).toHaveCSS('font-style', 'italic');
    await expect(label).toHaveCSS('fill', 'rgb(124, 58, 237)');
    await expect(label).toHaveCSS('font-size', key === 'Traffic' ? '28px' : '24px');
  }
  expect(await nested.locator('tspan').count()).toBeGreaterThan(1);
  await expect(nested.locator('tspan').nth(1)).toHaveAttribute('dy', '36');
  await saved(page);
  expect((await disk(workspaceFolder)).nodeAppearance).toMatchObject({
    shadowOpacity: 0.55,
    shadowBlur: 8,
    shadowOffsetY: 10,
    fontFamily: 'mono',
    fontColor: '#7c3aed',
    fontWeight: 500,
    fontItalic: true,
    lineHeight: 1.5,
  });
  await page.reload();
  await open(page, workspaceFolder);
  await expect(shadow).toHaveAttribute('flood-opacity', '0.55');
  await expect(nested).toHaveCSS('font-family', /Consolas/);
  await expect(nested).toHaveCSS('font-style', 'italic');
  await expect(nested).toHaveCSS('fill', 'rgb(124, 58, 237)');
  await expect(nested.locator('tspan').nth(1)).toHaveAttribute('dy', '36');
  await expect(page.getByTestId('node-Traffic').locator('.node-key')).toHaveCSS('font-size', '28px');
  await page.mouse.move(1100, 800);
  await page.screenshot({ path: test.info().outputPath('custom-shadow-typography.png') });
  await page.getByRole('button', { name: 'Canvas settings', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: 'Node font weight', exact: true })).toHaveValue('500');
  await settings.getByRole('button', { name: 'Use theme font color', exact: true }).click();
  await expect(nested).not.toHaveCSS('fill', 'rgb(124, 58, 237)');
  await settings.getByRole('button', { name: 'Reset node appearance', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: 'Node font family', exact: true })).toHaveValue('sans');
  await expect(settings.getByLabel('Italic node labels', { exact: true })).not.toBeChecked();
  await expect(nested).toHaveCSS('font-weight', '700');
  await expect(shadow).toHaveAttribute('flood-opacity', '0.32');
  await saved(page);
});
