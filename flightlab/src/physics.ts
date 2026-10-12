import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { FlightEnvironment, FlightInput, FlightMode, FlightState, SpawnPoint } from './types';
import { RateController, SensorSuite } from './controller';
import { defaultVehicleConfig, validateVehicleConfig, type VehicleConfig } from './vehicle-config';
export { defaultVehicleConfig, getVehicleFields, validateVehicleConfig } from './vehicle-config';

const GRAVITY = 9.81;
const FIXED_STEP = 1 / 240;
const DEG = 180 / Math.PI, RAD = Math.PI / 180;
const UP = new Vector3(0, 1, 0), FORWARD = new Vector3(0, 0, -1);
const RADIUS: Record<FlightMode, number> = { drone: 0.6, plane: 2.5, space: 2 };

export type HandlingPreset = 'gentle' | 'balanced' | 'sport';
export type ControlMode = 'acro' | 'angle' | 'altitude' | 'position' | 'manual';
export type FaultType = 'none' | 'motor' | 'sensor' | 'wind';
const HANDLING = {
  gentle: { angle: 32, bank: 36, rate: 0.66, planeBank: 42, planeRate: 0.8, spaceAcceleration: 5.5, spaceSpeed: 20, spaceRate: 0.7 },
  balanced: { angle: 45, bank: 48, rate: 1, planeBank: 62, planeRate: 1, spaceAcceleration: 7.5, spaceSpeed: 30, spaceRate: 1 },
  sport: { angle: 56, bank: 60, rate: 1.28, planeBank: 72, planeRate: 1.2, spaceAcceleration: 10.5, spaceSpeed: 42, spaceRate: 1.3 },
};

interface Dynamics {
  config: VehicleConfig; preset: HandlingPreset; controlMode: ControlMode; armed: boolean;
  pid: RateController; sensors: SensorSuite; targetRates: Vector3;
  outputs: number[]; motors: number[]; surfaces: Vector3;
  force: Vector3; torque: Vector3; acceleration: Vector3;
  fuel: number; damage: number; fault: FaultType; faultStrength: number;
  altitudeTarget: number; positionTarget: Vector3; external: number[] | null;
  contactSpeed: number;
}
const dynamics = new WeakMap<FlightState, Dynamics>();
function runtime(state: FlightState): Dynamics {
  let model = dynamics.get(state);
  if (!model) {
    const config = defaultVehicleConfig(state.mode);
    model = {
      config, preset: 'balanced', controlMode: state.mode === 'drone' ? 'angle' : 'manual', armed: true,
      pid: new RateController(), sensors: new SensorSuite(state.quaternion), targetRates: new Vector3(),
      outputs: state.mode === 'drone' ? [state.throttle, state.throttle, state.throttle, state.throttle] : [],
      motors: Array(4).fill(Math.sqrt(state.throttle)), surfaces: new Vector3(),
      force: new Vector3(), torque: new Vector3(), acceleration: new Vector3(),
      fuel: config.fuel ?? 0, damage: 0, fault: 'none', faultStrength: 0,
      altitudeTarget: state.position.y, positionTarget: state.position.clone(), external: null, contactSpeed: 0,
    };
    dynamics.set(state, model);
  }
  return model;
}

export function setHandlingPreset(state: FlightState, preset: HandlingPreset): void {
  runtime(state).preset = preset in HANDLING ? preset : 'balanced';
}
export function getHandlingPreset(state: FlightState): HandlingPreset { return runtime(state).preset; }
export function configureVehicle(state: FlightState, config: unknown): void {
  const model = runtime(state);
  const normalized = validateVehicleConfig(state.mode, config);
  if (state.mode === 'space' && normalized.fuel !== model.config.fuel) model.fuel = normalized.fuel;
  model.config = normalized; model.pid.reset();
}
export function getVehicleConfig(state: FlightState): VehicleConfig { return { ...runtime(state).config }; }
export function setControlMode(state: FlightState, mode: ControlMode): void {
  if (!['acro', 'angle', 'altitude', 'position', 'manual'].includes(mode)) return;
  const model = runtime(state);
  if (model.controlMode === mode && state.assist === (mode !== 'acro' && mode !== 'manual')) return;
  model.controlMode = mode; model.altitudeTarget = state.position.y; model.positionTarget.copy(state.position);
  model.pid.reset(); state.assist = mode !== 'acro' && mode !== 'manual';
}
export function setArmed(state: FlightState, armed: boolean): void {
  const model = runtime(state); model.armed = Boolean(armed);
  if (!model.armed) { model.external = null; model.pid.reset(); }
}
export function setFault(state: FlightState, fault: FaultType, strength = 1): void {
  const model = runtime(state);
  model.fault = ['none', 'motor', 'sensor', 'wind'].includes(fault) ? fault : 'none';
  model.faultStrength = Number.isFinite(strength) ? MathUtils.clamp(strength, 0, 1) : 1;
}
/** Normalized rotor thrust requests: front-left, front-right, rear-right, rear-left. */
export function setExternalActuators(state: FlightState, outputs: number[] | null): void {
  runtime(state).external = state.mode === 'drone' && Array.isArray(outputs) && outputs.length === 4 && outputs.every(Number.isFinite)
    ? outputs.map(value => MathUtils.clamp(value, 0, 1)) : null;
}

