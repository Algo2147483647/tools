import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkspace, validateKey, validateWorkspace, type Workspace } from '../src/model.js';

export const MAIN_FILE = 'workspace.json';
const TRANSACTION_DIRECTORY = '.service-flow-transaction';
const fold = (name: string) => name.toLocaleLowerCase('en-US');
const locks = new Map<string, Promise<unknown>>();

export class RepositoryError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'WORKSPACE_ERROR',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
interface JournalEntry {
  name: string;
  existed: boolean;
  backup: string | null;
  staged: string | null;
}
interface Journal {
  version: 1;
  phase: 'preparing' | 'prepared' | 'committed';
  entries: JournalEntry[];
}
export interface RepositoryOptions {
  /** Fault injection for transaction tests; not exposed by the HTTP API. */
  onTransactionStep?: (step: 'prepared' | 'applied' | 'committed', index: number) => void | Promise<void>;
}

async function exists(filename: string): Promise<boolean> {
  try {
    await fs.lstat(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function regularFile(filename: string, missingAllowed = false): Promise<boolean> {
  try {
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new RepositoryError(
        `Expected a regular file: ${path.basename(filename)}. Symbolic links and directories are not supported.`,
        422,
      );
    return true;
  } catch (error) {
    if (missingAllowed && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function durableWrite(filename: string, bytes: string | Buffer): Promise<void> {
  const handle = await fs.open(filename, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function replaceFile(filename: string, bytes: Buffer | string): Promise<void> {
  const temporary = path.join(path.dirname(filename), `.service-flow-write-${randomUUID()}`);
  try {
    await durableWrite(temporary, bytes);
    await fs.rename(temporary, filename);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}
async function writeJournal(transactionPath: string, journal: Journal): Promise<void> {
  const temporary = path.join(transactionPath, 'journal.next');
  if (await regularFile(temporary, true)) await fs.unlink(temporary);
  await durableWrite(temporary, JSON.stringify(journal));
  await fs.rename(temporary, path.join(transactionPath, 'journal.json'));
}
function safeEntryName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    (name === MAIN_FILE || (name.endsWith('.md') && validateKey(name.slice(0, -3), []) === null))
  );
}
function parseJournal(value: unknown): Journal {
  const item = value as Journal;
  if (
    !item ||
    item.version !== 1 ||
    !['preparing', 'prepared', 'committed'].includes(item.phase) ||
    !Array.isArray(item.entries)
  )
    throw new RepositoryError(
      'The recovery journal is invalid. Keep the transaction folder for manual recovery.',
      422,
    );
  const names = new Set<string>();
  item.entries.forEach((entry, index) => {
    if (
      !entry ||
      !safeEntryName(entry.name) ||
      names.has(entry.name) ||
      typeof entry.existed !== 'boolean' ||
      entry.backup !== (entry.existed ? `backup-${index}` : null) ||
      (entry.staged !== null && entry.staged !== `next-${index}`)
    ) {
      throw new RepositoryError('The recovery journal contains unsafe entries. No files were changed.', 422);
    }
    names.add(entry.name);
  });
  return item;
}
function starterDocument(key: string): Buffer {
  return Buffer.from(
    `# ${key}\n\nDescribe this service, its responsibilities, and its interfaces.\n`,
    'utf8',
  );
}

/** File operations are serialized per canonical directory, including across repository instances. */
export class WorkspaceRepository {
  constructor(private readonly options: RepositoryOptions = {}) {}

  private async exclusive<T>(directory: string, action: () => Promise<T>): Promise<T> {
    const lockKey = process.platform === 'win32' ? fold(directory) : directory;
    const previous = locks.get(lockKey) || Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    locks.set(lockKey, current);
    try {
      return await current;
    } finally {
      if (locks.get(lockKey) === current) locks.delete(lockKey);
    }
  }

  private async canonicalDirectory(directory: string, create = false): Promise<string> {
    if (typeof directory !== 'string' || !directory.trim() || directory.includes('\0'))
      throw new RepositoryError('Choose a valid workspace folder.');
    const absolute = path.resolve(directory);
    if (create) await fs.mkdir(absolute, { recursive: true });
    let stat;
    try {
      stat = await fs.stat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new RepositoryError('Workspace folder does not exist.', 404);
      throw error;
    }
    if (!stat.isDirectory()) throw new RepositoryError('The workspace path must be a folder.');
    return fs.realpath(absolute);
  }

  private async readWorkspace(directory: string): Promise<Workspace> {
    const filename = path.join(directory, MAIN_FILE);
    if (!(await regularFile(filename, true)))
      throw new RepositoryError(
        `No ${MAIN_FILE} was found in this folder. Choose Create workspace to initialize it.`,
        404,
      );
    try {
      return validateWorkspace(JSON.parse(await fs.readFile(filename, 'utf8')));
    } catch (error) {
      throw new RepositoryError(
        `Cannot open ${MAIN_FILE}: ${(error as Error).message}`,
        422,
        'INVALID_WORKSPACE',
      );
    }
  }

  private async inventory(directory: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const name of await fs.readdir(directory)) {
      const key = fold(name);
      if (result.has(key))
        throw new RepositoryError(
          `Folder contains filenames differing only by case: ${name}. Resolve this conflict first.`,
          409,
        );
      result.set(key, name);
    }
    return result;
  }

  private async recover(directory: string): Promise<void> {
    const transactionPath = path.join(directory, TRANSACTION_DIRECTORY);
    if (!(await exists(transactionPath))) return;
    const stat = await fs.lstat(transactionPath);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new RepositoryError(
        'The transaction path is not a regular directory. No files were changed.',
        422,
      );
    const transactionFiles = await fs.readdir(transactionPath);
    if (transactionFiles.length === 0) {
      await fs.rmdir(transactionPath);
      return;
    }
    const journalPath = path.join(transactionPath, 'journal.json');
    if (!(await regularFile(journalPath, true))) {
      // A crash while writing the very first journal occurs before staging or edits.
      if (transactionFiles.length === 1 && transactionFiles[0] === 'journal.next') {
        await regularFile(path.join(transactionPath, 'journal.next'));
        await fs.unlink(path.join(transactionPath, 'journal.next'));
        await fs.rmdir(transactionPath);
        return;
      }
      throw new RepositoryError(
        'An incomplete transaction folder has no recovery journal. Keep it for manual recovery.',
        422,
      );
    }
    let journal: Journal;
    try {
      journal = parseJournal(JSON.parse(await fs.readFile(journalPath, 'utf8')));
    } catch (error) {
      throw new RepositoryError(`Cannot recover workspace: ${(error as Error).message}`, 422);
    }
    if (journal.phase === 'prepared') {
      await this.restore(directory, transactionPath, journal);
      journal.phase = 'committed';
      await writeJournal(transactionPath, journal);
    }
    await this.cleanTransaction(transactionPath, journal);
  }

  private async restore(directory: string, transactionPath: string, journal: Journal): Promise<void> {
    // Verify every backup before touching any workspace file.
    for (const entry of journal.entries) {
      if (entry.backup) await regularFile(path.join(transactionPath, entry.backup));
      await regularFile(path.join(directory, entry.name), true);
    }
    for (const entry of [...journal.entries].reverse()) {
      const destination = path.join(directory, entry.name);
      if (entry.existed)
        await replaceFile(destination, await fs.readFile(path.join(transactionPath, entry.backup!)));
      else
        await fs.unlink(destination).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
    }
  }

  private async cleanTransaction(transactionPath: string, journal: Journal): Promise<void> {
    const expected = new Set([
      'journal.json',
      'journal.next',
      ...journal.entries.flatMap((entry) =>
        [entry.backup, entry.staged].filter((name): name is string => !!name),
      ),
    ]);
    const entries = await fs.readdir(transactionPath);
    if (entries.some((name) => !expected.has(name)))
      throw new RepositoryError(
        'Recovery contains unexpected files; the transaction folder was preserved.',
        422,
      );
    for (const name of entries.filter((name) => name !== 'journal.json')) {
      await regularFile(path.join(transactionPath, name));
      await fs.unlink(path.join(transactionPath, name));
    }
    await fs.unlink(path.join(transactionPath, 'journal.json'));
    await fs.rmdir(transactionPath);
  }

  private async transaction(directory: string, mutations: Map<string, Buffer | null>): Promise<void> {
    if (!mutations.size) return;
    const transactionPath = path.join(directory, TRANSACTION_DIRECTORY);
    await fs.mkdir(transactionPath);
    const journal: Journal = { version: 1, phase: 'preparing', entries: [] };
    let prepared = false;
    let committed = false;
    try {
      // Exact spellings matter for a case-only rename on Windows.
      const names = new Set(await fs.readdir(directory));
      let index = 0;
      for (const [name, bytes] of mutations) {
        if (!safeEntryName(name)) throw new RepositoryError('Unsafe transaction filename.');
        const existed = names.has(name);
        if (existed) await regularFile(path.join(directory, name));
        const entry: JournalEntry = {
          name,
          existed,
          backup: existed ? `backup-${index}` : null,
          staged: bytes === null ? null : `next-${index}`,
        };
        journal.entries.push(entry);
        index++;
      }
      await writeJournal(transactionPath, journal);
      for (const entry of journal.entries) {
        const bytes = mutations.get(entry.name);
        if (entry.backup)
          await durableWrite(
            path.join(transactionPath, entry.backup),
            await fs.readFile(path.join(directory, entry.name)),
          );
        if (entry.staged) await durableWrite(path.join(transactionPath, entry.staged), bytes!);
      }
      journal.phase = 'prepared';
      await writeJournal(transactionPath, journal);
      prepared = true;
      await this.options.onTransactionStep?.('prepared', -1);
      for (let index = 0; index < journal.entries.length; index++) {
        const entry = journal.entries[index];
        const destination = path.join(directory, entry.name);
        await regularFile(destination, true);
        if (entry.staged)
          await replaceFile(destination, await fs.readFile(path.join(transactionPath, entry.staged)));
        else
          await fs.unlink(destination).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        await this.options.onTransactionStep?.('applied', index);
      }
      journal.phase = 'committed';
      await writeJournal(transactionPath, journal);
      committed = true;
      await this.options.onTransactionStep?.('committed', -1);
      await this.cleanTransaction(transactionPath, journal);
    } catch (error) {
      if (committed) {
        // The save succeeded. A later open safely removes the committed journal.
        return;
      }
      try {
        if (prepared) {
          await this.restore(directory, transactionPath, journal);
          journal.phase = 'committed';
          await writeJournal(transactionPath, journal);
        }
        // Before preparation, this directory only contains files created above.
        if (prepared) await this.cleanTransaction(transactionPath, journal);
        else {
          for (const entry of journal.entries)
            for (const name of [entry.backup, entry.staged])
              if (name) await fs.unlink(path.join(transactionPath, name)).catch(() => {});
          await fs.unlink(path.join(transactionPath, 'journal.json')).catch(() => {});
          await fs.unlink(path.join(transactionPath, 'journal.next')).catch(() => {});
          await fs.rmdir(transactionPath);
        }
      } catch (rollbackError) {
        throw new RepositoryError(
          `Save failed and recovery is required. Your edits remain in the editor. Keep ${TRANSACTION_DIRECTORY}; retry after fixing filesystem access. ${(rollbackError as Error).message}`,
          500,
          'RECOVERY_REQUIRED',
        );
      }
      throw error;
    }
  }

  private async documentMutations(
    directory: string,
    previous: Workspace | null,
    next: Workspace,
  ): Promise<Map<string, Buffer | null>> {
    const inventory = await this.inventory(directory);
    const previousById = new Map(previous?.nodes.map((node) => [node.id, node]) || []);
    const managedNames = new Set(previous?.nodes.map((node) => fold(`${node.key}.md`)) || []);
    const previousContent = new Map<string, Buffer>();
    const oldActualNames = new Set<string>();
    for (const node of previous?.nodes || []) {
      const actual = inventory.get(fold(`${node.key}.md`));
      if (actual) {
        await regularFile(path.join(directory, actual));
        previousContent.set(node.id, await fs.readFile(path.join(directory, actual)));
        oldActualNames.add(actual);
      }
    }
    const desired = new Map<string, Buffer>();
    for (const node of next.nodes) {
      const name = `${node.key}.md`;
      const actual = inventory.get(fold(name));
      const oldNode = previousById.get(node.id);
      if (actual) await regularFile(path.join(directory, actual));
      if (oldNode && fold(oldNode.key) !== fold(node.key) && actual && !managedNames.has(fold(actual))) {
        throw new RepositoryError(
          `Cannot rename to ${node.key}: ${actual} already exists and belongs to another document. Rename or move that file first.`,
          409,
          'DOCUMENT_COLLISION',
        );
      }
      let content: Buffer;
      if (oldNode) content = previousContent.get(node.id) || starterDocument(node.key);
      else content = actual ? await fs.readFile(path.join(directory, actual)) : starterDocument(node.key);
      desired.set(name, content);
      if (actual && actual !== name) oldActualNames.add(actual);
    }
    const mutations = new Map<string, Buffer | null>();
    for (const name of oldActualNames) if (!desired.has(name)) mutations.set(name, null);
    for (const [name, bytes] of desired) {
      const actual = inventory.get(fold(name));
      if (actual === name && bytes.equals(await fs.readFile(path.join(directory, actual)))) continue;
      mutations.set(name, bytes);
    }
    return mutations;
  }

  async open(
    directory: string,
    options: { create?: boolean; name?: string } = {},
  ): Promise<{ path: string; workspace: Workspace }> {
    const canonical = await this.canonicalDirectory(directory, options.create);
    return this.exclusive(canonical, async () => {
      await this.recover(canonical);
      const present = await regularFile(path.join(canonical, MAIN_FILE), true);
      if (!present && !options.create)
        throw new RepositoryError(
          `No ${MAIN_FILE} was found in this folder. Choose Create workspace to initialize it.`,
          404,
        );
      const workspace = present
        ? await this.readWorkspace(canonical)
        : createWorkspace(options.name || path.basename(canonical));
      const mutations = await this.documentMutations(canonical, workspace, workspace);
      if (!present) mutations.set(MAIN_FILE, Buffer.from(JSON.stringify(workspace, null, 2) + '\n'));
      await this.transaction(canonical, mutations);
      return { path: canonical, workspace };
    });
  }

  async save(directory: string, data: unknown): Promise<{ workspace: Workspace; savedAt: string }> {
    let proposed: Workspace;
    try {
      proposed = validateWorkspace(data);
    } catch (error) {
      throw new RepositoryError((error as Error).message, 422, 'INVALID_WORKSPACE');
    }
    const canonical = await this.canonicalDirectory(directory);
    return this.exclusive(canonical, async () => {
      await this.recover(canonical);
      const previous = await this.readWorkspace(canonical);
      if (previous.revision !== proposed.revision)
        throw new RepositoryError(
          'This workspace changed on disk. Reopen it before saving to avoid overwriting external changes.',
          409,
          'REVISION_CONFLICT',
        );
      const workspace = { ...proposed, revision: previous.revision + 1 };
      const mutations = await this.documentMutations(canonical, previous, workspace);
      mutations.set(MAIN_FILE, Buffer.from(JSON.stringify(workspace, null, 2) + '\n'));
      await this.transaction(canonical, mutations);
      return { workspace, savedAt: new Date().toISOString() };
    });
  }

  async readDocument(directory: string, key: string): Promise<{ content: string }> {
    const canonical = await this.canonicalDirectory(directory);
    return this.exclusive(canonical, async () => {
      await this.recover(canonical);
      const workspace = await this.readWorkspace(canonical);
      if (!workspace.nodes.some((node) => node.key === key))
        throw new RepositoryError('Service document was not found.', 404);
      const filename = path.join(canonical, `${key}.md`);
      await regularFile(filename);
      return { content: await fs.readFile(filename, 'utf8') };
    });
  }

  async writeDocument(directory: string, key: string, content: string): Promise<{ savedAt: string }> {
    if (typeof content !== 'string') throw new RepositoryError('Document content must be text.');
    const canonical = await this.canonicalDirectory(directory);
    return this.exclusive(canonical, async () => {
      await this.recover(canonical);
      const workspace = await this.readWorkspace(canonical);
      if (!workspace.nodes.some((node) => node.key === key))
        throw new RepositoryError('Service document was not found.', 404);
      await regularFile(path.join(canonical, `${key}.md`), true);
      await this.transaction(canonical, new Map([[`${key}.md`, Buffer.from(content, 'utf8')]]));
      return { savedAt: new Date().toISOString() };
    });
  }
}
