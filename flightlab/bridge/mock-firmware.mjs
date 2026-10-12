// Explicit protocol fixture. This is NOT Betaflight, PX4, or a flight controller.
import dgram from 'node:dgram';
import net from 'node:net';
import { MavlinkParser, encodeMavlink } from './protocol.mjs';
const protocol = process.argv[2];
if (!['betaflight','px4'].includes(protocol)) throw Error('Usage: node bridge/mock-firmware.mjs betaflight|px4');
const durationArgument=process.argv.find(value=>value.startsWith('--duration='));
const durationSeconds=durationArgument?Number(durationArgument.slice('--duration='.length)):600;
if(!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>1800)throw Error('Mock duration must be 1–1800 seconds.');
console.log(`MOCK ONLY: ${protocol} protocol fixture; motor outputs are fixed test values. No real firmware is running. Auto-stop in ${durationSeconds} seconds.`);
const deadline=setTimeout(()=>{console.log('MOCK ONLY: fixture time limit reached; stopping.');process.exit(0);},durationSeconds*1000);deadline.unref();
if(protocol==='betaflight'){
  const sensors=dgram.createSocket('udp4'),rc=dgram.createSocket('udp4'); let armed=false;
  rc.on('message',bytes=>{if(bytes.length===40)armed=bytes.readUInt16LE(16)>1700;});
  sensors.on('message',bytes=>{if(bytes.length!==144)return; const response=Buffer.alloc(16);
    for(let i=0;i<4;i++)response.writeFloatLE(armed?.1:0,i*4);sensors.send(response,9002,'127.0.0.1');});
  sensors.bind(9003,'127.0.0.1');rc.bind(9004,'127.0.0.1');
  process.once('SIGINT',()=>{sensors.close();rc.close();});
}else{
  const socket=net.createConnection({host:'127.0.0.1',port:4560});const parser=new MavlinkParser();let armed=false;
  socket.on('error',error=>{console.error(`MOCK connection failed: ${error.message}. Connect PX4 in the Workshop first.`);process.exitCode=1;});
  socket.on('data',bytes=>{for(const message of parser.push(bytes)){
    if(message.id===65)armed=message.payload.readUInt16LE(12)>1700;
    if(message.id!==107)continue;const response=Buffer.alloc(81);response.writeBigUInt64LE(message.payload.readBigUInt64LE());
    for(let i=0;i<4;i++)response.writeFloatLE(armed?.1:0,16+i*4);response[80]=armed?128:0;socket.write(encodeMavlink(93,response));
  }});
  process.once('SIGINT',()=>socket.destroy());
}
