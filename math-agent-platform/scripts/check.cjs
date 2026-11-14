const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../desktop');
let count = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'fonts'].includes(item.name) || item.name.startsWith('dist')) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(?:cjs|js)$/.test(file) && !item.name.includes('.bundle.')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
      count++;
    }
  }
}
walk(root); console.log('Syntax checked ' + count + ' source files.');
const runtime = path.resolve(root, '../.runtime/python-engine/python.exe');
if (!fs.existsSync(runtime)) throw Error('Prepare the mathematics runtime using scripts/Prepare-MathRuntime.ps1.');
const engine = path.resolve(root,'../engines/mathematics/worker.py');
const checked = spawnSync(runtime,['-I','-B','-c',"import ast,sys,sympy,numpy,scipy,pandas,matplotlib,cvxpy,jsonschema; ast.parse(open(sys.argv[1], encoding='utf-8').read()); print('Mathematics runtime and worker verified.')",engine],{encoding:'utf8'});
if (checked.status !== 0) { process.stderr.write(checked.stderr); process.exit(1); }
process.stdout.write(checked.stdout);
const lean = path.resolve(root,'../.runtime/lean-runtime/bin/lean.exe');
const leanVersion=spawnSync(lean,['--version'],{encoding:'utf8'});
if(leanVersion.status!==0||!leanVersion.stdout.includes('version 4.35.0'))throw Error('Prepare pinned Lean runtime using scripts/Prepare-LeanRuntime.ps1.');
console.log(leanVersion.stdout.trim());
