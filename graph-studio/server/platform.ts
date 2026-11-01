import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { windowsFolderDialogSource } from "./windows-folder-dialog";

const run = promisify(execFile);
const children = new Set<ChildProcess>();
const execute: typeof run = ((...args: Parameters<typeof run>) => {
  const operation = run(...args);
  children.add(operation.child);
  void operation.finally(() => children.delete(operation.child)).catch(() => {});
  return operation;
}) as typeof run;
export function closePlatformProcesses() {
  for (const child of children) child.kill();
}
export type DialogKind = "directory" | "file" | "save";

export async function choosePath(kind: DialogKind, suggestedName = "graph.json"): Promise<string | null> {
  try {
    if (process.platform === "win32") {
      const script = `
        $ErrorActionPreference = 'Stop'
        [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
        if ($env:GS_DIALOG_KIND -eq 'directory') {
          Add-Type -TypeDefinition @'
${windowsFolderDialogSource}
'@
          $folder = New-Object GraphStudio.FolderDialog
          try { $folder.Show() } finally { $folder.Dispose() }
          exit
        }
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = if ($env:GS_DIALOG_KIND -eq 'save') { New-Object System.Windows.Forms.SaveFileDialog }
          else { New-Object System.Windows.Forms.OpenFileDialog }
        $dialog.AutoUpgradeEnabled = $true
        $dialog.Filter = 'Graph JSON (*.json)|*.json|All files (*.*)|*.*'
        if ($env:GS_DIALOG_KIND -eq 'save') { $dialog.FileName = $env:GS_SUGGESTED_NAME }
        try {
          if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $dialog.FileName
          }
        } finally { $dialog.Dispose() }
      `;
      const result = await execute(
        "powershell.exe",
        ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
        {
          windowsHide: true,
          env: { ...process.env, PSModulePath: "", GS_DIALOG_KIND: kind, GS_SUGGESTED_NAME: suggestedName },
        },
      );
      return result.stdout.trim() || null;
    }
    if (process.platform === "darwin") {
      const action = kind === "directory" ? "choose folder" : kind === "save" ? "choose file name" : "choose file";
      const result = await execute("osascript", [
        "-e",
        `try\nreturn POSIX path of (${action} with prompt "Graph Studio")\non error number -128\nreturn ""\nend try`,
      ]);
      return result.stdout.trim() || null;
    }
    const args = ["--file-selection", "--title=Graph Studio"];
    if (kind === "directory") args.push("--directory");
    if (kind === "save") args.push("--save", "--confirm-overwrite", `--filename=${suggestedName}`);
    const result = await execute("zenity", args);
    return result.stdout.trim() || null;
  } catch (error: any) {
    if (process.platform === "linux" && error.code === 1) return null;
    throw new Error(`System file dialog unavailable. ${error.message}`);
  }
}

export async function openExternal(path: string): Promise<void> {
  if (process.platform === "win32") {
    const script = "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:GS_OPEN_PATH";
    await execute(
      "powershell.exe",
      ["-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      {
        windowsHide: true,
        env: { ...process.env, PSModulePath: "", GS_OPEN_PATH: path },
      },
    );
  } else await execute(process.platform === "darwin" ? "open" : "xdg-open", [path]);
}
