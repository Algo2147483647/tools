const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {executeProcess,activeProcesses,shutdownProcesses}=require('../build/backend/platform/executor.js');
const run=(code,extra={})=>executeProcess({executable:process.execPath,args:['-e',code],cwd:os.tmpdir(),signal:new AbortController().signal,...extra});
test('executor captures both streams and nonzero exit status',async()=>{const r=await run("process.stdout.write('out');process.stderr.write('err');process.exitCode=7");assert.deepEqual(r,{code:7,stdout:'out',stderr:'err'});assert.equal(activeProcesses.size,0)});
test('pre-cancel and launch failure settle without leaked registrations',async()=>{await assert.rejects(run('',{signal:AbortSignal.abort()}),{code:'CANCELLED'});await assert.rejects(run('',{executable:path.join(os.tmpdir(),'missing-executable-001.exe')}),{code:'ENGINE_START_FAILED'});assert.equal(activeProcesses.size,0)});
test('timeout and byte output limit terminate before settling',async()=>{await assert.rejects(run('setInterval(()=>{},1000)',{timeoutMs:50}),{code:'TIMED_OUT'});await assert.rejects(run("process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)",{maxOutputBytes:1024}),{code:'OUTPUT_LIMIT'});assert.equal(activeProcesses.size,0)});
test('cancellation terminates descendant process and clears registration',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-tree-test-')),file=path.join(dir,'pid');const c=new AbortController();let childPid;
 const code="const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});require('fs').writeFileSync("+JSON.stringify(file)+",String(c.pid));setInterval(()=>{},1000)";
 const pending=run(code,{signal:c.signal});const rejection=assert.rejects(pending,{code:'CANCELLED'});
 try{for(let i=0;i<100&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,20));assert.ok(fs.existsSync(file));childPid=Number(fs.readFileSync(file,'utf8'));c.abort();await rejection;assert.throws(()=>process.kill(childPid,0));assert.equal(activeProcesses.size,0);}finally{c.abort();await rejection;if(childPid)try{process.kill(childPid)}catch{}if(path.dirname(dir)===os.tmpdir())fs.rmSync(dir,{recursive:true,force:true});}
});
test('application shutdown waits for all active workers',async()=>{const p=run('setInterval(()=>{},1000)');const rejected=assert.rejects(p,{code:'CANCELLED'});await shutdownProcesses();await rejected;assert.equal(activeProcesses.size,0)});
