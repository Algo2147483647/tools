import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  configureVehicle, createFlightState, defaultVehicleConfig, estimateStoppingDistance, getDynamicsTelemetry,
  getVehicleConfig, getVehicleFields, setArmed, setControlMode, setExternalActuators, setFault, stepFlight,
  syncDynamicsTelemetry, validateVehicleConfig, ZERO_INPUT,
} from '../src/physics';
import type { FlightEnvironment, FlightInput, FlightMode, FlightState } from '../src/types';

const sky: FlightEnvironment = { wind: new Vector3(), groundHeight: () => -Infinity, collides: () => false };
function vehicle(mode: FlightMode = 'drone', altitude = 100): FlightState {
  return createFlightState(mode, { position: new Vector3(0, altitude, 0), quaternion: new Quaternion(),
    velocity: new Vector3(0, 0, mode === 'plane' ? -38 : 0), throttle: mode === 'plane' ? 0.4 : 0.5 });
}
function fly(state: FlightState, seconds: number, input: Partial<FlightInput> = {}, environment = sky): void {
  for (let i = 0; i < Math.round(seconds * 240); i++) stepFlight(state, { ...ZERO_INPUT, ...input }, environment, 1 / 240);
}

describe('bounded vehicle configurations', () => {
  it('uses a complete independent finite SI parameter schema for each vehicle', () => {
    for (const mode of ['drone', 'plane', 'space'] as const) {
      const defaults = defaultVehicleConfig(mode), fields = getVehicleFields(mode);
      expect(fields.map(field => field.key)).toEqual(Object.keys(defaults));
      expect(validateVehicleConfig(mode, defaults)).toEqual(defaults);
      for (const field of fields) {
        expect(defaults[field.key]).toBeGreaterThanOrEqual(field.min);
        expect(defaults[field.key]).toBeLessThanOrEqual(field.max);
      }
      defaults.mass = -1;
      expect(defaultVehicleConfig(mode).mass).toBeGreaterThan(0);
    }
  });
  it('rejects nonfinite values, bounds unsafe physical parameters, and discards unknown fields', () => {
    const config = validateVehicleConfig('drone', { mass: -200, inertiaX: Infinity, motorTimeConstant: '0', injected: 5, comZ: 500 });
    expect(config.mass).toBe(0.3);
    expect(config.inertiaX).toBe(defaultVehicleConfig('drone').inertiaX);
    expect(config.motorTimeConstant).toBe(defaultVehicleConfig('drone').motorTimeConstant);
    expect(config.comZ).toBe(0.15);
    expect(config).not.toHaveProperty('injected');
  });
});

describe('rotor force and torque dynamics', () => {
  it('changes the hover throttle when only payload mass changes', () => {
    const light = vehicle(), heavy = vehicle();
    configureVehicle(heavy, { ...getVehicleConfig(heavy), mass: 1.8 });
    fly(light, 2); fly(heavy, 2);
    expect(light.position.y).toBeCloseTo(100, 8);
    expect(heavy.position.y).toBeLessThan(95);
    fly(heavy, 3, { throttle: 0.75 });
    expect(getDynamicsTelemetry(heavy).force[1]).toBeGreaterThan(17);
    expect(getDynamicsTelemetry(light).force[1]).toBeCloseTo(1.2 * 9.81, 6);
  });
  it('responds more slowly to the same physical rotor torque with more inertia', () => {
    const light = vehicle(), heavy = vehicle();
    configureVehicle(heavy, { ...getVehicleConfig(heavy), inertiaX: 0.14 });
    for (const state of [light, heavy]) { setExternalActuators(state, [0.65, 0.65, 0.35, 0.35]); fly(state, 0.1); }
    expect(light.angularVelocity.x).toBeGreaterThan(heavy.angularVelocity.x * 3.5);
    expect(getDynamicsTelemetry(light).torque[0]).toBeCloseTo(getDynamicsTelemetry(heavy).torque[0], 1);
  });
  it('models motor spool lag and disarm spin-down instead of teleporting thrust', () => {
    const state = vehicle();
    setExternalActuators(state, [1, 1, 1, 1]);
    stepFlight(state, ZERO_INPUT, sky, 1 / 240);
    const first = getDynamicsTelemetry(state);
    expect(first.commands).toEqual([1, 1, 1, 1]);
    expect(first.outputs[0]).toBeGreaterThan(0.5);
    expect(first.outputs[0]).toBeLessThan(0.7);
    fly(state, 0.5);
    expect(getDynamicsTelemetry(state).outputs[0]).toBeGreaterThan(0.999);
    setArmed(state, false); fly(state, 0.5);
    expect(getDynamicsTelemetry(state).outputs.every(value => value < 0.0001)).toBe(true);
    expect(state.velocity.y).toBeLessThan(0.5);
  });
  it('treats external firmware values as electrical commands before the squared thrust law', () => {
    const state = vehicle(); setExternalActuators(state, [0.5, 0.5, 0.5, 0.5]); fly(state, 0.5);
    const data = getDynamicsTelemetry(state);
    expect(data.commands).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(data.outputs[0]).toBeCloseTo(0.25, 5);
    expect(state.velocity.y).toBeLessThan(-2);
  });
  it('uses customized rotor locations both in the allocation matrix and in physical moments', () => {
    const state = vehicle(); configureVehicle(state, { ...getVehicleConfig(state), motor0X: -0.12, motor0Z: 0.05 });
    fly(state, 3);
    const telemetry = getDynamicsTelemetry(state);
    expect(state.angularVelocity.length()).toBeLessThan(0.02);
    expect(Math.abs(state.position.y - 100)).toBeLessThan(0.3);
    expect(telemetry.commands[0]).not.toBeCloseTo(telemetry.commands[1], 2);
    const fixed = vehicle(); configureVehicle(fixed, getVehicleConfig(state));
    setExternalActuators(fixed, Array(4).fill(Math.sqrt(0.5))); fly(fixed, 0.1);
    expect(fixed.angularVelocity.length()).toBeGreaterThan(0.5);
  });
  it('applies displaced center of mass as a moment arm on rotor thrust', () => {
    const centered = vehicle(), offset = vehicle();
    configureVehicle(offset, { ...getVehicleConfig(offset), comX: 0.05 });
    for (const state of [centered, offset]) { setExternalActuators(state, Array(4).fill(Math.sqrt(0.5))); fly(state, 0.1); }
    expect(centered.angularVelocity.length()).toBeLessThan(1e-8);
    expect(offset.angularVelocity.z).toBeLessThan(-1);
  });
  it('retains free-fall and configured gravity when disarmed', () => {
    const state = vehicle(); setArmed(state, false);
    fly(state, 1, {}, { ...sky, gravity: 1.62 });
    expect(state.velocity.y).toBeLessThan(-1);
    expect(state.velocity.y).toBeGreaterThan(-1.7);
  });
});

