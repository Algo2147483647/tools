const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(__dirname, '../desktop'));
for (const name of ['dist-math']) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root || !name.startsWith('dist')) throw Error('Unsafe build cleanup target.');
  if (!fs.existsSync(target)) continue;
  if (fs.lstatSync(target).isSymbolicLink()) throw Error('Refusing to clean a linked build directory.');
  fs.rmSync(target, { recursive: true, force: true });
  console.log('Removed old build: ' + name);
}
