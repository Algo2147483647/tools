import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSitlFrame, SitlClient } from '../src/sitl-client';
class Socket {
  static OPEN=1; static instances: Socket[]=[]; readyState=1;
  onopen:(()=>void)|null=null; onmessage:((event:{data:string})=>void)|null=null;
  onerror:(()=>void)|null=null;onclose:(()=>void)|null=null; sent:string[]=[];
  constructor(public url:string){Socket.instances.push(this);}
  send(value:string){this.sent.push(value);} close(){this.readyState=3;this.onclose?.();}
  receive(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
const state={position:{x:2,y:3,z:4},velocity:{x:5,y:6,z:7},quaternion:{x:0,y:0,z:0,w:1},angularVelocity:{x:1,y:2,z:3},throttle:.4};
const frame=()=>makeSitlFrame(0,1000,state,{roll:0,pitch:0,yaw:0},{x:0,y:9.80665,z:0},true,true);
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();Socket.instances=[];});
describe('local SITL browser client',()=>{
  it('converts Three Y-up/-Z-forward coordinates to NED/FRD consistently',()=>{
    const value=frame();expect(value.positionNed).toEqual([-4,2,-3]);expect(value.velocityNed).toEqual([-7,5,-6]);
    expect(value.gyroFrd).toEqual([-3,1,-2]);expect(value.specificForceFrd).toEqual([-0,0,-9.80665]);expect(value.quaternionWxyz).toEqual([1,-0,0,-0]);
  });
  it('allows exactly one in-flight frame and rejects stale or invalid motor responses',()=>{
    vi.stubGlobal('WebSocket',Socket);const client=new SitlClient();client.connect('betaflight');const socket=Socket.instances[0];socket.onopen?.();
    expect(client.sendFrame(frame())).toBe(false);socket.receive({type:'ready'});expect(client.sendFrame(frame())).toBe(true);expect(client.sendFrame(frame())).toBe(false);
    socket.receive({type:'actuators',sequence:5,motors:[.2,.2,.2,.2]});expect(client.pending).toBe(true);
    socket.receive({type:'actuators',sequence:0,motors:[2,0,0,0]});expect(client.pending).toBe(true);
    socket.receive({type:'actuators',sequence:0,motors:[.1,.2,.3,.4]});expect(client.readActuators(0)).toEqual([.1,.2,.3,.4]);
    expect(client.readActuators(1)).toBeNull();client.disconnect();expect(client.actuators).toBeNull();
  });
  it('watchdog halts and clears motor output without fallback',()=>{
    vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);const client=new SitlClient();client.connect('px4');Socket.instances[0].receive({type:'ready'});
    client.sendFrame(frame());vi.advanceTimersByTime(3100);expect(client.status).toBe('error');expect(client.actuators).toBeNull();expect(client.error).toMatch(/halted/);
  });
  it('ignores events from a previously closed connection',()=>{
    vi.stubGlobal('WebSocket',Socket);const client=new SitlClient();client.connect('betaflight');const old=Socket.instances[0];client.connect('px4');
    old.receive({type:'error',message:'stale'});expect(client.status).toBe('connecting');client.disconnect();
  });
  it('emits ready and motor events after state updates so an asynchronous simulation pump can continue',()=>{
    vi.stubGlobal('WebSocket',Socket);const observations:unknown[]=[];
    const client=new SitlClient(event=>observations.push({type:event.type,status:client.status,pending:client.pending,motors:client.readActuators(0)}));
    client.connect('betaflight');const socket=Socket.instances[0];socket.receive({type:'ready'});client.sendFrame(frame());
    socket.receive({type:'actuators',sequence:0,motors:[.1,.2,.3,.4]});
    expect(observations).toEqual([
      {type:'connecting',status:'connecting',pending:false,motors:null},
      {type:'ready',status:'ready',pending:false,motors:null},
      {type:'actuators',status:'active',pending:false,motors:[.1,.2,.3,.4]},
    ]);client.disconnect();
  });
  it('changes session on reconnect, removes pending output and emits only one error event on failure',()=>{
    vi.stubGlobal('WebSocket',Socket);const events:unknown[]=[];const client=new SitlClient(event=>events.push(event));
    client.connect('betaflight');const firstSession=client.session;const old=Socket.instances[0];old.receive({type:'ready'});client.sendFrame(frame());
    client.connect('px4');expect(client.session).toBeGreaterThan(firstSession);expect(client.pending).toBe(false);expect(client.actuators).toBeNull();
    old.receive({type:'actuators',sequence:0,motors:[1,1,1,1]});expect(client.actuators).toBeNull();
    const count=events.length;Socket.instances[1].receive({type:'error',message:'Firmware missing'});
    expect(events.slice(count)).toEqual([{type:'error',session:client.session}]);expect(client.status).toBe('error');expect(client.error).toBe('Firmware missing');
  });
  it('waits for the old close handshake before opening a replacement connection',()=>{
    vi.stubGlobal('WebSocket',Socket);const client=new SitlClient();client.connect('betaflight');const old=Socket.instances[0];old.receive({type:'ready'});
    old.close=()=>{old.readyState=2;};client.connect('px4');
    expect(client.status).toBe('connecting');expect(Socket.instances).toHaveLength(1);
    old.readyState=3;old.onclose?.();expect(Socket.instances).toHaveLength(2);
    const replacement=Socket.instances[1];replacement.onopen?.();expect(JSON.parse(replacement.sent[0]).protocol).toBe('px4');
    replacement.receive({type:'ready'});expect(client.status).toBe('ready');client.disconnect();
  });
  it('coalesces repeated reconnect requests during close and cancellation cannot reopen a socket',()=>{
    vi.stubGlobal('WebSocket',Socket);const client=new SitlClient();client.connect('betaflight');const old=Socket.instances[0];
    old.close=()=>{old.readyState=2;};client.connect('px4');client.connect('betaflight');
    expect(Socket.instances).toHaveLength(1);old.readyState=3;old.onclose?.();expect(Socket.instances).toHaveLength(2);
    const next=Socket.instances[1];next.onopen?.();expect(JSON.parse(next.sent[0]).protocol).toBe('betaflight');
    next.close=()=>{next.readyState=2;};client.connect('px4');client.disconnect();next.readyState=3;next.onclose?.();
    expect(Socket.instances).toHaveLength(2);expect(client.status).toBe('disconnected');
  });
});
