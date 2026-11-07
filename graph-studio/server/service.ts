import { WorkspaceFileOperations } from "./workspaceFiles";
import type { FileMutationRequest } from "../src/workspace/fileContracts";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, realpath, stat, readFile, unlink, rmdir, open } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { normalizeDagInput } from "../src/graph/normalize";
import { createInitialCanvasDag } from "../src/graph/initialCanvas";
import { serializeDagToJson } from "../src/graph/serialize";
import { discoverWorkspace } from "../src/workspace/discovery";
import { parseLayoutConfigFile } from "../src/schema/layoutConfig";
import { parseChartStyleFile } from "../src/schema/styleProtocol";
import { resolveWorkspacePath } from "../src/workspace/paths";
import {
  atomicWrite,
  readBytes,
  relativeFilePath,
  revision,
  serialQueue,
  ServiceError,
  targetPath,
  MAX_FILE_BYTES,
} from "./files";
import { openExternal } from "./platform";
import type { GeneralPreferences } from "../src/workspace/generalPreferences";

export interface LocationRecord {
  id: string;
  kind: "workspace" | "file";
  name: string;
  location: string;
  openedAt: number;
  lastGraph?: string;
  exampleId?: string;
}
const ignored = new Set(["node_modules", "dist", "build", "coverage", "vendor"]);
export const defaultStateDirectory = () =>
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData/Local"), "Graph Studio")
    : process.platform === "darwin"
      ? join(homedir(), "Library/Application Support/Graph Studio")
      : join(process.env.XDG_STATE_HOME || join(homedir(), ".local/state"), "graph-studio");

