import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServiceNode, Workspace } from '../../src/model';

const test = base.extend<{ folder: string }>({
  folder: async ({}, use) => {
    const root = path.resolve(tmpdir());
    const temporary = await mkdtemp(path.join(root, 'service-atlas-selection-'));
    try {
      await use(path.join(temporary, 'workspace'));
    } finally {
      const target = path.resolve(temporary);
      if (path.dirname(target) !== root || !path.basename(target).startsWith('service-atlas-selection-'))
        throw new Error(`Refusing to remove unexpected test folder: ${target}`);
      await rm(target, { recursive: true, force: true });
    }
  },
});

const disk = async (folder: string): Promise<Workspace> =>
  JSON.parse(await readFile(path.join(folder, 'workspace.json'), 'utf8'));
const node = (key: string, x: number, y: number, graphId = 'root'): ServiceNode => ({
  id: `id-${key}`,
  key,
  graphId,
  x,
  y,
  width: 160,
  height: 80,
  childGraphId: `inside-${key}`,
});

async function setup(page: Page, folder: string, nested = false) {
  const nodes = nested
    ? [
        { ...node('Container', 100, 100), expanded: true, expandedSize: { width: 424, height: 168 } },
        node('One', 0, 0, 'inside-Container'),
        node('Two', 200, 0, 'inside-Container'),
        node('Outside', 660, 200),
      ]
    : [
        node('Alpha', 0, 0),
        node('Beta', 260, 0),
        { ...node('Gamma', 620, 240), type: 'terminal' as const, width: 100, height: 100 },
      ];
  const workspace: Workspace = {
    version: 2,
    name: 'Selection verification',
    revision: 0,
    rootGraphId: 'root',
    graphs: [
      { id: 'root', parentNodeId: null },
      ...nodes.map((item) => ({ id: item.childGraphId, parentNodeId: item.id })),
    ],
    nodes,
    edges: nested
      ? []
      : [
          {
            id: 'alpha-beta',
            graphId: 'root',
            source: 'Alpha',
            target: 'Beta',
            sourceNodeId: 'id-Alpha',
            targetNodeId: 'id-Beta',
            sourceSide: 'right',
            targetSide: 'left',
            weights: ['payload'],
            points: [
              { x: 160, y: 40 },
              { x: 260, y: 40 },
            ],
          },
        ],
  };
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'workspace.json'), JSON.stringify(workspace));
  await Promise.all(nodes.map((item) => writeFile(path.join(folder, `${item.key}.md`), `# ${item.key}\n`)));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Workspace folder').fill(folder);
  await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing graph geometry');
  return box;
}
async function saved(page: Page) {
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText('All changes saved');
}
async function gesture(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  button: 'left' | 'middle' = 'left',
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up({ button });
}
async function dragNode(page: Page, name: string, dx: number, dy: number) {
  const box = await bounds(page.getByTestId(`node-${name}`).locator('.node-body'));
  await gesture(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy },
  );
}
async function view(page: Page) {
  return page.getByTestId('node-Alpha').evaluate((element) => {
    const matrix = (element as unknown as SVGGraphicsElement).getScreenCTM()!;
    return { x: matrix.e, y: matrix.f, scale: matrix.a };
  });
}

