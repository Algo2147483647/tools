import { ipcMain, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '../ai/providers.js';
import type { RunService } from '../application/runs.js';
import type { SettingsStore } from './settings-store.js';
export function registerCommands(sessions: Map<number, RunService>, settingsStore: SettingsStore, entry: string) {
    ipcMain.handle('workspace:command', async (event, command, payload) => {
        if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(entry).href)
            throw Error('Untrusted IPC sender.');
        const service = sessions.get(event.sender.id);
        if (!service)
            throw Error("Session closed.");
        try {
            let value;
            switch (command) {
                case 'bootstrap':
                    value = { presets: PRESETS, settings: service.publicSettings(), runs: service.list(), settingsError: service.settingsError, cachedModels: service.settings ? settingsStore.models(service.settings) || [] : [] };
                    break;
                case 'importDataset': {
                    if (service.active)
                        throw Error('Wait for the current run before importing data.');
                    const picked = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, { properties: ['openFile'], filters: [{ name: 'Data', extensions: ['csv', 'tsv'] }] });
                    if (picked.canceled) {
                        value = null;
                        break;
                    }
                    const filename = picked.filePaths[0];
                    if ((await fs.stat(filename)).size > 2 * 1024 * 1024)
                        throw Error('Dataset exceeds 2 MB.');
                    const bytes = await fs.readFile(filename);
                    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                    value = service.datasets.import(path.basename(filename), text);
                    break;
                }
                case 'editorSync':
                    value = service.document.update(payload.text);
                    break;
                case 'editorAck':
                    service.document.acknowledge(payload);
                    break;
                case 'get':
                    value = service.get(payload);
                    break;
                case 'artifact':
                    value = service.artifacts.get(payload.runId, payload.id);
                    break;
                case 'start':
                    value = service.start(payload);
                    break;
                case 'cancel':
                    await service.cancel(payload);
                    break;
                case 'configure': {
                    const previous = service.settings;
                    value = service.configure(payload);
                    try {
                        await settingsStore.save(service.settings);
                    }
                    catch (error) {
                        service.settings = previous;
                        throw error;
                    }
                    break;
                }
                case 'models': {
                    const resolved = service.resolveSettings(payload);
                    value = !payload.refresh && settingsStore.models(resolved);
                    if (!value) {
                        value = await service.settingOperation('models', payload);
                        settingsStore.cache.set(settingsStore.key(resolved), { at: Date.now(), models: value });
                        if (service.settings)
                            await settingsStore.save(service.settings);
                    }
                    break;
                }
                case 'test':
                    value = await service.settingOperation(command, payload);
                    break;
                case 'clear':
                    service.clear();
                    break;
                default: throw Error('Unknown command.');
            }
            return { ok: true, value };
        }
        catch (error) {
            return { ok: false, error: { code: error.code || 'COMMAND_FAILED', message: error.message } };
        }
    });
}
