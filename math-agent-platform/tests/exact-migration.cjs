const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('Python exact engine preserves reference arithmetic and affine equation results',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-exact-differential-'));
 try{
 await require('../desktop/node_modules/esbuild').build({entryPoints:[path.join(__dirname,'reference/exact-ts/engine.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'reference.cjs')});
 const {solve}=require(path.join(dir,'reference.cjs'));
 const cases=['1/3+1/6','0.1+0.2','2(x+3)=4x-1','x=x','x=x+1','1=1','.25/.5','-(-3)+4*2','3/7-2/9','2(3+4)','(2+3)(4-1)','2x=3','x/3+2=5','3(x-2)=x+8','0x=0','0x=2','5=2x','2(x+1)/3=4','x-x=0'];
 const script="import sys,json;sys.path.insert(0,sys.argv[1]);from math_engine import execute;print(json.dumps([execute({'schemaVersion':1,'tool':'exact_math','arguments':{'expression':s}}) for s in json.loads(sys.stdin.read())]))";
 const r=spawnSync(path.join(root,'.runtime/python-engine/python.exe'),['-I','-B','-c',script,path.join(root,'engines/mathematics/src')],{input:JSON.stringify(cases),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const outputs=JSON.parse(r.stdout);cases.forEach((source,i)=>{const old=solve(source);assert.equal(outputs[i].ok,true,source);const actual=outputs[i].value.result;for(const field of ['kind','value'])assert.equal(actual.candidate[field],old.candidate[field],source);assert.equal(actual.verification.status,old.verification.status,source);});
 }finally{if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('math-exact-differential-'))fs.rmSync(dir,{recursive:true,force:true});}
});