test('marquee, Shift selection, grouped movement, undo, and pan remain independent', async ({
  page,
  folder,
}) => {
  await setup(page, folder);
  const before = await disk(folder);
  const originalView = await view(page);
  const a = await bounds(page.getByTestId('node-Alpha').locator('.node-body'));
  const b = await bounds(page.getByTestId('node-Beta').locator('.node-body'));
  await gesture(page, { x: a.x - 20, y: a.y - 20 }, { x: b.x + b.width + 20, y: b.y + b.height + 20 });
  await expect(page.locator('.service-node.selected')).toHaveCount(2);
  await expect(page.getByTestId('edge-alpha-beta')).toHaveClass(/selected/);
  await expect(page.getByTestId('selection-marquee')).toHaveCount(0);
  expect(await view(page)).toEqual(originalView);
  await expect(page.getByRole('heading', { name: '3 elements selected', exact: true })).toBeVisible();

  await page
    .getByTestId('node-Gamma')
    .locator('.node-body')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.service-node.selected')).toHaveCount(3);
  await page
    .getByTestId('node-Gamma')
    .locator('.node-body')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.service-node.selected')).toHaveCount(2);
  await dragNode(page, 'Alpha', 72, 36);
  await saved(page);
  const moved = await disk(folder);
  const da = { x: moved.nodes[0].x - before.nodes[0].x, y: moved.nodes[0].y - before.nodes[0].y };
  const db = { x: moved.nodes[1].x - before.nodes[1].x, y: moved.nodes[1].y - before.nodes[1].y };
  expect(da).toEqual(db);
  expect(da.x).toBeGreaterThan(0);
  expect(da.y).toBeGreaterThan(0);
  expect(moved.nodes[2]).toEqual(before.nodes[2]);
  expect(moved.edges[0].points).not.toEqual(before.edges[0].points);
  await expect(page.locator('.edge-handles')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(before.nodes);
  expect((await disk(folder)).edges).toEqual(before.edges);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(moved.nodes);

  const panStart = await view(page);
  await gesture(page, { x: 1040, y: 780 }, { x: 1080, y: 810 }, 'middle');
  const middle = await view(page);
  expect(middle.x - panStart.x).toBeCloseTo(40);
  expect(middle.y - panStart.y).toBeCloseTo(30);
  await page.mouse.move(1040, 780);
  await page.keyboard.down('Space');
  await gesture(page, { x: 1040, y: 780 }, { x: 1010, y: 760 });
  await page.keyboard.up('Space');
  const space = await view(page);
  expect(space.x - middle.x).toBeCloseTo(-30);
  expect(space.y - middle.y).toBeCloseTo(-20);
  expect((await disk(folder)).nodes).toEqual(moved.nodes);

  await page.getByTestId('node-Alpha').locator('.node-body').click();
  await page
    .getByTestId('node-Beta')
    .locator('.node-body')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.service-node.selected')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete selected elements', exact: true })
    .click();
  await saved(page);
  expect((await disk(folder)).nodes.map((item) => item.key)).toEqual(['Gamma']);
  expect((await disk(folder)).edges).toEqual([]);
  expect(await readdir(folder)).not.toContain('Alpha.md');
  expect(await readdir(folder)).not.toContain('Beta.md');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(moved.nodes);
  expect((await disk(folder)).edges).toEqual(moved.edges);
  expect(await readFile(path.join(folder, 'Alpha.md'), 'utf8')).toBe('# Alpha\n');
  expect(await readFile(path.join(folder, 'Beta.md'), 'utf8')).toBe('# Beta\n');
});

test('arrow tips terminate at the target anchors for hidden and visible ports', async ({ page, folder }) => {
  await setup(page, folder);
  const inspect = () =>
    page
      .getByTestId('edge-alpha-beta')
      .locator('.edge-line')
      .evaluate((element) => {
        const line = element as SVGPathElement;
        const markerId = line.getAttribute('marker-end')!.slice(5, -1);
        const marker = document.getElementById(markerId) as unknown as SVGMarkerElement;
        const end = line.getPointAtLength(line.getTotalLength());
        const port = document.querySelector('[data-testid="port-Beta-left"]') as unknown as SVGGElement;
        const portMatrix = port.getCTM()!;
        const pathMatrix = line.getCTM()!;
        const portCenter = new DOMPoint(0, 0)
          .matrixTransform(portMatrix)
          .matrixTransform(pathMatrix.inverse());
        return {
          refX: marker.refX.baseVal.value,
          refY: marker.refY.baseVal.value,
          markerPath: marker.querySelector('path')!.getAttribute('d'),
          endpoint: { x: end.x, y: end.y },
          anchor: { x: portCenter.x, y: portCenter.y },
        };
      });
  await page.mouse.move(1100, 900);
  await expect(page.getByTestId('port-Beta-left')).toHaveCSS('opacity', '0');
  const hidden = await inspect();
  expect(hidden.refX).toBe(9);
  expect(hidden.refY).toBe(5);
  expect(hidden.markerPath).toBe('M1 1 9 5 1 9');
  expect(hidden.endpoint.x).toBeCloseTo(hidden.anchor.x);
  expect(hidden.endpoint.y).toBeCloseTo(hidden.anchor.y);
  await page.getByTestId('node-Beta').locator('.node-body').hover();
  await expect(page.getByTestId('port-Beta-left')).toHaveCSS('opacity', '1');
  expect(await inspect()).toEqual(hidden);
  await page.getByTestId('node-Beta').locator('.node-body').click();
  await page.mouse.move(1100, 900);
  expect(await inspect()).toEqual(hidden);
});