function effectiveMode(state: FlightState, model: Dynamics): ControlMode {
  if (!state.assist) return state.mode === 'drone' ? 'acro' : 'manual';
  return model.controlMode === 'manual' || model.controlMode === 'acro' ? 'angle' : model.controlMode;
}
function massOf(state: FlightState, model: Dynamics): number { return model.config.mass + (state.mode === 'space' ? model.fuel : 0); }
function inertiaOf(state: FlightState, model: Dynamics): Vector3 {
  const factor = state.mode === 'space' ? massOf(state, model) / model.config.mass : 1;
  return new Vector3(model.config.inertiaX, model.config.inertiaY, model.config.inertiaZ).multiplyScalar(factor);
}

export function getDynamicsTelemetry(state: FlightState) {
  const model = runtime(state), attitude = new Euler().setFromQuaternion(model.sensors.orientation, 'YXZ');
  return {
    armed: model.armed, controlMode: effectiveMode(state, model), externalControl: model.external !== null,
    targetRates: model.targetRates.toArray(), measuredRates: model.sensors.gyro.toArray(),
    estimatedAngles: [attitude.x * DEG, attitude.y * DEG, attitude.z * DEG],
    outputs: state.mode === 'drone' ? model.motors.map(rpm => rpm * rpm) : [...model.outputs],
    commands: [...model.outputs],
    pid: { p: model.pid.p.toArray(), i: model.pid.i.toArray(), d: model.pid.d.toArray() },
    mass: massOf(state, model), fuel: model.fuel, damage: model.damage,
    force: model.force.toArray(), torque: model.torque.toArray(), acceleration: model.acceleration.toArray(),
    saturation: model.pid.saturated, fault: model.fault, contactSpeed: model.contactSpeed,
    sensors: { gyro: model.sensors.gyro.toArray(), accel: model.sensors.accel.toArray(), quaternion: model.sensors.orientation.toArray(),
      position: state.position.toArray(), velocity: state.velocity.toArray() },
  };
}

/** Conservative powered braking estimate, including the assist's low-speed taper. */
export function estimateStoppingDistance(state: FlightState, speed = state.velocity.length()): number {
  const velocity = Math.max(0, speed), model = runtime(state);
  if (state.mode === 'space' && (!model.armed || model.fuel <= 0)) return velocity > 0.05 ? Infinity : 0;
  const acceleration = state.mode === 'space'
    ? Math.min(model.config.rcsForce / massOf(state, model), HANDLING[model.preset].spaceAcceleration) : 5;
  const taper = acceleration / 1.8;
  return (velocity > taper ? (velocity * velocity - taper * taper) / (2 * acceleration) : 0)
    + Math.max(0, Math.min(velocity, taper) - 0.05) / 1.8 + velocity * 0.2;
}

