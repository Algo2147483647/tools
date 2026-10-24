interface PickedJsonFile {
  file: File;
  handle: FileSystemFileHandle | null;
  path: string;
}

export function supportsFilePicker(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function pickJsonFileHandle(description = "JSON configuration"): Promise<FileSystemFileHandle | null> {
  if (!supportsFilePicker()) return null;
  const [handle] = await window.showOpenFilePicker!({
    multiple: false,
    types: [{ accept: { "application/json": [".json"] }, description }],
  });
  return handle ?? null;
}

export async function pickDirectoryHandle(options: {
  mode: "read" | "readwrite";
  id: string;
}): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  return window.showDirectoryPicker!(options);
}

export async function openJsonFileWithAccess(): Promise<PickedJsonFile | null> {
  const handle = await pickJsonFileHandle();
  return handle ? { file: await handle.getFile(), handle, path: handle.name } : null;
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
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}
