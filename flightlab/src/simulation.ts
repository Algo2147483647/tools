import { Quaternion, Vector3 } from 'three';
import { createFlightState,stepFlight,setHandlingPreset,configureVehicle,setControlMode,setArmed,setFault,setExternalActuators,getDynamicsTelemetry } from './physics';
import type { FlightInput,FlightMode,FlightState } from './types';
import { makeEnvironment,type Vec3,type WorldPhysics } from './environment';
import { scenarioWind,type Scenario } from './scenario';

export const PHYSICS_DT=1/240;
export interface StateFrame { mode:FlightMode;p:Vec3;pp:Vec3;q:[number,number,number,number];pq:[number,number,number,number];v:Vec3;w:Vec3;throttle:number;airspeed:number;stall:number;grounded:boolean;crashed:boolean;assist:boolean;flightTime:number; }
export interface SimulationInit { mode:FlightMode;spawn:{p:Vec3;q:[number,number,number,number];v:Vec3;throttle:number};world:WorldPhysics;config:Record<string,number>;handling:'gentle'|'balanced'|'sport';scenario:Scenario|null;controlMode:'acro'|'angle'|'altitude'|'position'|'manual';armed:boolean; }
export interface StepCommand { input:FlightInput;elapsed:number;wind:Vec3;controlMode?:SimulationInit['controlMode'];handling?:SimulationInit['handling'];armed?:boolean;motors?:number[]|null; }
export interface SimulationFrame {state:StateFrame;telemetry:ReturnType<typeof getDynamicsTelemetry>;wind:Vec3;}
export interface SimulationPacket {frames:SimulationFrame[];droppedTime:number;input:FlightInput;}
export function captureState(s:FlightState):StateFrame{return {mode:s.mode,p:s.position.toArray() as Vec3,pp:s.previousPosition.toArray() as Vec3,q:s.quaternion.toArray() as StateFrame['q'],pq:s.previousQuaternion.toArray() as StateFrame['pq'],v:s.velocity.toArray() as Vec3,w:s.angularVelocity.toArray() as Vec3,throttle:s.throttle,airspeed:s.airspeed,stall:s.stall,grounded:s.grounded,crashed:s.crashed,assist:s.assist,flightTime:s.flightTime};}
export function applyState(s:FlightState,f:StateFrame):void {s.mode=f.mode;s.position.fromArray(f.p);s.previousPosition.fromArray(f.pp);s.quaternion.fromArray(f.q);s.previousQuaternion.fromArray(f.pq);s.velocity.fromArray(f.v);s.angularVelocity.fromArray(f.w);s.throttle=f.throttle;s.airspeed=f.airspeed;s.stall=f.stall;s.grounded=f.grounded;s.crashed=f.crashed;s.assist=f.assist;s.flightTime=f.flightTime;}

/** Shared numerical runner: Worker in the browser; identical code in tests/fallback. */
export class SimulationRunner {
  readonly state:FlightState;
  readonly environment:ReturnType<typeof makeEnvironment>;
  private accumulator=0;private faultApplied=false;
  constructor(readonly init:SimulationInit){
    this.environment=makeEnvironment(init.world);this.environment.gravity=init.scenario?.gravity??(init.mode==='space'?0:9.81);
    this.state=createFlightState(init.mode,{position:new Vector3(...init.spawn.p),quaternion:new Quaternion(...init.spawn.q),velocity:new Vector3(...init.spawn.v),throttle:init.spawn.throttle});
    configureVehicle(this.state,init.config);setHandlingPreset(this.state,init.handling);setControlMode(this.state,init.controlMode);setArmed(this.state,init.armed);
  }
  advance(command:StepCommand):SimulationPacket {
    if(command.controlMode)setControlMode(this.state,command.controlMode);
    if(command.handling)setHandlingPreset(this.state,command.handling);
    if(command.armed!==undefined)setArmed(this.state,command.armed);
    if(command.motors!==undefined)setExternalActuators(this.state,command.motors);
    const elapsed=Number.isFinite(command.elapsed)?Math.max(0,command.elapsed):0;
    this.accumulator+=Math.min(.075,elapsed);let count=0;
    const frames:SimulationFrame[]=[];
    while(this.accumulator+1e-10>=PHYSICS_DT&&count<18&&!this.state.crashed){
      this.accumulator-=PHYSICS_DT;count++;
      const scenario=this.init.scenario;
      this.environment.wind.fromArray(scenario?scenarioWind(scenario,this.state.flightTime):command.wind);
      if(scenario&&!this.faultApplied&&this.state.flightTime+1e-10>=scenario.fault.at){setFault(this.state,scenario.fault.type,scenario.fault.strength);this.faultApplied=true;}
      stepFlight(this.state,command.input,this.environment,PHYSICS_DT);
      if(this.state.mode!=='space'&&this.state.grounded&&this.environment.groundHeight(this.state.position.x,this.state.position.z)<=-2.99){
        this.state.crashed=true;this.state.velocity.set(0,0,0);this.state.angularVelocity.set(0,0,0);setArmed(this.state,false);
      }
      frames.push({state:captureState(this.state),telemetry:getDynamicsTelemetry(this.state),wind:this.environment.wind.toArray() as Vec3});
    }
    return {frames,droppedTime:Math.max(0,elapsed-.075),input:{...command.input}};
  }
}
