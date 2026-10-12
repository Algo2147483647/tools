import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { defaultVehicleConfig, getDynamicsTelemetry, getHandlingPreset, ZERO_INPUT } from '../src/physics';
import { defaultScenario, scenarioWind } from '../src/scenario';
import { captureState, PHYSICS_DT, SimulationRunner, type SimulationInit, type SimulationFrame } from '../src/simulation';
import { makeSitlFrame } from '../src/sitl-client';

function configuration():SimulationInit {
  return {mode:'drone',spawn:{p:[-300,500,0],q:[0,0,0,1],v:[0,0,0],throttle:.5},
    world:{mode:'drone',solids:[],hills:[],pad:{position:[0,.25,120],radius:8}},
    config:defaultVehicleConfig('drone'),handling:'balanced',scenario:null,controlMode:'angle',armed:true};
}

describe('authoritative fixed-step simulation runner',()=>{
  it('applies handling changes inside the simulation without resetting the flight',()=>{
    const runner=new SimulationRunner(configuration());
    runner.advance({input:{...ZERO_INPUT,roll:.5},elapsed:.05,wind:[0,0,0]});
    const before=captureState(runner.state);
    const packet=runner.advance({input:ZERO_INPUT,elapsed:0,wind:[0,0,0],handling:'sport'});
    expect(packet.frames).toHaveLength(0);
    expect(getHandlingPreset(runner.state)).toBe('sport');
    expect(captureState(runner.state)).toEqual(before);
    const target=runner.advance({input:{...ZERO_INPUT,roll:.5},elapsed:PHYSICS_DT,wind:[0,0,0]}).frames[0].telemetry.targetRates[2];
    const gentle=new SimulationRunner({...configuration(),handling:'gentle'});
    const gentleTarget=gentle.advance({input:{...ZERO_INPUT,roll:.5},elapsed:PHYSICS_DT,wind:[0,0,0]}).frames[0].telemetry.targetRates[2];
    expect(Math.abs(target)).toBeGreaterThan(Math.abs(gentleTarget));
  });

  it('produces the same seeded gust, sensor and scheduled-fault trajectory at60Hzand144Hz',()=>{
    const setup=configuration(),scenario=defaultScenario('drone');
    scenario.wind=[2,0,-1];scenario.gust=3;scenario.seed=813;scenario.fault={type:'sensor',at:1,strength:.3};
    setup.scenario=scenario;setup.controlMode='position';
    setup.config={...setup.config,gyroNoise:.01,sensorDelay:.012,positionNoise:.1};
    const trajectories:SimulationFrame[][]=[];
    for(const hz of [60,144]){
      const runner=new SimulationRunner(structuredClone(setup));const trajectory:SimulationFrame[]=[];
      for(let frame=0;frame<hz*3;frame++) trajectory.push(...runner.advance({input:ZERO_INPUT,elapsed:1/hz,wind:[50,50,50]}).frames);
      expect(runner.state.crashed).toBe(false);expect(trajectory).toHaveLength(720);trajectories.push(trajectory);
    }
    expect(trajectories[0]).toEqual(trajectories[1]);
    expect(trajectories[0][239].telemetry.fault).toBe('none');
    expect(trajectories[0][240].telemetry.fault).toBe('sensor');
    expect(trajectories[0][0].wind).toEqual(scenarioWind(scenario,0));
  });

  it('accounts for dropped wall time and retains substep remainder without a large catch-up impulse',()=>{
    const runner=new SimulationRunner(configuration());
    const packet=runner.advance({input:ZERO_INPUT,elapsed:1,wind:[0,0,0]});
    expect(packet.frames).toHaveLength(18);expect(packet.droppedTime).toBeCloseTo(.925,12);
    expect(runner.state.flightTime).toBeCloseTo(.075,12);
    expect(runner.advance({input:ZERO_INPUT,elapsed:PHYSICS_DT*.4,wind:[0,0,0]}).frames).toHaveLength(0);
    expect(runner.advance({input:ZERO_INPUT,elapsed:PHYSICS_DT*.6,wind:[0,0,0]}).frames).toHaveLength(1);
  });

  it('disarms a water impact and stops angular motion as well as translation',()=>{
    const setup=configuration();setup.spawn={p:[-500,-2.35,1500],q:[0,0,0,1],v:[0,-1,0],throttle:0};
    const runner=new SimulationRunner(setup);runner.state.angularVelocity.y=.5;
    runner.advance({input:ZERO_INPUT,elapsed:.075,wind:[0,0,0]});
    expect(runner.state.crashed).toBe(true);expect(runner.state.velocity.length()).toBe(0);
    expect(runner.state.angularVelocity.length()).toBe(0);expect(getDynamicsTelemetry(runner.state).armed).toBe(false);
  });

  it('converts simulated gyro and specific-force observations into firmware body axes',()=>{
    const setup=configuration();setup.config={...setup.config,gyroBias:.03,accelBias:.1};
    const runner=new SimulationRunner(setup);
    const telemetry=runner.advance({input:ZERO_INPUT,elapsed:PHYSICS_DT,wind:[0,0,0]}).frames[0].telemetry;
    const gyro=new Vector3().fromArray(telemetry.sensors.gyro),accel=new Vector3().fromArray(telemetry.sensors.accel);
    const frame=makeSitlFrame(1,4167,{...runner.state,angularVelocity:gyro},ZERO_INPUT,accel,true,true);
    expect(frame.gyroFrd).toEqual([-gyro.z,gyro.x,-gyro.y]);
    expect(frame.specificForceFrd).toEqual([-accel.z,accel.x,-accel.y]);
    expect(frame.gyroFrd).not.toEqual([-runner.state.angularVelocity.z,runner.state.angularVelocity.x,-runner.state.angularVelocity.y]);
    expect(frame.specificForceFrd[2]).toBeLessThan(-9);
  });

  it('starts a strict-arming scenario with stopped motors despite a stored throttle setting',()=>{
    const setup=configuration();setup.armed=false;setup.spawn.throttle=.8;
    const runner=new SimulationRunner(setup);
    expect(getDynamicsTelemetry(runner.state).outputs).toEqual([0,0,0,0]);
    const frame=runner.advance({input:ZERO_INPUT,elapsed:PHYSICS_DT,wind:[0,0,0]}).frames[0];
    expect(frame.telemetry.commands).toEqual([0,0,0,0]);
    expect(frame.telemetry.outputs).toEqual([0,0,0,0]);
    expect(frame.state.v[1]).toBeCloseTo(-9.81*PHYSICS_DT,12);
  });
});