export const ZERO_INPUT: FlightInput = {
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, moveX: 0, moveY: 0, moveZ: 0, brake: false, boost: false,
};
export function createFlightState(mode: FlightMode, spawn: SpawnPoint): FlightState {
  const state: FlightState = {
    mode, position: spawn.position.clone(), previousPosition: spawn.position.clone(),
    quaternion: spawn.quaternion.clone().normalize(), previousQuaternion: spawn.quaternion.clone().normalize(),
    velocity: spawn.velocity.clone(), angularVelocity: new Vector3(), throttle: MathUtils.clamp(spawn.throttle, 0, 1),
    airspeed: spawn.velocity.length(), stall: 0, grounded: false, crashed: false, assist: true, flightTime: 0,
  };
  runtime(state); return state;
}
function axis(value: number): number { return Number.isFinite(value) ? MathUtils.clamp(value, -1, 1) : 0; }
function gravityOf(state: FlightState, environment: FlightEnvironment): number {
  return Number.isFinite(environment.gravity) ? MathUtils.clamp(environment.gravity!, 0, 40) : state.mode === 'space' ? 0 : GRAVITY;
}

function attitudeRate(orientation: Quaternion, pitch: number, roll: number, gain: number): Vector3 {
  const attitude = new Euler().setFromQuaternion(orientation, 'YXZ');
  const target = new Quaternion().setFromEuler(new Euler(pitch, attitude.y, roll, 'YXZ'));
  const error = orientation.clone().invert().multiply(target), sign = error.w < 0 ? -1 : 1;
  return new Vector3(error.x, error.y, error.z).multiplyScalar(sign * 2 * gain);
}
function applyAt(model: Dynamics, force: Vector3, point: Vector3): void {
  model.force.add(force);
  model.torque.add(point.clone().sub(new Vector3(model.config.comX, model.config.comY, model.config.comZ)).cross(force));
}

function droneForces(state: FlightState, input: FlightInput, model: Dynamics, wind: Vector3, gravity: number, dt: number): void {
  const config = model.config, profile = HANDLING[model.preset], mode = effectiveMode(state, model);
  const mass = massOf(state, model), arm = config.armLength / Math.SQRT2;
  let pitch = axis(input.pitch) * profile.angle * RAD, roll = -axis(input.roll) * profile.bank * RAD;
  let collective = state.throttle * config.maxRotorThrust * 4 * (input.boost ? 1.1 : 1);
  const altitudeHold = mode === 'altitude' || mode === 'position';
  const yaw = new Euler().setFromQuaternion(model.sensors.orientation, 'YXZ').y;
  if (mode === 'position') {
    const commanded = new Vector3(axis(input.roll) * 9, 0, axis(input.pitch) * 9).applyAxisAngle(UP, yaw);
    model.positionTarget.addScaledVector(commanded, dt);
    const local = model.positionTarget.clone().sub(state.position).multiplyScalar(1.1).addScaledVector(state.velocity, -1.8).applyAxisAngle(UP, -yaw);
    pitch = Math.atan2(MathUtils.clamp(local.z, -5.5, 5.5), Math.max(1, gravity));
    roll = -Math.atan2(MathUtils.clamp(local.x, -5.5, 5.5), Math.max(1, gravity));
  } else if (state.assist && input.brake) {
    const local = state.velocity.clone().applyAxisAngle(UP, -yaw);
    pitch = Math.atan2(MathUtils.clamp(-local.z * 1.7, -6, 6), Math.max(1, gravity));
    roll = Math.atan2(MathUtils.clamp(local.x * 1.7, -6, 6), Math.max(1, gravity));
  }
  if (mode === 'acro' || mode === 'manual') {
    model.targetRates.set(axis(input.pitch) * config.maxPitchRate * RAD, -axis(input.yaw) * config.maxYawRate * RAD,
      -axis(input.roll) * config.maxRollRate * RAD).multiplyScalar(profile.rate);
  } else {
    model.targetRates.copy(attitudeRate(model.sensors.orientation, pitch, roll, config.attitudeP));
    model.targetRates.x = MathUtils.clamp(model.targetRates.x, -config.maxPitchRate * RAD, config.maxPitchRate * RAD);
    model.targetRates.z = MathUtils.clamp(model.targetRates.z, -config.maxRollRate * RAD, config.maxRollRate * RAD);
    model.targetRates.y += -axis(input.yaw) * config.maxYawRate * RAD * profile.rate;
  }
  const up = UP.clone().applyQuaternion(state.quaternion);
  if (altitudeHold) {
    model.altitudeTarget += (state.throttle - 0.5) * 8 * dt;
    const acceleration = MathUtils.clamp((model.altitudeTarget - state.position.y) * 2.3 - state.velocity.y * 2.2, -5, 7);
    collective = mass * (gravity + acceleration) / Math.max(0.35, up.y);
  } else if (state.assist && input.brake) collective /= Math.max(0.4, up.y);
  collective = MathUtils.clamp(collective, 0, config.maxRotorThrust * 4);
  const limits = new Vector3(config.maxRotorThrust * arm * 2, config.maxRotorThrust * config.reactionTorque * 2, config.maxRotorThrust * arm * 2);
  const desiredTorque = model.pid.update(model.targetRates, model.sensors.gyro, config, limits, dt);
  const positions = [new Vector3(-arm, 0, -arm), new Vector3(arm, 0, -arm), new Vector3(arm, 0, arm), new Vector3(-arm, 0, arm)];
  const spins = [1, -1, 1, -1];
  const demand = positions.map((position, i) => collective / 4 + desiredTorque.x * (-position.z / arm) / (4 * arm)
    + desiredTorque.z * (position.x / arm) / (4 * arm) + desiredTorque.y * spins[i] / (4 * config.reactionTorque));
  const allocated = new Vector3();
  model.outputs = demand.map((value, i) => model.armed ? model.external?.[i] ?? MathUtils.clamp(value / config.maxRotorThrust, 0, 1) : 0);
  for (let i = 0; i < 4; i++) {
    const commandedForce = model.outputs[i] * config.maxRotorThrust;
    allocated.x += -positions[i].z * commandedForce; allocated.z += positions[i].x * commandedForce;
    allocated.y += spins[i] * config.reactionTorque * commandedForce;
    const health = model.fault === 'motor' && i === 0 ? 1 - model.faultStrength : 1;
    const targetRpm = Math.sqrt(model.outputs[i]) * Math.sqrt(health) * Math.max(0, 1 - model.damage * 0.3);
    model.motors[i] += (targetRpm - model.motors[i]) * (1 - Math.exp(-dt / config.motorTimeConstant));
    const force = model.motors[i] ** 2 * config.maxRotorThrust;
    applyAt(model, new Vector3(0, force, 0), positions[i]); model.torque.y += force * config.reactionTorque * spins[i];
  }
  if (!model.external && model.armed) model.pid.allocationFeedback(desiredTorque, allocated, dt);
  if (!model.armed) model.pid.reset();
  const air = state.velocity.clone().sub(wind); state.airspeed = air.length(); state.stall = 0;
  model.force.add(air.applyQuaternion(state.quaternion.clone().invert()).multiplyScalar(-config.drag * (1 + state.airspeed * 0.082)));
  model.torque.addScaledVector(state.angularVelocity, -0.008);
}

