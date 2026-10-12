import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createFlightState, getDynamicsTelemetry, stepFlight, ZERO_INPUT } from '../src/physics';
import { captureState } from '../src/simulation';
import { defaultScenario } from '../src/scenario';
import { FlightRecorder, MAX_RECORDING_FRAMES, recordingStats, validateRecording } from '../src/recorder';
import { defaultVehicleConfig, getVehicleFields, validateVehicleConfig } from '../src/vehicle-config';
import type { FlightMode } from '../src/types';

function state(mode: FlightMode = 'drone') {
  return createFlightState(mode, { position: new Vector3(0, 10, 0), quaternion: new Quaternion(), velocity: new Vector3(), throttle: 0.5 });
}
function recording() {
  const s = state(), recorder = new FlightRecorder();
  recorder.begin('drone', { mass: 1.2 }, defaultScenario('drone'));
  recorder.record(s, { ...ZERO_INPUT }, getDynamicsTelemetry(s));
  s.flightTime = 1; s.position.set(3, 14, 0); s.velocity.set(3, 4, 0);
  s.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
  recorder.record(s, { ...ZERO_INPUT, pitch: 1 }, getDynamicsTelemetry(s));
  return recorder.recording!;
}

describe('flight recording', () => {
  it('records at30Hz from simulation time and snapshots state, input, telemetry and experiment seed', () => {
    const s = state(), input = { ...ZERO_INPUT }, telemetry = getDynamicsTelemetry(s), scenario = defaultScenario('drone');
    const config = { mass: 1.2 }, recorder = new FlightRecorder();
    scenario.seed = 753;
    recorder.begin('drone', config, scenario);
    for (let i = 0; i < 240; i++) { s.flightTime = i / 240; recorder.record(s, input, telemetry); }
    expect(recorder.sampleCount).toBe(30);
    expect(recorder.duration).toBeCloseTo(29 / 30);
    config.mass = 9; scenario.seed = 1; telemetry.targetRates[0] = 99; input.pitch = 1; s.position.x = 700;
    const saved = recorder.recording!;
    expect(saved.config.mass).toBe(1.2);
    expect(saved.scenario?.seed).toBe(753);
    expect(saved.frames[0].state.p[0]).toBe(0);
    expect(saved.frames[0].input.pitch).toBe(0);
    expect(saved.frames[0].telemetry.targetRates[0]).toBe(0);
    saved.frames[0].state.p[0] = 500;
    expect(recorder.recording!.frames[0].state.p[0]).toBe(0);
  });

  it('accepts worker state frames and starts a fresh timeline for every flight', () => {
    const s = state(), recorder = new FlightRecorder();
    expect(recorder.record(s, ZERO_INPUT, getDynamicsTelemetry(s))).toBe(false);
    recorder.begin('drone', {}, null);
    s.flightTime = 21;
    expect(recorder.record(captureState(s), ZERO_INPUT, getDynamicsTelemetry(s))).toBe(true);
    expect(recorder.recording!.frames[0].t).toBe(0);
    s.flightTime = 22; recorder.record(s, ZERO_INPUT, getDynamicsTelemetry(s));
    expect(recorder.duration).toBe(1);
    s.flightTime = 20;
    expect(recorder.record(s, ZERO_INPUT, getDynamicsTelemetry(s))).toBe(false);
    recorder.begin('space', {}, null);
    expect(recorder.sampleCount).toBe(0);
    const ship = state('space');
    expect(recorder.record(ship, ZERO_INPUT, getDynamicsTelemetry(ship))).toBe(true);
    expect(recorder.recording!.mode).toBe('space');
    expect(recorder.duration).toBe(0);
    recorder.clear();
    expect(recorder.recording).toBeNull();
    expect(recorder.frameAt(0)).toBeNull();
  });

  it('bounds memory to18000 snapshots while retaining the start of the flight', () => {
    const recorder = new FlightRecorder(), s = state(), telemetry = getDynamicsTelemetry(s);
    recorder.begin('drone', {}, null);
    for (let i = 0; i <= MAX_RECORDING_FRAMES; i++) { s.flightTime = i / 30; recorder.record(s, ZERO_INPUT, telemetry); }
    expect(recorder.full).toBe(true);
    expect(recorder.sampleCount).toBe(MAX_RECORDING_FRAMES);
    expect(recorder.frameAt(0)?.t).toBe(0);
    expect(recorder.duration).toBeCloseTo((MAX_RECORDING_FRAMES - 1) / 30);
    s.flightTime = 601; s.crashed = true; telemetry.damage = 1;
    expect(recorder.record(captureState(s), ZERO_INPUT, telemetry)).toBe(true);
    expect(recorder.sampleCount).toBe(MAX_RECORDING_FRAMES);
    expect(recorder.frameAt(0)?.t).toBe(0);
    expect(recorder.frameAt(601)?.state.crashed).toBe(true);
    expect(recorder.frameAt(601)?.telemetry.damage).toBe(1);
    expect(recorder.record(s, ZERO_INPUT, telemetry)).toBe(false);
  });

  it('retains an actual hard-impact state between regular30Hz samples exactly once',()=>{
    const s=state(),recorder=new FlightRecorder();
    s.position.y=.8;s.previousPosition.copy(s.position);s.velocity.y=-20;
    const environment={wind:new Vector3(),groundHeight:()=>0,collides:()=>false};
    recorder.begin('drone',{},null);
    recorder.record(s,ZERO_INPUT,getDynamicsTelemetry(s));
    for(let step=0;step<7&&!s.crashed;step++){
      stepFlight(s,ZERO_INPUT,environment,1/240);
      recorder.record(captureState(s),ZERO_INPUT,getDynamicsTelemetry(s));
    }
    expect(s.crashed).toBe(true);
    expect(s.flightTime).toBeLessThan(1/30);
    expect(recorder.sampleCount).toBe(2);
    const saved=validateRecording(recorder.recording),terminal=saved.frames.at(-1)!;
    expect(terminal.state.crashed).toBe(true);
    expect(terminal.telemetry.damage).toBe(1);
    expect(terminal.telemetry.armed).toBe(false);
    expect(terminal.t).toBe(s.flightTime);
    expect(recorder.frameAt(terminal.t)?.state.crashed).toBe(true);
    expect(recorder.record(s,ZERO_INPUT,getDynamicsTelemetry(s))).toBe(false);
    expect(recorder.sampleCount).toBe(2);
  });

  it('interpolates position and shortest-path attitude with nearest discrete controls and telemetry', () => {
    const data = recording(), recorder = new FlightRecorder();
    data.frames[1].telemetry.damage = 0.7;
    data.frames[1].state.grounded = true;
    recorder.load(data);
    const halfway = recorder.frameAt(0.5)!;
    expect(halfway.state.p).toEqual([1.5, 12, 0]);
    expect(halfway.state.v).toEqual([1.5, 2, 0]);
    expect(new Quaternion(...halfway.state.q).angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2))).toBeCloseTo(0);
    expect(halfway.telemetry.damage).toBe(0.7);
    expect(halfway.input.pitch).toBe(1);
    expect(halfway.state.grounded).toBe(true);
    expect(recorder.frameAt(0.49)!.telemetry.damage).toBe(0);
    expect(recorder.frameAt(-1)!.t).toBe(0);
    expect(recorder.frameAt(99)!.t).toBe(1);
    expect(recorder.frameAt(NaN)).toBeNull();
    halfway.state.p[0] = 99; halfway.telemetry.targetRates[0] = 99;
    expect(recorder.frameAt(0.5)!.state.p[0]).toBe(1.5);
    expect(recorder.frameAt(0.5)!.telemetry.targetRates[0]).toBe(0);
  });

  it('round trips JSON and computes control error, distance, speed and damage', () => {
    const data = recording();
    data.frames[0].telemetry.targetRates = [1, 0, 0];
    data.frames[1].telemetry.targetRates = [3, 0, 0];
    data.frames[1].telemetry.measuredRates = [1, 0, 0];
    data.frames[1].telemetry.damage = 0.6;
    const restored = validateRecording(JSON.parse(JSON.stringify(data)));
    expect(restored).toEqual(data);
    const stats = recordingStats(restored);
    expect(stats).toMatchObject({ samples: 2, duration: 1, distance: 5, maxSpeed: 5, maxDamage: 0.6, peakRateError: 2 });
    expect(stats.rmsRateError).toBeCloseTo(Math.sqrt(2.5));
    expect(recordingStats({ ...restored, frames: [] })).toEqual({ samples: 0, duration: 0, distance: 0, maxSpeed: 0, maxDamage: 0, peakRateError: 0, rmsRateError: 0 });
  });

  it('rejects nonfinite values, corrupt states, sparse data, mixed modes and giant arrays', () => {
    const corruptions: ((data: ReturnType<typeof recording>) => void)[] = [
      d => { d.frames[0].state.p[0] = NaN; },
      d => { d.frames[0].input.roll = Infinity; },
      d => { d.frames[0].telemetry.pid.p[0] = NaN; },
      d => { d.frames[0].state.q = [0, 0, 0, 0]; },
      d => { d.frames[0].state.mode = 'space'; },
      d => { d.frames[1].t = 0; },
      d => { d.frames[1].state.flightTime = -1; },
      d => { d.frames[0].telemetry.outputs = Array(65).fill(0); },
      d => { d.frames = Array(MAX_RECORDING_FRAMES + 1); },
      d => { d.frames = Array(1); },
      d => { d.frames[0].state.p = Array(3) as [number, number, number]; },
      d => { d.config.mass = NaN; },
      d => { d.scenario!.mode = 'space'; },
      d => { d.name = 'x'.repeat(81); },
    ];
    for (const corrupt of corruptions) {
      const data = recording(); corrupt(data);
      expect(() => validateRecording(data)).toThrow();
    }
    expect(() => validateRecording(null)).toThrow();
    expect(() => validateRecording({})).toThrow();
  });

  it('keeps the previous recording after a rejected import', () => {
    const recorder = new FlightRecorder(); recorder.load(recording());
    const before = recorder.recording;
    expect(() => recorder.load({ version: 2 })).toThrow();
    expect(recorder.recording).toEqual(before);
  });

  it.each(['drone','plane','space'] as const)('normalizes imported %s configurations to exactly the replay schema',mode=>{
    const defaults=defaultVehicleConfig(mode);
    const source={version:1,name:'Legacy recording',mode,scenario:null,frames:[]};
    expect(validateRecording(source).config).toEqual(defaults);
    expect(validateRecording({...source,config:{}}).config).toEqual(defaults);
    const outOfRange={mass:1e8,inertiaX:-100,gyroNoise:99,unknownField:123};
    const imported=validateRecording({...source,config:outOfRange});
    expect(imported.config).toEqual(validateVehicleConfig(mode,outOfRange));
    expect(imported.config).not.toHaveProperty('unknownField');
    for(const field of getVehicleFields(mode)){
      expect(imported.config[field.key]).toBeGreaterThanOrEqual(field.min);
      expect(imported.config[field.key]).toBeLessThanOrEqual(field.max);
    }
    const recorder=new FlightRecorder();recorder.begin(mode,outOfRange,null);
    expect(recorder.recording!.config).toEqual(imported.config);
    expect(()=>validateRecording({...source,config:{mass:Infinity}})).toThrow();
    expect(()=>validateRecording({...source,config:{mass:NaN}})).toThrow();
  });
});
