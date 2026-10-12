import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { FlightEnvironment, FlightInput, FlightMode, FlightState, SpawnPoint } from './types';

const GRAVITY = 9.81;
const FIXED_STEP = 1 / 120;
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);
const RADIUS: Record<FlightMode, number> = { drone: 0.6, plane: 2.5, space: 2 };

export type HandlingPreset = 'gentle' | 'balanced' | 'sport';
interface HandlingProfile {
  droneAngle: number; droneBank: number; pitchRate: number; rollRate: number;
  yawRate: number; response: number; planeBank: number; planeRate: number;
  spaceAcceleration: number; spaceSpeed: number; spaceRate: number;
}
const HANDLING: Record<HandlingPreset, HandlingProfile> = {
  gentle: { droneAngle: 32, droneBank: 36, pitchRate: 2.3, rollRate: 2.8, yawRate: 1.65, response: 12, planeBank: 42, planeRate: 0.8, spaceAcceleration: 5.5, spaceSpeed: 20, spaceRate: 0.7 },
  balanced: { droneAngle: 45, droneBank: 48, pitchRate: 3.5, rollRate: 4.5, yawRate: 2.4, response: 14, planeBank: 62, planeRate: 1, spaceAcceleration: 7.5, spaceSpeed: 30, spaceRate: 1 },
  sport: { droneAngle: 56, droneBank: 60, pitchRate: 4.5, rollRate: 5.5, yawRate: 3, response: 18, planeBank: 72, planeRate: 1.2, spaceAcceleration: 10.5, spaceSpeed: 42, spaceRate: 1.3 },
};
const handlingPresets = new WeakMap<FlightState, HandlingPreset>();

/** Profiles affect control authority; state is retained when changing profile in flight. */
export function setHandlingPreset(state: FlightState, preset: HandlingPreset): void {
  handlingPresets.set(state, preset in HANDLING ? preset : 'balanced');
}
export function getHandlingPreset(state: FlightState): HandlingPreset {
  return handlingPresets.get(state) ?? 'balanced';
}

/** Includes the assist's exponential low-speed taper and a 0.2 second reaction margin. */
export function estimateStoppingDistance(state: FlightState, speed = state.velocity.length()): number {
  const velocity = Math.max(0, speed);
  const acceleration = state.mode === 'space' ? HANDLING[getHandlingPreset(state)].spaceAcceleration : 5;
  const taperRate = 1.8;
  const cutoff = 0.05;
  const taperStart = acceleration / taperRate;
  const constantDistance = velocity > taperStart ? (velocity * velocity - taperStart * taperStart) / (2 * acceleration) : 0;
  const taperDistance = Math.max(0, Math.min(velocity, taperStart) - cutoff) / taperRate;
  return constantDistance + taperDistance + velocity * 0.2;
}

export const ZERO_INPUT: FlightInput = {
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0,
  moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
};

export function createFlightState(mode: FlightMode, spawn: SpawnPoint): FlightState {
  return {
    mode,
    position: spawn.position.clone(),
    previousPosition: spawn.position.clone(),
    quaternion: spawn.quaternion.clone().normalize(),
    previousQuaternion: spawn.quaternion.clone().normalize(),
    velocity: spawn.velocity.clone(),
    angularVelocity: new Vector3(),
    throttle: MathUtils.clamp(spawn.throttle, 0, 1),
    airspeed: spawn.velocity.length(), stall: 0,
    grounded: false, crashed: false, assist: true, flightTime: 0,
  };
}

function axis(value: number): number {
  return Number.isFinite(value) ? MathUtils.clamp(value, -1, 1) : 0;
}

/** Body angular rates: positive X pitches up; negative Y yaws right; negative Z banks right. */
function attitudeRate(state: FlightState, targetPitch: number, targetRoll: number): Vector3 {
  const attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ');
  const target = new Quaternion().setFromEuler(new Euler(targetPitch, attitude.y, targetRoll, 'YXZ'));
  const error = state.quaternion.clone().invert().multiply(target);
  const sign = error.w < 0 ? -1 : 1;
  return new Vector3(error.x, error.y, error.z).multiplyScalar(sign * 7);
}

