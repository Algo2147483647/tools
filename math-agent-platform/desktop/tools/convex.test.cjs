const test=require('node:test'),assert=require('node:assert/strict');
const {ToolRegistry}=require('../build/backend/tools/registry.js');
const {ArtifactStore}=require('../build/backend/tools/artifacts.js');
const {runAgent}=require('../build/backend/ai/agent.js');
test('AI autonomously calls convex optimization and receives a real table artifact',async()=>{
 const artifacts=new ArtifactStore();let round=0;
 const result=await runAgent({settings:{provider:'deepseek',baseUrl:'https://example.test',model:'test',apiKey:''},input:'Minimize x squared minus 2x',signal:new AbortController().signal,runId:'convex-agent',artifacts,
 request:async(_url,options)=>{const body=JSON.parse(options.body);assert.ok(body.tools.some(t=>t.function.name==='convex_optimize'));
 if(round++===0)return Response.json({choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'c1',type:'function',function:{name:'convex_optimize',arguments:JSON.stringify({operation:'quadratic_program',linear:[-2],quadratic:[[2]]})}}]},finish_reason:'tool_calls'}]});
 const tool=JSON.parse(body.messages.find(m=>m.role==='tool').content);assert.equal(tool.status,'ok');assert.equal(tool.result.status,'optimal');assert.ok(Math.abs(tool.result.values[0]-1)<1e-5);assert.equal(tool.artifacts[0].kind,'table');
 return Response.json({choices:[{message:{role:'assistant',content:'The numerical optimizer found x = 1.'},finish_reason:'stop'}]});}});
 assert.equal(result.tools.length,1);assert.equal(artifacts.get('convex-agent',result.tools[0].output.artifacts[0].id).value.rows.length,1);
});