function planeForces(state: FlightState, input: FlightInput, model: Dynamics, wind: Vector3, gravity: number, dt: number): void {
  const config = model.config, profile = HANDLING[model.preset], mass = massOf(state, model);
  const air = state.velocity.clone().sub(wind), speed = air.length();
  const local = air.clone().applyQuaternion(state.quaternion.clone().invert());
  const forwardSpeed = Math.max(0, -local.z), alpha = Math.atan2(-local.y, Math.max(0.2, forwardSpeed));
  const stall = MathUtils.smoothstep(Math.abs(alpha), 15 * RAD, 32 * RAD);
  const qArea = 0.5 * 1.225 * forwardSpeed * forwardSpeed * config.wingArea, chord = config.wingArea / config.wingSpan;
  const bank = state.grounded ? 0 : -axis(input.roll) * profile.planeBank * RAD;
  const attitude = new Euler().setFromQuaternion(model.sensors.orientation, 'YXZ'), surfaceLimit = config.surfaceLimit * RAD;
  const pitchAuthority = qArea * chord * 1.9, yawAuthority = qArea * config.wingSpan * 0.25, rollAuthority = qArea * config.wingSpan * 0.35;
  const passiveTorque = new Vector3(-qArea * chord * 0.32 * (alpha - 0.07), -qArea * config.wingSpan * 0.035 * Math.atan2(local.x, Math.max(forwardSpeed, 1)), 0);
  const damping = new Vector3(qArea * chord * 0.08, qArea * config.wingSpan * 0.035, qArea * config.wingSpan * 0.07);
  passiveTorque.sub(state.angularVelocity.clone().multiply(damping));
  let surface = new Vector3(axis(input.pitch), -axis(input.yaw), -axis(input.roll)).multiplyScalar(surfaceLimit);
  if (state.assist) {
    const requiredLiftCoefficient = mass * gravity / Math.max(8, qArea * Math.cos(bank));
    const trimAlpha = MathUtils.clamp((requiredLiftCoefficient - config.baseLift) / config.liftSlope, -0.08, 0.16);
    let desiredPitch = Math.asin(MathUtils.clamp(axis(input.pitch) * 17 / Math.max(speed, 22), -0.7, 0.7)) + trimAlpha;
    if (state.grounded) desiredPitch = MathUtils.clamp(desiredPitch, -3 * RAD, 12 * RAD) * MathUtils.smoothstep(speed, 12, 26);
    model.targetRates.copy(attitudeRate(model.sensors.orientation, desiredPitch, bank, config.attitudeP));
    const turn = gravity * Math.tan(MathUtils.clamp(attitude.z, -1.1, 1.1)) / Math.max(speed, 18);
    model.targetRates.add(UP.clone().multiplyScalar(turn).applyQuaternion(state.quaternion.clone().invert()));
    model.targetRates.y += -axis(input.yaw) * 0.65; model.targetRates.multiplyScalar(profile.planeRate).clampLength(0, 2.5);
    if (state.grounded) { model.targetRates.z = 0; model.targetRates.y += -axis(input.yaw) * Math.min(1, speed / 12) * 0.3; }
    const torqueLimit = new Vector3(pitchAuthority, yawAuthority, rollAuthority).multiplyScalar(surfaceLimit);
    const demand = model.pid.update(model.targetRates, model.sensors.gyro, config, torqueLimit, dt).sub(passiveTorque);
    surface.set(demand.x / Math.max(1, pitchAuthority), demand.y / Math.max(1, yawAuthority), demand.z / Math.max(1, rollAuthority));
  } else { model.targetRates.set(0, 0, 0); model.pid.reset(); }
  surface.x += config.elevatorTrim * RAD;
  for (let i = 0; i < 3; i++) surface.setComponent(i, MathUtils.clamp(surface.getComponent(i), -surfaceLimit, surfaceLimit));
  if (!model.armed) surface.set(0, 0, 0);
  model.surfaces.lerp(surface, 1 - Math.exp(-dt / config.servoTimeConstant));
  model.outputs = [state.throttle * Number(model.armed), model.surfaces.x / surfaceLimit, model.surfaces.z / surfaceLimit, model.surfaces.y / surfaceLimit];
  model.torque.add(passiveTorque).add(new Vector3(model.surfaces.x * pitchAuthority, model.surfaces.y * yawAuthority, model.surfaces.z * rollAuthority));
  const cl = MathUtils.clamp((config.baseLift + config.liftSlope * alpha) * (1 - stall * 0.88), -1.3, 1.6);
  const liftDirection = new Vector3(0, forwardSpeed, local.y).normalize();
  const drag = 0.5 * 1.225 * speed * speed * config.wingArea * (config.dragCoefficient + 0.1 * cl * cl + stall * 1.25);
  applyAt(model, liftDirection.multiplyScalar(qArea * cl), new Vector3());
  if (speed > 0.01) model.force.addScaledVector(local, -drag / speed);
  model.force.x += -local.x * Math.min(speed * 0.035, 1.7) * mass;
  const engineHealth = model.fault === 'motor' ? 1 - model.faultStrength : 1;
  applyAt(model, new Vector3(0, 0, -state.throttle * config.maxThrust * (input.boost ? 1.35 : 1)
    * Number(model.armed) * engineHealth * (1 - model.damage * 0.5)), new Vector3());
  if (input.brake && speed > 0.1) model.force.addScaledVector(local, -Math.min(speed * 0.004, 0.6) * mass);
  state.airspeed = speed; state.stall = Math.max(stall, 1 - MathUtils.smoothstep(forwardSpeed, 12, 25));
}

