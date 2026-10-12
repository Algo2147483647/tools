import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { WebSocket } from 'ws';
import { startBridge } from './server.mjs';

test('production browser client reconnects repeatedly to the single-client bridge after close handshake',async()=>{
  const source=await readFile(new URL('../src/sitl-client.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const {SitlClient}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const bridge=await startBridge({ports:{websocket:0,bfMotors:0}});
  const original=globalThis.WebSocket;
  globalThis.WebSocket=class extends WebSocket {
    constructor(){super(`ws://127.0.0.1:${bridge.port}/sitl`,{origin:'http://127.0.0.1:4188'});}
  };
  let notify=null;const events=[];const client=new SitlClient(event=>{events.push(event.type);notify?.(event);});
  try{
    for(let attempt=0;attempt<20;attempt++){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error(`Reconnect ${attempt} timed out`)),1500);
        notify=event=>{if(event.type==='ready'){clearTimeout(timer);resolve();}
          else if(event.type==='error'){clearTimeout(timer);reject(Error(client.error));}};
        client.connect('betaflight');
      });
      assert.equal(client.status,'ready');assert.equal(client.pending,false);
    }
    assert.equal(events.filter(type=>type==='ready').length,20);assert.equal(events.includes('error'),false);
  }finally{notify=null;client.disconnect();globalThis.WebSocket=original;await bridge.close();}
});
