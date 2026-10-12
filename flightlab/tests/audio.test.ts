import { afterEach, describe, expect, it, vi } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { FlightAudio } from '../src/audio';
import { createFlightState } from '../src/physics';
import type { FlightMode } from '../src/types';

class Parameter {
  value = 0;
  setTargetAtTime(value: number): void { this.value = value; }
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.value = value; }
  exponentialRampToValueAtTime(value: number): void { this.value = value; }
}
class AudioNodeDouble {
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  buffer: unknown;
  loop = false;
  type = '';
  onended?: () => void;
  connect(node: AudioNodeDouble): AudioNodeDouble { return node; }
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}
class AudioContextDouble {
  static latest: AudioContextDouble;
  currentTime = 0;
  sampleRate = 100;
  state = 'running';
  destination = new AudioNodeDouble();
  sources: AudioNodeDouble[] = [];
  oscillators: AudioNodeDouble[] = [];
  gains: AudioNodeDouble[] = [];
  constructor() { AudioContextDouble.latest = this; }
  createGain(): AudioNodeDouble { const node = new AudioNodeDouble(); this.gains.push(node); return node; }
  createOscillator(): AudioNodeDouble { const node = new AudioNodeDouble(); this.oscillators.push(node); return node; }
  createBufferSource(): AudioNodeDouble { const node = new AudioNodeDouble(); this.sources.push(node); return node; }
  createBiquadFilter(): AudioNodeDouble { return new AudioNodeDouble(); }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(length) };
  }
  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
}
const vehicle = (mode: FlightMode) => createFlightState(mode, {
  position: new Vector3(0, 100, 0), quaternion: new Quaternion(), velocity: new Vector3(), throttle: 0.5,
});
async function audioRig(): Promise<{ audio: FlightAudio; context: AudioContextDouble }> {
  vi.stubGlobal('window', { AudioContext: AudioContextDouble });
  const audio = new FlightAudio();
  await audio.start();
  return { audio, context: AudioContextDouble.latest };
}
afterEach(() => vi.unstubAllGlobals());

describe('procedural flight feedback', () => {
  it('remains usable without Web Audio support or before the first user gesture', async () => {
    vi.stubGlobal('window', {});
    const audio = new FlightAudio();
    await audio.start();
    expect(() => {
      audio.update(vehicle('drone'), 1 / 60, { proximity: 1, wind: 8 });
      audio.cue('land');
      audio.setEnabled(false);
      audio.dispose();
    }).not.toThrow();
  });

  it('emits one whoosh for a fast approach and stays quiet beside a nearby surface', async () => {
    const { audio, context } = await audioRig();
    const state = vehicle('drone');
    state.airspeed = 30;
    state.velocity.z = -30;
    audio.update(state, 1 / 60, { proximity: 0.3, wind: 3 });
    expect(context.sources).toHaveLength(1);
    context.currentTime = 0.02;
    audio.update(state, 1 / 60, { proximity: 0.55, wind: 3 });
    expect(context.sources).toHaveLength(2);
    context.currentTime = 1;
    audio.update(state, 1 / 60, { proximity: 0.55, wind: 3 });
    expect(context.sources).toHaveLength(2);
    audio.dispose();
  });

  it('uses thruster activity rather than drift speed in space and ignores atmospheric wind', async () => {
    const { audio, context } = await audioRig();
    const state = vehicle('space');
    state.airspeed = 60;
    state.velocity.z = -60;
    audio.update(state, 1 / 60, { proximity: 0.2, wind: 30 });
    audio.update(state, 1 / 60, { proximity: 0.8, wind: 30 });
    expect(context.sources).toHaveLength(1);
    expect(context.gains[4].gain.value).toBe(0);
    state.velocity.z -= 0.125;
    audio.update(state, 1 / 60, { proximity: 0.8, wind: 30 });
    expect(context.sources).toHaveLength(2);
    expect(context.gains[4].gain.value).toBeGreaterThan(0);
    audio.dispose();
  });

  it('limits airborne stall alerts and suppresses one-shot sounds when muted', async () => {
    const { audio, context } = await audioRig();
    const state = vehicle('plane');
    state.airspeed = 19;
    state.stall = 0.9;
    state.grounded = true;
    audio.update(state, 1 / 60);
    expect(context.oscillators).toHaveLength(3);
    state.grounded = false;
    audio.update(state, 1 / 60);
    expect(context.oscillators).toHaveLength(5);
    context.currentTime = 0.5;
    audio.update(state, 1 / 60);
    expect(context.oscillators).toHaveLength(5);
    audio.setEnabled(false);
    context.currentTime = 2;
    audio.update(state, 1 / 60);
    audio.cue('land');
    expect(context.oscillators).toHaveLength(5);
    expect(context.gains[0].gain.value).toBe(0);
    audio.dispose();
  });
});