/** Twenty-four individual jets form translation and rotation pairs. */
function spaceForces(state: FlightState, input: FlightInput, model: Dynamics, dt: number): void {
  const config = model.config, profile = HANDLING[model.preset], mass = massOf(state, model);
  const translation = new Vector3(axis(input.moveX), axis(input.moveY), -axis(input.moveZ)).clampLength(0, 1);
  const maxAcceleration = Math.min(config.rcsForce / mass, profile.spaceAcceleration) * (input.boost ? 2.4 : 1);
  const force = translation.clone();
  if (input.brake || state.assist) {
    const target = input.brake ? new Vector3() : translation.clone().applyQuaternion(state.quaternion)
      .multiplyScalar(profile.spaceSpeed * (input.boost ? 2.4 : 1) * (0.2 + 0.8 * translation.lengthSq()));
    force.copy(target).sub(state.velocity).multiplyScalar(1.8).clampLength(0, maxAcceleration)
      .multiplyScalar(mass).applyQuaternion(state.quaternion.clone().invert());
  } else force.multiplyScalar(maxAcceleration * mass);
  const command = new Vector3(axis(input.pitch) * 1.15, -axis(input.yaw) * 1.15, -axis(input.roll) * 1.6).multiplyScalar(profile.spaceRate);
  const maxTorque = config.rcsTorque * (input.boost ? 1.4 : 1);
  let torque: Vector3;
  if (state.assist || input.brake) {
    model.targetRates.copy(input.brake ? new Vector3() : command);
    torque = model.pid.update(model.targetRates, model.sensors.gyro, config, new Vector3(maxTorque, maxTorque, maxTorque), dt);
  } else {
    model.targetRates.set(0, 0, 0); model.pid.reset();
    torque = new Vector3(axis(input.pitch), -axis(input.yaw), -axis(input.roll)).multiplyScalar(maxTorque * profile.spaceRate);
  }
  model.outputs = [];
  const enabled = model.armed && model.fuel > 0; let propellantForce = 0;
  const fire = (direction: Vector3, position: Vector3, forceNewtons: number, capacity: number, index: number): void => {
    const health = model.fault === 'motor' && index === 0 ? 1 - model.faultStrength : 1;
    const duty = enabled ? MathUtils.clamp(forceNewtons / capacity, 0, 1) * health : 0;
    model.outputs.push(duty); const thrust = duty * capacity;
    applyAt(model, direction.clone().multiplyScalar(thrust), position); propellantForce += thrust;
  };
  let index = 0;
  for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
    const direction = new Vector3().setComponent(axisIndex, 1), arm = new Vector3().setComponent((axisIndex + 1) % 3, config.rcsArm);
    for (const sign of [1, -1]) for (const side of [1, -1]) fire(direction.clone().multiplyScalar(sign), arm.clone().multiplyScalar(side),
      Math.max(0, force.getComponent(axisIndex) * sign) / 2, config.rcsForce * (input.boost ? 2.4 : 1) / 2, index++);
  }
  for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
    const armAxis = (axisIndex + 1) % 3, forceAxis = (axisIndex + 2) % 3;
    for (const sign of [1, -1]) for (const side of [1, -1]) {
      const position = new Vector3().setComponent(armAxis, config.rcsArm * side), direction = new Vector3().setComponent(forceAxis, sign * side);
      fire(direction, position, Math.max(0, torque.getComponent(axisIndex) * sign) / (2 * config.rcsArm), maxTorque / (2 * config.rcsArm), index++);
    }
  }
  const requiredFuel = propellantForce * dt / (config.specificImpulse * GRAVITY);
  if (requiredFuel > model.fuel && requiredFuel > 0) {
    const available = model.fuel / requiredFuel; model.force.multiplyScalar(available); model.torque.multiplyScalar(available);
    model.outputs = model.outputs.map(value => value * available);
  }
  model.fuel = Math.max(0, model.fuel - requiredFuel);
  state.airspeed = state.velocity.length(); state.stall = 0; state.throttle = translation.length();
}

