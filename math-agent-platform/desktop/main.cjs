const { app, BrowserWindow, Menu, ipcMain, net, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { RunService } = require('./application/runs.cjs');
const { PRESETS } = require('./ai/providers.cjs');
const entry = path.join(__dirname, 'renderer', 'index.html');
const sessions = new Map();
function createWindow() {
  const win = new BrowserWindow({ width: 1360, height: 900, minWidth: 900, minHeight: 600,
    title: 'Math Workspace', backgroundColor: '#f5f6f8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'math-session' } });
  const service = new RunService({ request: (url, options) => net.fetch(url, options), notify: run => {
    if (!win.isDestroyed()) win.webContents.send('workspace:run', run);
  }, notifyDelta: patch => { if (!win.isDestroyed()) win.webContents.send('workspace:delta', patch); } });
  sessions.set(win.webContents.id, service);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.on('closed', () => { service.dispose(); sessions.delete(win.webContents.id); });
  win.loadFile(entry);
}
app.whenReady().then(() => {
  ipcMain.handle('workspace:command', async (event, command, payload) => {
    if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(entry).href) throw Error('Untrusted IPC sender.');
    const service = sessions.get(event.sender.id);
    try {
      let value;
      switch (command) {
        case 'bootstrap': value = { presets: PRESETS, settings: service.publicSettings(), runs: service.list() }; break;
        case 'importDataset': {
          if (service.active) throw Error('Wait for the current run before importing data.');
          const picked = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile'], filters: [{ name: 'Data', extensions: ['csv','tsv'] }] });
          if (picked.canceled) { value = null; break; }
          const filename = picked.filePaths[0];
          if ((await fs.stat(filename)).size > 2 * 1024 * 1024) throw Error('Dataset exceeds 2 MB.');
          const bytes = await fs.readFile(filename);
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          value = service.datasets.import(path.basename(filename), text); break;
        }
        case 'get': value = service.get(payload); break;
        case 'artifact': value = service.artifacts.get(payload.runId, payload.id); break;
        case 'start': value = service.start(payload); break;
        case 'cancel': await service.cancel(payload); break;
        case 'configure': value = service.configure(payload); break;
        case 'models': case 'test': value = await service.settingOperation(command, payload); break;
        case 'clear': service.clear(); break;
        default: throw Error('Unknown command.');
      }
      return { ok: true, value };
    } catch (error) { return { ok: false, error: { code: error.code || 'COMMAND_FAILED', message: error.message } }; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] }
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
