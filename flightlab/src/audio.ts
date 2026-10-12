import type { FlightState } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface AudioFeedback {
  /** Surface proximity from 0 (clear) to 1 (very close). */
  proximity: number;
  /** Ambient wind speed in metres per second; ignored in vacuum. */
  wind: number;
}

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
  private previousFlightTime = -1;
  private previousProximity = 0;
  private previousThruster = 0;
  private nextWhoosh = 0;
  private nextStallAlert = 0;
  private nextThrusterPulse = 0;
  private noiseBuffer: AudioBuffer | null = null;

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
        this.noiseBuffer = noiseBuffer;
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

  update(state: FlightState, dt: number, feedback?: AudioFeedback): void {
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
    const validDelta = dt > 0.0001 && dt < 0.15 && this.previousMode === state.mode
      && state.flightTime >= this.previousFlightTime && state.flightTime - this.previousFlightTime < 0.25;
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
    this.previousFlightTime = state.flightTime;
    const thruster = clamp(acceleration / 12 + angularAcceleration / 18, 0, 1);
    const proximity = clamp(Number.isFinite(feedback?.proximity) ? feedback!.proximity : 0, 0, 1);
    const ambientWind = Math.max(0, Number.isFinite(feedback?.wind) ? feedback!.wind : 0);
    const approach = validDelta ? Math.max(0, (proximity - this.previousProximity) / dt) : 0;
    const airborneStall = state.mode === 'plane' && !state.grounded ? clamp(state.stall, 0, 1) : 0;
    const buffet = airborneStall * (0.6 + Math.sin(time * 47) * 0.25 + Math.sin(time * 29) * 0.15);

    // A whoosh needs an actual fast approach to nearby geometry, not just high speed.
    if (alive && !isSpace && validDelta && speed > 10 && proximity >= 0.48
      && approach > 0.35 && this.previousProximity < 0.48 && time >= this.nextWhoosh) {
      this.noisePulse(clamp(speed / 60, 0.15, 0.7), 0.24, 1600 + speed * 28);
      this.nextWhoosh = time + 0.7;
    }
    if (alive && airborneStall > 0.65 && speed > 8 && time >= this.nextStallAlert) {
      this.cue('stall');
      this.nextStallAlert = time + 1.4;
    }
    if (alive && isSpace && validDelta && thruster - this.previousThruster > 0.25 && time >= this.nextThrusterPulse) {
      this.noisePulse(thruster * 0.14, 0.13, 650, 'lowpass');
      this.nextThrusterPulse = time + 0.25;
    }
    this.previousProximity = proximity;
    this.previousThruster = thruster;

    target(this.rotor?.frequency, (isDrone ? 110 : 52) + throttle * (isDrone ? 260 : 110));
    target(this.rotorHarmonic?.frequency, (isDrone ? 221 : 105) + throttle * (isDrone ? 522 : 220));
    target(this.motorGain?.gain, isSpace ? 0 : alive * (0.035 + throttle * 0.11));
    target(this.engine?.frequency, isSpace ? 38 + thruster * 42 : 38 + throttle * 50);
    target(this.engineGain?.gain, alive * (isSpace ? thruster * 0.15 : 0.025 + throttle * 0.055));
    target(this.windGain?.gain, alive * (isSpace ? thruster * 0.15 : Math.min((speed + ambientWind * 0.3) / 80, 1) * 0.28 + buffet * 0.13));
    target(this.windFilter?.frequency, isSpace ? 420 + thruster * 850 : 700 + Math.min(speed, 100) * 40);
  }

  private noisePulse(volume: number, duration: number, frequency: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.context || !this.master || !this.noiseBuffer || !this.enabled || this.disposed || this.context.state !== 'running') return;
    const context = this.context;
    const start = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, frequency * 0.38), start + duration);
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.05, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.02);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  cue(kind: 'gate' | 'crash' | 'complete' | 'click' | 'land' | 'stall'): void {
    if (!this.context || !this.master || !this.enabled || this.disposed || this.context.state !== 'running') return;
    const context = this.context;
    const notes = kind === 'complete' ? [523.25, 659.25, 783.99, 1046.5]
      : kind === 'gate' ? [660, 880] : kind === 'crash' ? [95] : kind === 'land' ? [72] : kind === 'stall' ? [430, 430] : [400];
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.1;
      const duration = kind === 'crash' ? 0.55 : kind === 'click' ? 0.06 : kind === 'stall' ? 0.075 : 0.18;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = kind === 'crash' || kind === 'land' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === 'crash' || kind === 'land') oscillator.frequency.exponentialRampToValueAtTime(28, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(kind === 'crash' ? 0.35 : kind === 'land' ? 0.1 : kind === 'stall' ? 0.07 : 0.15, start + 0.008);
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
    this.noiseBuffer = null;
  }
}