/** Integrate world angular momentum, then recover body rates from the rotated inertia tensor. */
function rotateRigidBody(state: FlightState, model: Dynamics, dt: number): void {
  const inertia = inertiaOf(state, model);
  const momentum = state.angularVelocity.clone().multiply(inertia).applyQuaternion(state.quaternion);
  momentum.add(model.torque.clone().applyQuaternion(state.quaternion).multiplyScalar(dt));
  const midpoint = state.quaternion.clone(), rate = state.angularVelocity.clone(), speed = rate.length();
  if (speed > 1e-10) midpoint.multiply(new Quaternion().setFromAxisAngle(rate.divideScalar(speed), speed * dt * 0.5));
  const midpointRate = momentum.clone().applyQuaternion(midpoint.clone().invert()).divide(inertia), angularSpeed = midpointRate.length();
  if (angularSpeed > 1e-10) state.quaternion.multiply(new Quaternion().setFromAxisAngle(midpointRate.divideScalar(angularSpeed), angularSpeed * dt)).normalize();
  state.angularVelocity.copy(momentum).applyQuaternion(state.quaternion.clone().invert()).divide(inertia);
}
function crash(state: FlightState, model: Dynamics): void {
  state.crashed = true; state.grounded = false; state.velocity.set(0, 0, 0); state.angularVelocity.set(0, 0, 0);
  model.damage = 1; model.armed = false;
}
function terrainLandingSafe(state: FlightState, normalSpeed: number): boolean {
  const attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ'), horizontal = Math.hypot(state.velocity.x, state.velocity.z);
  return state.mode === 'plane'
    ? normalSpeed < 7 && horizontal < 70 && Math.abs(attitude.z) < 24 * RAD && Math.abs(attitude.x) < 30 * RAD
    : normalSpeed < 8 && horizontal < 12 && Math.abs(attitude.z) < 50 * RAD && Math.abs(attitude.x) < 50 * RAD;
}
function obstacleNormal(environment: FlightEnvironment, point: Vector3, radius: number, velocity: Vector3): Vector3 {
  const supplied = environment.contactNormal?.(point, radius);
  if (supplied && supplied.lengthSq() > 1e-8) return supplied.clone().normalize();
  const normal = new Vector3(), epsilon = Math.max(0.03, radius * 0.12);
  for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
    const plus = point.clone().setComponent(axisIndex, point.getComponent(axisIndex) + epsilon);
    const minus = point.clone().setComponent(axisIndex, point.getComponent(axisIndex) - epsilon);
    normal.setComponent(axisIndex, Number(environment.collides(minus, radius)) - Number(environment.collides(plus, radius)));
  }
  return normal.lengthSq() > 0 ? normal.normalize() : velocity.clone().normalize().negate();
}
function moveWithCollisions(state: FlightState, input: FlightInput, environment: FlightEnvironment, model: Dynamics, dt: number): void {
  const radius = RADIUS[state.mode], origin = state.position.clone(), destination = origin.clone().addScaledVector(state.velocity, dt);
  const samples = Math.max(1, Math.ceil(origin.distanceTo(destination) / Math.min(0.8, radius * 0.45)));
  const sample = new Vector3(); let contact = false, floorAtContact = -Infinity;
  let previousFloor = environment.groundHeight(origin.x, origin.z) + radius;
  for (let i = 1; i <= samples; i++) {
    sample.lerpVectors(origin, destination, i / samples);
    if (environment.collides(sample, radius)) {
      state.position.lerpVectors(origin, destination, (i - 1) / samples);
      const normal = obstacleNormal(environment, sample, radius, state.velocity), impact = Math.max(0, -state.velocity.dot(normal));
      model.contactSpeed = impact; model.damage = Math.min(1, model.damage + Math.max(0, impact - 1) ** 2 / 100);
      if (impact > (state.mode === 'space' ? 10 : 9) || model.damage >= 1) { crash(state, model); return; }
      state.velocity.addScaledVector(normal, impact * (1 + model.config.restitution));
      const tangent = state.velocity.clone().addScaledVector(normal, -state.velocity.dot(normal));
      state.velocity.addScaledVector(tangent, -Math.min(1, model.config.friction * impact / Math.max(0.1, tangent.length())));
      const lever = normal.clone().negate().multiplyScalar(radius).applyQuaternion(state.quaternion.clone().invert());
      const impulse = tangent.multiplyScalar(-model.config.friction * massOf(state, model) * 0.15).applyQuaternion(state.quaternion.clone().invert());
      state.angularVelocity.add(lever.cross(impulse).divide(inertiaOf(state, model)));
      state.position.addScaledVector(normal, 0.002); state.grounded = false; return;
    }
    if (state.mode !== 'space') {
      const floor = environment.groundHeight(sample.x, sample.z) + radius;
      if (sample.y <= floor) {
        const riseRate = Number.isFinite(previousFloor) ? (floor - previousFloor) / (dt / samples) : 0;
        const impact = Math.max(0, riseRate - state.velocity.y); model.contactSpeed = impact;
        if (!terrainLandingSafe(state, impact)) { state.position.copy(sample); state.position.y = floor; crash(state, model); return; }
        if (!state.grounded) model.damage = Math.min(1, model.damage + Math.max(0, impact - 3) ** 2 / 70);
        contact = true; floorAtContact = Math.max(floorAtContact, floor);
      }
      previousFloor = floor;
    }
  }
  state.position.copy(destination);
  if (contact) {
    state.position.y = Math.max(state.position.y, floorAtContact, environment.groundHeight(state.position.x, state.position.z) + radius);
    const impact = Math.max(0, -state.velocity.y);
    state.velocity.y = impact > 2 ? impact * model.config.restitution : Math.max(0, state.velocity.y);
    const damping = state.mode === 'plane' ? (input.brake ? 1.4 : 0.035) : model.config.friction * 9;
    state.velocity.x *= Math.exp(-damping * dt); state.velocity.z *= Math.exp(-damping * dt);
    state.angularVelocity.multiplyScalar(Math.exp(-dt * (state.mode === 'plane' ? 8 : 12)));
  }
  state.grounded = contact;
}

