const test=require('node:test'),assert=require('node:assert/strict');
const {ToolRegistry}=require('./registry.cjs');const {ArtifactStore}=require('./artifacts.cjs');
const request=(args={expression:'1/3+1/6'})=>({schemaVersion:1,runId:'r',callId:'c',tool:'exact_math',operation:'evaluate',arguments:args,limits:{timeoutMs:5000,maxOutputBytes:262144}});
const context=()=>({signal:new AbortController().signal});
test('exact tool returns versioned envelope and checked result',async()=>{
 const result=await new ToolRegistry().execute(request(),context());assert.equal(result.schemaVersion,1);assert.equal(result.status,'ok');assert.equal(result.result.candidate.value,'1/2');assert.equal(result.verification.status,'passed');assert.ok(result.diagnostics.elapsedMs>=0);
});
test('unknown tools and invalid arguments never reach executor',async()=>{
 const registry=new ToolRegistry({computeFn:()=>assert.fail()});
 const a=await registry.execute(request({expression:'1',extra:true}),context());assert.equal(a.error.code,'INVALID_ARGUMENT');
 const b=await registry.execute({...request(),callId:'d',tool:'shell'},context());assert.equal(b.error.code,'UNKNOWN_TOOL');
});
test('call IDs deduplicate identical calls and reject conflicting requests',async()=>{
 let count=0;const registry=new ToolRegistry({computeFn:async()=>{count++;return {verification:{status:'passed'}}}});
 const [a,b]=await Promise.all([registry.execute(request(),context()),registry.execute(request(),context())]);assert.equal(count,1);assert.deepEqual(a,b);
 assert.throws(()=>registry.execute(request({expression:'2'}),context()),{code:'CALL_CONFLICT'});
});
test('unsupported maths returns structured failure',async()=>{
 const result=await new ToolRegistry().execute(request({expression:'x*x=1'}),context());assert.equal(result.status,'error');assert.equal(result.error.code,'UNSUPPORTED');
});
test('bounded artifact store scopes access to its owning run',()=>{
 const store=new ArtifactStore(100);const item=store.put('r',{answer:42});assert.equal(store.get('r',item.id).value.answer,42);assert.throws(()=>store.get('other',item.id));assert.throws(()=>store.put('r','x'.repeat(200)),{code:'RESOURCE_LIMIT'});store.clear();assert.throws(()=>store.get('r',item.id));
});
test('large results become local artifacts with a bounded reference',async()=>{
 const store=new ArtifactStore();const registry=new ToolRegistry({artifacts:store,computeFn:async()=>({verification:{status:'passed'},data:'x'.repeat(2000)})});
 const result=await registry.execute({...request(),limits:{timeoutMs:5000,maxOutputBytes:100}},context());assert.equal(result.result.kind,'artifact');assert.equal(store.get('r',result.artifacts[0].id).value.data.length,2000);
});
test('tool timeout waits for executor cancellation and returns standardized error',async()=>{
 let settled=false;const registry=new ToolRegistry({computeFn:(_input,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{settled=true;reject(Error('aborted'))},{once:true}))});
 const result=await registry.execute({...request(),limits:{timeoutMs:5}},context());assert.equal(result.error.code,'TIMED_OUT');assert.equal(settled,true);
});

test('unsupported envelope versions and invalid resource limits are rejected',()=>{
 const registry=new ToolRegistry();assert.throws(()=>registry.execute({...request(),schemaVersion:2},context()),{code:'INVALID_ARGUMENT'});assert.throws(()=>registry.execute({...request(),limits:{timeoutMs:-1}},context()),{code:'INVALID_ARGUMENT'});
});
