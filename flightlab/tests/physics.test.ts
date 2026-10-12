import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { createFlightState, getTelemetry, stepFlight, ZERO_INPUT } from '../src/physics';
import type { FlightEnvironment, FlightInput, FlightMode, FlightState } from '../src/types';

const empty: FlightEnvironment = {
  wind: new Vector3(), groundHeight: () => 0, collides: () => false,
};

function vehicle(mode: FlightMode, altitude = 50): FlightState {
  return createFlightState(mode, {
    position: new Vector3(0, altitude, 0), quaternion: new Quaternion(),
    velocity: new Vector3(0, 0, mode === 'plane' ? -38 : 0),
    throttle: mode === 'plane' ? 0.4 : 0.5,
  });
}

function fly(state: FlightState, seconds: number, input: Partial<FlightInput> = {}, environment = empty, dt = 1 / 120): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepFlight(state, { ...ZERO_INPUT, ...input }, environment, dt);
}

describe('drone controls', () => {
  it('holds a level hover at half throttle without hidden altitude corrections', () => {
    const state = vehicle('drone');
    fly(state, 10);
    expect(state.position.y).toBeCloseTo(50, 8);
    expect(state.velocity.length()).toBeLessThan(1e-8);
    fly(state, 1, { throttle: 0.7 });
    expect(state.position.y).toBeGreaterThan(51);
  });

  it('returns to level in angle mode and retains attitude in acro mode', () => {
    const angle = vehicle('drone', 500);
    fly(angle, 0.4, { roll: 0.6 });
    fly(angle, 2);
    expect(Math.abs(getTelemetry(angle, empty.wind).roll)).toBeLessThan(0.2);

    const acro = vehicle('drone', 500);
    acro.assist = false;
    fly(acro, 0.25, { roll: 0.5 });
    fly(acro, 1);
    const retained = acro.quaternion.clone();
    fly(acro, 1);
    expect(acro.quaternion.angleTo(retained)).toBeLessThan(0.001);
    expect(Math.abs(getTelemetry(acro, empty.wind).roll)).toBeGreaterThan(20);
  });

  it('stores throttle on stick release and respects calibrated direct throttle', () => {
    const state = vehicle('drone');
    fly(state, 0.5, { throttleDelta: 1 });
    expect(state.throttle).toBeCloseTo(0.7, 8);
    fly(state, 0.5);
    expect(state.throttle).toBeCloseTo(0.7, 8);
    fly(state, 0.1, { throttle: 0.3, throttleDelta: 1 });
    expect(state.throttle).toBe(0.3);
  });
});

describe('space flight', () => {
  it('preserves linear momentum when translation assist is off', () => {
    const state = vehicle('space');
    state.assist = false;
    state.velocity.set(12, -3, 8);
    fly(state, 4, { yaw: 0.4 });
    expect(state.velocity.toArray()).toEqual([12, -3, 8]);
    expect(state.position.x).toBeCloseTo(48, 7);
    expect(state.position.y).toBeCloseTo(38, 7);
    expect(state.position.z).toBeCloseTo(32, 7);
  });

  it('brakes with bounded acceleration and obeys the estimated stopping distance', () => {
    const state = vehicle('space');
    state.velocity.set(30, 0, 0);
    expect(getTelemetry(state, empty.wind).stoppingDistance).toBe(60);
    stepFlight(state, ZERO_INPUT, empty, 1 / 120);
    expect(state.velocity.x).toBeCloseTo(30 - 7.5 / 120, 8);
    fly(state, 7);
    expect(state.velocity.length()).toBeLessThan(0.02);
    expect(state.position.x).toBeGreaterThan(59);
    expect(state.position.x).toBeLessThan(63);
  });

  it('supports independent lateral, vertical, forward and rotation commands', () => {
    const state = vehicle('space');
    state.assist = false;
    fly(state, 1, { moveX: 1, moveY: 0.5, moveZ: 1, roll: 0.2 });
    expect(state.position.x).toBeGreaterThan(1);
    expect(state.position.y).toBeGreaterThan(50);
    expect(state.position.z).toBeLessThan(-1);
    expect(getTelemetry(state, empty.wind).roll).toBeGreaterThan(10);
  });
});

