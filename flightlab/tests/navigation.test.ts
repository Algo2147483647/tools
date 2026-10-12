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

  it('captures a co-moving vessel using relative speed instead of absolute world speed', () => {
    const state=vessel(),velocity=new Vector3(18,-3,12);
    state.position.copy(dock.position).add(new Vector3(0,0,3));state.velocity.copy(velocity);
    const guidance=getDockingGuidance(state,{...dock,velocity});
    expect(guidance.closingSpeed).toBe(0);
    expect(guidance.lateralSpeed).toBe(0);
    expect(guidance.stoppingDistance).toBe(0);
    expect(guidance.safeApproach).toBe(true);
  });

  it('is invariant when vessel and target receive the same world velocity', () => {
    const state=vessel(),velocity=new Vector3(2,1,-3);
    state.velocity.set(2.5,1.2,-8);
    const before=getDockingGuidance(state,{...dock,velocity});
    const boost=new Vector3(-35,14,42);
    state.velocity.add(boost);velocity.add(boost);
    const after=getDockingGuidance(state,{...dock,velocity});
    expect(after.closingSpeed).toBeCloseTo(before.closingSpeed,12);
    expect(after.lateralSpeed).toBeCloseTo(before.lateralSpeed,12);
    expect(after.stoppingDistance).toBeCloseTo(before.stoppingDistance,12);
    expect(after.safeApproach).toBe(before.safeApproach);
  });

  it('warns when a moving target creates excessive closure or sideways drift', () => {
    const state=vessel();state.position.z=-80;state.velocity.set(0,0,0);
    const closing=getDockingGuidance(state,{...dock,velocity:new Vector3(0,0,20)});
    expect(closing.closingSpeed).toBe(20);
    expect(closing.safeApproach).toBe(false);
    const drifting=getDockingGuidance(state,{...dock,velocity:new Vector3(3,0,0)});
    expect(drifting.lateralSpeed).toBe(3);
    expect(drifting.safeApproach).toBe(false);
  });
});