test('nested marquee avoids ancestor selection and group dragging never moves descendants twice', async ({
  page,
  folder,
}) => {
  await setup(page, folder, true);
  await page.getByTestId('node-One').locator('.node-body').dblclick();
  await expect(page.getByTestId('node-One')).toHaveAttribute('data-expanded', 'true');
  await page.getByTestId('container-header-One').dblclick();
  await expect(page.getByTestId('node-One')).not.toHaveAttribute('data-expanded', 'true');
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await saved(page);
  const beforeGroup = await disk(folder);
  const one = await bounds(page.getByTestId('node-One').locator('.node-body'));
  const two = await bounds(page.getByTestId('node-Two').locator('.node-body'));
  const scale = await page
    .getByTestId('node-One')
    .evaluate((element) => (element as unknown as SVGGraphicsElement).getScreenCTM()!.a);
  const expectDelta = (actual: number, requested: number) =>
    expect(Math.abs(actual - requested)).toBeLessThan(scale + 1);
  await gesture(
    page,
    { x: two.x + two.width + 10, y: two.y + two.height + 10 },
    { x: one.x - 10, y: one.y - 1 },
  );
  await expect(page.locator('.service-node.selected')).toHaveCount(2);
  await expect(page.getByTestId('node-Container')).not.toHaveClass(/selected/);
  await dragNode(page, 'One', 70, 35);
  await saved(page);
  const shiftedOne = await bounds(page.getByTestId('node-One').locator('.node-body'));
  const shiftedTwo = await bounds(page.getByTestId('node-Two').locator('.node-body'));
  expectDelta(shiftedOne.x - one.x, 70);
  expectDelta(shiftedOne.y - one.y, 35);
  expect(Math.abs(shiftedTwo.x - two.x - (shiftedOne.x - one.x))).toBeLessThan(1);
  expect(Math.abs(shiftedTwo.y - two.y - (shiftedOne.y - one.y))).toBeLessThan(1);
  const afterGroup = await disk(folder);
  const relative = (workspace: Workspace) => {
    const a = workspace.nodes.find((item) => item.key === 'One')!;
    const b = workspace.nodes.find((item) => item.key === 'Two')!;
    return { x: b.x - a.x, y: b.y - a.y };
  };
  expect(relative(afterGroup)).toEqual(relative(beforeGroup));

  await page
    .getByTestId('container-header-Container')
    .click({ modifiers: ['Shift'], position: { x: 25, y: 25 } });
  await expect(page.locator('.service-node.selected')).toHaveCount(3);
  await expect(page.getByTestId('resize-handle')).toHaveCount(0);
  const before = await disk(folder);
  const header = await bounds(page.getByTestId('container-header-Container'));
  await gesture(page, { x: header.x + 35, y: header.y + 20 }, { x: header.x + 85, y: header.y + 45 });
  await saved(page);
  const after = await disk(folder);
  expect(after.nodes.filter((item) => item.graphId === 'inside-Container')).toEqual(
    before.nodes.filter((item) => item.graphId === 'inside-Container'),
  );
  const finalOne = await bounds(page.getByTestId('node-One').locator('.node-body'));
  expectDelta(finalOne.x - shiftedOne.x, 50);
  expectDelta(finalOne.y - shiftedOne.y, 25);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(before.nodes);
});

test('editing an internal path keeps its world position through automatic container normalization', async ({
  page,
  folder,
}) => {
  await setup(page, folder, true);
  await page.getByTestId('node-Two').locator('.node-body').click();
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'X', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Add flow', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Source service').selectOption('One');
  await dialog.getByLabel('Destination service').selectOption('Two');
  await dialog.getByRole('button', { name: 'Create flow', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Path segment').selectOption('0');
  await page.getByRole('button', { name: 'Add bend', exact: true }).click();
  await saved(page);
  const before = await disk(folder);
  const one = await bounds(page.getByTestId('node-One').locator('.node-body'));
  const handle = await bounds(page.getByTestId('segment-2'));
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await gesture(page, start, { x: start.x, y: start.y - 140 });
  await saved(page);
  const moved = await disk(folder);
  const movedOne = await bounds(page.getByTestId('node-One').locator('.node-body'));
  expect(movedOne.x).toBeCloseTo(one.x, 2);
  expect(movedOne.y).toBeCloseTo(one.y, 2);
  const end = await bounds(page.getByTestId('segment-2'));
  expect(Math.abs(end.y - handle.y + 140)).toBeLessThan(3);
  expect(moved.nodes.find((item) => item.key === 'Container')!.y).toBeLessThan(
    before.nodes.find((item) => item.key === 'Container')!.y,
  );
  expect(moved.edges[0].points).not.toEqual(before.edges[0].points);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(before.nodes);
  expect((await disk(folder)).edges).toEqual(before.edges);
});
