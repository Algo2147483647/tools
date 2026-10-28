import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, runPython } from './python.mjs';

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? files(file) : /\.m?js$/.test(file) ? [file] : [];
  });
}
for (const file of [
  'playwright.config.mjs',
  ...['public/src', 'scripts', 'tests'].flatMap((dir) => files(join(root, dir))),
]) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
runPython(['scripts/manage.py', 'check']);
