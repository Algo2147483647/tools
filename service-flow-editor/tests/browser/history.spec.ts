import { test as base, expect, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWorkspace, type ServiceNode, type Workspace } from '../../src/model';

const test = base.extend<{ folder: string }>({
  folder: async ({}, use) => {
    const root = path.resolve(tmpdir());
    const temporary = await mkdtemp(path.join(root, 'service-atlas-history-'));
    try {
      await use(path.join(temporary, 'workspace'));
    } finally {
      const target = path.resolve(temporary);
      if (path.dirname(target) !== root || !path.basename(target).startsWith('service-atlas-history-'))
        throw new Error(`Refusing to remove an unexpected test folder: ${target}`);
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

test('saved subtree deletion and rename can be undone and redone without losing service notes', async ({
  page,
  folder,
}) => {
  const workspace = createWorkspace('History verification');
  const add = (key: string, graphId: string, x: number): ServiceNode => {
    const node: ServiceNode = {
      id: `id-${key}`,
      key,
      graphId,
      childGraphId: `inside-${key}`,
      x,
      y: 120,
      width: 200,
      height: 88,
    };
    workspace.nodes.push(node);
    workspace.graphs.push({ id: node.childGraphId, parentNodeId: node.id });
    return node;
  };
  add('Client', 'root', 0);
  const parent = add('Platform', 'root', 360);
  const child = add('Storage', parent.childGraphId, 0);
  add('Replica', child.childGraphId, 0);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'workspace.json'), JSON.stringify(workspace));
  for (const node of workspace.nodes)
    await writeFile(path.join(folder, `${node.key}.md`), `# ${node.key}\nOriginal ${node.key} notes 数据`);

  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Workspace folder').fill(folder);
  await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await page.getByTestId('node-Platform').click();
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const notes = '# Platform\nThese edited notes must survive saved deletion and rename.';
  await page.getByRole('textbox', { name: 'Service Markdown document' }).fill(notes);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Delete service', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete service and documents', exact: true })
    .click();
  await saved(page);
  expect((await disk(folder)).nodes.map((node) => node.key)).toEqual(['Client']);
  expect(await readdir(folder)).not.toContain('Platform.md');
  await undo.click();
  await saved(page);
  expect((await disk(folder)).nodes).toEqual(workspace.nodes);
  expect(await readFile(path.join(folder, 'Platform.md'), 'utf8')).toBe(notes);
  expect(await readFile(path.join(folder, 'Replica.md'), 'utf8')).toBe(
    '# Replica\nOriginal Replica notes 数据',
  );
  await redo.click();
  await saved(page);
  expect((await disk(folder)).nodes).toHaveLength(1);
  await undo.click();
  await saved(page);
  await page.getByTestId('node-Platform').click();
  await page.getByLabel('Service key', { exact: true }).fill('Renamed Platform');
  await page.getByLabel('Service key', { exact: true }).press('Enter');
  await saved(page);
  expect(await readFile(path.join(folder, 'Renamed Platform.md'), 'utf8')).toBe(notes);
  await undo.click();
  await saved(page);
  expect(await readFile(path.join(folder, 'Platform.md'), 'utf8')).toBe(notes);
  expect(await readdir(folder)).not.toContain('Renamed Platform.md');
  await redo.click();
  await saved(page);
  expect(await readFile(path.join(folder, 'Renamed Platform.md'), 'utf8')).toBe(notes);

  // Reopening a workspace starts a new editing history.
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  const reopen = page.getByRole('dialog');
  await reopen.getByLabel('Workspace folder').fill(folder);
  await reopen.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
  await expect(reopen).toHaveCount(0);
  await saved(page);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
});

test('a failed document restoration keeps its safety identities after browser reload', async ({
  page,
  folder,
}) => {
  const workspace = createWorkspace('Expired history');
  const node: ServiceNode = {
    id: 'archived-node',
    key: 'Archived',
    graphId: 'root',
    childGraphId: 'inside-archived',
    x: 80,
    y: 120,
    width: 200,
    height: 88,
  };
  workspace.nodes.push(node);
  workspace.graphs.push({ id: node.childGraphId, parentNodeId: node.id });
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'workspace.json'), JSON.stringify(workspace));
  await writeFile(path.join(folder, 'Archived.md'), 'Original notes must never become starter text.');
  const open = async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Workspace folder').fill(folder);
    await dialog.getByRole('button', { name: 'Open workspace', exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
  };
  await open();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await page.getByTestId('node-Archived').click();
  await page.getByRole('button', { name: 'Delete service', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete service and documents', exact: true })
    .click();
  await saved(page);
  const restorationRequests: string[][] = [];
  // Emulate an expired server archive while keeping the current browser session.
  // Without the expected IDs a server would treat this as a new node, so inspect
  // the safety contract as well as the visible failure and unchanged filesystem.
  await page.route('**/api/workspace/save', async (route) => {
    const body = route.request().postDataJSON() as { workspace: Workspace; restoringNodeIds?: string[] };
    if (body.workspace.nodes.some((item) => item.id === node.id)) {
      restorationRequests.push(body.restoringNodeIds || []);
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'DOCUMENT_HISTORY_EXPIRED',
          error:
            'Cannot restore Archived: its deleted document is no longer available in this server session.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Save failed');
  expect(restorationRequests[0]).toContain(node.id);
  expect(await readdir(folder)).not.toContain('Archived.md');
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await open();
  await expect(page.locator('.save-status')).toContainText('Save failed');
  await expect.poll(() => restorationRequests.length).toBeGreaterThanOrEqual(2);
  expect(restorationRequests.at(-1)).toContain(node.id);
  expect(await readdir(folder)).not.toContain('Archived.md');
  expect((await disk(folder)).nodes).toHaveLength(0);
  await expect(page.getByTestId('node-Archived')).toBeVisible();
});