function rotate(state: FlightState, targetRate: Vector3, response: number, dt: number): void {
  state.angularVelocity.lerp(targetRate, 1 - Math.exp(-response * dt));
  state.angularVelocity.clampLength(0, 6);
  const angularSpeed = state.angularVelocity.length();
  if (angularSpeed > 1e-8) {
    const rotation = new Quaternion().setFromAxisAngle(
      state.angularVelocity.clone().divideScalar(angularSpeed), angularSpeed * dt,
    );
    state.quaternion.multiply(rotation).normalize();
  }
}

function droneAcceleration(state: FlightState, input: FlightInput, wind: Vector3, dt: number): Vector3 {
  const profile = HANDLING[getHandlingPreset(state)];
  let pitchTarget = axis(input.pitch) * profile.droneAngle * RAD;
  let rollTarget = -axis(input.roll) * profile.droneBank * RAD;
  if (state.assist && input.brake) {
    const yaw = new Euler().setFromQuaternion(state.quaternion, 'YXZ').y;
    const localVelocity = state.velocity.clone().applyAxisAngle(UP, -yaw);
    pitchTarget = Math.atan2(MathUtils.clamp(-localVelocity.z * 1.7, -6, 6), GRAVITY);
    rollTarget = Math.atan2(MathUtils.clamp(localVelocity.x * 1.7, -6, 6), GRAVITY);
  }
  const rates = state.assist
    ? attitudeRate(state, pitchTarget, rollTarget)
    : new Vector3(axis(input.pitch) * profile.pitchRate, 0, -axis(input.roll) * profile.rollRate);
  rates.y += -axis(input.yaw) * profile.yawRate;
  rotate(state, rates, profile.response, dt);

  const relativeVelocity = state.velocity.clone().sub(wind);
  state.airspeed = relativeVelocity.length();
  state.stall = 0;
  const thrustDirection = UP.clone().applyQuaternion(state.quaternion);
  const maxThrust = GRAVITY * 2 * (input.boost ? 1.22 : 1);
  // Brake assist tilts against horizontal velocity and compensates for tilted thrust.
  // It still respects motor authority and cannot arrest a fall at zero throttle.
  const thrust = state.assist && input.brake
    ? Math.min(maxThrust, state.throttle * maxThrust / Math.max(0.4, thrustDirection.y))
    : state.throttle * maxThrust;
  const acceleration = thrustDirection.multiplyScalar(thrust);
  acceleration.y -= GRAVITY;
  acceleration.addScaledVector(relativeVelocity, -(0.11 + state.airspeed * 0.009));
  return acceleration;
}