describe('cascaded flight controller and sensors', () => {
  it('tracks requested body rates through the motor mixer', () => {
    const state = vehicle(); setControlMode(state, 'acro');
    fly(state, 1.5, { roll: 0.4 });
    const data = getDynamicsTelemetry(state);
    expect(Math.abs(data.targetRates[2] - data.measuredRates[2])).toBeLessThan(0.08);
    expect(data.outputs).toHaveLength(4);
    expect(data.outputs.every(value => value >= 0 && value <= 1)).toBe(true);
  });
  it('recovers from motor saturation without an accumulated integral runaway', () => {
    const state = vehicle(); setControlMode(state, 'acro');
    fly(state, 2, { throttle: 1, yaw: 1 });
    expect(getDynamicsTelemetry(state).saturation).toBe(true);
    fly(state, 4, { throttle: 0.5 });
    const recovered = getDynamicsTelemetry(state);
    expect(state.angularVelocity.length()).toBeLessThan(0.1);
    expect(Math.max(...recovered.pid.i.map(Math.abs))).toBeLessThan(0.1);
  });
  it('holds altitude with a different payload through collective feedback', () => {
    const state = vehicle(); configureVehicle(state, { ...getVehicleConfig(state), mass: 1.8 });
    setControlMode(state, 'altitude'); fly(state, 6);
    expect(Math.abs(state.position.y - 100)).toBeLessThan(0.3);
    expect(Math.abs(state.velocity.y)).toBeLessThan(0.1);
    expect(getDynamicsTelemetry(state).outputs[0]).toBeGreaterThan(0.7);
  });
  it('returns to its position target after an initial velocity disturbance', () => {
    const state = vehicle(); setControlMode(state, 'position'); state.velocity.set(4, 0, -3);
    fly(state, 10);
    expect(Math.hypot(state.position.x, state.position.z)).toBeLessThan(0.5);
    expect(state.velocity.length()).toBeLessThan(0.3);
    expect(Math.abs(state.position.y - 100)).toBeLessThan(0.3);
  });
  it('does not reset the hold target when the same mode is requested repeatedly', () => {
    const a = vehicle(), b = vehicle();
    setControlMode(a, 'position'); setControlMode(b, 'position');
    a.velocity.x = 2; b.velocity.x = 2;
    for (let i = 0; i < 480; i++) {
      stepFlight(a, ZERO_INPUT, sky, 1 / 240); setControlMode(b, 'position'); stepFlight(b, ZERO_INPUT, sky, 1 / 240);
    }
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-9);
  });
  it('generates deterministic sensor noise, bias and delayed measurements', () => {
    const a = vehicle(), b = vehicle(), ideal = vehicle();
    for (const state of [a, b]) configureVehicle(state, { ...getVehicleConfig(state), gyroNoise: 0.02, gyroBias: 0.01, sensorDelay: 0.02, gyroFilter: 25 });
    for (const state of [a, b, ideal]) fly(state, 1, { roll: 0.25 });
    const data = getDynamicsTelemetry(a);
    expect(data).toEqual(getDynamicsTelemetry(b));
    expect(data.measuredRates).not.toEqual(a.angularVelocity.toArray());
    expect(a.quaternion.angleTo(ideal.quaternion)).toBeGreaterThan(0.001);
    expect(data.sensors.accel.every(Number.isFinite)).toBe(true);
  });
  it('uses position observations in the hold controller and exposes noisy accelerometer samples', () => {
    const state = vehicle(), ideal = vehicle();
    configureVehicle(state, { ...getVehicleConfig(state), positionNoise: 0.5, velocityNoise: 0.1, accelNoise: 0.2, accelBias: 0.1 });
    for (const sample of [state, ideal]) { setControlMode(sample, 'position'); fly(sample, 1); }
    const telemetry = getDynamicsTelemetry(state);
    expect(telemetry.sensors.position).not.toEqual(state.position.toArray());
    expect(telemetry.sensors.accel).not.toEqual([0, 9.81, 0]);
    expect(state.position.distanceTo(ideal.position)).toBeGreaterThan(0.001);
    expect(state.position.distanceTo(ideal.position)).toBeLessThan(0.5);
  });
  it('makes a rotor fault reduce actual actuator thrust and disturb flight', () => {
    const state = vehicle(); setFault(state, 'motor', 1); fly(state, 0.5);
    const data = getDynamicsTelemetry(state);
    expect(data.outputs[0]).toBeLessThan(0.00001);
    expect(state.angularVelocity.length()).toBeGreaterThan(0.1);
    setFault(state, 'none'); expect(getDynamicsTelemetry(state).fault).toBe('none');
  });
});

