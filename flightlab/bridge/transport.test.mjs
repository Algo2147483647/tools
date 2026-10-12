import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import net from 'node:net';
import { WebSocket } from 'ws';
import { startBridge } from './server.mjs';
import { encodeMavlink, MavlinkParser } from './protocol.mjs';

const frame = (sequence=0) => ({ sequence,timeUs:1000000+sequence*4000,positionNed:[0,0,-2],velocityNed:[0,0,0],
  quaternionWxyz:[1,0,0,0],gyroFrd:[0,0,0],specificForceFrd:[0,0,-9.80665],
  rc:{roll:0,pitch:0,yaw:0,throttle:.4,armed:true,angle:true} });
const bind = socket => new Promise(resolve => socket.bind(0,'127.0.0.1',resolve));
const waitMessage = ws => new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(Error('Mock transport timeout')),3000);
  ws.once('message', data => {clearTimeout(timer);resolve(JSON.parse(data));}); });
async function connect(port,protocol) {
  const ws=new WebSocket(`ws://127.0.0.1:${port}/sitl`,{origin:'http://127.0.0.1:4188'});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const ready=waitMessage(ws);ws.send(JSON.stringify({type:'connect',protocol}));await ready;return ws;
}
test('MOCK ONLY: WebSocket -> actual BF UDP ABI -> ordered motor response, then watchdog',async()=>{
  const sensors=dgram.createSocket('udp4'),rc=dgram.createSocket('udp4'),output=dgram.createSocket('udp4');
  await bind(sensors);await bind(rc);await bind(output);
  const motorPort=output.address().port;await new Promise(resolve=>output.close(resolve));
  const bridge=await startBridge({ports:{websocket:0,bfMotors:motorPort,bfSensors:sensors.address().port,bfRc:rc.address().port},timeoutMs:80});
  let respond=true, observedRc=null;
  rc.on('message',bytes=>{observedRc=bytes;});
  sensors.on('message',bytes=>{
    assert.equal(bytes.length,144); assert.equal(bytes.readDoubleLE(),1);
    if(respond){const packet=Buffer.alloc(16);[.1,.2,.3,.4].forEach((v,i)=>packet.writeFloatLE(v,4*i));sensors.send(packet,motorPort,'127.0.0.1');}
  });
  try{
    const ws=await connect(bridge.port,'betaflight');let response=waitMessage(ws);ws.send(JSON.stringify({type:'frame',frame:frame()}));
    const result=await response;assert.equal(result.type,'actuators');assert.equal(result.sequence,0);
    assert.deepEqual(result.motors.map(v=>Number(v.toFixed(2))),[.3,.1,.4,.2]);assert.equal(observedRc.length,40);
    respond=false;response=waitMessage(ws);const next=frame(1);next.timeUs=1000000+4000;
    sensors.removeAllListeners('message');ws.send(JSON.stringify({type:'frame',frame:next}));
    assert.match((await response).message,/timeout/);ws.close();
  }finally{await bridge.close();sensors.close();rc.close();}
});
test('MOCK ONLY: PX4 TCP MAVLink stream matches simulation timestamp and rejects stale output',async()=>{
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const bridge=await startBridge({ports:{websocket:0,px4:port}});let peer;
  try{const ws=await connect(bridge.port,'px4');
    peer=net.createConnection({host:'127.0.0.1',port});const parser=new MavlinkParser();
    peer.on('data',bytes=>{for(const message of parser.push(bytes)){if(message.id!==107)continue;
      const payload=Buffer.alloc(81);payload.writeBigUInt64LE(message.payload.readBigUInt64LE());
      [.1,.2,.3,.4].forEach((v,i)=>payload.writeFloatLE(v,16+4*i));payload[80]=128;
      const stale=Buffer.from(payload);stale.writeBigUInt64LE(1n);peer.write(encodeMavlink(93,stale));peer.write(encodeMavlink(93,payload));
    }});
    await new Promise((resolve,reject)=>{peer.once('connect',resolve);peer.once('error',reject);});
    const response=waitMessage(ws);ws.send(JSON.stringify({type:'frame',frame:frame()}));
    const result=await response;assert.equal(result.timeUs,1000000);assert.deepEqual(result.motors.map(v=>Number(v.toFixed(2))),[.3,.1,.4,.2]);ws.close();
  }finally{peer?.destroy();await bridge.close();}
});
test('rejects nonlocal browser origins before opening firmware transport',async()=>{
  const bridge=await startBridge({ports:{websocket:0}});
  try{const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/sitl`,{origin:'https://untrusted.example'});
    const message=await new Promise(resolve=>ws.once('error',error=>resolve(error.message)));assert.match(message,/403/);
  }finally{await bridge.close();}
});
test('rejects invalid sensor frames and never produces fallback actuators',async()=>{
  const output=dgram.createSocket('udp4');await bind(output);const port=output.address().port;await new Promise(resolve=>output.close(resolve));
  const bridge=await startBridge({ports:{websocket:0,bfMotors:port}});
  try{const ws=await connect(bridge.port,'betaflight');const response=waitMessage(ws);ws.send(JSON.stringify({type:'frame',frame:{...frame(),timeUs:-1}}));
    assert.equal((await response).type,'error');ws.close();
  }finally{await bridge.close();}
});
