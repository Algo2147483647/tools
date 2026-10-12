import type { FlightMode } from './types';

export type VehicleConfig = Record<string, number>;
export interface VehicleField { key: string; label: string; group: string; min: number; max: number; step: number; unit: string; }
type Definition = VehicleField & { value: number };
const field = (key: string, label: string, group: string, value: number, min: number, max: number, step: number, unit = ''): Definition =>
  ({ key, label, group, value, min, max, step, unit });

const common = [
  field('comX', 'Center of mass: right', 'Airframe', 0, -0.15, 0.15, 0.005, 'm'),
  field('comY', 'Center of mass: up', 'Airframe', 0, -0.15, 0.15, 0.005, 'm'),
  field('comZ', 'Center of mass: aft', 'Airframe', 0, -0.15, 0.15, 0.005, 'm'),
  field('gyroNoise', 'Gyroscope noise', 'Sensors', 0, 0, 0.12, 0.001, 'rad/s RMS'),
  field('gyroBias', 'Gyroscope bias', 'Sensors', 0, -0.08, 0.08, 0.001, 'rad/s'),
  field('sensorDelay', 'Sensor delay', 'Sensors', 0, 0, 0.12, 0.004, 's'),
  field('gyroFilter', 'Gyroscope low-pass cutoff', 'Sensors', 90, 5, 120, 1, 'Hz'),
  field('accelNoise', 'Accelerometer noise', 'Sensors', 0, 0, 0.8, 0.01, 'm/s² RMS'),
  field('accelBias', 'Accelerometer bias', 'Sensors', 0, -0.5, 0.5, 0.01, 'm/s²'),
  field('accelFilter', 'Accelerometer low-pass cutoff', 'Sensors', 30, 5, 120, 1, 'Hz'),
  field('positionNoise', 'Position observation noise', 'Sensors', 0, 0, 2, 0.01, 'm RMS'),
  field('velocityNoise', 'Velocity observation noise', 'Sensors', 0, 0, 0.5, 0.01, 'm/s RMS'),
  field('restitution', 'Contact restitution', 'Contact', 0.12, 0, 0.75, 0.01),
  field('friction', 'Contact friction', 'Contact', 0.55, 0, 1.2, 0.01),
];

