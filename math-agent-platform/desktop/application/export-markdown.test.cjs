const {test}=require('node:test'),assert=require('node:assert/strict');
const {answerMarkdown,runMarkdown}=require('../build/backend/shared/export-markdown.js');
const run={id:'r',input:'Question',status:'completed',createdAt:'today',settings:{apiKey:'SECRET'},events:[],datasets:[],blocks:[{kind:'text',text:'Answer **bold**',reasoning:'Reasoning'},{kind:'tool',name:'code_workspace',operation:'run',status:'completed',input:{code:'print("```")'},output:{result:{value:42},artifacts:[{id:'t'},{id:'i'}]}}]};
test('copy excludes reasoning and tool records',()=>assert.equal(answerMarkdown(run),'Answer **bold**'));
test('Markdown includes question, reasoning, tool data and embedded artifacts without settings secrets',()=>{const text=runMarkdown(run,id=>id==='t'?{kind:'table',title:'Table',columns:['A'],rows:[['a|b']]}:{kind:'image',data:'png',title:'Chart'});for(const part of ['Question','Answer **bold**','Reasoning','code_workspace','42','a\\|b','data:image/png;base64,png','````json'])assert.ok(text.includes(part),part);assert.ok(!text.includes('SECRET'));});
test('empty streaming run can export',()=>{const empty={...run,status:'explaining',blocks:[]};assert.equal(answerMarkdown(empty),'');assert.ok(runMarkdown(empty,()=>{throw Error()}).includes('explaining'));});
test('native commands copy answer, save Markdown and respect save cancellation',async()=>{
 const Module=require('node:module'),original=Module._load,fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'math-export-'));let handler,copied,canceled=false;const target=path.join(dir,'answer.md');
 Module._load=function(id,...args){if(id==='electron')return {ipcMain:{handle:(_name,fn)=>handler=fn},BrowserWindow:{fromWebContents:()=>({})},clipboard:{writeText:text=>copied=text},dialog:{showSaveDialog:async()=>({canceled,filePath:target})}};return original.call(this,id,...args)};
 try{
  const {registerCommands}=require('../build/backend/platform/commands.js');
  const entry=path.join(dir,'index.html'),frame={url:require('node:url').pathToFileURL(entry).href},sender={id:1,mainFrame:frame};
  const plain={...run,blocks:run.blocks.filter(b=>b.kind==='text')};registerCommands(new Map([[1,{get:id=>{assert.equal(id,'r');return plain}}]]),{},entry);
  assert.equal((await handler({sender,senderFrame:frame},'copyAnswer','r')).ok,true);assert.equal(copied,'Answer **bold**');
  assert.equal((await handler({sender,senderFrame:frame},'exportRun','r')).value,true);assert.ok((await fs.readFile(target,'utf8')).includes('Reasoning'));
  canceled=true;assert.equal((await handler({sender,senderFrame:frame},'exportRun','r')).value,false);
  await assert.rejects(handler({sender,senderFrame:{}},'copyAnswer','r'),/Untrusted/);
 }finally{Module._load=original;await fs.rm(dir,{recursive:true,force:true});}
});
