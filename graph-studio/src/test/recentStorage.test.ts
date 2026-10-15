import assert from "node:assert/strict";
import { loadRecentLocations, rememberLocation } from "../adapters/recentImport";
import { defineSuite, defineTest } from "./harness";

async function withStorage(open: () => unknown, test: (metadata: () => string) => Promise<void>) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDatabase = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let metadata = "[]";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => metadata,
        setItem: (_key: string, value: string) => {
          metadata = value;
        },
      },
    },
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open } });
  try {
    await test(() => metadata);
  } finally {
    for (const [key, descriptor] of [
      ["window", previousWindow],
      ["indexedDB", previousDatabase],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const handle = { name: "tmp" } as FileSystemDirectoryHandle;
const location = { kind: "workspace" as const, name: "tmp", location: "tmp", handle, lastGraph: "A.json" };

export const recentStorageSuite = defineSuite("Local workspace recent storage failures", [
  defineTest("consecutive creations keep the latest metadata and persist handles in order", async () => {
    const writes: string[] = [];
    const finish: Array<() => void> = [];
    let firstStarted!: () => void;
    let secondStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const secondWrite = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    await withStorage(
      () => {
        const request = {
          result: {
            close: () => {},
            transaction: () => {
              const transaction = {
                oncomplete: null as (() => void) | null,
                objectStore: () => ({
                  put: (item: { lastGraph: string }) => {
                    writes.push(item.lastGraph);
                    finish.push(() => transaction.oncomplete?.());
                    if (writes.length === 1) firstStarted();
                    else secondStarted();
                    return {};
                  },
                }),
              };
              return transaction;
            },
          },
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onsuccess?.call(request, {} as Event));
        return request;
      },
      async (metadata) => {
        const first = rememberLocation({ ...location, id: "tmp", lastGraph: "B.json" }, []);
        await firstWrite;
        const second = rememberLocation({ ...location, id: "tmp", lastGraph: "C.json" }, []);
        assert.equal(JSON.parse(metadata())[0].lastGraph, "C.json");
        assert.deepEqual(writes, ["B.json"]);
        finish[0]();
        await secondWrite;
        finish[1]();
        await Promise.all([first, second]);
        assert.deepEqual(writes, ["B.json", "C.json"]);
        assert.equal(JSON.parse(metadata())[0].lastGraph, "C.json");
      },
    );
  }),
  defineTest("a blocked database does not trap local workspace opening and keeps its live handle", async () => {
    let calls = 0;
    await withStorage(
      () => {
        calls++;
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => request.onblocked?.call(request, {} as IDBVersionChangeEvent));
        return request;
      },
      async (metadata) => {
        const result = await rememberLocation(location, []);
        assert.equal(calls, 1, "known locations avoid a redundant database read");
        assert.equal(result.items[0].handle, handle);
        assert.equal(result.items[0].canReopen, true);
        assert.equal(JSON.parse(metadata())[0].lastGraph, "A.json");
      },
    );
  }),
  defineTest("a silent database open times out and closes a connection that arrives later", async () => {
    let request: IDBOpenDBRequest;
    let closed = false;
    await withStorage(
      () => {
        request = {
          result: {
            close: () => {
              closed = true;
            },
          },
        } as unknown as IDBOpenDBRequest;
        return request;
      },
      async () => {
        const result = await rememberLocation(location, []);
        assert.equal(result.items[0].lastGraph, "A.json");
        request.onsuccess?.call(request, {} as Event);
        assert.equal(closed, true);
      },
    );
  }),
  defineTest("a stalled handle transaction is aborted and closes its database", async () => {
    let aborted = false;
    let closed = false;
    const transaction = {
      objectStore: () => ({ put: () => ({}) }),
      abort: () => {
        aborted = true;
      },
    };
    await withStorage(
      () => {
        const request = {
          result: {
            transaction: () => transaction,
            close: () => {
              closed = true;
            },
          },
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onsuccess?.call(request, {} as Event));
        return request;
      },
      async () => {
        const result = await rememberLocation(location, []);
        assert.equal(result.items[0].handle, handle);
        assert.equal(aborted, true);
        assert.equal(closed, true);
      },
    );
  }),
  defineTest("database version changes release the connection for other tabs", async () => {
    let closed = false;
    const db = {
      close: () => {
        closed = true;
      },
      onversionchange: null as (() => void) | null,
      transaction: () => {
        const transaction = {
          objectStore: () => ({ getAll: () => ({ result: [] }) }),
          oncomplete: null as (() => void) | null,
        };
        queueMicrotask(() => {
          db.onversionchange?.();
          transaction.oncomplete?.();
        });
        return transaction;
      },
    };
    await withStorage(
      () => {
        const request = { result: db } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onsuccess?.call(request, {} as Event));
        return request;
      },
      async () => {
        assert.deepEqual(await loadRecentLocations(), []);
        assert.equal(closed, true);
      },
    );
  }),
  defineTest("unresponsive old directory handles cannot trap a new workspace opening", async () => {
    await withStorage(
      () => {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => request.onblocked?.call(request, {} as IDBVersionChangeEvent));
        return request;
      },
      async () => {
        const pendingHandle = {
          ...handle,
          isSameEntry: () => new Promise<boolean>(() => {}),
        } as FileSystemDirectoryHandle;
        const old = { ...location, id: "old", openedAt: 1, canReopen: true };
        const result = await rememberLocation({ ...location, handle: pendingHandle }, [old]);
        assert.notEqual(result.id, "old");
        assert.equal(result.items[0].handle, pendingHandle);
        assert.equal(result.items[1].id, "old");
      },
    );
  }),
]);
