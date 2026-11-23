import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { get } from 'node:http';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const localPython = join(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.ZERO_PYTHON || localPython;
const port = Number(process.argv[2] || process.env.ZERO_API_PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Port must be an integer in 1–65535 range');
const frontend = join(root, 'frontend');
async function run(command, args, cwd, shell = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, stdio: 'inherit', shell, windowsHide: true});
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 || signal === 'SIGINT' ? resolve() : reject(Error('Launch command failed ' + (code ?? signal))));
    const stop = () => child.kill('SIGINT');
    process.once('SIGINT', stop);
    child.once('exit', () => process.off('SIGINT', stop));
  });
}
if (!process.env.ZERO_PYTHON && !existsSync(localPython)) {
  const command = windows && spawnSync('py',['-3','--version'],{windowsHide:true}).status === 0 ? 'py' : windows ? 'python' : 'python3';
  await run(command,[...(command==='py'?['-3']:[]),'-m','venv',join(root,'.venv')],root);
}
const probe = spawnSync(python,['-c',"import importlib.metadata as m; m.version('weiqi-zero-lab')"],{windowsHide:true});
if (probe.status !== 0) await run(python,['-m','pip','install','-e','.'],root);
const index = join(frontend,'dist','index.html');
const inputs = ['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json',
  ...readdirSync(join(frontend,'src')).map(name => join('src',name))];
if (!existsSync(index) || inputs.some(name => statSync(join(frontend,name)).mtimeMs > statSync(index).mtimeMs)) {
  if (!existsSync(join(frontend, 'node_modules', 'vite'))) {
    await run('npm', [existsSync(join(frontend,'package-lock.json')) ? 'ci' : 'install'], frontend, windows);
  }
  await run('npm', ['run','build'], frontend, windows);
}
const address = 'http://127.0.0.1:' + port;
function serving() {
  return new Promise(resolve => {
    const request = get(address + '/openapi.json', {timeout: 1500}, response => {
      let text = '';
      response.setEncoding('utf8').on('data', part => { if (text.length < 200000) text += part; });
      response.on('end', () => {
        try { resolve(JSON.parse(text).info.title === 'WeiQi Zero Workbench'); } catch { resolve(false); }
      }).on('error', () => resolve(false));
    });
    request.on('error', () => resolve(false)).on('timeout', () => request.destroy());
  });
}
function openBrowser() {
  if (process.env.ZERO_OPEN_BROWSER !== '1') return;
  const child = spawn(python, ['-m','webbrowser','-t',address], {cwd: root, stdio:'ignore', windowsHide:true});
  child.on('error', () => console.log(address));
  child.unref();
}
console.log('WeiQi Zero Workbench  ' + address);
if (await serving()) {
  openBrowser();
} else {
  let finished = false;
  const service = run(python, ['-m','zero','serve','--port',String(port)], root).finally(() => { finished = true; });
  if (process.env.ZERO_OPEN_BROWSER === '1') {
    void (async () => {
      while (!finished) {
        if (await serving()) { openBrowser(); break; }
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    })();
  }
  await service;
}
