import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServiceNode, Workspace } from '../../src/model';

const test = base.extend<{ folder: string }>({
  folder: async ({}, use) => {
    const root = path.resolve(tmpdir());
    const temporary = await mkdtemp(path.join(root, 'service-atlas-hierarchy-'));
    try {
      await use(path.join(temporary, 'workspace'));
    } finally {
      const target = path.resolve(temporary);
      if (path.dirname(target) !== root || !path.basename(target).startsWith('service-atlas-hierarchy-'))
        throw new Error(`Refusing to remove an unexpected test folder: ${target}`);
      await rm(target, { recursive: true, force: true });
    }
  },
});

test.setTimeout(90_000);

const disk = async (folder: string): Promise<Workspace> =>
  JSON.parse(await readFile(path.join(folder, 'workspace.json'), 'utf8'));

async function seedLegacy(folder: string) {
  const node = (key: string, graphId: string, x: number, y: number): ServiceNode => ({
    id: `id-${key}`,
    key,
    graphId,
    x,
    y,
    width: 180,
    height: 88,
    childGraphId: `inside-${key}`,
  });
  const nodes = [
    node('Client', 'root', 0, 120),
    node('Platform', 'root', 280, 80),
    node('Neighbor', 'root', 510, 80),
    node('Router', 'inside-Platform', 32, 24),
    node('Database', 'inside-Platform', 280, 24),
    node('Handler', 'inside-Router', 24, 24),
    node('Worker', 'inside-Handler', 24, 24),
  ];
  const workspace: Workspace = {
    version: 1,
    name: 'Hierarchy browser verification',
    rootGraphId: 'root',
    revision: 0,
    graphs: [
      { id: 'root', parentNodeId: null },
      ...nodes.map((item) => ({ id: item.childGraphId, parentNodeId: item.id })),
    ],
    nodes,
    edges: [
      {
        id: 'request',
        graphId: 'root',
        source: 'Client',
        target: 'Platform',
        weights: ['Request'],
        sourceSide: 'right',
        targetSide: 'left',
        points: [
          { x: 180, y: 164 },
          { x: 220, y: 164 },
          { x: 220, y: 124 },
          { x: 280, y: 124 },
        ],
      },
      {
        id: 'storage',
        graphId: 'inside-Platform',
        source: 'Router',
        target: 'Database',
        weights: ['Stored'],
        sourceSide: 'right',
        targetSide: 'left',
        points: [
          { x: 212, y: 68 },
          { x: 280, y: 68 },
        ],
      },
    ],
  };
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'workspace.json'), JSON.stringify(workspace, null, 2));
  await Promise.all(
    nodes.map((item) => writeFile(path.join(folder, `${item.key}.md`), `# ${item.key}\n\nLegacy notes.\n`)),
  );
}

async function open(page: Page, folder: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Workspace folder').fill(folder);
  await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
}

async function saved(page: Page) {
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('All changes saved');
}

async function expand(page: Page, key: string) {
  await page.getByTestId(`node-${key}`).locator('.node-body').dblclick();
  await expect(page.getByTestId(`node-${key}`)).toHaveAttribute('data-expanded', 'true');
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText('Overview');
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
}

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('The graph element is not visible.');
  return bounds;
}

async function assertSeparate(page: Page, first: string, second: string) {
  const a = await box(page.getByTestId(`node-${first}`).locator('.node-body'));
  const b = await box(page.getByTestId(`node-${second}`).locator('.node-body'));
  expect(
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
  ).toBeTruthy();
}

async function assertContains(page: Page, parent: string, child: string) {
  const a = await box(page.getByTestId(`node-${parent}`).locator('.node-body'));
  const b = await box(page.getByTestId(`node-${child}`).locator('.node-body'));
  expect(b.x).toBeGreaterThan(a.x);
  expect(b.y).toBeGreaterThan(a.y);
  expect(b.x + b.width).toBeLessThan(a.x + a.width);
  expect(b.y + b.height).toBeLessThan(a.y + a.height);
}

async function connect(page: Page, source: string, target: string) {
  await page.getByTestId(`node-${source}`).locator('.node-body').hover();
  const sourcePort = page.getByTestId(`port-${source}-right`);
  await expect(sourcePort).toHaveCSS('opacity', '1');
  const a = await box(sourcePort);
  const b = await box(page.getByTestId(`port-${target}-left`));
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.getByTestId('connection-preview')).toBeAttached();
  await expect(page.getByTestId(`port-${target}-left`)).toHaveCSS('opacity', '1');
  await page.mouse.up();
  await expect(page.getByTestId('connection-preview')).toHaveCount(0);
  await saved(page);
}

