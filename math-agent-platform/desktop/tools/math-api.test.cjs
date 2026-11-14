const test=require('node:test'),assert=require('node:assert/strict');
const {CodeWorkspace,workspaceDefinition}=require('../build/backend/tools/code-workspace.js');
const {ToolRegistry}=require('../build/backend/tools/registry.js');
const {activeProcesses}=require('../build/backend/platform/executor.js');
test('workspace reuses shared API, traces parent and partial batch failures, preserves artifacts',async()=>{
 const ws=new CodeWorkspace(),events=[];try{const result=await ws.execute(`from math_engine import solve, batch
import json
r=batch(tool='exact_math',arguments_list=[{'expression':'1/3+1/6'},{'expression':'1/0'},{'expression':'2+2'}])
print(json.dumps([x['ok'] for x in r]))
solve(tool='convex_optimize',arguments={'operation':'quadratic_program','quadratic':[[2]],'linear':[-4]})`,{signal:new AbortController().signal,progress:(s,m)=>events.push(m),deadline:Date.now()+15000,callId:'parent'});
 assert.equal(result.result.stdout.trim(),'[true, false, true]');assert.equal(result.result.subcalls.length,4);assert.ok(result.result.subcalls.every(x=>x.parentCallId==='parent'));assert.ok(result.result.subcalls.every(x=>x.remainingMs<=15000));assert.ok(events.some(x=>x.includes('"status":"running"')));assert.equal(result.views[0].kind,'table');assert.equal(result.result.subcalls[1].status,'failed');
 }finally{await ws.clear()}
});
test('API stops batch when shared deadline is exhausted',async()=>{const ws=new CodeWorkspace();try{const result=await ws.execute(`from math_engine import batch,execution_context
import time,json
with execution_context(deadline=time.time()-1):
 print(json.dumps(batch(tool='exact_math',arguments_list=[{'expression':'1+1'}]*3)))`,{signal:new AbortController().signal,progress:()=>{}});const replies=JSON.parse(result.result.stdout);assert.equal(replies.length,1);assert.equal(replies[0].error.code,'TIMED_OUT');}finally{await ws.clear()}});
for(const mode of ['cancel','timeout'])test(mode+' terminates running mathematical child and retains trace',async()=>{
 const ws=new CodeWorkspace(),controller=new AbortController(),events=[];let timer;
 try{const registry=new ToolRegistry({definitions:[workspaceDefinition(ws)]});const output=await registry.execute({schemaVersion:1,runId:'r',callId:'p',tool:'code_workspace',operation:'run',arguments:{operation:'run',code:`import math_engine.exact as module
import time
module.exact=lambda args: time.sleep(60)
from math_engine import solve
solve(tool='exact_math',arguments={'expression':'1+1'})`},limits:{timeoutMs:mode==='timeout'?2500:15000}},{signal:controller.signal,emit:e=>{events.push(e);if(mode==='cancel'&&e.message?.includes('"status":"running"'))timer=setTimeout(()=>controller.abort(),50)}});
 assert.equal(output.error.code,mode==='cancel'?'CANCELLED':'TIMED_OUT');assert.ok(events.some(e=>e.message?.includes('MATH_CALL ')));assert.equal(activeProcesses.size,0);
 }finally{clearTimeout(timer);await ws.clear()}
});