describe('spacecraft momentum and propellant', () => {
  function angularMomentum(state: FlightState): Vector3 {
    const config = getVehicleConfig(state), mass = getDynamicsTelemetry(state).mass;
    return state.angularVelocity.clone().multiply(new Vector3(config.inertiaX, config.inertiaY, config.inertiaZ))
      .multiplyScalar(mass / config.mass).applyQuaternion(state.quaternion);
  }
  it('preserves world angular momentum with asymmetric inertia and assist disabled', () => {
    const state = vehicle('space'); setControlMode(state, 'manual');
    state.angularVelocity.set(0.6, -0.4, 0.8); state.velocity.set(3, 2, -5);
    const momentum = angularMomentum(state), before = state.quaternion.clone();
    fly(state, 20);
    expect(angularMomentum(state).distanceTo(momentum)).toBeLessThan(1e-7);
    expect(state.velocity.toArray()).toEqual([3, 2, -5]);
    expect(state.quaternion.angleTo(before)).toBeGreaterThan(0.1);
    expect(getDynamicsTelemetry(state).fuel).toBe(100);
  });
  it('allocates pure rotational couples without producing translation', () => {
    const state = vehicle('space'); setControlMode(state, 'manual'); fly(state, 1, { yaw: 0.3 });
    const data = getDynamicsTelemetry(state);
    expect(data.outputs).toHaveLength(24);
    expect(data.outputs.filter(value => value > 0)).toHaveLength(2);
    expect(state.velocity.length()).toBeLessThan(1e-9);
    expect(state.angularVelocity.y).toBeLessThan(-0.5);
    expect(data.fuel).toBeLessThan(100);
    expect(data.mass).toBe(1000 + data.fuel);
  });
  it('changes translation acceleration when actual thruster force changes', () => {
    const standard = vehicle('space'), stronger = vehicle('space');
    configureVehicle(stronger, { ...getVehicleConfig(stronger), rcsForce: 16500 });
    for (const state of [standard, stronger]) { setControlMode(state, 'manual'); fly(state, 0.5, { moveZ: 1 }); }
    expect(-stronger.velocity.z).toBeGreaterThan(-standard.velocity.z * 1.9);
    expect(-stronger.velocity.z).toBeLessThan(-standard.velocity.z * 2.1);
  });
  it('uses an off-center thrust line to couple translation and rotation', () => {
    const state = vehicle('space'); configureVehicle(state, { ...getVehicleConfig(state), comX: 0.1 });
    setControlMode(state, 'manual'); fly(state, 0.5, { moveZ: 0.5 });
    expect(state.velocity.z).toBeLessThan(-1);
    expect(Math.abs(state.angularVelocity.y)).toBeGreaterThan(0.03);
  });
  it('exhausts finite propellant and coasts without hidden braking', () => {
    const state = vehicle('space'); configureVehicle(state, { ...getVehicleConfig(state), fuel: 0.1 });
    setControlMode(state, 'manual'); fly(state, 1, { moveZ: 1 });
    expect(getDynamicsTelemetry(state).fuel).toBe(0);
    const velocity = state.velocity.clone(); fly(state, 2, { brake: true });
    expect(state.velocity.distanceTo(velocity)).toBeLessThan(1e-12);
    expect(getDynamicsTelemetry(state).outputs.every(value => value === 0)).toBe(true);
    expect(estimateStoppingDistance(state)).toBe(Infinity);
  });
  it('does not refill fuel when changing a PID setting', () => {
    const state = vehicle('space'); fly(state, 1, { moveX: 1 });
    const fuel = getDynamicsTelemetry(state).fuel;
    configureVehicle(state, { ...getVehicleConfig(state), rateP: 11000 });
    expect(getDynamicsTelemetry(state).fuel).toBe(fuel);
  });
  it('changes RCS propellant use when jet-pair moment arms are moved', () => {
    const standard = vehicle('space'), longArm = vehicle('space');
    configureVehicle(longArm, { ...getVehicleConfig(longArm), rcsYawOffset: 1.5 });
    for (const state of [standard, longArm]) { setControlMode(state, 'manual'); fly(state, 1, { yaw: 0.25 }); }
    expect(getDynamicsTelemetry(longArm).fuel).toBeGreaterThan(getDynamicsTelemetry(standard).fuel);
    expect(Math.abs(longArm.angularVelocity.y - standard.angularVelocity.y)).toBeLessThan(0.001);
  });
  it('mirrors worker propellant and armed state into render-side braking guidance', () => {
    const authoritative = vehicle('space'), rendering = vehicle('space');
    configureVehicle(authoritative, { ...getVehicleConfig(authoritative), fuel: 0 });
    authoritative.velocity.x = 5; rendering.velocity.x = 5;
    expect(Number.isFinite(estimateStoppingDistance(rendering))).toBe(true);
    syncDynamicsTelemetry(rendering, getDynamicsTelemetry(authoritative));
    expect(estimateStoppingDistance(rendering)).toBe(Infinity);
  });
});

