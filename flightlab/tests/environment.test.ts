import { describe,it,expect } from 'vitest';
import { Vector3 } from 'three';
import { FlightWorld } from '../src/world';
import { makeEnvironment } from '../src/environment';
describe('worker collision environment',()=>{
  it.each(['drone','plane','space'] as const)('matches authored %s terrain and collision queries',mode=>{
    const world=new FlightWorld(mode),env=makeEnvironment(world.physicsSnapshot());
    for(let x=-250;x<=300;x+=31)for(let z=-800;z<=400;z+=47){expect(env.groundHeight(x,z)).toBe(world.groundHeight(x,z));for(const y of [1,8,30,70]){const p=new Vector3(x,y,z);expect(env.collides(p,.6)).toBe(world.collides(p,.6));}}
    world.dispose();
  });
  it('returns an outward collision normal without modifying the query',()=>{
    const env=makeEnvironment({mode:'drone',hills:[],pad:{position:[0,0,0],radius:1},solids:[{min:[0,0,0],max:[10,10,10]}]});
    const p=new Vector3(-.2,5,5);expect(env.contactNormal!(p,.6)?.toArray()).toEqual([-1,0,0]);expect(p.x).toBe(-.2);
  });
});
