import {shutdownProcesses} from './platform/executor.js';
import { registerCommands } from './platform/commands.js';
import type { RunService } from './application/runs.js';
import { appRoot } from './platform/runtime.js';
import type { MenuItemConstructorOptions } from 'electron';
const { app, BrowserWindow, Menu, net, safeStorage } = require('electron') as typeof import('electron');
const path = require('node:path') as typeof import('node:path');
import { createRunService } from './platform/composition.js';
const { SettingsStore } = require('./platform/settings-store.js') as typeof import('./platform/settings-store.js');
let settingsStore: InstanceType<typeof SettingsStore>;
const entry = path.join(appRoot, 'renderer', 'index.html');
const sessions = new Map<number, RunService>();
const pendingCleanups = new Set<Promise<void>>();
async function createWindow() {
    const win = new BrowserWindow({ width: 1360, height: 900, minWidth: 900, minHeight: 600,
        title: 'Math Workspace', backgroundColor: '#f5f6f8',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'math-session' } });
    const service = createRunService({ notifyEdit: edit => { if (!win.isDestroyed())
            win.webContents.send('workspace:edit', edit); }, request: (url, options) => net.fetch(String(url), options), notify: run => {
            if (!win.isDestroyed())
                win.webContents.send('workspace:run', run);
        }, notifyDelta: patch => { if (!win.isDestroyed())
            win.webContents.send('workspace:delta', patch); } });
    let settingsError = '';
    try {
        const saved = await settingsStore.load();
        if (saved)
            service.configure(saved);
    }
    catch (error) {
        settingsError = error.message;
    }
    service.settingsError = settingsError;
    const sessionId=win.webContents.id;
    sessions.set(sessionId, service);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('closed', () => { const cleanup=service.dispose();pendingCleanups.add(cleanup);void cleanup.catch(()=>{}).finally(()=>pendingCleanups.delete(cleanup));sessions.delete(sessionId); });
    win.loadFile(entry);
}
app.whenReady().then(() => {
    settingsStore = new SettingsStore(app.getPath('userData'), safeStorage);
    registerCommands(sessions, settingsStore, entry);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
        { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] }
    ]));
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length)
        createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    app.quit(); });

app.once('before-quit', event => { event.preventDefault(); void (async()=>{const closing=[...sessions.values()].map(service=>service.dispose());await shutdownProcesses();await Promise.allSettled([...pendingCleanups,...closing]);})().finally(() => app.quit()); });