describe('surfaces and survivable contact', () => {
  it('makes manual elevator effectiveness depend on dynamic pressure', () => {
    const slow = vehicle('plane'), fast = vehicle('plane');
    slow.velocity.z = -18; fast.velocity.z = -38;
    for (const state of [slow, fast]) { setControlMode(state, 'manual'); fly(state, 0.1, { pitch: 0.25 }); }
    expect(fast.angularVelocity.x).toBeGreaterThan(slow.angularVelocity.x * 2);
    expect(Math.abs(getDynamicsTelemetry(fast).outputs[1])).toBeLessThan(0.25);
  });
  it('changes longitudinal balance with actual elevator trim', () => {
    const normal = vehicle('plane'), trimmed = vehicle('plane');
    configureVehicle(trimmed, { ...getVehicleConfig(trimmed), elevatorTrim: 5 });
    for (const state of [normal, trimmed]) { setControlMode(state, 'manual'); fly(state, 0.2); }
    expect(trimmed.angularVelocity.x).toBeGreaterThan(normal.angularVelocity.x + 0.15);
  });
  it('rebounds from a gentle wall strike with finite damage rather than destroying the vehicle', () => {
    const state = vehicle('space'); setControlMode(state, 'manual'); state.velocity.set(3, 0, 0);
    fly(state, 0.5, {}, { ...sky, collides: (position, radius) => position.x + radius >= 3,
      contactNormal: () => new Vector3(-1, 0, 0) });
    expect(state.crashed).toBe(false);
    expect(state.velocity.x).toBeLessThan(0);
    expect(getDynamicsTelemetry(state).damage).toBeGreaterThan(0);
    expect(getDynamicsTelemetry(state).damage).toBeLessThan(0.2);
  });
  it('distinguishes a hard survivable landing from a destructive impact', () => {
    const state = vehicle('drone', 0.62); state.velocity.y = -5;
    stepFlight(state, ZERO_INPUT, { ...sky, groundHeight: () => 0 }, 1 / 120);
    expect(state.crashed).toBe(false);
    expect(state.velocity.y).toBeGreaterThan(0);
    expect(getDynamicsTelemetry(state).damage).toBeGreaterThan(0.04);
    const fatal = vehicle('drone', 0.62); fatal.velocity.y = -12;
    stepFlight(fatal, ZERO_INPUT, { ...sky, groundHeight: () => 0 }, 1 / 120);
    expect(fatal.crashed).toBe(true);
    expect(getDynamicsTelemetry(fatal).armed).toBe(false);
  });
});
