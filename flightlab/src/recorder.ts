import { Quaternion } from 'three';
import { captureState, type StateFrame, type SimulationFrame } from './simulation';
import { validateScenario, type Scenario } from './scenario';
import { validateVehicleConfig } from './vehicle-config';
import type { FlightInput, FlightMode, FlightState } from './types';

export const RECORDING_HZ = 30;
export const MAX_RECORDING_FRAMES = 18000;
export interface RecordedFrame {
  t: number;
  state: StateFrame;
  input: FlightInput;
  telemetry: SimulationFrame['telemetry'];
}
export interface FlightRecording {
  version: 1;
  name: string;
  mode: FlightMode;
  config: Record<string, number>;
  scenario: Scenario | null;
  frames: RecordedFrame[];
}
export interface RecordingStats {
  duration: number;
  /** Euclidean body-rate tracking error, rad/s. */
  rmsRateError: number;
  peakRateError: number;
  distance: number;
  maxSpeed: number;
  maxDamage: number;
  samples: number;
}
const clone = <T>(value: T): T => structuredClone(value);
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} is outside the supported range.`);
  return value === 0 ? 0 : value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}
function vector(value: unknown, size: 3, limit: number, label: string): [number, number, number];
function vector(value: unknown, size: 4, limit: number, label: string): [number, number, number, number];
function vector(value: unknown, size: number, limit: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== size) throw new Error(`${label} needs ${size} components.`);
  return Array.from(value, v => number(v, -limit, limit, label));
}
function rotation(value: unknown, label: string): StateFrame['q'] {
  const result = vector(value, 4, 1.0001, label) as StateFrame['q'];
  if (Math.abs(result.reduce((sum, component) => sum + component ** 2, 0) - 1) > 0.002) throw new Error(`${label} must be a normalized quaternion.`);
  return result;
}
function stateFrame(raw: unknown, mode: FlightMode): StateFrame {
  const s = object(raw, 'Flight state');
  if (s.mode !== mode) throw new Error('A recording cannot mix vehicle modes.');
  return {
    mode, p: vector(s.p, 3, 1e8, 'Position') as StateFrame['p'], pp: vector(s.pp, 3, 1e8, 'Previous position') as StateFrame['pp'],
    q: rotation(s.q, 'Attitude'), pq: rotation(s.pq, 'Previous attitude'),
    v: vector(s.v, 3, 1e5, 'Velocity') as StateFrame['v'], w: vector(s.w, 3, 1e4, 'Angular velocity') as StateFrame['w'],
    throttle: number(s.throttle, 0, 1, 'Throttle'), airspeed: number(s.airspeed, 0, 1e5, 'Airspeed'), stall: number(s.stall, 0, 1, 'Stall'),
    grounded: boolean(s.grounded, 'Ground contact'), crashed: boolean(s.crashed, 'Crash state'), assist: boolean(s.assist, 'Assist'),
    flightTime: number(s.flightTime, 0, 86400, 'Flight time'),
  };
}
function flightInput(raw: unknown): FlightInput {
  const r = object(raw, 'Control input');
  const result: FlightInput = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: boolean(r.brake, 'Brake'), boost: boolean(r.boost, 'Boost') };
  for (const key of ['pitch', 'roll', 'yaw', 'throttleDelta', 'moveX', 'moveY', 'moveZ'] as const) result[key] = number(r[key], -1, 1, key);
  if (r.throttle !== undefined) result.throttle = number(r.throttle, 0, 1, 'Absolute throttle');
  return result;
}
function vehicleConfig(raw: unknown, mode: FlightMode): Record<string, number> {
  const source = raw === undefined ? {} : object(raw, 'Vehicle configuration'), entries = Object.entries(source);
  if (entries.length > 128) throw new Error('Vehicle configuration is too large.');
  const finiteConfig = Object.fromEntries(entries.map(([key, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || key === 'constructor' || key === 'prototype') throw new Error('Invalid configuration field.');
    return [key, number(value, -1e9, 1e9, key)];
  }));
  return validateVehicleConfig(mode, finiteConfig);
}

function telemetry(raw: unknown): SimulationFrame['telemetry'] {
  const t = object(raw, 'Telemetry'), pid = object(t.pid, 'PID telemetry'), sensors = object(t.sensors, 'Sensor telemetry');
  if (!['acro', 'angle', 'altitude', 'position', 'manual'].includes(String(t.controlMode)) || !['none', 'motor', 'sensor', 'wind'].includes(String(t.fault))) throw new Error('Unknown controller or fault mode.');
  if (!Array.isArray(t.outputs) || t.outputs.length > 32 || !Array.isArray(t.commands) || t.commands.length > 32) throw new Error('Telemetry supports at most 32 actuator outputs.');
  return {
    armed: boolean(t.armed, 'Armed state'), controlMode: t.controlMode as SimulationFrame['telemetry']['controlMode'],
    externalControl: boolean(t.externalControl, 'External control'),
    targetRates: vector(t.targetRates, 3, 1e4, 'Rate target'), measuredRates: vector(t.measuredRates, 3, 1e4, 'Measured rate'),
    estimatedAngles: vector(t.estimatedAngles, 3, 360, 'Estimated attitude'), outputs: Array.from(t.outputs, value => number(value, -1, 1, 'Actuator command')),
    commands: Array.from(t.commands, value => number(value, -1, 1, 'Requested actuator command')),
    pid: { p: vector(pid.p, 3, 1e10, 'PID P term'), i: vector(pid.i, 3, 1e10, 'PID I term'), d: vector(pid.d, 3, 1e10, 'PID D term') },
    mass: number(t.mass, 0.001, 1e7, 'Vehicle mass'), fuel: number(t.fuel, 0, 1e7, 'Propellant'), damage: number(t.damage, 0, 1, 'Damage'),
    force: vector(t.force, 3, 1e10, 'Force'), torque: vector(t.torque, 3, 1e10, 'Torque'), acceleration: vector(t.acceleration, 3, 1e8, 'Acceleration'),
    saturation: boolean(t.saturation, 'Saturation'), fault: t.fault as SimulationFrame['telemetry']['fault'], contactSpeed: number(t.contactSpeed, 0, 1e5, 'Contact speed'),
    sensors: { gyro: vector(sensors.gyro, 3, 1e4, 'Gyroscope'), accel: vector(sensors.accel, 3, 1e8, 'Accelerometer'), quaternion: rotation(sensors.quaternion, 'Estimated quaternion'),
      position: vector(sensors.position, 3, 1e8, 'Sensor position'), velocity: vector(sensors.velocity, 3, 1e5, 'Sensor velocity') },
  };
}

/** Untrusted recording files contain bounded numeric data only. Unknown top-level fields are discarded. */
export function validateRecording(raw: unknown): FlightRecording {
  const r = object(raw, 'Recording');
  if (r.version !== 1 || !['drone', 'plane', 'space'].includes(String(r.mode))) throw new Error('Unsupported recording version or vehicle.');
  if (typeof r.name !== 'string' || !r.name.length || r.name.length > 80) throw new Error('Recording name must contain 1 to 80 characters.');
  if (!Array.isArray(r.frames) || r.frames.length > MAX_RECORDING_FRAMES) throw new Error(`A recording supports at most ${MAX_RECORDING_FRAMES} frames.`);
  const mode = r.mode as FlightMode, config = vehicleConfig(r.config, mode);
  const scenario = r.scenario === null ? null : validateScenario(r.scenario);
  if (scenario && scenario.mode !== mode) throw new Error('Recording and scenario vehicle modes differ.');
  let previous = -Infinity, previousFlightTime = -Infinity;
  const frames = Array.from(r.frames, rawFrame => {
    const f = object(rawFrame, 'Recorded frame'), t = number(f.t, 0, 86400, 'Timeline');
    if (t <= previous) throw new Error('Recording times must increase strictly.');
    const state = stateFrame(f.state, mode);
    if (state.flightTime < previousFlightTime) throw new Error('Recorded flight time cannot run backward.');
    previous = t; previousFlightTime = state.flightTime;
    return { t, state, input: flightInput(f.input), telemetry: telemetry(f.telemetry) };
  });
  return { version: 1, name: r.name, mode, config, scenario, frames };
}

function interpolateFrame(a: RecordedFrame, b: RecordedFrame, time: number): RecordedFrame {
  const alpha = b.t > a.t ? Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t))) : 0;
  const selected = alpha < 0.5 ? a : b, result = clone(selected);
  result.t = time;
  for (const key of ['p', 'pp', 'v', 'w'] as const) result.state[key] = a.state[key].map((value, i) => value + (b.state[key][i] - value) * alpha) as StateFrame[typeof key];
  for (const key of ['q', 'pq'] as const) result.state[key] = new Quaternion(...a.state[key]).slerp(new Quaternion(...b.state[key]), alpha).normalize().toArray() as StateFrame[typeof key];
  for (const key of ['throttle', 'airspeed', 'stall', 'flightTime'] as const) result.state[key] = a.state[key] + (b.state[key] - a.state[key]) * alpha;
  return result;
}

/** 30 Hz snapshots retain the first ten minutes. A terminal crash always captures
 * its event state; at capacity it replaces only the last sample. */
export class FlightRecorder {
  private data: FlightRecording | null = null;
  private origin: number | null = null;
  private nextSample = 0;
  begin(mode: FlightMode, config: Record<string, number>, scenario: Scenario | null): void {
    this.data = validateRecording({ version: 1, name: `${mode === 'drone' ? 'Rotor' : mode === 'plane' ? 'Airframe' : 'Orbital'} flight`, mode, config, scenario, frames: [] });
    this.origin = null; this.nextSample = 0;
  }
  record(state: FlightState | StateFrame, input: FlightInput, dynamics: SimulationFrame['telemetry']): boolean {
    if (!this.data || state.mode !== this.data.mode || !Number.isFinite(state.flightTime)) return false;
    const snapshot = 'position' in state ? captureState(state) : state;
    const last = this.data.frames.at(-1);
    if (last?.state.crashed || (this.full && !snapshot.crashed)) return false;
    const time = snapshot.flightTime;
    const origin = this.origin ?? time, t = time - origin;
    if (t < -1e-9 || (last && t < last.t) || (!snapshot.crashed && t + 1e-9 < this.nextSample)) return false;
    const frame = { t: Math.max(0, t), state: stateFrame(snapshot, this.data.mode), input: flightInput(input), telemetry: telemetry(dynamics) };
    this.origin = origin;
    if (this.full || (last && t === last.t)) this.data.frames[this.data.frames.length - 1] = frame;
    else this.data.frames.push(frame);
    this.nextSample = (Math.floor((t + 1e-9) * RECORDING_HZ) + 1) / RECORDING_HZ;
    return true;
  }
  get recording(): FlightRecording | null { return this.data ? clone(this.data) : null; }
  get sampleCount(): number { return this.data?.frames.length ?? 0; }
  get duration(): number { return this.data?.frames.at(-1)?.t ?? 0; }
  get full(): boolean { return this.sampleCount >= MAX_RECORDING_FRAMES; }
  clear(): void { this.data = null; this.origin = null; this.nextSample = 0; }
  load(raw: unknown): void {
    const data = validateRecording(raw);
    this.data = data;
    this.origin = data.frames.length ? data.frames[0].state.flightTime - data.frames[0].t : null;
    this.nextSample = this.duration + 1 / RECORDING_HZ;
  }
  frameAt(time: number): RecordedFrame | null {
    const frames = this.data?.frames;
    if (!frames?.length || !Number.isFinite(time)) return null;
    if (time <= frames[0].t) return clone(frames[0]);
    if (time >= frames[frames.length - 1].t) return clone(frames[frames.length - 1]);
    let low = 0, high = frames.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (frames[middle].t <= time) low = middle; else high = middle;
    }
    return interpolateFrame(frames[low], frames[high], time);
  }
}

export function recordingStats(recording: FlightRecording): RecordingStats {
  const frames = recording.frames;
  let distance = 0, errorSquared = 0, peakRateError = 0, maxSpeed = 0, maxDamage = 0;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (index) distance += Math.hypot(...frame.state.p.map((value, axis) => value - frames[index - 1].state.p[axis]));
    maxSpeed = Math.max(maxSpeed, Math.hypot(...frame.state.v));
    const metrics = frame.telemetry;
    const error = Math.hypot(...metrics.targetRates.map((value, axis) => value - metrics.measuredRates[axis]));
    errorSquared += error * error; peakRateError = Math.max(peakRateError, error);
    if (typeof metrics.damage === 'number') maxDamage = Math.max(maxDamage, metrics.damage);
  }
  return {
    duration: frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0,
    rmsRateError: frames.length ? Math.sqrt(errorSquared / frames.length) : 0,
    peakRateError, distance, maxSpeed, maxDamage, samples: frames.length,
  };
}
