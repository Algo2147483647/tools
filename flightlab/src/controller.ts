import { MathUtils, Quaternion, Vector3 } from 'three';
import type { VehicleConfig } from './vehicle-config';

export class RateController {
  readonly integral = new Vector3();
  readonly p = new Vector3();
  readonly i = new Vector3();
  readonly d = new Vector3();
  private previous = new Vector3();
  private derivative = new Vector3();
  private initialized = false;
  saturated = false;

  reset(): void {
    this.integral.set(0, 0, 0);
    this.previous.set(0, 0, 0);
    this.derivative.set(0, 0, 0);
    this.p.set(0, 0, 0); this.i.set(0, 0, 0); this.d.set(0, 0, 0);
    this.initialized = false; this.saturated = false;
  }

  update(target: Vector3, measured: Vector3, config: VehicleConfig, limit: Vector3, dt: number): Vector3 {
    const error = target.clone().sub(measured);
    const derivative = this.initialized ? measured.clone().sub(this.previous).divideScalar(dt) : new Vector3();
    this.derivative.lerp(derivative, 1 - Math.exp(-dt / 0.018));
    this.previous.copy(measured); this.initialized = true;
    this.p.copy(error).multiplyScalar(config.rateP);
    this.d.copy(this.derivative).multiplyScalar(-config.rateD);
    const output = new Vector3();
    this.saturated = false;
    for (let axis = 0; axis < 3; axis++) {
      const cap = limit.getComponent(axis);
      const p = this.p.getComponent(axis), d = this.d.getComponent(axis), e = error.getComponent(axis);
      const old = this.integral.getComponent(axis);
      const candidate = MathUtils.clamp(old + e * config.rateI * dt, -cap * 0.45, cap * 0.45);
      const unclamped = p + candidate + d;
      // Conditional integration prevents a persistent unavailable command winding up the controller.
      const integral = Math.abs(unclamped) < cap || e * unclamped < 0 ? candidate : old;
      this.integral.setComponent(axis, integral);
      this.i.setComponent(axis, integral);
      output.setComponent(axis, MathUtils.clamp(p + integral + d, -cap, cap));
      this.saturated ||= Math.abs(unclamped) >= cap;
    }
    return output;
  }

  allocationFeedback(requested: Vector3, delivered: Vector3, dt: number): void {
    // Back-calculation follows allocation saturation, not motor lag or sensor noise.
    const difference = delivered.clone().sub(requested);
    if (difference.lengthSq() > 1e-8) {
      this.saturated = true;
      for (let axis = 0; axis < 3; axis++) {
        const integral = this.integral.getComponent(axis), correction = difference.getComponent(axis) * Math.min(1, dt * 4);
        // Unwind stored error without creating a reverse integral merely to cancel unavailable P demand.
        if (integral * correction < 0) this.integral.setComponent(axis,
          Math.abs(correction) >= Math.abs(integral) ? 0 : integral + correction);
      }
      this.i.copy(this.integral);
    }
  }
}

interface SensorSample { time: number; gyro: Vector3; accel: Vector3; position: Vector3; velocity: Vector3; }
export class SensorSuite {
  readonly gyro = new Vector3();
  readonly accel = new Vector3();
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly orientation = new Quaternion();
  private samples: SensorSample[] = [];
  private randomState = 0x713ab21;
  private initialized = false;

  constructor(orientation: Quaternion) { this.orientation.copy(orientation); }

  private noise(): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
      sum += this.randomState / 0x100000000;
    }
    return (sum - 3) * Math.SQRT2;
  }

  update(actualRates: Vector3, actualOrientation: Quaternion, acceleration: Vector3, gravity: number, config: VehicleConfig,
    time: number, dt: number, sensorFault: number, position: Vector3, velocity: Vector3): void {
    const noise = config.gyroNoise + sensorFault * 0.12;
    const bias = config.gyroBias + sensorFault * 0.1;
    const measured = actualRates.clone().add(new Vector3(
      this.noise() * noise + bias, this.noise() * noise - bias * 0.6, this.noise() * noise + bias * 0.35,
    ));
    const accelerationBody = acceleration.clone().add(new Vector3(0, gravity, 0)).applyQuaternion(actualOrientation.clone().invert());
    accelerationBody.add(new Vector3(this.noise() * config.accelNoise + config.accelBias,
      this.noise() * config.accelNoise - config.accelBias * 0.5, this.noise() * config.accelNoise + config.accelBias * 0.35));
    const observedPosition = position.clone().add(new Vector3(this.noise(), this.noise(), this.noise()).multiplyScalar(config.positionNoise));
    const observedVelocity = velocity.clone().add(new Vector3(this.noise(), this.noise(), this.noise()).multiplyScalar(config.velocityNoise));
    this.samples.push({ time, gyro: measured, accel: accelerationBody, position: observedPosition, velocity: observedVelocity });
    const cutoff = time - config.sensorDelay;
    while (this.samples.length > 1 && this.samples[1].time <= cutoff + 1e-9) this.samples.shift();
    const sample = this.samples[0];
    const blend = this.initialized ? 1 - Math.exp(-Math.PI * 2 * config.gyroFilter * dt) : 1;
    this.gyro.lerp(sample.gyro, blend);
    this.accel.lerp(sample.accel, this.initialized ? 1 - Math.exp(-Math.PI * 2 * config.accelFilter * dt) : 1);
    this.position.copy(sample.position); this.velocity.copy(sample.velocity);
    this.initialized = true;
    const correction = new Vector3();
    // An accelerometer measures specific force, not gravity. Reject translation before applying a gravity correction.
    if (gravity > 0 && acceleration.length() < 0.05 && Math.abs(this.accel.length() - gravity) < 0.1) {
      const estimatedUp = new Vector3(0, 1, 0).applyQuaternion(this.orientation.clone().invert());
      correction.crossVectors(this.accel.clone().normalize(), estimatedUp).multiplyScalar(0.6);
    }
    const rate = this.gyro.clone().add(correction);
    const magnitude = rate.length();
    if (magnitude > 1e-10) this.orientation.multiply(new Quaternion().setFromAxisAngle(rate.divideScalar(magnitude), magnitude * dt)).normalize();
  }
}