/** Every caller step is divided into equal substeps at no less than 240 Hz. */
export function stepFlight(state: FlightState, input: FlightInput, environment: FlightEnvironment, dt: number): void {
  if (state.crashed || !Number.isFinite(dt) || dt <= 0) return;
  state.previousPosition.copy(state.position); state.previousQuaternion.copy(state.quaternion);
  const count = Math.max(1, Math.ceil(dt / FIXED_STEP - 1e-8)), substep = dt / count;
  const model = runtime(state), gravity = gravityOf(state, environment);
  for (let i = 0; i < count && !state.crashed; i++) {
    if (state.mode !== 'space') state.throttle = typeof input.throttle === 'number' && Number.isFinite(input.throttle)
      ? MathUtils.clamp(input.throttle, 0, 1) : MathUtils.clamp(state.throttle + axis(input.throttleDelta) * 0.4 * substep, 0, 1);
    model.sensors.update(state.angularVelocity, state.quaternion, model.acceleration, gravity, model.config, state.flightTime, substep,
      model.fault === 'sensor' ? model.faultStrength : 0);
    model.force.set(0, 0, 0); model.torque.set(0, 0, 0);
    const wind = environment.wind.clone();
    if (model.fault === 'wind') wind.add(new Vector3(Math.sin(state.flightTime * 1.7) * 12, Math.sin(state.flightTime * 0.7) * 3,
      Math.cos(state.flightTime * 1.3) * 8).multiplyScalar(model.faultStrength));
    if (state.mode === 'drone') droneForces(state, input, model, wind, gravity, substep);
    else if (state.mode === 'plane') planeForces(state, input, model, wind, gravity, substep);
    else spaceForces(state, input, model, substep);
    const acceleration = model.force.clone().applyQuaternion(state.quaternion).divideScalar(massOf(state, model)); acceleration.y -= gravity;
    rotateRigidBody(state, model, substep);
    const before = state.velocity.clone(); state.velocity.addScaledVector(acceleration, substep);
    moveWithCollisions(state, input, environment, model, substep);
    model.acceleration.copy(state.velocity).sub(before).divideScalar(substep); state.flightTime += substep;
  }
}

export function getTelemetry(state: FlightState, wind: Vector3): {
  speed: number; altitude: number; verticalSpeed: number; heading: number; pitch: number; roll: number; stoppingDistance: number;
} {
  const forward = FORWARD.clone().applyQuaternion(state.quaternion), attitude = new Euler().setFromQuaternion(state.quaternion, 'YXZ');
  return {
    speed: state.mode === 'space' ? state.velocity.length() : state.velocity.clone().sub(wind).length(),
    altitude: state.position.y, verticalSpeed: state.velocity.y,
    heading: (Math.atan2(forward.x, -forward.z) * DEG + 360) % 360,
    pitch: Math.asin(MathUtils.clamp(forward.y, -1, 1)) * DEG, roll: -attitude.z * DEG,
    stoppingDistance: state.velocity.lengthSq() / (2 * (state.mode === 'space' ? 7.5 : 5)),
  };
}