function planeAcceleration(state: FlightState, input: FlightInput, wind: Vector3, dt: number): Vector3 {
  const profile = HANDLING[getHandlingPreset(state)];
  const airVelocity = state.velocity.clone().sub(wind);
  const speed = airVelocity.length();
  const attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ');
  let rates: Vector3;
  const authority = MathUtils.clamp(speed / 27, 0.08, 1.2);

  if (state.assist) {
    const bank = state.grounded ? 0 : -axis(input.roll) * profile.planeBank * RAD;
    const desiredClimb = axis(input.pitch) * 17;
    const liftForLevel = GRAVITY / Math.max(8, 0.02 * speed * speed * Math.cos(bank));
    const trimAlpha = MathUtils.clamp((liftForLevel - 0.34) / 4.5, -0.08, 0.16);
    let desiredPitch = Math.asin(MathUtils.clamp(desiredClimb / Math.max(speed, 22), -0.7, 0.7)) + trimAlpha;
    if (state.grounded) {
      // Rotation builds with airspeed, keeping the wheels planted while taxiing.
      const rotationAuthority = MathUtils.smoothstep(speed, 12, 26);
      desiredPitch = MathUtils.clamp(desiredPitch, -3 * RAD, 12 * RAD) * rotationAuthority;
    }
    rates = attitudeRate(state, desiredPitch, bank).multiplyScalar(0.55);
    // Tilted lift curves the flight path. Match heading to that turn without eliminating sideslip.
    const turnRate = GRAVITY * Math.tan(MathUtils.clamp(attitude.z, -1.1, 1.1)) / Math.max(speed, 18);
    const coordinatedRate = UP.clone().multiplyScalar(turnRate)
      .applyQuaternion(state.quaternion.clone().invert());
    rates.add(coordinatedRate);
    rates.y += -axis(input.yaw) * 0.65;
  } else {
    rates = new Vector3(axis(input.pitch) * 0.95, -axis(input.yaw) * 0.7, -axis(input.roll) * 1.7);
  }
  rates.multiplyScalar(authority * profile.planeRate);
  if (state.grounded) {
    rates.z *= 0.1;
    rates.y += -axis(input.yaw) * MathUtils.clamp(speed / 12, 0, 1) * 0.3;
  }
  rotate(state, rates, 4.5, dt);

  const localAir = airVelocity.clone().applyQuaternion(state.quaternion.clone().invert());
  const forwardSpeed = Math.max(0, -localAir.z);
  const alpha = Math.atan2(-localAir.y, Math.max(0.2, forwardSpeed));
  const stallAngle = Math.abs(alpha);
  const angleStall = MathUtils.smoothstep(stallAngle, 15 * RAD, 32 * RAD);
  const lowSpeedStall = 1 - MathUtils.smoothstep(forwardSpeed, 12, 25);
  state.airspeed = speed;
  state.stall = Math.max(angleStall, lowSpeedStall);

  const liftCoefficient = MathUtils.clamp((0.34 + 4.5 * alpha) * (1 - angleStall * 0.88), -1.3, 1.6);
  const liftDirection = new Vector3(0, forwardSpeed, localAir.y).normalize().applyQuaternion(state.quaternion);
  const lift = 0.02 * forwardSpeed * forwardSpeed * liftCoefficient;
  const drag = (0.0015 + 0.002 * liftCoefficient * liftCoefficient + angleStall * 0.025) * speed * speed;
  const acceleration = new Vector3(0, -GRAVITY, 0);
  acceleration.addScaledVector(liftDirection, lift);
  if (speed > 0.01) acceleration.addScaledVector(airVelocity, -drag / speed);
  acceleration.add(new Vector3(-localAir.x * Math.min(speed * 0.035, 1.7), 0, 0).applyQuaternion(state.quaternion));
  acceleration.add(FORWARD.clone().applyQuaternion(state.quaternion)
    .multiplyScalar(state.throttle * (input.boost ? 13 : 9.5)));
  if (input.brake && speed > 0.1) acceleration.addScaledVector(airVelocity, -Math.min(speed * 0.004, 0.6));
  return acceleration;
}

function spaceAcceleration(state: FlightState, input: FlightInput, dt: number): Vector3 {
  const profile = HANDLING[getHandlingPreset(state)];
  rotate(state, new Vector3(axis(input.pitch) * 1.15, -axis(input.yaw) * 1.15, -axis(input.roll) * 1.6).multiplyScalar(profile.spaceRate), 8, dt);
  const translation = new Vector3(axis(input.moveX), axis(input.moveY), -axis(input.moveZ)).clampLength(0, 1);
  const maxAcceleration = profile.spaceAcceleration * (input.boost ? 2.4 : 1);
  const acceleration = translation.clone().applyQuaternion(state.quaternion);
  if (input.brake || state.assist) {
    // Small stick deflections command precise docking speeds without reducing full thrust.
    const magnitude = translation.length();
    const precisionCurve = 0.2 + 0.8 * magnitude * magnitude;
    const targetVelocity = input.brake ? new Vector3() : acceleration.multiplyScalar(profile.spaceSpeed * (input.boost ? 2.4 : 1) * precisionCurve);
    // Limit acceleration, rather than clipping velocity, so stopping distance stays meaningful.
    acceleration.copy(targetVelocity).sub(state.velocity).multiplyScalar(1.8).clampLength(0, maxAcceleration);
  } else {
    acceleration.multiplyScalar(maxAcceleration);
  }
  state.airspeed = state.velocity.length();
  state.stall = 0;
  state.throttle = translation.length();
  return acceleration;
}

function crash(state: FlightState): void {
  state.crashed = true;
  state.grounded = false;
  state.velocity.set(0, 0, 0);
  state.angularVelocity.set(0, 0, 0);
}

function safeLanding(state: FlightState, closingSpeed: number): boolean {
  const attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ');
  const horizontalSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  if (state.mode === 'plane') {
    return closingSpeed >= -3.8 && horizontalSpeed < 65
      && Math.abs(attitude.z) < 15 * RAD && Math.abs(attitude.x) < 24 * RAD;
  }
  return closingSpeed >= -4.2 && horizontalSpeed < 9
    && Math.abs(attitude.z) < 35 * RAD && Math.abs(attitude.x) < 35 * RAD;
}