export class LocalService {
  events = new EventEmitter();
  readonly fileOperations: WorkspaceFileOperations;
  private records: LocationRecord[] = [];
  private preferences: GeneralPreferences = { fileOpenMode: "preview" };
  private queue = serialQueue();
  private watchers = new Map<string, { close(): void }>();
  private lockPath: string;
  private ownsLock = false;
  private active = new Set<string>();
  constructor(
    public stateDirectory: string,
    public examplesDirectory: string,
    private external = openExternal,
  ) {
    this.fileOperations = new WorkspaceFileOperations(this, stateDirectory);
    this.lockPath = join(stateDirectory, "service.lock");
  }
  async initialize() {
    await mkdir(this.stateDirectory, { recursive: true });
    try {
      await this.acquireLock();
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(this.lockPath, "utf8"));
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error("Invalid Graph Studio service lock. Check the state directory.");
      try {
        process.kill(pid, 0);
        throw new Error("Graph Studio backend is already running. Close it before starting another instance.");
      } catch (probe: any) {
        if (probe.code !== "ESRCH") throw probe;
      }
      await unlink(this.lockPath);
      await this.acquireLock();
    }
    try {
      const state = JSON.parse(await readFile(join(this.stateDirectory, "state.json"), "utf8"));
      if (state.version !== 1 || !Array.isArray(state.locations)) throw new Error("Unsupported user-state file.");
      this.records = state.locations;
      this.preferences = { fileOpenMode: state.preferences?.fileOpenMode === "external" ? "external" : "preview" };
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        await this.close();
        throw error;
      }
    }
    try {
      await this.fileOperations.recover();
    } catch (error) {
      await this.close();
      throw error;
    }
    // Finish interrupted linked-document commits before accepting requests.
    try {
      const journal = JSON.parse(await readFile(join(this.stateDirectory, "transaction.json"), "utf8"));
      await this.applyJournal(journal);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        await this.close();
        throw error;
      }
    }
  }
  private async acquireLock() {
    const lock = await open(this.lockPath, "wx");
    await lock.writeFile(String(process.pid));
    await lock.close();
    this.ownsLock = true;
  }
  private persist() {
    return atomicWrite(
      join(this.stateDirectory, "state.json"),
      JSON.stringify({ version: 1, locations: this.records, preferences: this.preferences }, null, 2),
    );
  }
  getPreferences() {
    return { ...this.preferences };
  }
  async updatePreferences(input: unknown) {
    const mode = (input as Partial<GeneralPreferences> | null)?.fileOpenMode;
    if (mode !== "preview" && mode !== "external")
      throw new ServiceError("INVALID_PREFERENCES", "Choose preview or external for fileOpenMode.");
    return this.queue(async () => {
      const previous = this.preferences;
      this.preferences = { fileOpenMode: mode };
      try {
        await this.persist();
      } catch (error) {
        this.preferences = previous;
        throw error;
      }
      return this.getPreferences();
    });
  }
  private async requireNoPendingTransaction() {
    await this.fileOperations.requireNoPending();
    if (
      await stat(join(this.stateDirectory, "transaction.json"))
        .then(() => true)
        .catch((error: any) => {
          if (error.code === "ENOENT") return false;
          throw error;
        })
    )
      throw new ServiceError(
        "RECOVERY_REQUIRED",
        "A linked-document save is incomplete. Restart Graph Studio to recover it before writing more files.",
        409,
      );
  }
  private record(id: string) {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new ServiceError("LOCATION_NOT_FOUND", "Location not found. Open it again.", 404);
    return record;
  }
  async recent() {
    return Promise.all(
      this.records
        .filter((r) => r.openedAt > 0)
        .sort((a, b) => b.openedAt - a.openedAt)
        .slice(0, 20)
        .map(async (r) => ({
          ...r,
          canReopen: await stat(r.location)
            .then((s) => (r.kind === "workspace" ? s.isDirectory() : s.isFile()))
            .catch(() => false),
        })),
    );
  }
  async removeRecent(ids: string[]) {
    return this.queue(async () => {
      for (const r of this.records) if (ids.includes(r.id)) r.openedAt = 0;
      await this.persist();
    });
  }
  async register(
    path: string,
    kind: LocationRecord["kind"],
    options: { id?: string; exampleId?: string; allowMissing?: boolean } = {},
  ) {
    let canonical: string;
    try {
      canonical = await realpath(resolve(path));
    } catch (error) {
      if (!options.allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      canonical = join(await realpath(dirname(resolve(path))), basename(path));
    }
    if (!options.allowMissing) {
      const s = await stat(canonical);
      if (kind === "workspace" ? !s.isDirectory() : !s.isFile())
        throw new ServiceError("INVALID_LOCATION", "The selected path has the wrong file type.");
    }
    return this.queue(async () => {
      const same = (p: string) =>
        process.platform === "win32" ? p.toLowerCase() === canonical.toLowerCase() : p === canonical;
      let record = this.records.find((r) => r.kind === kind && same(r.location));
      if (options.id && record && record.id !== options.id)
        throw new ServiceError("LOCATION_ALREADY_OPEN", "This location already belongs to another recent entry.");
      if (!record && options.id) {
        record = this.record(options.id);
        if (record.kind !== kind) throw new ServiceError("INVALID_LOCATION", "Location type cannot change.");
        this.stopWatching(record.id);
      }
      if (!record) {
        record = { id: randomUUID(), kind, location: canonical, name: basename(canonical), openedAt: 0 };
        this.records.push(record);
      }
      Object.assign(record, {
        location: canonical,
        name: basename(canonical),
        ...(options.exampleId ? { exampleId: options.exampleId } : {}),
      });
      await this.persist();
      return { ...record };
    });
  }
  async session(id: string, lastGraph?: string) {
    return this.queue(async () => {
      const r = this.record(id);
      r.openedAt = Date.now();
      if (lastGraph !== undefined) r.lastGraph = relativeFilePath(lastGraph);
      await this.persist();
      return r;
    });
  }
  async reopen(id: string) {
    const r = this.record(id);
    const current = await realpath(r.location);
    if (current !== r.location)
      throw new ServiceError("LOCATION_MOVED", "The location changed. Relocate it before opening.", 409);
    return r.kind === "workspace" ? this.snapshot(id) : { ...r };
  }
  async create(parent: string, name: string) {
    if (
      !name ||
      name !== name.trim() ||
      /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
      /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    )
      throw new ServiceError("INVALID_NAME", "Enter a valid workspace folder name.");
    const root = join(await realpath(parent), name);
    await mkdir(root); // Existing directories are never reused.
    try {
      await atomicWrite(join(root, "graph.json"), serializeDagToJson(createInitialCanvasDag()), true);
    } catch (error) {
      await rmdir(root).catch(() => {});
      throw error;
    }
    const r = await this.register(root, "workspace");
    return this.snapshot(r.id);
  }
  async listFiles(id: string) {
    const r = this.record(id);
    if (r.kind !== "workspace") throw new ServiceError("NOT_WORKSPACE", "Open a workspace folder first.");
    if ((await realpath(r.location)) !== r.location)
      throw new ServiceError("LOCATION_MOVED", "Workspace root changed.", 409);
    const files: string[] = [];
    const walk = async (dir: string, prefix = "", depth = 0) => {
      if (depth > 32) throw new ServiceError("DIRECTORY_TOO_DEEP", "Workspace directory nesting exceeds 32 levels.");
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || ignored.has(entry.name) || entry.name.endsWith(".tmp")) continue;
        const path = prefix + entry.name;
        // Do not traverse links/junctions during discovery. Direct reads also check real paths.
        if (entry.isDirectory()) await walk(join(dir, entry.name), path + "/", depth + 1);
        else if (entry.isFile()) files.push(path);
        if (files.length > 20000)
          throw new ServiceError("WORKSPACE_TOO_LARGE", "More than 20,000 files found. Open a smaller folder.");
      }
    };
    await walk(r.location);
    return files.sort();
  }
  async snapshot(id: string) {
    const r = this.record(id);
    const paths = await this.listFiles(id);
    const files = new Map(
      paths.map((path) => [
        path,
        {
          path,
          handle: null,
          loadFile: async () => {
            const data = await this.read(id, path);
            return new File([new Uint8Array(data.bytes)], basename(path));
          },
        },
      ]),
    );
    const found = await discoverWorkspace({ name: r.name, handle: null, files }, r.lastGraph);
    this.startWatching(id);
    return {
      ...r,
      name: found.name,
      rootName: r.name,
      files: paths,
      graphs: found.graphs,
      manifest: found.manifest,
      notices: found.notices,
      activePath: found.activePath,
    };
  }
  async filePath(id: string, path: string, allowMissing = false) {
    const r = this.record(id);
    if (r.kind === "workspace") {
      if ((await realpath(r.location)) !== r.location)
        throw new ServiceError("LOCATION_MOVED", "Workspace root changed.", 409);
      return targetPath(r.location, path, allowMissing);
    }
    if (path !== basename(r.location))
      throw new ServiceError(
        "PATH_OUTSIDE_FILE",
        "Single-file access does not grant access to neighboring files.",
        403,
      );
    const parent = dirname(r.location);
    if ((await realpath(parent)) !== parent)
      throw new ServiceError("LOCATION_MOVED", "File parent directory changed.", 409);
    const target = await targetPath(parent, path, allowMissing);
    if (target !== r.location)
      throw new ServiceError("LOCATION_MOVED", "File now points to a different location.", 409);
    return target;
  }
  async read(id: string, path: string) {
    const target = await this.filePath(id, path);
    const bytes = await readBytes(target);
    return { bytes, revision: revision(bytes) };
  }
  private validateContent(path: string, content: string) {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES)
      throw new ServiceError("FILE_TOO_LARGE", "File exceeds 32 MB.", 413);
    if (!/\.json$/i.test(path)) return;
    const value = JSON.parse(content);
    if (value?.format === "graph-studio") normalizeDagInput(value);
    if (value?.format === "graph-studio-layout") parseLayoutConfigFile(value);
    if (value?.format === "graph-studio-style") parseChartStyleFile(value, value.chartType);
  }
  async write(id: string, path: string, content: string, expected: string | null) {
    return this.queue(async () => {
      await this.requireNoPendingTransaction();
      if (typeof content !== "string" || !(typeof expected === "string" || expected === null))
        throw new ServiceError("INVALID_WRITE", "Content and expectedRevision are required.");
      this.validateContent(path, content);
      const target = await this.filePath(id, path, true);
      const previous = await readBytes(target).catch((e: any) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      const actual = previous === null ? null : revision(previous);
      if (actual !== expected)
        throw new ServiceError(
          "FILE_CHANGED",
          "The file changed outside Graph Studio. Reload it or save a new copy.",
          409,
        );
      if (/\.json$/i.test(path) && previous) {
        let old: any;
        try {
          old = JSON.parse(previous.toString("utf8"));
        } catch {
          /* A malformed JSON file can be repaired. */
        }
        if (old?.format === "graph-studio") normalizeDagInput(JSON.parse(content));
      }
      await atomicWrite(target, content, expected === null);
      this.events.emit("change", { locationId: id, path });
      return { path, revision: revision(content) };
    });
  }
  async openFile(id: string, path: string) {
    if (!/\.(?:md|mdown|markdown|txt|json|png|jpe?g|gif|pdf|svg|webp|css|html?)$/i.test(path))
      throw new ServiceError("UNSUPPORTED_EXTERNAL_FILE", "This file type cannot be opened externally.");
    const target = await this.filePath(id, path);
    if (!/\.(?:md|mdown|markdown|txt|json|png|jpe?g|gif|pdf|svg|webp|css|html?)$/i.test(target))
      throw new ServiceError("UNSUPPORTED_EXTERNAL_FILE", "The resolved target is not a supported document.");
    if (!(await stat(target)).isFile()) throw new ServiceError("NOT_FILE", "Select a file.");
    await this.external(target);
    return { opened: true };
  }
  private async applyJournal(journal: any) {
    const r = this.record(journal.id);
    if (r.kind !== "workspace" || !Array.isArray(journal.writes)) throw new Error("Invalid file transaction journal.");
    for (const item of journal.writes) {
      const path = await this.filePath(r.id, item.path, true);
      const actual = await readBytes(path)
        .then(revision)
        .catch((e: any) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
      if (actual === revision(item.content)) continue;
      if (actual !== item.before)
        throw new Error(
          `Interrupted save conflicts with external edits: ${item.path}. Preserve transaction.json and resolve the conflict before restarting.`,
        );
      await atomicWrite(path, item.content, item.before === null);
    }
    await unlink(join(this.stateDirectory, "transaction.json"));
  }
  async saveLinked(id: string, graphPath: string, input: any) {
    return this.queue(async () => {
      await this.requireNoPendingTransaction();
      const kind = input.kind;
      if (kind !== "style" && kind !== "layout") throw new ServiceError("INVALID_KIND", "Expected style or layout.");
      const data = await this.read(id, graphPath);
      if (data.revision !== input.expectedRevision)
        throw new ServiceError(
          "FILE_CHANGED",
          "The graph changed outside Graph Studio. Reload before updating its association.",
          409,
        );
      const graph = JSON.parse(data.bytes.toString("utf8"));
      normalizeDagInput(graph);
      if (kind === "layout") parseLayoutConfigFile(input.document);
      else parseChartStyleFile(input.document, input.document?.chartType);
      let reference = graph.metadata?.[kind];
      if (reference === undefined) {
        const stem = `${basename(graphPath).replace(/\.json$/i, "")}.${input.document.chartType}`;
        let suffix = 0;
        do {
          reference = `${stem}${suffix ? `.${suffix}` : ""}.${kind}.json`;
          suffix++;
        } while (
          await this.filePath(id, resolveWorkspacePath(reference, graphPath))
            .then(() => true)
            .catch((e: any) => {
              if (e.code === "ENOENT") return false;
              throw e;
            })
        );
      }
      if (typeof reference !== "string")
        throw new ServiceError("INVALID_REFERENCE", "Invalid linked document reference.");
      const path = resolveWorkspacePath(reference, graphPath);
      if (!/\.json$/i.test(path) || path === graphPath || basename(path) === "graph-studio.workspace.json")
        throw new ServiceError("INVALID_REFERENCE", "Linked document must be a separate JSON file.");
      const previous = await this.read(id, path).catch((e: any) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (previous && JSON.parse(previous.bytes.toString("utf8")).format !== `graph-studio-${kind}`)
        throw new ServiceError("INVALID_TARGET", "Target is not a linked document of this kind.");
      const persistedDag = { ...graph, metadata: { ...graph.metadata, [kind]: reference } };
      const content = JSON.stringify(input.document, null, 2) + "\n";
      const graphContent = JSON.stringify(persistedDag, null, 2) + "\n";
      const journal = {
        id,
        writes: [
          { path, content, before: previous?.revision ?? null },
          { path: graphPath, content: graphContent, before: data.revision },
        ],
      };
      await atomicWrite(join(this.stateDirectory, "transaction.json"), JSON.stringify(journal));
      await this.applyJournal(journal);
      this.events.emit("change", { locationId: id, path });
      return { path, reference, persistedDag, revision: revision(graphContent) };
    });
  }
  fileIndex(id: string) {
    return this.fileOperations.index(id);
  }
  planFileOperation(id: string, input: FileMutationRequest) {
    return this.queue(() => this.fileOperations.plan(id, input));
  }
  mutateFile(id: string, planId: string, undo = false) {
    return this.queue(async () => {
      await this.requireNoPendingTransaction();
      this.stopWatching(id);
      try {
        const result = await (undo ? this.fileOperations.undo(id, planId) : this.fileOperations.commit(id, planId));
        const record = this.record(id);
        if (record.lastGraph === result.path) record.lastGraph = result.newPath;
        await this.persist();
        this.events.emit("change", { locationId: id, transactionId: result.transactionId });
        return result;
      } finally {
        this.startWatching(id);
      }
    });
  }
  private startWatching(id: string) {
    this.active.add(id);
    if (this.watchers.has(id)) return;
    const r = this.record(id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.events.emit("change", { locationId: id }), 250);
    };
    try {
      const watcher: FSWatcher = watch(r.location, { recursive: true }, (_event, file) => {
        if (
          !file ||
          !String(file)
            .split(/[\\/]/)
            .some((p) => p.startsWith(".") || ignored.has(p) || p.endsWith(".tmp"))
        )
          notify();
      });
      watcher.on("error", notify);
      this.watchers.set(id, {
        close: () => {
          watcher.close();
          clearTimeout(timer);
        },
      });
    } catch {
      let signature: string | undefined;
      let polling = false;
      let closed = false;
      const check = async () => {
        if (polling || closed) return;
        polling = true;
        try {
          const paths = r.kind === "workspace" ? await this.listFiles(id) : [basename(r.location)];
          const parts: string[] = [];
          for (const path of paths) {
            const data = await stat(await this.filePath(id, path));
            parts.push(`${path}:${data.size}:${data.mtimeMs}`);
          }
          const next = parts.join("\n");
          if (!closed && signature !== undefined && signature !== next) notify();
          signature = next;
        } catch {
          if (!closed) notify();
        } finally {
          polling = false;
        }
      };
      void check();
      const poll = setInterval(() => {
        void check();
      }, 3000);
      this.watchers.set(id, {
        close: () => {
          closed = true;
          clearInterval(poll);
          clearTimeout(timer);
        },
      });
    }
  }
  watchLocation(id: string) {
    this.record(id);
    this.startWatching(id);
  }
  stopWatching(id: string) {
    this.active.delete(id);
    this.watchers.get(id)?.close();
    this.watchers.delete(id);
  }
  async close() {
    for (const id of [...this.watchers.keys()]) this.stopWatching(id);
    await this.queue(async () => {});
    if (this.ownsLock) {
      await unlink(this.lockPath).catch(() => {});
      this.ownsLock = false;
    }
  }
}
