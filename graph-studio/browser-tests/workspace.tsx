// Development-only fixture. No real directory handles, storage or user files.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import "../src/styles/index.css";

const storage = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});
Object.defineProperty(window, "indexedDB", { value: { open: () => ({}) } });

function folder(name: string, nested = false, empty = false) {
  const source = { format: "graph-studio", version: 3, nodes: { A: { title: "Initial Node" } }, edges: [] };
  const files = new Map<string, string>(empty ? [] : [["graph.json", JSON.stringify(source)]]);
  if (nested)
    files.set(
      "nested.json",
      JSON.stringify({
        ...source,
        hierarchy: { id: "test-hierarchy", groups: { group: { title: "Test group" } }, parentById: { A: "group" } },
      }),
    );
  const handles = new Map<string, FileSystemFileHandle>();
  function fileHandle(path: string): FileSystemFileHandle {
    if (handles.has(path)) return handles.get(path)!;
    const handle = {
      kind: "file",
      name: path,
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      getFile: async () => new File([files.get(path)!], path, { type: "application/json" }),
      isSameEntry: async (other: unknown) => other === handle,
      createWritable: async () => {
        let content = files.get(path) || "";
        return {
          write: async (value: string) => {
            content = value;
          },
          close: async () => {
            files.set(path, content);
          },
          abort: async () => {},
        };
      },
    } as unknown as FileSystemFileHandle;
    handles.set(path, handle);
    return handle;
  }
  const directory = {
    kind: "directory",
    name,
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    isSameEntry: async (other: unknown) => other === directory,
    async *entries() {
      for (const path of files.keys()) yield [path, fileHandle(path)];
    },
    getFileHandle: async (path: string, options?: { create?: boolean }) => {
      if (!files.has(path)) {
        if (!options?.create) throw new DOMException("Missing file", "NotFoundError");
        files.set(path, "");
      }
      return fileHandle(path);
    },
    removeEntry: async (path: string) => {
      files.delete(path);
      handles.delete(path);
    },
  } as unknown as FileSystemDirectoryHandle;
  return directory;
}
const folders = { primary: folder("tmp", true), other: folder("tmp"), empty: folder("empty", false, true) };
window.showDirectoryPicker = async () => {
  const choice = (document.querySelector("#fixture-folder") as HTMLSelectElement).value;
  if (choice === "cancel") throw new DOMException("Cancelled", "AbortError");
  return folders[choice as keyof typeof folders];
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