/** Sample a swept sphere at intervals smaller than its radius to catch thin obstacles. */
function moveWithCollisions(state: FlightState, input: FlightInput, environment: FlightEnvironment, dt: number): void {
  const radius = RADIUS[state.mode];
  const origin = state.position.clone();
  const destination = origin.clone().addScaledVector(state.velocity, dt);
  const distance = origin.distanceTo(destination);
  const samples = Math.max(1, Math.ceil(distance / Math.min(0.8, radius * 0.45)));
  const sample = new Vector3();
  let contact = false;
  let previousFloor = environment.groundHeight(origin.x, origin.z) + radius;
  let contactFloor = -Infinity;

  for (let i = 1; i <= samples; i++) {
    sample.lerpVectors(origin, destination, i / samples);
    if (environment.collides(sample, radius)) {
      state.position.lerpVectors(origin, destination, Math.max(0, i - 1) / samples);
      crash(state);
      return;
    }
    if (state.mode !== 'space') {
      const floor = environment.groundHeight(sample.x, sample.z) + radius;
      if (sample.y <= floor) {
        const terrainRiseRate = Number.isFinite(previousFloor) ? (floor - previousFloor) / (dt / samples) : 0;
        if (!safeLanding(state, state.velocity.y - terrainRiseRate)) {
          state.position.copy(sample);
          state.position.y = floor;
          crash(state);
          return;
        }
        contact = true;
        contactFloor = Math.max(contactFloor, floor);
        // Continue checking the complete horizontal sweep, including terrain beyond touchdown.
        sample.y = floor;
      }
      previousFloor = floor;
    }
  }

  state.position.copy(destination);
  if (contact) {
    state.position.y = Math.max(state.position.y, contactFloor, environment.groundHeight(state.position.x, state.position.z) + radius);
    state.velocity.y = Math.max(0, state.velocity.y);
    const groundDamping = Math.exp(-(state.mode === 'plane' ? (input.brake ? 0.9 : 0.035) : 5) * dt);
    state.velocity.x *= groundDamping;
    state.velocity.z *= groundDamping;
  }
  state.grounded = contact;
}

/** Render-independent integration; larger caller steps are split into stable 120 Hz substeps. */
export function stepFlight(state: FlightState, input: FlightInput, environment: FlightEnvironment, dt: number): void {
  if (state.crashed || !Number.isFinite(dt) || dt <= 0) return;
  state.previousPosition.copy(state.position);
  state.previousQuaternion.copy(state.quaternion);
  const stepCount = Math.max(1, Math.ceil(dt / FIXED_STEP - 1e-8));
  const substep = dt / stepCount;
  for (let i = 0; i < stepCount && !state.crashed; i++) {
    if (state.mode !== 'space') {
      state.throttle = typeof input.throttle === 'number' && Number.isFinite(input.throttle)
        ? MathUtils.clamp(input.throttle, 0, 1)
        : MathUtils.clamp(state.throttle + axis(input.throttleDelta) * 0.4 * substep, 0, 1);
    }
    const acceleration = state.mode === 'drone'
      ? droneAcceleration(state, input, environment.wind, substep)
      : state.mode === 'plane'
        ? planeAcceleration(state, input, environment.wind, substep)
        : spaceAcceleration(state, input, substep);
    state.velocity.addScaledVector(acceleration, substep);
    moveWithCollisions(state, input, environment, substep);
    state.flightTime += substep;
  }
}

export function getTelemetry(state: FlightState, wind: Vector3): {
  speed: number; altitude: number; verticalSpeed: number;
  heading: number; pitch: number; roll: number; stoppingDistance: number;
} {
  const forward = FORWARD.clone().applyQuaternion(state.quaternion);
  const attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ');
  const speed = state.mode === 'space' ? state.velocity.length() : state.velocity.clone().sub(wind).length();
  return {
    speed,
    altitude: state.position.y,
    verticalSpeed: state.velocity.y,
    heading: (Math.atan2(forward.x, -forward.z) * DEG + 360) % 360,
    pitch: Math.asin(MathUtils.clamp(forward.y, -1, 1)) * DEG,
    roll: -attitude.z * DEG,
    stoppingDistance: state.velocity.lengthSq() / (2 * (state.mode === 'space' ? 7.5 : 5)),
  };
}