const definitions: Record<FlightMode, Definition[]> = {
  drone: [
    field('mass', 'Mass', 'Airframe', 1.2, 0.3, 6, 0.05, 'kg'),
    field('inertiaX', 'Pitch inertia', 'Airframe', 0.035, 0.005, 0.3, 0.001, 'kg m²'),
    field('inertiaY', 'Yaw inertia', 'Airframe', 0.055, 0.005, 0.5, 0.001, 'kg m²'),
    field('inertiaZ', 'Roll inertia', 'Airframe', 0.035, 0.005, 0.3, 0.001, 'kg m²'),
    field('armLength', 'Motor diagonal arm length', 'Propulsion', 0.3, 0.15, 0.65, 0.01, 'm'),
    ...['Front-left', 'Front-right', 'Rear-right', 'Rear-left'].flatMap((label, index) => [
      field(`motor${index}X`, `${label} motor X offset`, 'Motor layout', 0, -0.3, 0.3, 0.005, 'm'),
      field(`motor${index}Z`, `${label} motor Z offset`, 'Motor layout', 0, -0.3, 0.3, 0.005, 'm'),
    ]),
    field('maxRotorThrust', 'Maximum thrust per rotor', 'Propulsion', 5.886, 1, 30, 0.01, 'N'),
    field('motorTimeConstant', 'Motor response time', 'Propulsion', 0.035, 0.005, 0.25, 0.005, 's'),
    field('reactionTorque', 'Rotor reaction torque ratio', 'Propulsion', 0.025, 0.005, 0.08, 0.001, 'm'),
    field('drag', 'Airframe drag', 'Aerodynamics', 0.132, 0, 2, 0.01, 'N/(m/s)'),
    field('rateP', 'Rate proportional gain', 'Flight controller', 0.3, 0.02, 1.5, 0.01),
    field('rateI', 'Rate integral gain', 'Flight controller', 0.06, 0, 0.5, 0.005),
    field('rateD', 'Rate derivative gain', 'Flight controller', 0.004, 0, 0.04, 0.001),
    field('attitudeP', 'Attitude proportional gain', 'Flight controller', 6, 1, 12, 0.1),
    field('maxPitchRate', 'Maximum pitch rate', 'Flight controller', 200, 30, 900, 5, 'deg/s'),
    field('maxRollRate', 'Maximum roll rate', 'Flight controller', 260, 30, 900, 5, 'deg/s'),
    field('maxYawRate', 'Maximum yaw rate', 'Flight controller', 140, 20, 600, 5, 'deg/s'),
    ...common,
  ],
  plane: [
    field('mass', 'Mass', 'Airframe', 90, 30, 300, 1, 'kg'),
    field('inertiaX', 'Pitch inertia', 'Airframe', 70, 10, 400, 1, 'kg m²'),
    field('inertiaY', 'Yaw inertia', 'Airframe', 100, 10, 600, 1, 'kg m²'),
    field('inertiaZ', 'Roll inertia', 'Airframe', 150, 10, 800, 1, 'kg m²'),
    field('wingArea', 'Wing area', 'Aerodynamics', 2.94, 0.8, 12, 0.05, 'm²'),
    field('wingSpan', 'Wing span', 'Aerodynamics', 5, 2, 12, 0.1, 'm'),
    field('liftSlope', 'Lift curve slope', 'Aerodynamics', 4.5, 1, 7, 0.1, '/rad'),
    field('baseLift', 'Lift coefficient at zero AoA', 'Aerodynamics', 0.34, 0, 0.8, 0.01),
    field('dragCoefficient', 'Parasitic drag coefficient', 'Aerodynamics', 0.075, 0.015, 0.2, 0.005),
    field('maxThrust', 'Maximum engine thrust', 'Propulsion', 855, 200, 3000, 5, 'N'),
    field('servoTimeConstant', 'Servo response time', 'Actuators', 0.075, 0.02, 0.4, 0.005, 's'),
    field('surfaceLimit', 'Maximum surface deflection', 'Actuators', 24, 8, 40, 1, 'deg'),
    field('elevatorTrim', 'Elevator trim', 'Actuators', 0, -12, 12, 0.25, 'deg'),
    field('rateP', 'Rate proportional gain', 'Flight controller', 350, 50, 900, 5),
    field('rateI', 'Rate integral gain', 'Flight controller', 35, 0, 150, 1),
    field('rateD', 'Rate derivative gain', 'Flight controller', 8, 0, 60, 1),
    field('attitudeP', 'Attitude proportional gain', 'Flight controller', 3.5, 1, 8, 0.1),
    ...common,
  ],
  space: [
    field('mass', 'Dry mass', 'Airframe', 1000, 200, 5000, 10, 'kg'),
    field('inertiaX', 'Pitch inertia', 'Airframe', 1800, 200, 20000, 50, 'kg m²'),
    field('inertiaY', 'Yaw inertia', 'Airframe', 2200, 200, 20000, 50, 'kg m²'),
    field('inertiaZ', 'Roll inertia', 'Airframe', 1500, 200, 20000, 50, 'kg m²'),
    field('fuel', 'Propellant load', 'Propulsion', 100, 0, 1000, 1, 'kg'),
    field('rcsForce', 'Translation pair thrust', 'Propulsion', 8250, 500, 40000, 50, 'N'),
    field('rcsTorque', 'Rotation pair torque', 'Propulsion', 5500, 200, 25000, 50, 'N m'),
    field('rcsArm', 'RCS moment arm', 'Propulsion', 2, 0.5, 6, 0.1, 'm'),
    field('rcsPitchOffset', 'Pitch jet arm offset', 'RCS layout', 0, -0.4, 3, 0.05, 'm'),
    field('rcsYawOffset', 'Yaw jet arm offset', 'RCS layout', 0, -0.4, 3, 0.05, 'm'),
    field('rcsRollOffset', 'Roll jet arm offset', 'RCS layout', 0, -0.4, 3, 0.05, 'm'),
    field('specificImpulse', 'Thruster specific impulse', 'Propulsion', 280, 80, 900, 5, 's'),
    field('rateP', 'Rate proportional gain', 'Flight controller', 10000, 500, 30000, 100),
    field('rateI', 'Rate integral gain', 'Flight controller', 100, 0, 3000, 50),
    field('rateD', 'Rate derivative gain', 'Flight controller', 100, 0, 1000, 10),
    field('attitudeP', 'Attitude proportional gain', 'Flight controller', 3, 1, 8, 0.1),
    ...common,
  ],
};

export function getVehicleFields(mode: FlightMode): VehicleField[] {
  return definitions[mode].map(({ value: _value, ...descriptor }) => ({ ...descriptor }));
}
export function defaultVehicleConfig(mode: FlightMode): VehicleConfig {
  return Object.fromEntries(definitions[mode].map(({ key, value }) => [key, value]));
}
/** Untrusted files are bounded by the schema; missing and nonfinite values use defaults. */
export function validateVehicleConfig(mode: FlightMode, value: unknown): VehicleConfig {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(definitions[mode].map(({ key, value: fallback, min, max }) => {
    const input = candidate[key];
    return [key, typeof input === 'number' && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback];
  }));
}
