import { MathUtils, Quaternion, Vector3 } from 'three';
import { estimateStoppingDistance } from './physics';
import type { FlightState } from './types';

export interface DockingTarget {
  position: Vector3;
  /** Desired vessel orientation; the approach corridor extends along local +Z. */
  quaternion: Quaternion;
  radius: number;
  velocity?: Vector3;
}
export interface DockingGuidance {
  distance: number;
  /** Positive when range to the target is decreasing; negative when retreating. */
  closingSpeed: number;
  lateralSpeed: number;
  alignmentDegrees: number;
  /** Vessel offset in the target's frame. Positive X is right and positive Y is up. */
  offsetX: number;
  offsetY: number;
  stoppingDistance: number;
  safeApproach: boolean;
  behind: boolean;
}

/** Target-relative docking guidance, including moving ports. No target is silently selected by the flight model. */
export function getDockingGuidance(state: FlightState, dock: DockingTarget): DockingGuidance {
  const inverse = dock.quaternion.clone().invert();
  const offset = state.position.clone().sub(dock.position);
  const distance = offset.length();
  const localOffset = offset.clone().applyQuaternion(inverse);
  const relativeVelocity=state.velocity.clone().sub(dock.velocity??new Vector3());
  const localVelocity = relativeVelocity.clone().applyQuaternion(inverse);
  const closingSpeed = distance > 1e-6 ? -relativeVelocity.dot(offset) / distance || 0 : 0;
  const lateralSpeed = Math.hypot(localVelocity.x, localVelocity.y);
  const alignmentDegrees = MathUtils.radToDeg(state.quaternion.angleTo(dock.quaternion));
  const stoppingDistance = estimateStoppingDistance(state,relativeVelocity.length());
  const behind = localOffset.z < -0.001;
  const centered = Math.hypot(localOffset.x, localOffset.y) < dock.radius * 0.65;
  const slowCapture = distance < dock.radius && relativeVelocity.length() < 1.4;
  const safeApproach = !behind && centered && alignmentDegrees < 15 && lateralSpeed < 1.4
    && closingSpeed >= -0.5 && (slowCapture || stoppingDistance < Math.max(0, localOffset.z - dock.radius));
  return {
    distance, closingSpeed, lateralSpeed, alignmentDegrees,
    offsetX: localOffset.x, offsetY: localOffset.y,
    stoppingDistance, safeApproach, behind,
  };
}
