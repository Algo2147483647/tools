import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(directory) {
  const entries = await readdir(new URL(directory, import.meta.url), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = directory + entry.name;
    if (entry.isDirectory()) result.push(...(await files(path + '/')));
    else if (/\.(m?js)$/.test(entry.name))
      result.push(fileURLToPath(new URL(path, import.meta.url)));
  }
  return result;
}
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const file of [
  'server.mjs',
  'playwright.config.mjs',
  ...(await files('../public/src/')),
  ...(await files('./')),
  ...(await files('../tests/')),
]) {
  run(['--check', file]);
}
const tests = (await files('../tests/')).filter((file) => file.endsWith('.test.mjs'));
run(['--test', ...tests]);
