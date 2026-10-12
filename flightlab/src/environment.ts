import { Vector3 } from 'three';
import type { FlightEnvironment, FlightMode } from './types';

export type Vec3 = [number, number, number];
export interface WorldPhysics {
  mode: FlightMode;
  solids: { min: Vec3; max: Vec3 }[];
  hills: { x:number; z:number; rx:number; rz:number; height:number }[];
  pad: { position:Vec3; radius:number };
}

/** Identical terrain/collision data in the renderer and in the physics worker. */
export function makeEnvironment(world:WorldPhysics):FlightEnvironment {
  const groundHeight=(x:number,z:number)=>{
    if(world.mode==='space')return -Infinity;
    let ground=x>=-1400&&x<=70&&z>=-2200&&z<=800?0:-3;
    if(x>70&&x<=147.5&&(Math.abs(z+68)<11||Math.abs(z+423)<11))ground=.3;
    if(Math.hypot(x-world.pad.position[0],z-world.pad.position[2])<=world.pad.radius)ground=world.pad.position[1];
    for(const hill of world.hills){const d=((x-hill.x)/hill.rx)**2+((z-hill.z)/hill.rz)**2;if(d<1)ground=Math.max(ground,hill.height*(Math.sqrt(1-d)-.22));}
    return ground;
  };
  const contactNormal=(p:Vector3,r:number):Vector3|null=>{
    if(world.mode==='space'){
      const radial=Math.hypot(p.x,p.y-8),tube=Math.hypot(radial-112,p.z+550);
      if(tube<6.2+r){const center=new Vector3(p.x,p.y-8,0).normalize().multiplyScalar(112).add(new Vector3(0,8,-550));return p.clone().sub(center).normalize();}
      if(Math.abs(p.z+660)<1.5+r&&Math.abs(p.y-8)<71+r&&Math.abs(p.x)>57.5-r&&Math.abs(p.x)<273.5+r)return new Vector3(0,0,p.z>=-660?1:-1);
    }
    for(const box of world.solids){
      const nearest=new Vector3(Math.max(box.min[0],Math.min(p.x,box.max[0])),Math.max(box.min[1],Math.min(p.y,box.max[1])),Math.max(box.min[2],Math.min(p.z,box.max[2])));
      const delta=p.clone().sub(nearest);if(delta.lengthSq()>=r*r)continue;
      if(delta.lengthSq()>1e-10)return delta.normalize();
      const distances=[p.x-box.min[0],box.max[0]-p.x,p.y-box.min[1],box.max[1]-p.y,p.z-box.min[2],box.max[2]-p.z];
      const face=distances.indexOf(Math.min(...distances));return new Vector3(face===0?-1:face===1?1:0,face===2?-1:face===3?1:0,face===4?-1:face===5?1:0);
    }
    return null;
  };
  return {wind:new Vector3(),gravity:world.mode==='space'?0:9.81,groundHeight,contactNormal,collides:(p,r)=>contactNormal(p,r)!==null};
}
