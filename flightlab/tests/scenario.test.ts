import {describe,it,expect} from 'vitest';
import {defaultScenario,validateScenario,scenarioSpawn,scenarioWind,targetAt} from '../src/scenario';
describe('scenario data and experiments',()=>{
  it('round trips each vehicle without shared mutable data',()=>{for(const mode of ['drone','plane','space'] as const){const original=defaultScenario(mode),copy=validateScenario(JSON.parse(JSON.stringify(original)));expect(copy).toEqual(original);copy.spawn.position[0]=99;expect(original.spawn.position[0]).not.toBe(99);}});
  it('rejects malformed imported vectors, excess gates and nonfinite values',()=>{const s=defaultScenario('drone');expect(()=>validateScenario({...s,wind:[1,NaN,0]})).toThrow();expect(()=>validateScenario({...s,gates:new Array(65).fill({})})).toThrow();expect(()=>validateScenario({...s,gravity:-1})).toThrow();});
  it('makes seeded wind repeatable and resolves target velocity analytically',()=>{const s=defaultScenario('space');s.gust=2;s.dock.amplitude=20;const a=targetAt(s,8),b=targetAt(s,8.001);expect(b.position.clone().sub(a.position).divideScalar(.001).x).toBeCloseTo(a.velocity.x,2);expect(scenarioWind(s,20)).toEqual(scenarioWind(s,20));});
  it('converts compass heading into body orientation',()=>{const s=defaultScenario('drone');s.spawn.heading=90;const p=scenarioSpawn(s);expect(p.velocity.clone().set(0,0,-1).applyQuaternion(p.quaternion).x).toBeCloseTo(1);});
});
