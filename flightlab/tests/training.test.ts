import { afterEach,describe,expect,it,vi } from 'vitest';
import { Quaternion,Sprite,Vector3 } from 'three';
import { TrainingSession } from '../src/training';
import { createFlightState,getTelemetry,setHandlingPreset,stepFlight,ZERO_INPUT } from '../src/physics';
import type { FlightInput, FlightMode } from '../src/types';
import { FlightWorld } from '../src/world';
const dock={position:new Vector3(0,8,-150),quaternion:new Quaternion(),radius:9};
function setup(mode:FlightMode){
  const spawn={position:new Vector3(0,mode==='drone'?.6:8,0),quaternion:new Quaternion(),velocity:new Vector3(),throttle:0};
  return {state:createFlightState(mode,spawn),lesson:new TrainingSession(mode,spawn.position,spawn.quaternion,dock,()=>0)};
}
function tick(set:ReturnType<typeof setup>,seconds:number,input:Partial<FlightInput>={}){for(let i=0;i<seconds*120;i++)set.lesson.update(set.state,{...ZERO_INPUT,...input},1/120);}
const worlds:FlightWorld[]=[];
afterEach(()=>{for(const world of worlds)world.dispose();worlds.length=0;vi.restoreAllMocks();});
function setupInWorld(mode:FlightMode){
  vi.spyOn(FlightWorld.prototype as unknown as {makeLabel:()=>Sprite},'makeLabel').mockImplementation(()=>new Sprite());
  const world=new FlightWorld(mode);worlds.push(world);
  const spawn=world.trainingSpawn();
  const environment={wind:new Vector3(),groundHeight:(x:number,z:number)=>world.groundHeight(x,z),collides:(p:Vector3,r:number)=>world.collides(p,r)};
  return {state:createFlightState(mode,spawn),lesson:new TrainingSession(mode,spawn.position,spawn.quaternion,world.dock,environment.groundHeight),environment,world};
}
describe('skill-based flight lessons',()=>{
  it('does not award a drone course for waiting on the ground',()=>{const s=setup('drone');tick(s,180);expect(s.lesson.step).toBe(0);expect(s.lesson.completed).toBe(false);});
  it('requires lift, a steady hover, heading change, acceleration and an active brake',()=>{
    const s=setup('drone');s.state.position.y=8;tick(s,.55);expect(s.lesson.step).toBe(1);
    tick(s,3);s.state.velocity.x=3;tick(s,.1);s.state.velocity.x=0;tick(s,3);expect(s.lesson.step).toBe(1);tick(s,1.1);expect(s.lesson.step).toBe(2);
    s.state.quaternion.setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2);tick(s,1.1);expect(s.lesson.step).toBe(3);
    s.state.velocity.x=7;tick(s,.4);s.state.velocity.x=0;tick(s,3);expect(s.lesson.completed).toBe(false);
    tick(s,2.1,{brake:true});expect(s.lesson.completed).toBe(true);
  });
  it('requires actual translation input and realignment before docking',()=>{
    const s=setup('space');s.state.position.z=-25;tick(s,1);expect(s.lesson.step).toBe(0);
    tick(s,.3,{moveZ:.4});expect(s.lesson.step).toBe(1);tick(s,2.1);expect(s.lesson.step).toBe(2);
    tick(s,3);expect(s.lesson.step).toBe(2);
    s.state.quaternion.setFromAxisAngle(new Vector3(0,1,0),.6);tick(s,.1);s.state.quaternion.identity();tick(s,1.1);expect(s.lesson.step).toBe(3);
    s.state.position.copy(dock.position);s.state.velocity.z=-3;tick(s,3);expect(s.lesson.completed).toBe(false);
    s.state.velocity.set(0,0,0);tick(s,2.1);expect(s.lesson.completed).toBe(true);
  });
  it('does not advance a crashed aircraft',()=>{const s=setup('plane');s.state.position.y=50;s.state.airspeed=35;s.state.crashed=true;tick(s,10);expect(s.lesson.step).toBe(0);});

  it('measures forward travel in the spawn frame and labels relative headings correctly',()=>{
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2);
    const vessel=createFlightState('space',{position:new Vector3(),quaternion:rotation,velocity:new Vector3(),throttle:0});
    const lesson=new TrainingSession('space',vessel.position,rotation,dock,()=>0);
    vessel.position.x=21;
    for(let i=0;i<30;i++)lesson.update(vessel,{...ZERO_INPUT,moveZ:.5},1/120);
    expect(lesson.step).toBe(1);
    const droneLesson=new TrainingSession('drone',new Vector3(),rotation,dock,()=>0);
    droneLesson.step=2;
    expect(droneLesson.lesson.description).toContain('180°');
  });

  it('can complete the drone course through the actual gentle flight model',()=>{
    const s=setupInWorld('drone');setHandlingPreset(s.state,'gentle');
    const environment=s.environment;
    for(let frame=0;frame<120*180&&!s.lesson.completed;frame++){
      const input={...ZERO_INPUT,throttle:Math.min(.85,Math.max(.2,.5+(8-s.state.position.y)*.07-s.state.velocity.y*.16))};
      if(s.lesson.step===2){
        const heading=getTelemetry(s.state,environment.wind).heading;
        input.yaw=Math.max(-.6,Math.min(.6,(90-heading)*.025));
      }
      if(s.lesson.step===3)input.pitch=-.4;
      if(s.lesson.step===4)input.brake=true;
      stepFlight(s.state,input,environment,1/120);s.lesson.update(s.state,input,1/120);
    }
    expect(s.state.crashed).toBe(false);
    expect(s.lesson.step).toBe(s.lesson.count);
    expect(s.lesson.completed).toBe(true);
  });

  it('can take off, turn, cruise, and descend through the actual gentle fixed-wing model',()=>{
    const s=setupInWorld('plane');setHandlingPreset(s.state,'gentle');
    const environment=s.environment;
    const transitions:number[][]=[];
    for(let frame=0;frame<120*180&&!s.lesson.completed;frame++){
      const input={...ZERO_INPUT,throttle:.55};
      if(s.lesson.step===0){input.throttle=.95;input.pitch=.18;}
      if(s.lesson.step===1)input.roll=.45;
      if(s.lesson.step===2)input.throttle=.4;
      if(s.lesson.step===3){input.throttle=Math.max(0,Math.min(.8,.21+(32-s.state.airspeed)*.05));input.pitch=-.1;}
      stepFlight(s.state,input,environment,1/120);if(s.lesson.update(s.state,input,1/120))transitions.push([s.lesson.step,s.state.position.y,s.state.airspeed,s.state.flightTime]);
    }
    expect(s.state.crashed).toBe(false);
    expect(s.lesson.step,JSON.stringify({transitions,position:s.state.position.toArray(),velocity:s.state.velocity.toArray(),speed:s.state.airspeed})).toBe(s.lesson.count);
    expect(s.lesson.completed).toBe(true);
  });

  it('can complete translation, braking, realignment, and docking through the actual space model',()=>{
    const s=setupInWorld('space');setHandlingPreset(s.state,'gentle');let turned=false;
    const environment=s.environment;const target=s.world.dock;
    for(let frame=0;frame<120*180&&!s.lesson.completed;frame++){
      const input={...ZERO_INPUT};
      if(s.lesson.step===0)input.moveZ=.5;
      if(s.lesson.step===1)input.brake=true;
      if(s.lesson.step===2){
        turned ||= s.state.quaternion.angleTo(target.quaternion)>.6;
        const heading=getTelemetry(s.state,environment.wind).heading;
        input.yaw=turned?Math.max(-.5,Math.min(.5,(heading>180?360-heading:-heading)*.04)):.5;
      }
      if(s.lesson.step===3){
        const direction=target.position.clone().sub(s.state.position).applyQuaternion(s.state.quaternion.clone().invert());
        const distance=direction.length();
        if(distance<4)input.brake=true;
        else{
          const target=Math.min(10,distance*.3)/20;
          let low=0,high=1;
          for(let i=0;i<20;i++){const mid=(low+high)/2;if(.2*mid+.8*mid**3<target)low=mid;else high=mid;}
          direction.normalize().multiplyScalar((low+high)/2);
          input.moveX=direction.x;input.moveY=direction.y;input.moveZ=-direction.z;
        }
      }
      stepFlight(s.state,input,environment,1/120);s.lesson.update(s.state,input,1/120);
    }
    expect(s.state.crashed).toBe(false);
    expect(s.lesson.step).toBe(s.lesson.count);
    expect(s.lesson.completed).toBe(true);
  });
});
