import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { atomicWrite, readBytes, ServiceError } from "./files";
import { analyzeReferences, referenceTextFile } from "../src/workspace/referenceAdapters";
import type {
  FileMutationPlan,
  FileMutationRequest,
  FileMutationResult,
  WorkspaceReferenceIndex,
} from "../src/workspace/fileContracts";

interface Host {
  listFiles(id: string): Promise<string[]>;
  filePath(id: string, path: string, missing?: boolean): Promise<string>;
  read(id: string, path: string): Promise<{ bytes: Buffer; revision: string }>;
}
type Change = { path: string; before: string | null; after: string | null };
type StoredPlan = {
  workspace: string;
  plan: FileMutationPlan;
  revisions: Record<string, string>;
  paths: string[];
  changes: Change[];
};
type Journal = { id: string; workspace: string; changes: Change[]; state: "pending" | "committed" | "undone" };
export class WorkspaceFileOperations {
  private plans = new Map<string, StoredPlan>();
  private cache = new Map<string, { revision: string; analysis: ReturnType<typeof analyzeReferences> }>();
  private identities = new Map<string, string>();
  constructor(
    private host: Host,
    private stateDirectory: string,
  ) {}
  private directory() {
    return join(this.stateDirectory, "file-operations");
  }
  async index(workspace: string): Promise<WorkspaceReferenceIndex> {
    const paths = await this.host.listFiles(workspace);
    const canonical = new Map(paths.map((path) => [path.toLowerCase(), path]));
    const files: WorkspaceReferenceIndex["files"] = [],
      references: WorkspaceReferenceIndex["references"] = [];
    for (const path of paths) {
      const key = workspace + ":" + path;
      if (!this.identities.has(key)) this.identities.set(key, randomUUID());
      try {
        const data = await this.host.read(workspace, path);
        let status: "complete" | "opaque" = "opaque";
        if (referenceTextFile.test(path)) {
          let cached = this.cache.get(key);
          if (cached?.revision !== data.revision) {
            cached = { revision: data.revision, analysis: analyzeReferences(path, data.bytes.toString("utf8")) };
            this.cache.set(key, cached);
          }
          references.push(
            ...cached.analysis.links.map((link) =>
              process.platform === "win32"
                ? { ...link, target: canonical.get(link.target.toLowerCase()) || link.target }
                : link,
            ),
          );
          status = "complete";
        }
        files.push({ id: this.identities.get(key)!, path, revision: data.revision, status });
      } catch (error) {
        files.push({
          id: this.identities.get(key)!,
          path,
          revision: "",
          status: "failed",
          message: (error as Error).message,
        });
      }
    }
    for (const key of this.cache.keys())
      if (key.startsWith(workspace + ":") && !paths.includes(key.slice(workspace.length + 1))) this.cache.delete(key);
    return { files, references, complete: files.every((f) => f.status !== "failed") };
  }
  async plan(workspace: string, input: FileMutationRequest): Promise<FileMutationPlan> {
    if (!input || !["rename", "delete"].includes(input.kind) || typeof input.path !== "string")
      throw new ServiceError("INVALID_OPERATION", "Choose a file and operation.");
    const index = await this.index(workspace),
      source = index.files.find((f) => f.path === input.path);
    if (!source) throw new ServiceError("FILE_NOT_FOUND", "The file is no longer in the workspace.", 404);
    if (!index.complete)
      throw new ServiceError(
        "INCOMPLETE_SCAN",
        "Resolve file scanning errors before modifying workspace references.",
        409,
      );
    let newPath: string | undefined;
    if (input.kind === "rename") {
      const name = input.name?.trim();
      if (
        !name ||
        name !== input.name ||
        /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
        /[. ]$/.test(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
      )
        throw new ServiceError("INVALID_NAME", "Use a valid file name without folders.");
      if (
        name.slice(name.lastIndexOf(".")).toLowerCase() !==
        basename(input.path).slice(basename(input.path).lastIndexOf(".")).toLowerCase()
      )
        throw new ServiceError("INVALID_EXTENSION", "Keep the existing file extension.");
      newPath = (dirname(input.path) === "." ? "" : dirname(input.path).replace(/\\/g, "/") + "/") + name;
      // Case-only moves are rejected instead of depending on platform-specific alias behavior.
      if (index.files.some((f) => f.path.toLowerCase() === newPath!.toLowerCase()))
        throw new ServiceError("FILE_EXISTS", "A file with that name already exists.", 409);
      await this.host.filePath(workspace, newPath, true);
    }
    const references = index.references.filter((r) => r.target === input.path),
      affected = new Set(references.map((r) => r.source));
    if (
      newPath &&
      /[?#]/.test(newPath) &&
      references.some(
        (r) => r.locator === "/metadata/style" || r.locator === "/metadata/layout" || r.locator.startsWith("/graphs/"),
      )
    )
      throw new ServiceError("INVALID_NAME", "Linked configuration and manifest paths cannot contain ? or #.");
    const changes: Change[] = [];
    for (const path of affected) {
      if (path === input.path && input.kind === "delete") continue;
      const data = await this.host.read(workspace, path);
      if (data.revision !== index.files.find((f) => f.path === path)!.revision)
        throw new ServiceError("FILE_CHANGED", "Files changed while preparing the operation. Try again.", 409);
      const updated = analyzeReferences(path, data.bytes.toString("utf8")).rewrite(
        input.path,
        newPath,
        process.platform === "win32",
      );
      if (/\.json$/i.test(path)) JSON.parse(updated);
      changes.push({ path, before: data.bytes.toString("base64"), after: Buffer.from(updated).toString("base64") });
    }
    const sourceData = await this.host.read(workspace, input.path);
    if (sourceData.revision !== source.revision)
      throw new ServiceError("FILE_CHANGED", "File changed. Prepare the operation again.", 409);
    const own = changes.find((c) => c.path === input.path);
    if (newPath)
      changes.push({ path: newPath, before: null, after: own?.after || sourceData.bytes.toString("base64") });
    if (own) own.after = null;
    else changes.push({ path: input.path, before: sourceData.bytes.toString("base64"), after: null });
    const id = randomUUID();
    const plan: FileMutationPlan = {
      id,
      kind: input.kind,
      path: input.path,
      newPath,
      references,
      changes: changes.map((c) => ({
        path: c.path,
        before: c.before === null ? null : "existing",
        after: c.after === null ? null : "updated",
      })),
    };
    this.plans.set(id, {
      workspace,
      plan,
      revisions: Object.fromEntries(index.files.map((f) => [f.path, f.revision])),
      paths: index.files.map((f) => f.path),
      changes,
    });
    while (this.plans.size > 20) this.plans.delete(this.plans.keys().next().value!);
    return plan;
  }
  private async current(workspace: string, path: string) {
    return readBytes(await this.host.filePath(workspace, path, true))
      .then((b) => b.toString("base64"))
      .catch((e: any) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
  }
  private async write(workspace: string, path: string, value: string | null) {
    const target = await this.host.filePath(workspace, path, true);
    if (value === null)
      await unlink(target).catch((e: any) => {
        if (e.code !== "ENOENT") throw e;
      });
    else await atomicWrite(target, Buffer.from(value, "base64"));
  }
  private async apply(journal: Journal) {
    for (const c of journal.changes)
      if ((await this.current(journal.workspace, c.path)) !== c.before)
        throw new ServiceError("FILE_CHANGED", `File changed: ${c.path}. Prepare the operation again.`, 409);
    await mkdir(this.directory(), { recursive: true });
    const path = join(this.directory(), journal.id + ".json");
    await atomicWrite(path, JSON.stringify(journal));
    try {
      for (const c of journal.changes) {
        if ((await this.current(journal.workspace, c.path)) !== c.before)
          throw new ServiceError("FILE_CHANGED", `Concurrent edit: ${c.path}`, 409);
        await this.write(journal.workspace, c.path, c.after);
      }
      journal.state = "committed";
      await atomicWrite(path, JSON.stringify(journal));
    } catch (error) {
      await this.rollback(journal);
      await unlink(path);
      throw error;
    }
  }
  private async rollback(journal: Journal) {
    for (const c of [...journal.changes].reverse()) {
      const current = await this.current(journal.workspace, c.path);
      if (current === c.before) continue;
      if (current !== c.after)
        throw new ServiceError(
          "RECOVERY_CONFLICT",
          `Recovery conflicts with external edits: ${c.path}. The recovery journal has been preserved.`,
          409,
        );
      await this.write(journal.workspace, c.path, c.before);
    }
  }
  async requireNoPending() {
    await mkdir(this.directory(), { recursive: true });
    for (const file of await readdir(this.directory())) {
      if (!file.endsWith(".json")) continue;
      const journal = JSON.parse(await readFile(join(this.directory(), file), "utf8")) as Journal;
      if (journal.state === "pending")
        throw new ServiceError(
          "RECOVERY_REQUIRED",
          "A file operation needs recovery. Restart Graph Studio before writing more files.",
          409,
        );
    }
  }
  async recover() {
    await mkdir(this.directory(), { recursive: true });
    for (const file of await readdir(this.directory())) {
      if (!file.endsWith(".json")) continue;
      const path = join(this.directory(), file),
        journal = JSON.parse(await readFile(path, "utf8")) as Journal;
      if (journal.state === "pending") {
        await this.rollback(journal);
        await unlink(path);
      }
    }
  }
  async commit(workspace: string, id: string): Promise<FileMutationResult> {
    const stored = this.plans.get(id);
    if (!stored || stored.workspace !== workspace)
      throw new ServiceError("PLAN_EXPIRED", "Prepare the operation again.", 409);
    const paths = await this.host.listFiles(workspace);
    if (JSON.stringify(paths) !== JSON.stringify(stored.paths))
      throw new ServiceError("WORKSPACE_CHANGED", "Workspace files changed. Prepare the operation again.", 409);
    for (const path of paths)
      if ((await this.host.read(workspace, path)).revision !== stored.revisions[path])
        throw new ServiceError("FILE_CHANGED", `File changed: ${path}. Prepare the operation again.`, 409);
    await this.apply({ id, workspace, changes: stored.changes, state: "pending" });
    this.plans.delete(id);
    const { plan } = stored;
    if (plan.newPath) {
      const old = workspace + ":" + plan.path;
      this.identities.set(workspace + ":" + plan.newPath, this.identities.get(old)!);
      this.identities.delete(old);
    }
    return {
      caseInsensitive: process.platform === "win32",
      transactionId: id,
      undoId: id,
      kind: plan.kind,
      path: plan.path,
      newPath: plan.newPath,
      changedPaths: stored.changes.map((c) => c.path),
    };
  }
  async undo(workspace: string, id: string): Promise<FileMutationResult> {
    if (!/^[\da-f-]{36}$/i.test(id)) throw new ServiceError("INVALID_TRANSACTION", "Invalid transaction.");
    const path = join(this.directory(), id + ".json"),
      previous = JSON.parse(await readFile(path, "utf8")) as Journal;
    if (previous.workspace !== workspace || previous.state !== "committed")
      throw new ServiceError("UNDO_UNAVAILABLE", "This operation cannot be undone.", 409);
    const undoId = randomUUID(),
      changes = [...previous.changes].reverse().map((c) => ({ path: c.path, before: c.after, after: c.before }));
    // Do not resurrect stale references introduced after the original operation.
    const index = await this.index(workspace);
    if (!index.complete) throw new ServiceError("INCOMPLETE_SCAN", "Resolve scanning errors before undo.", 409);
    const removing = changes.filter((c) => c.after === null).map((c) => c.path);
    if (index.references.some((r) => removing.includes(r.target) && !changes.some((c) => c.path === r.source)))
      throw new ServiceError("UNDO_CONFLICT", "New references depend on this file. Undo is no longer safe.", 409);
    await this.apply({ id: undoId, workspace, changes, state: "pending" });
    const restored = changes.find((c) => c.before === null && c.after !== null);
    const removed = changes.find((c) => c.after === null && c.before !== null);
    if (restored && removed) {
      const identity = this.identities.get(workspace + ":" + removed.path);
      if (identity) this.identities.set(workspace + ":" + restored.path, identity);
      this.identities.delete(workspace + ":" + removed.path);
    }
    previous.state = "undone";
    await atomicWrite(path, JSON.stringify(previous));
    return {
      caseInsensitive: process.platform === "win32",
      transactionId: undoId,
      undoId,
      kind: "undo",
      path: changes.find((c) => c.after === null)?.path || "",
      newPath: changes.find((c) => c.before === null)?.path,
      changedPaths: changes.map((c) => c.path),
    };
  }
}
