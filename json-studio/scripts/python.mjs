import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const python =
  process.env.STUDIO_PYTHON ||
  fileURLToPath(
    new URL(
      process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python',
      import.meta.url,
    ),
  );

export function runPython(args) {
  if (!existsSync(python))
    throw new Error('Create .venv and install requirements.txt first, or run launch.cmd.');
  const result = spawnSync(python, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  runPython(process.argv.slice(2));
