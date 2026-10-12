import type { FlightState } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Procedural audio: no network assets, and no AudioContext until a user gesture. */
export class FlightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private rotor: OscillatorNode | null = null;
  private rotorHarmonic: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private enabled = true;
  private volume = 0.35;
  private disposed = false;
  private previousVelocity: [number, number, number] | null = null;
  private previousAngular: [number, number, number] | null = null;
  private previousMode: FlightState['mode'] | null = null;

  async start(): Promise<void> {
    if (this.disposed || typeof window === 'undefined') return;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        this.master.connect(context.destination);

        const motorFilter = context.createBiquadFilter();
        motorFilter.type = 'lowpass';
        motorFilter.frequency.value = 1500;
        motorFilter.Q.value = 0.3;
        this.motorGain = context.createGain();
        this.motorGain.gain.value = 0;
        this.motorGain.connect(motorFilter).connect(this.master);
        this.rotor = context.createOscillator();
        this.rotor.type = 'triangle';
        this.rotor.frequency.value = 90;
        this.rotor.connect(this.motorGain);
        this.rotorHarmonic = context.createOscillator();
        this.rotorHarmonic.type = 'sine';
        this.rotorHarmonic.frequency.value = 181;
        const harmonicGain = context.createGain();
        harmonicGain.gain.value = 0.3;
        this.rotorHarmonic.connect(harmonicGain).connect(this.motorGain);
        this.rotor.start();
        this.rotorHarmonic.start();

        this.engine = context.createOscillator();
        this.engine.type = 'sine';
        this.engine.frequency.value = 48;
        this.engineGain = context.createGain();
        this.engineGain.gain.value = 0;
        this.engine.connect(this.engineGain).connect(this.master);
        this.engine.start();

        const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let softened = 0;
        for (let i = 0; i < data.length; i++) {
          softened = 0.88 * softened + 0.12 * (Math.random() * 2 - 1);
          data[i] = softened * 2;
        }
        this.wind = context.createBufferSource();
        this.wind.buffer = noiseBuffer;
        this.wind.loop = true;
        this.windFilter = context.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.frequency.value = 1200;
        this.windFilter.Q.value = 0.1;
        this.windGain = context.createGain();
        this.windGain.gain.value = 0;
        this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
        this.wind.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Flight remains usable when audio is blocked or no output is available. */ }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVolume();
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? clamp(volume, 0, 1) : 0.35;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.05);
  }

  update(state: FlightState, dt: number): void {
    if (!this.context || this.disposed) return;
    const time = this.context.currentTime;
    const target = (parameter: AudioParam | undefined, value: number, smooth = 0.09) => {
      if (parameter && Number.isFinite(value)) parameter.setTargetAtTime(value, time, smooth);
    };
    const throttle = clamp(state.throttle, 0, 1);
    const speed = Math.max(0, state.airspeed);
    const alive = state.crashed ? 0 : 1;
    const isSpace = state.mode === 'space';
    const isDrone = state.mode === 'drone';
    const validDelta = dt > 0.0001 && dt < 0.15 && this.previousMode === state.mode;
    let acceleration = 0;
    let angularAcceleration = 0;
    if (validDelta && this.previousVelocity && this.previousAngular) {
      acceleration = Math.hypot(
        state.velocity.x - this.previousVelocity[0],
        state.velocity.y - this.previousVelocity[1],
        state.velocity.z - this.previousVelocity[2],
      ) / dt;
      angularAcceleration = Math.hypot(
        state.angularVelocity.x - this.previousAngular[0],
        state.angularVelocity.y - this.previousAngular[1],
        state.angularVelocity.z - this.previousAngular[2],
      ) / dt;
    }
    this.previousVelocity = [state.velocity.x, state.velocity.y, state.velocity.z];
    this.previousAngular = [state.angularVelocity.x, state.angularVelocity.y, state.angularVelocity.z];
    this.previousMode = state.mode;
    const thruster = clamp(acceleration / 12 + angularAcceleration / 18, 0, 1);

    target(this.rotor?.frequency, (isDrone ? 110 : 52) + throttle * (isDrone ? 260 : 110));
    target(this.rotorHarmonic?.frequency, (isDrone ? 221 : 105) + throttle * (isDrone ? 522 : 220));
    target(this.motorGain?.gain, isSpace ? 0 : alive * (0.035 + throttle * 0.11));
    target(this.engine?.frequency, isSpace ? 38 + thruster * 42 : 38 + throttle * 50);
    target(this.engineGain?.gain, alive * (isSpace ? thruster * 0.15 : 0.025 + throttle * 0.055));
    target(this.windGain?.gain, alive * (isSpace ? thruster * 0.15 : Math.min(speed / 80, 1) * 0.28 + state.stall * 0.08));
    target(this.windFilter?.frequency, isSpace ? 420 + thruster * 850 : 700 + Math.min(speed, 100) * 40);
  }

  cue(kind: 'gate' | 'crash' | 'complete' | 'click'): void {
    if (!this.context || !this.master || !this.enabled || this.disposed || this.context.state !== 'running') return;
    const context = this.context;
    const notes = kind === 'complete' ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'gate' ? [660, 880] : kind === 'crash' ? [95] : [400];
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.1;
      const duration = kind === 'crash' ? 0.55 : kind === 'click' ? 0.06 : 0.18;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = kind === 'crash' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === 'crash') oscillator.frequency.exponentialRampToValueAtTime(28, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(kind === 'crash' ? 0.35 : 0.15, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(envelope).connect(this.master!);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    });
  }

  dispose(): void {
    this.disposed = true;
    this.rotor?.stop();
    this.rotorHarmonic?.stop();
    this.engine?.stop();
    this.wind?.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
  }
}
