import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';
import type { Run, Patch, Edit } from './shared/contracts';
import { commandNames, type CommandName } from './shared/ipc';
const commands = new Set<string>(commandNames);
function subscribe<T>(channel: string, callback: (value: T) => void) { const handler = (_event: IpcRendererEvent, value: T) => callback(value); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); }
contextBridge.exposeInMainWorld('workspace', {
    platform: process.platform,
    command: (name: CommandName, payload?: unknown) => { if (!commands.has(name))
        return Promise.reject(Error('Unknown command.')); return ipcRenderer.invoke('workspace:command', name, payload); },
    onRun: (callback: (run: Run) => void) => subscribe('workspace:run', callback),
    onDelta: (callback: (patch: Patch) => void) => subscribe('workspace:delta', callback),
    onEdit: (callback: (edit: Edit) => void) => subscribe('workspace:edit', callback)
});