async function selectEdge(page: Page, id: string) {
  const hit = page.getByTestId(`edge-${id}`).locator('.edge-hit');
  const point = await hit.evaluate((element) => {
    const line = element as SVGPathElement;
    const matrix = line.getScreenCTM();
    if (!matrix) return null;
    for (let step = 1; step < 80; step++) {
      const local = line.getPointAtLength((line.getTotalLength() * step) / 80);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
      if (document.elementFromPoint(screen.x, screen.y)?.closest('.flow-edge') === line.parentElement)
        return { x: screen.x, y: screen.y };
    }
    return null;
  });
  if (!point) throw new Error('The flow has no exposed path segment.');
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('Flow weights')).toBeVisible();
}

test('anchors appear on demand and three inline levels fit resized contents and accept internal services', async ({
  page,
  folder,
}) => {
  await seedLegacy(folder);
  await open(page, folder);
  const platform = page.getByTestId('node-Platform');
  const anchor = page.getByTestId('port-Platform-right');
  await page.mouse.move(1100, 900);
  await expect(anchor).toHaveCSS('opacity', '0');
  await expect(anchor).toHaveCSS('pointer-events', 'none');
  await platform.locator('.node-body').hover();
  await expect(anchor).toHaveCSS('opacity', '1');
  await page.mouse.move(1100, 900);
  await expect(anchor).toHaveCSS('opacity', '0');
  await platform.locator('.node-body').click();
  await page.mouse.move(1100, 900);
  await expect(anchor).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(anchor).toHaveCSS('opacity', '0');

  await expand(page, 'Platform');
  await assertContains(page, 'Platform', 'Router');
  await assertContains(page, 'Platform', 'Database');
  await assertSeparate(page, 'Platform', 'Neighbor');
  await expand(page, 'Router');
  await expand(page, 'Handler');
  await expect(page.getByTestId('node-Worker')).toHaveAttribute('data-depth', '3');
  await assertContains(page, 'Platform', 'Router');
  await assertContains(page, 'Router', 'Handler');
  await assertContains(page, 'Handler', 'Worker');
  await assertSeparate(page, 'Router', 'Database');
  await assertSeparate(page, 'Platform', 'Neighbor');
  await saved(page);
  const beforeResize = await disk(folder);
  expect(beforeResize.version).toBe(3);
  expect(beforeResize.edges.find((edge) => edge.id === 'request')).toMatchObject({
    sourceNodeId: 'id-Client',
    targetNodeId: 'id-Platform',
  });

  await page.getByTestId('container-header-Platform').click({ position: { x: 30, y: 25 } });
  await expect(page.getByTestId('resize-handle')).toHaveCount(0);
  await expect(page.getByTestId('container-dimensions')).toContainText('Auto-sized to contents');
  await page.getByTestId('node-Worker').locator('.node-body').click();
  const beforeContainer = await box(platform.locator('.node-body'));
  const resize = await box(page.getByTestId('resize-handle'));
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 60, resize.y + resize.height / 2 + 45, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const resized = (await disk(folder)).nodes.find((node) => node.key === 'Platform')!;
  const old = beforeResize.nodes.find((node) => node.key === 'Platform')!;
  const afterContainer = await box(platform.locator('.node-body'));
  expect(afterContainer.width).toBeGreaterThan(beforeContainer.width);
  expect(afterContainer.height).toBeGreaterThan(beforeContainer.height);
  expect(resized).toEqual(old);
  expect(resized.expandedSize).toBeUndefined();
  expect([resized.width, resized.height]).toEqual([180, 88]);
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await assertSeparate(page, 'Platform', 'Neighbor');

  await page.getByTestId('container-header-Handler').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add service inside', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Service key').fill('Audit');
  await dialog.getByRole('button', { name: 'Create service', exact: true }).click();
  await expect(page.getByTestId('node-Audit')).toBeVisible();
  await saved(page);
  const added = (await disk(folder)).nodes.find((node) => node.key === 'Audit')!;
  expect(added.graphId).toBe('inside-Handler');
  expect(await readdir(folder)).toContain('Audit.md');
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await assertContains(page, 'Handler', 'Audit');
  await assertSeparate(page, 'Worker', 'Audit');
  await assertSeparate(page, 'Platform', 'Neighbor');
});

