import { Quaternion, Vector3 } from 'three';
import type { FlightMode, Gate, SpawnPoint } from './types';
import type { Vec3 } from './environment';

export interface Scenario {
  version:1; name:string; mode:FlightMode;
  spawn:{position:Vec3;velocity:Vec3;heading:number;throttle:number};
  wind:Vec3; gust:number; gravity:number; seed:number; strictArming:boolean;
  gates:{position:Vec3;heading:number;radius:number}[];
  dock:{position:Vec3;heading:number;radius:number;amplitude:number;period:number};
  fault:{type:'none'|'motor'|'sensor'|'wind';at:number;strength:number};
}
export function defaultScenario(mode:FlightMode):Scenario {
  return {version:1,name:`${mode==='drone'?'Rotor':mode==='plane'?'Airframe':'Orbital'} experiment`,mode,
    spawn:{position:mode==='drone'?[0,.9,120]:mode==='plane'?[-75,2.5,330]:[0,8,-320],velocity:[0,0,0],heading:0,throttle:0},
    wind:[0,0,0],gust:0,gravity:mode==='space'?0:9.81,seed:42,strictArming:true,gates:[],
    dock:{position:[0,8,-470],heading:0,radius:9,amplitude:0,period:40},fault:{type:'none',at:15,strength:.5}};
}
function number(value:unknown,min:number,max:number,label:string):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}.`);return value;
}
function vector(value:unknown,min:number,max:number,label:string):Vec3 {
  if(!Array.isArray(value)||value.length!==3)throw new Error(`${label} needs X, Y and Z.`);
  return value.map(v=>number(v,min,max,label)) as Vec3;
}
/** Imported scenarios are data only; no expressions, URLs, scripts or live code. */
export function validateScenario(raw:unknown):Scenario {
  if(!raw||typeof raw!=='object')throw new Error('Choose a valid FlightLab scenario.');
  const r=raw as Scenario;
  if(r.version!==1||!['drone','plane','space'].includes(r.mode))throw new Error('Unsupported scenario version or vehicle.');
  if(!r.spawn||!r.dock||!r.fault||!Array.isArray(r.gates)||r.gates.length>64)throw new Error('Scenario fields are incomplete (maximum 64 gates).');
  if(!['none','motor','sensor','wind'].includes(r.fault.type))throw new Error('Unknown fault type.');
  return {version:1,mode:r.mode,name:typeof r.name==='string'?r.name.slice(0,64):'Imported experiment',
    spawn:{position:vector(r.spawn.position,-20000,20000,'Spawn position'),velocity:vector(r.spawn.velocity,-500,500,'Spawn velocity'),heading:number(r.spawn.heading,-360,360,'Heading'),throttle:number(r.spawn.throttle,0,1,'Throttle')},
    wind:vector(r.wind,-60,60,'Wind'),gust:number(r.gust,0,30,'Gust'),gravity:number(r.gravity,0,25,'Gravity'),seed:number(r.seed,0,2147483647,'Seed')|0,strictArming:!!r.strictArming,
    gates:r.gates.map((g,i)=>({position:vector(g.position,-20000,20000,`Gate ${i+1}`),heading:number(g.heading,-360,360,'Gate heading'),radius:number(g.radius,2,100,'Gate radius')})),
    dock:{position:vector(r.dock.position,-20000,20000,'Dock position'),heading:number(r.dock.heading,-360,360,'Dock heading'),radius:number(r.dock.radius,2,30,'Capture radius'),amplitude:number(r.dock.amplitude,0,120,'Target motion'),period:number(r.dock.period,10,300,'Target period')},
    fault:{type:r.fault.type,at:number(r.fault.at,0,1800,'Fault time'),strength:number(r.fault.strength,0,1,'Fault strength')}};
}
export function scenarioSpawn(s:Scenario):SpawnPoint{return {position:new Vector3(...s.spawn.position),velocity:new Vector3(...s.spawn.velocity),quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-s.spawn.heading*Math.PI/180),throttle:s.spawn.throttle};}
export function scenarioGates(s:Scenario):Gate[]{return s.gates.map(g=>({position:new Vector3(...g.position),normal:new Vector3(Math.sin(g.heading*Math.PI/180),0,-Math.cos(g.heading*Math.PI/180)),radius:g.radius}));}
export function targetAt(s:Scenario,time:number):{position:Vector3;velocity:Vector3;quaternion:Quaternion;radius:number}{
  const omega=2*Math.PI/s.dock.period,phase=time*omega;
  return {position:new Vector3(...s.dock.position).add(new Vector3(Math.sin(phase)*s.dock.amplitude,0,0)),velocity:new Vector3(Math.cos(phase)*omega*s.dock.amplitude,0,0),quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-s.dock.heading*Math.PI/180),radius:s.dock.radius};
}
export function scenarioWind(s:Scenario,time:number):Vec3 {
  const phase=(s.seed%997)/997*6.28;
  return [s.wind[0]+s.gust*Math.sin(time*.43+phase),s.wind[1]+s.gust*.15*Math.sin(time*.77+phase),s.wind[2]+s.gust*.65*Math.cos(time*.31+phase)];
}
export function loadScenario(mode:FlightMode):Scenario {try{const value=localStorage.getItem(`flightlab.scenario.v1.${mode}`);if(value){const s=validateScenario(JSON.parse(value));if(s.mode===mode)return s;}}catch{}return defaultScenario(mode);}
export function saveScenario(s:Scenario):void {localStorage.setItem(`flightlab.scenario.v1.${s.mode}`,JSON.stringify(validateScenario(s)));}
