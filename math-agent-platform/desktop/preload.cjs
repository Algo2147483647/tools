const { contextBridge, ipcRenderer } = require('electron');
const commands = new Set(['bootstrap', 'importDataset', 'get', 'artifact', 'start', 'cancel', 'configure', 'models', 'test', 'clear']);
contextBridge.exposeInMainWorld('workspace', {
  platform: process.platform,
  command: (name, payload) => {
    if (!commands.has(name)) return Promise.reject(Error('Unknown command.'));
    return ipcRenderer.invoke('workspace:command', name, payload);
  },
  onDelta: callback => { const handler = (_event, patch) => callback(patch); ipcRenderer.on('workspace:delta', handler); return () => ipcRenderer.removeListener('workspace:delta', handler); },
  onRun: callback => {
    const handler = (_event, run) => callback(run);
    ipcRenderer.on('workspace:run', handler);
    return () => ipcRenderer.removeListener('workspace:run', handler);
  }
});
