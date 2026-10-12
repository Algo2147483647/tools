import type { Quaternion, Vector3 } from 'three';

export type FlightMode = 'drone' | 'plane' | 'space';
export type CameraMode = 'chase' | 'fpv';
export type Weather = 'clear' | 'windy' | 'dusk';
// Coordinates: Y up, local -Z forward, local +X right. SI units throughout.
export interface FlightInput {
  pitch: number; // Positive nose up.
  roll: number; // Positive right bank.
  yaw: number; // Positive turn right.
  throttleDelta: number;
  throttle?: number;
  moveX: number; // Right.
  moveY: number; // Up.
  moveZ: number; // Forward.
  brake: boolean;
  boost: boolean;
}
export interface FlightState {
  mode: FlightMode;
  position: Vector3;
  previousPosition: Vector3;
  quaternion: Quaternion;
  previousQuaternion: Quaternion;
  velocity: Vector3;
  angularVelocity: Vector3; // Body XYZ, radians per second.
  throttle: number;
  airspeed: number;
  stall: number;
  grounded: boolean;
  crashed: boolean;
  assist: boolean;
  flightTime: number;
}
export interface SpawnPoint { position: Vector3; quaternion: Quaternion; velocity: Vector3; throttle: number; }
export interface FlightEnvironment {
  wind: Vector3;
  gravity?: number;
  groundHeight: (x: number, z: number) => number;
  collides: (position: Vector3, radius: number) => boolean;
  contactNormal?: (position: Vector3, radius: number) => Vector3 | null;
}
export interface Gate { position: Vector3; normal: Vector3; radius: number; }
export interface InputSettings {
  deadzone: number;
  sensitivity: number;
  expo: number;
  invertPitch: boolean;
  vibration: boolean;
}
export type InputAction = 'pause' | 'reset' | 'camera' | 'assist' | 'arm';