test('cross-level flows preserve real endpoints through collapse, reopening, rename, and recursive deletion', async ({
  page,
  folder,
}) => {
  await seedLegacy(folder);
  await open(page, folder);
  for (const key of ['Platform', 'Router', 'Handler']) await expand(page, key);
  await connect(page, 'Client', 'Worker');
  const expanded = await disk(folder);
  const cross = expanded.edges.find((edge) => edge.source === 'Client' && edge.target === 'Worker')!;
  expect(cross).toMatchObject({
    sourceNodeId: 'id-Client',
    targetNodeId: 'id-Worker',
    graphId: 'root',
    sourceSide: 'right',
    targetSide: 'left',
  });
  expect(cross.points.length).toBeGreaterThanOrEqual(2);
  cross.points.slice(1).forEach((point, index) => {
    expect(point.x === cross.points[index].x || point.y === cross.points[index].y).toBeTruthy();
  });
  const edge = page.getByTestId(`edge-${cross.id}`);
  const expandedPath = await edge.locator('.edge-line').getAttribute('d');
  await expect(page.getByTestId('port-Client-right').locator('.port-count')).toHaveText('2');
  await expect(page.getByTestId('port-Worker-left').locator('.port-count')).toHaveText('1');
  await selectEdge(page, cross.id);
  expect(await page.locator('.edge-handles .segment-handle').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Collapse Platform', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await expect(page.getByTestId('node-Worker')).toHaveCount(0);
  await expect(page.getByTestId('edge-storage')).toHaveCount(0);
  await expect(edge).toHaveClass(/projected/);
  await expect(edge.locator('.edge-line')).toHaveCSS('stroke-dasharray', '7px, 5px');
  await expect(edge.locator('title').first()).toContainText('Client → Worker');
  await selectEdge(page, cross.id);
  await expect(page.locator('.edge-handles')).toHaveCount(0);
  await expect(page.locator('.proxy-notice')).toContainText('real endpoints and saved route are preserved');
  await expect(page.getByTestId('port-Platform-left').locator('.port-count')).toHaveText('3');
  const collapsed = await disk(folder);
  expect(collapsed.edges).toEqual(expanded.edges);

  await page.reload();
  await open(page, folder);
  expect(await disk(folder)).toEqual(collapsed);
  await expect(page.getByTestId(`edge-${cross.id}`)).toHaveClass(/projected/);
  await expand(page, 'Platform');
  await expect(page.getByTestId('node-Worker')).toBeVisible();
  await expect(page.getByTestId(`edge-${cross.id}`)).not.toHaveClass(/projected/);
  await expect(page.getByTestId(`edge-${cross.id}`).locator('.edge-line')).toHaveAttribute(
    'd',
    expandedPath!,
  );
  await expect(page.getByTestId('edge-storage')).toBeAttached();
  await saved(page);
  const restored = await disk(folder);
  expect(restored.nodes).toEqual(expanded.nodes);
  expect(restored.edges).toEqual(expanded.edges);

  await page.getByTestId('container-header-Handler').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focus subgraph', exact: true }).click();
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText('Handler');
  await expect(page.getByTestId(`edge-${cross.id}`)).toHaveCount(0);
  await expect(page.getByTestId('port-Worker-left').locator('.port-count')).toHaveText('1');
  await page.locator('.breadcrumbs').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();

  await page.getByTestId('node-Worker').locator('.node-body').click();
  const keyInput = page.getByRole('textbox', { name: 'Service key', exact: true });
  await keyInput.fill('WorkerCore');
  await keyInput.press('Enter');
  await expect(page.getByTestId('node-WorkerCore')).toBeVisible();
  await saved(page);
  const renamed = await disk(folder);
  expect(renamed.edges.find((item) => item.id === cross.id)).toMatchObject({
    target: 'WorkerCore',
    targetNodeId: 'id-Worker',
  });
  expect(await readdir(folder)).toContain('WorkerCore.md');
  expect(await readdir(folder)).not.toContain('Worker.md');
  expect(await readFile(path.join(folder, 'WorkerCore.md'), 'utf8')).toBe('# Worker\n\nLegacy notes.\n');

  await page.getByTestId('container-header-Router').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete service', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete service and documents', exact: true })
    .click();
  await expect(page.getByTestId('node-Router')).toHaveCount(0);
  await expect(page.getByTestId('node-WorkerCore')).toHaveCount(0);
  await saved(page);
  const deleted = await disk(folder);
  expect(deleted.nodes.map((item) => item.key)).not.toContain('WorkerCore');
  expect(deleted.nodes.map((item) => item.key)).not.toContain('Handler');
  expect(deleted.edges.map((item) => item.id)).not.toContain(cross.id);
  expect(deleted.edges.map((item) => item.id)).not.toContain('storage');
  expect(await readdir(folder)).not.toContain('WorkerCore.md');
  expect(await readdir(folder)).not.toContain('Handler.md');
  expect(await readdir(folder)).not.toContain('Router.md');
});

test('expanded container blank space opens its own subgraph menu, including nested containers', async ({
  page,
  folder,
}) => {
  await seedLegacy(folder);
  await open(page, folder);
  for (const key of ['Platform', 'Router']) await expand(page, key);
  const before = await disk(folder);
  const container = await box(page.getByTestId('node-Router').locator('.node-body'));
  await page.mouse.click(container.x + 12, container.y + container.height - 12, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Focus subgraph', exact: true }).click();
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText('Router');
  await expect(page.getByTestId('node-Handler')).toBeVisible();
  await expect(page.getByTestId('node-Database')).toHaveCount(0);
  await page.getByRole('button', { name: 'Up one level', exact: true }).click();
  await expect(page.locator('.breadcrumbs .crumb').last()).toHaveText('Platform');
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(before.nodes);
});
