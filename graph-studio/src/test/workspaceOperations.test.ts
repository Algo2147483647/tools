import assert from "node:assert/strict";
import { createWorkspaceOperations, openPreparedDocument } from "../workspace/operations";
import { createRecentLocationsStore } from "../workspace/recentLocationsStore";
import { resolveLocationIdentity } from "../workspace/locationIdentity";
import type { RecentLocation } from "../workspace/locations";
import { defineSuite, defineTest } from "./harness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const location: RecentLocation = { id: "folder", kind: "workspace", name: "tmp", location: "tmp", openedAt: 1, canReopen: true,
  handle: { name: "tmp", isSameEntry: async () => true } as unknown as FileSystemDirectoryHandle };

export const workspaceOperationsSuite = defineSuite("Workspace operation lifecycle", [
  defineTest("opening releases busy state before optional persistence and consecutive creations retain both records", async () => {
    const pending = deferred<void>();
    let busy = false;
    const store = createRecentLocationsStore({ readMetadata: () => [], writeMetadata: () => {},
      readIdentities: async () => [], writeIdentity: () => pending.promise });
    const operations = createWorkspaceOperations({ busy: (value) => { busy = value; }, notice: () => {}, generation: () => 0 });
    const opened: string[] = [];
    for (const id of ["B", "C"]) {
      await operations.run((context) => openPreparedDocument(context, async () => id, () => true,
        (name) => { opened.push(name); }, (name) => store.remember({ ...location, id: name })));
      assert.equal(busy, false);
      assert.equal(operations.isBusy(), false);
    }
    assert.deepEqual(opened, ["B", "C"]);
    assert.equal(store.getSnapshot().length, 2);
    pending.resolve();
  }),
  defineTest("cancelled replacement never commits or records the candidate", async () => {
    const events: string[] = [];
    const result = await openPreparedDocument({ isCurrent: () => true }, async () => "A", () => false,
      () => events.push("commit"), () => events.push("remember"));
    assert.equal(result, false);
    assert.deepEqual(events, []);
  }),
  defineTest("overlapping operations are refused and late results cannot replace a newer document", async () => {
    const prepared = deferred<string>();
    let generation = 1;
    let commits = 0;
    const operations = createWorkspaceOperations({ busy: () => {}, notice: () => {}, generation: () => generation });
    const first = operations.run((context) => openPreparedDocument(context, () => prepared.promise, () => true,
      () => { commits++; }, () => {}));
    assert.equal(await operations.run(async () => { commits++; }), undefined);
    generation++;
    prepared.resolve("old");
    await first;
    assert.equal(commits, 0);
    assert.equal(operations.isBusy(), false);
  }),
  defineTest("picker cancellation and errors both unlock the next operation", async () => {
    const notices: string[] = [];
    const operations = createWorkspaceOperations({ busy: () => {}, notice: (value) => notices.push(value), generation: () => 0 });
    await operations.run(async () => { throw new DOMException("cancelled", "AbortError"); });
    await operations.run(async () => { throw new Error("write failed"); });
    assert.deepEqual(notices, ["", "", "write failed"]);
    assert.equal(await operations.run(async () => "ready"), "ready");
  }),
  defineTest("removal preserves identity across hydration and a simulated reload", async () => {
    let metadata: RecentLocation[] = [location];
    const persisted = new Map([[location.id, location]]);
    const ports = { readMetadata: () => metadata, writeMetadata: (items: RecentLocation[]) => { metadata = items; },
      readIdentities: async () => [...persisted.values()], writeIdentity: async (item: RecentLocation) => { persisted.set(item.id, item); } };
    const store = createRecentLocationsStore(ports);
    const hydrating = store.hydrate();
    store.remove(location.id);
    await hydrating;
    assert.deepEqual(store.getSnapshot(), []);
    const reloaded = createRecentLocationsStore(ports);
    const id = await reloaded.identify({ ...location, id: undefined, handle: { ...location.handle! } });
    assert.equal(id, location.id);
    assert.deepEqual(reloaded.getSnapshot(), []);
  }),
  defineTest("same-name folders and verifiable reconnection mismatches retain separate identities", async () => {
    const handle = { name: "tmp", isSameEntry: async () => false } as unknown as FileSystemDirectoryHandle;
    assert.notEqual(await resolveLocationIdentity({ ...location, handle }, [location]), location.id);
    assert.notEqual(await resolveLocationIdentity({ ...location, id: undefined, handle }, [location]), location.id);
    assert.equal(await resolveLocationIdentity({ ...location, handle }, [{ ...location, handle: undefined }]), location.id);
  }),
]);
