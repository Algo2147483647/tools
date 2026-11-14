const test = require('node:test'), assert = require('node:assert/strict');
const { readReply } = require('./stream.cjs');
const { runAgent } = require('./agent.cjs');
const { RunService } = require('../application/runs.cjs');
const { compute } = require('../core/worker-client.cjs');
const settings = provider => ({ provider, baseUrl: 'https://example.test', model: 'test', apiKey: '', maxTokens: 1024 });
const signal = () => new AbortController().signal;
function streamed(items, type = 'text/event-stream', split = 1) {
  const raw = items.map(x => type.includes('event-stream') ? 'data: ' + (typeof x === 'string' ? x : JSON.stringify(x)) + '\r\n\r\n' : JSON.stringify(x) + '\n').join('');
  const bytes = new TextEncoder().encode(raw);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i,i+split)); controller.close(); } }), { headers: { 'content-type': type } });
}
function chunk(content, finish_reason = null) { return { choices: [{ index: 0, delta: { content }, finish_reason }] }; }
test('SSE preserves split Chinese/UTF-8, CRLF, multiple frames and final text', async () => {
  let text=''; const reply = await readReply(streamed([chunk('解题'),chunk('：x=-5','stop'),'[DONE]']), 'openai-compatible', signal(), t=>text+=t);
  assert.equal(text,'解题：x=-5'); assert.equal(reply.choices[0].message.content,text);
});
test('partial visible output arrives before the stream closes', async () => {
  let wire;const events=[];
  const response=new Response(new ReadableStream({start(c){wire=c}}),{headers:{'content-type':'text/event-stream'}});
  let done=false; const reading=readReply(response,'deepseek',signal(),x=>events.push(x)).then(x=>{done=true;return x});
  wire.enqueue(new TextEncoder().encode('data: '+JSON.stringify(chunk('First step'))+'\n\n'));
  await new Promise(r=>setTimeout(r,5));assert.deepEqual(events,['First step']);assert.equal(done,false);
  wire.enqueue(new TextEncoder().encode('data: '+JSON.stringify(chunk(' answer','stop'))+'\n\n'));wire.close();await reading;
});
test('interleaved tool argument fragments execute only after a complete turn', async () => {
  let requests=0;const content=[];let executions=0;
  const result=await runAgent({settings:settings('openai-compatible'),input:'q',signal:signal(),onContent:e=>content.push(e),compute:async(...args)=>{executions++;return compute(...args)},request:async()=>{
    if(requests++)return streamed([chunk('Answer: -5 and 3','stop')]);
    return streamed([chunk('I will calculate both.'),
      {choices:[{index:0,delta:{tool_calls:[{index:0,id:'a',type:'function',function:{name:'exact_math',arguments:'{"expression":'}},{index:1,id:'b',type:'function',function:{name:'exact_math',arguments:'{"expression":"1'}}]}}]},
      {choices:[{index:0,delta:{tool_calls:[{index:1,function:{arguments:'+2"}'}},{index:0,function:{arguments:'"x+6=1"}'}}]},finish_reason:'tool_calls'}]},'[DONE]']);
  }});
  assert.equal(executions,2);assert.equal(result.tools[0].output.result.candidate.value,'-5');
  const types=content.map(e=>e.type);assert.ok(types.indexOf('text.delta')<types.indexOf('tool.started'));assert.equal(types.filter(t=>t==='tool.completed').length,2);
});
test('Anthropic text and tool partial JSON are normalized; signatures retained privately', async()=>{
  let text='';const j=await readReply(streamed([
    {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}},
    {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'private'}},
    {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'sig'}},{type:'content_block_stop',index:0},
    {type:'content_block_start',index:1,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:1,delta:{type:'text_delta',text:'Calculate'}},{type:'content_block_stop',index:1},
    {type:'content_block_start',index:2,content_block:{type:'tool_use',id:'a',name:'exact_math',input:{}}},
    {type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'{"expression":'}},
    {type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'"1+2"}'}},{type:'content_block_stop',index:2},
    {type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'}
  ]),'anthropic',signal(),t=>text+=t);
  assert.equal(text,'Calculate');assert.equal(j.content[0].signature,'sig');assert.equal(j.content[2].input.expression,'1+2');
});
test('Gemini retains tool signatures and excludes thought text',async()=>{
  let text='';const j=await readReply(streamed([
    {candidates:[{content:{parts:[{thought:true,text:'private'},{text:'Plan'}]}}]},
    {candidates:[{content:{parts:[{functionCall:{name:'exact_math',args:{expression:'1+2'}},thoughtSignature:'signature'}]},finishReason:'STOP'}]}
  ]),'gemini',signal(),t=>text+=t);
  assert.equal(text,'Plan');assert.equal(j.candidates[0].content.parts[2].thoughtSignature,'signature');
});
test('Ollama NDJSON handles tool calls and visible text',async()=>{
  let text='';const j=await readReply(streamed([{message:{role:'assistant',content:'Use a tool',thinking:'private'}},{message:{role:'assistant',tool_calls:[{function:{name:'exact_math',arguments:{expression:'1+2'}}}]},done:true}], 'application/x-ndjson'),'ollama',signal(),t=>text+=t);
  assert.equal(text,'Use a tool');assert.equal(j.message.tool_calls[0].function.name,'exact_math');
});
test('malformed or interrupted streams never execute a tool',async()=>{
  await assert.rejects(runAgent({settings:settings('deepseek'),input:'q',signal:signal(),compute:()=>assert.fail('must not execute'),request:async()=>streamed([{choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'exact_math',arguments:'{"expression":"1+2"}'}}]}}]}])}),{code:'STREAM_INTERRUPTED'});
  await assert.rejects(readReply(streamed(['{bad json']), 'deepseek',signal(),()=>{}),{code:'STREAM_INVALID'});
  await assert.rejects(readReply(streamed([{error:{message:'secret'}}]), 'deepseek',signal(),()=>{}),/streaming error/);
});
test('stream cancellation releases reader and ignores late tokens',async()=>{
  let wire,cancelled=false;const controller=new AbortController();const text=[];
  const response=new Response(new ReadableStream({start(c){wire=c},cancel(){cancelled=true}}),{headers:{'content-type':'text/event-stream'}});
  const reading=readReply(response,'deepseek',controller.signal,t=>text.push(t));
  wire.enqueue(new TextEncoder().encode('data: '+JSON.stringify(chunk('partial'))+'\n\n'));await new Promise(r=>setTimeout(r,5));
  controller.abort();await assert.rejects(reading);assert.equal(cancelled,true);assert.deepEqual(text,['partial']);
});
test('idle timeout releases stream',async()=>{
  let cancelled=false;const response=new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{'content-type':'text/event-stream'}});
  await assert.rejects(readReply(response,'deepseek',signal(),()=>{},()=>{},{idleMs:10}),{code:'TIMED_OUT'});assert.equal(cancelled,true);
});
test('non-streaming service fallback is explicitly reported',async()=>{
  let compatibility=0,text='';await readReply(new Response(JSON.stringify({choices:[{message:{content:'full answer'}}]})),'deepseek',signal(),t=>text+=t,()=>compatibility++);
  assert.equal(compatibility,1);assert.equal(text,'full answer');
});
test('RunService retains partial text after cancellation and publishes revisions',async()=>{
  let wire;const patches=[];
  const service=new RunService({notifyDelta:p=>patches.push(p),request:async()=>new Response(new ReadableStream({start(c){wire=c}}),{headers:{'content-type':'text/event-stream'}})});
  service.configure(settings('deepseek'));const run=service.start({input:'q'});await new Promise(r=>setTimeout(r,5));
  wire.enqueue(new TextEncoder().encode('data: '+JSON.stringify(chunk('Useful partial'))+'\n\n'));await new Promise(r=>setTimeout(r,5));
  assert.equal(service.get(run.id).blocks[0].text,'Useful partial');assert.ok(patches.some(p=>p.event.type==='text.delta'));
  await service.cancel(run.id);assert.equal(service.get(run.id).blocks[0].text,'Useful partial');assert.equal(service.get(run.id).status,'cancelled');
});
module.exports = { streamed, chunk };

