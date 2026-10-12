import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { getDockingGuidance } from '../src/navigation';
import { createFlightState, setHandlingPreset } from '../src/physics';

const dock = { position: new Vector3(0, 0, -100), quaternion: new Quaternion(), radius: 9 };
const vessel = () => createFlightState('space', {
  position: new Vector3(0, 0, 0), quaternion: new Quaternion(),
  velocity: new Vector3(0, 0, -5), throttle: 0,
});

describe('target-frame docking guidance', () => {
  it('reports signed closure and classifies a centered, aligned slow approach', () => {
    const state = vessel();
    const guidance = getDockingGuidance(state, dock);
    expect(guidance.distance).toBe(100);
    expect(guidance.closingSpeed).toBe(5);
    expect(guidance.lateralSpeed).toBe(0);
    expect(guidance.alignmentDegrees).toBe(0);
    expect(guidance.safeApproach).toBe(true);
    expect(guidance.behind).toBe(false);
    state.velocity.z = 3;
    expect(getDockingGuidance(state, dock).closingSpeed).toBe(-3);
    expect(getDockingGuidance(state, dock).safeApproach).toBe(false);
  });

  it('rotates offsets, lateral speed and corridor direction with the docking target', () => {
    const state = vessel();
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const rotatedDock = { ...dock, quaternion: rotation };
    state.position.set(3, 4, 50).applyQuaternion(rotation).add(dock.position);
    state.velocity.set(1, 2, -5).applyQuaternion(rotation);
    state.quaternion.copy(rotation);
    const guidance = getDockingGuidance(state, rotatedDock);
    expect(guidance.offsetX).toBeCloseTo(3, 8);
    expect(guidance.offsetY).toBeCloseTo(4, 8);
    expect(guidance.lateralSpeed).toBeCloseTo(Math.sqrt(5), 8);
    expect(guidance.alignmentDegrees).toBe(0);
    expect(guidance.behind).toBe(false);
    expect(guidance.safeApproach).toBe(false);
  });

  it('warns when behind the port, misaligned, or too fast to brake in the remaining corridor', () => {
    const state = vessel();
    state.position.z = -110;
    expect(getDockingGuidance(state, dock).behind).toBe(true);
    expect(getDockingGuidance(state, dock).safeApproach).toBe(false);
    state.position.z = 0;
    state.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4);
    expect(getDockingGuidance(state, dock).alignmentDegrees).toBeCloseTo(45, 8);
    expect(getDockingGuidance(state, dock).safeApproach).toBe(false);
    state.quaternion.identity();
    state.position.z = -70;
    state.velocity.z = -30;
    expect(getDockingGuidance(state, dock).stoppingDistance).toBeGreaterThan(60);
    expect(getDockingGuidance(state, dock).safeApproach).toBe(false);
  });

  it('handles a stopped vessel at the target and accounts for handling profile braking', () => {
    const state = vessel();
    state.position.copy(dock.position);
    state.velocity.set(0, 0, 0);
    const capture = getDockingGuidance(state, dock);
    expect(capture.closingSpeed).toBe(0);
    expect(capture.stoppingDistance).toBe(0);
    expect(capture.safeApproach).toBe(true);
    state.velocity.set(0, 0, -20);
    setHandlingPreset(state, 'gentle');
    const gentle = getDockingGuidance(state, dock).stoppingDistance;
    setHandlingPreset(state, 'sport');
    expect(getDockingGuidance(state, dock).stoppingDistance).toBeLessThan(gentle);
  });
});
