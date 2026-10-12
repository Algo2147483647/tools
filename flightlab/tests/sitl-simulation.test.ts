import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationRunner, PHYSICS_DT, type SimulationInit } from '../src/simulation';
import { SimulationClient } from '../src/simulation-client';
import { ZERO_INPUT } from '../src/physics';
const init = (): SimulationInit => ({mode:'drone',spawn:{p:[0,100,0],q:[0,0,0,1],v:[0,0,0],throttle:0},
  world:{mode:'drone',solids:[],hills:[],pad:{position:[0,0,0],radius:8}},config:{},handling:'balanced',
  scenario:null,controlMode:'angle',armed:true});
const command = {input:{...ZERO_INPUT},elapsed:PHYSICS_DT,wind:[0,0,0] as [number,number,number]};
class FakeWorker {
  static last:FakeWorker;onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;
  static failNext=false;terminated=false;
  messages:Record<string,unknown>[]=[];constructor(){if(FakeWorker.failNext){FakeWorker.failNext=false;throw Error('Worker unavailable');}FakeWorker.last=this;}postMessage(message:Record<string,unknown>){this.messages.push(message);}terminate(){this.terminated=true;}
  receive(data:unknown){this.onmessage?.({data});}
}
afterEach(()=>vi.unstubAllGlobals());
describe('external firmware and worker boundary',()=>{
  it('advances exactly one fixed step for one accepted external motor command',()=>{
    const runner=new SimulationRunner(init());const before=runner.state.flightTime;
    const response=runner.advance({...command,motors:[.4,.4,.4,.4]});
    expect(response.frames).toHaveLength(1);expect(runner.state.flightTime-before).toBeCloseTo(PHYSICS_DT,12);
    expect(response.frames[0].telemetry.externalControl).toBe(true);
    expect(response.frames[0].telemetry.commands).toEqual([.4,.4,.4,.4]);
  });
  it('firmware electrical outputs drive rotor lag and squared thrust without the built-in mixer changing them',()=>{
    const a=new SimulationRunner(init()),b=new SimulationRunner(init());let packet;
    for(let index=0;index<120;index++){
      packet=a.advance({...command,motors:[.6,.6,.6,.6]});
      b.advance({...command,input:{...ZERO_INPUT,roll:1,pitch:-1,yaw:.9,throttle:1},motors:[.6,.6,.6,.6]});
    }
    expect(a.state.position.distanceTo(b.state.position)).toBeLessThan(1e-10);
    expect(a.state.quaternion.angleTo(b.state.quaternion)).toBeLessThan(1e-10);
    for(const thrust of packet!.frames[0].telemetry.outputs)expect(thrust).toBeCloseTo(.36,4);
  });
  it('does not allow a second worker step while the first command is pending',()=>{
    vi.stubGlobal('Worker',FakeWorker);const onFrame=vi.fn(),client=new SimulationClient(onFrame,vi.fn());client.initialize(init());
    FakeWorker.last.receive({type:'ready',generation:1});client.setMotors([.1,.2,.3,.4]);
    expect(client.advance(command)).toBe(true);expect(client.advance(command)).toBe(false);
    expect(FakeWorker.last.messages.filter(message=>message.type==='step')).toHaveLength(1);
    expect((FakeWorker.last.messages[1].value as {motors:number[]}).motors).toEqual([.1,.2,.3,.4]);client.dispose();
  });
  it('ignores stale worker frames and ready events after a flight reset',()=>{
    vi.stubGlobal('Worker',FakeWorker);const onFrame=vi.fn(),client=new SimulationClient(onFrame,vi.fn());client.initialize(init());client.initialize(init());
    FakeWorker.last.receive({type:'ready',generation:1});expect(client.busy).toBe(true);
    FakeWorker.last.receive({type:'frame',generation:1,packet:{frames:[]}});expect(onFrame).not.toHaveBeenCalled();
    FakeWorker.last.receive({type:'ready',generation:2});expect(client.busy).toBe(false);client.dispose();
  });
  it('constructs a fresh worker after failure and ignores late errors from the dead instance',()=>{
    vi.stubGlobal('Worker',FakeWorker);const onFrame=vi.fn(),onError=vi.fn(),client=new SimulationClient(onFrame,onError);client.initialize(init());
    const failed=FakeWorker.last;failed.receive({type:'ready',generation:1});client.advance(command);failed.onerror?.();
    expect(failed.terminated).toBe(true);expect(client.busy).toBe(true);expect(onError).toHaveBeenCalledTimes(1);
    client.initialize(init());const replacement=FakeWorker.last;expect(replacement).not.toBe(failed);
    failed.receive({type:'frame',generation:2,packet:{frames:[]}});failed.onerror?.();
    expect(onFrame).not.toHaveBeenCalled();expect(onError).toHaveBeenCalledTimes(1);
    replacement.receive({type:'ready',generation:2});expect(client.advance(command)).toBe(true);
    replacement.receive({type:'frame',generation:2,packet:{frames:[]}});expect(onFrame).toHaveBeenCalledOnce();client.dispose();
  });
  it('uses the same numerical runner when worker reconstruction is unavailable',()=>{
    vi.stubGlobal('Worker',FakeWorker);const onFrame=vi.fn(),client=new SimulationClient(onFrame,vi.fn());client.initialize(init());FakeWorker.last.onerror?.();
    FakeWorker.failNext=true;client.initialize(init());expect(client.backend).toMatch(/Main thread/);expect(client.busy).toBe(false);
    expect(client.advance(command)).toBe(true);expect(onFrame.mock.calls[0][0].frames).toHaveLength(1);client.dispose();
  });
  it('retains the latest queued handling choice while a worker step is busy',()=>{
    vi.stubGlobal('Worker',FakeWorker);const client=new SimulationClient(vi.fn(),vi.fn());client.initialize(init());
    const worker=FakeWorker.last;worker.receive({type:'ready',generation:1});client.advance(command);
    client.setHandling('sport');expect(client.advance(command)).toBe(false);client.setHandling('gentle');
    worker.receive({type:'frame',generation:1,packet:{frames:[]}});client.advance(command);
    const steps=worker.messages.filter(message=>message.type==='step');expect((steps[1].value as {handling:string}).handling).toBe('gentle');client.dispose();
  });
});