describe('fixed wing flight', () => {
  it('generates lift at cruise and cannot hover at zero airspeed', () => {
    const cruise = vehicle('plane', 300);
    fly(cruise, 6);
    expect(cruise.position.y).toBeGreaterThan(290);
    expect(cruise.position.y).toBeLessThan(315);
    expect(cruise.airspeed).toBeGreaterThan(30);
    expect(cruise.stall).toBeLessThan(0.05);
    const slow = vehicle('plane', 300);
    slow.velocity.set(0, 0, 0);
    fly(slow, 1, { throttle: 0 });
    expect(slow.velocity.y).toBeLessThan(-8);
    expect(slow.stall).toBeGreaterThan(0.9);
  });

  it('reports a high angle of attack stall and responds to air-relative velocity', () => {
    const stalled = vehicle('plane', 300);
    stalled.assist = false;
    stalled.quaternion.setFromEuler(new Euler(0.55, 0, 0));
    stepFlight(stalled, ZERO_INPUT, empty, 1 / 120);
    expect(stalled.stall).toBeGreaterThan(0.9);
    const wind = { ...empty, wind: new Vector3(0, 0, 12) };
    const upwind = vehicle('plane', 300);
    stepFlight(upwind, ZERO_INPUT, wind, 1 / 120);
    expect(upwind.airspeed).toBeCloseTo(50, 4);
  });

  it('uses banked lift to turn in assisted mode', () => {
    const state = vehicle('plane', 500);
    fly(state, 5, { roll: 0.6 });
    expect(state.position.x).toBeGreaterThan(10);
    expect(getTelemetry(state, empty.wind).heading).toBeGreaterThan(10);
    expect(state.position.y).toBeGreaterThan(470);
  });
});

describe('integration and contact', () => {
  it('gives the same trajectory for 60 Hz and 120 Hz caller updates', () => {
    const a = vehicle('drone', 500);
    const b = vehicle('drone', 500);
    const input = { roll: 0.2, pitch: 0.3, yaw: 0.15, throttleDelta: 0.1 };
    fly(a, 4, input, empty, 1 / 60);
    fly(b, 4, input, empty, 1 / 120);
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-8);
    expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-7);
  });

  it('catches a thin obstacle crossed at high speed', () => {
    const state = vehicle('space');
    state.assist = false;
    state.velocity.set(0, 0, -900);
    const obstacle = {
      ...empty,
      collides: (position: Vector3, radius: number) => Math.abs(position.z + 20) < radius + 0.05,
    };
    stepFlight(state, ZERO_INPUT, obstacle, 0.05);
    expect(state.crashed).toBe(true);
    expect(state.position.z).toBeGreaterThan(-20);
  });

  it('lands gently, can lift off again, and crashes on hard terrain impacts', () => {
    const gentle = vehicle('drone', 0.7);
    gentle.velocity.y = -1;
    fly(gentle, 0.2);
    expect(gentle.crashed).toBe(false);
    expect(gentle.grounded).toBe(true);
    expect(gentle.position.y).toBeCloseTo(0.6, 8);
    fly(gentle, 1, { throttle: 0.8 });
    expect(gentle.grounded).toBe(false);
    expect(gentle.position.y).toBeGreaterThan(2);
    const hard = vehicle('drone', 1);
    hard.velocity.y = -15;
    fly(hard, 0.1);
    expect(hard.crashed).toBe(true);
  });

  it('copies spawn values and retains the previous transform for render interpolation', () => {
    const spawn = { position: new Vector3(0, 10, 0), velocity: new Vector3(1, 0, 0), quaternion: new Quaternion(), throttle: 0 };
    const state = createFlightState('space', spawn);
    state.assist = false;
    stepFlight(state, ZERO_INPUT, empty, 1 / 60);
    expect(state.previousPosition.toArray()).toEqual([0, 10, 0]);
    expect(spawn.position.toArray()).toEqual([0, 10, 0]);
    expect(state.position.x).toBeCloseTo(1 / 60, 8);
  });
});
