export interface PickedJsonFile {
  file: File;
  handle: FileSystemFileHandle | null;
  path: string;
}

export interface PickedJsonCollection {
  files: PickedJsonFile[];
  name: string;
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export async function openJsonFileWithAccess(): Promise<PickedJsonFile | null> {
  const collection = await openJsonFilesWithAccess();
  return collection.files[0] || null;
}

export async function openJsonFilesWithAccess(): Promise<PickedJsonCollection> {
  if (typeof window.showOpenFilePicker !== "function") {
    return { files: [], name: "selected-files.json" };
  }

  const handles = await window.showOpenFilePicker({
    excludeAcceptAllOption: false,
    multiple: true,
    types: [{
      accept: { "application/json": [".json"] },
      description: "JSON graph documents",
    }],
  });

  const files = await Promise.all(
    (handles || []).map(async (handle) => ({
      file: await handle.getFile(),
      handle,
      path: handle.name,
    })),
  );

  return {
    files,
    name: files.length === 1 ? files[0].file.name : "selected-json-files.json",
  };
}

export async function openJsonDirectoryWithAccess(): Promise<PickedJsonCollection | null> {
  if (typeof window.showDirectoryPicker !== "function") {
    return null;
  }

  const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
  const files: PickedJsonFile[] = [];
  await collectJsonFilesFromDirectory(directoryHandle, "", files);

  return {
    files,
    name: `${directoryHandle.name || "folder"}-merged.json`,
    directoryHandle,
  };
}

export async function createJsonCollectionFromFileHandles(
  handles: FileSystemFileHandle[],
  paths: string[] = [],
  name = "selected-json-files.json",
): Promise<PickedJsonCollection> {
  const files = await Promise.all(
    handles.map(async (handle, index) => ({
      file: await handle.getFile(),
      handle,
      path: paths[index] || handle.name,
    })),
  );

  return {
    files,
    name: files.length === 1 ? files[0].file.name : name,
  };
}

export async function createJsonCollectionFromDirectoryHandle(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<PickedJsonCollection> {
  const files: PickedJsonFile[] = [];
  await collectJsonFilesFromDirectory(directoryHandle, "", files);

  return {
    files,
    name: `${directoryHandle.name || "folder"}-merged.json`,
    directoryHandle,
  };
}

export async function readJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}

export function canOverwrite(fileHandle: FileSystemFileHandle | null): boolean {
  return Boolean(fileHandle && typeof fileHandle.createWritable === "function");
}

export async function requestWritablePermission(fileHandle: FileSystemFileHandle): Promise<boolean> {
  if (typeof fileHandle.queryPermission === "function") {
    const permission = await fileHandle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      return true;
    }
  }

  if (typeof fileHandle.requestPermission === "function") {
    const permission = await fileHandle.requestPermission({ mode: "readwrite" });
    return permission === "granted";
  }

  return true;
}

export async function writeJsonToHandle(fileHandle: FileSystemFileHandle, content: string): Promise<void> {
  if (!fileHandle.createWritable) {
    throw new Error("File overwrite is not supported in this browser.");
  }
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function hasReadPermission(handle: { queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState> }): Promise<boolean> {
  if (typeof handle.queryPermission !== "function") {
    return true;
  }

  const permission = await handle.queryPermission({ mode: "read" });
  return permission === "granted";
}

async function collectJsonFilesFromDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  relativePath: string,
  output: PickedJsonFile[],
): Promise<void> {
  if (typeof directoryHandle.entries !== "function") {
    return;
  }

  for await (const [entryName, handle] of directoryHandle.entries()) {
    const entryPath = `${relativePath}${entryName}`;
    if (isDirectoryHandle(handle)) {
      await collectJsonFilesFromDirectory(handle, `${entryPath}/`, output);
      continue;
    }
    if (isJsonFileName(entryName)) {
      output.push({
        file: await handle.getFile(),
        handle,
        path: entryPath,
      });
    }
  }
}

function isDirectoryHandle(handle: FileSystemFileHandle | FileSystemDirectoryHandle): handle is FileSystemDirectoryHandle {
  return handle.kind === "directory" || typeof (handle as unknown as FileSystemDirectoryHandle).entries === "function";
}

function isJsonFileName(fileName: string): boolean {
  return /\.json$/i.test(fileName);
}