for (const provider of ['openai-compatible','deepseek','anthropic','gemini','ollama']) test(provider+': streaming text/tool/text round trip preserves native continuation',async()=>{
 let count=0;const events=[];
 const first={};
 first['openai-compatible']=first.deepseek=[chunk('Calculate first.'),{choices:[{index:0,delta:{tool_calls:[{index:0,id:'a',type:'function',function:{name:'exact_math',arguments:'{"expression":"1+2"}'}}]},finish_reason:'tool_calls'}]}];
 first.anthropic=[{type:'content_block_start',index:0,content_block:{type:'text',text:'Calculate first.'}},{type:'content_block_stop',index:0},{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'a',name:'exact_math',input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"expression":"1+2"}'}},{type:'content_block_stop',index:1},{type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'}];
 first.gemini=[{candidates:[{content:{parts:[{text:'Calculate first.'},{functionCall:{name:'exact_math',args:{expression:'1+2'}},thoughtSignature:'sig'}]},finishReason:'STOP'}]}];
 first.ollama=[{message:{role:'assistant',content:'Calculate first.',tool_calls:[{function:{name:'exact_math',arguments:{expression:'1+2'}}}]},done:true}];
 const last={};last['openai-compatible']=last.deepseek=[chunk('Answer: 3','stop')];last.anthropic=[{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Answer: 3'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}];last.gemini=[{candidates:[{content:{parts:[{text:'Answer: 3'}]},finishReason:'STOP'}]}];last.ollama=[{message:{role:'assistant',content:'Answer: 3'},done:true}];
 const result=await runAgent({settings:settings(provider),input:'1+2',signal:signal(),compute,onContent:e=>events.push(e),request:async(url,init)=>{
  const body=JSON.parse(init.body);if(provider==='gemini')assert.match(url,/:streamGenerateContent\?alt=sse$/);else assert.equal(body.stream,true);
  if(count++){const history=JSON.stringify(body.messages||body.contents);assert.match(history,/schemaVersion/);assert.match(history,/passed/);if(provider==='gemini')assert.match(history,/sig/);return streamed(last[provider],provider==='ollama'?'application/x-ndjson':'text/event-stream',7)}
  return streamed(first[provider],provider==='ollama'?'application/x-ndjson':'text/event-stream',7);
 }});
 assert.equal(result.tools[0].output.result.candidate.value,'3');assert.equal(result.markdown,'Answer: 3');
 assert.deepEqual(events.filter(e=>['text.delta','tool.started','tool.completed'].includes(e.type)).map(e=>e.type),['text.delta','tool.started','tool.completed','text.delta']);
});
test('truncated tool parameters do not run; visible answer truncation is reported',async()=>{
 await assert.rejects(runAgent({settings:settings('deepseek'),input:'q',signal:signal(),compute:()=>assert.fail(),request:async()=>streamed([{choices:[{index:0,delta:{tool_calls:[{index:0,id:'a',function:{name:'exact_math',arguments:'{"expression":"1+2"}'}}]},finish_reason:'length'}]}])}),/truncated/);
 const result=await runAgent({settings:settings('deepseek'),input:'q',signal:signal(),request:async()=>streamed([chunk('Partial','length')])});assert.equal(result.truncated,true);
});
