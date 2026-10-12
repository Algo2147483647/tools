import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Sprite, Vector3 } from 'three';
import { FlightWorld } from '../src/world';
import { createFlightState, stepFlight, ZERO_INPUT } from '../src/physics';
import type { FlightMode } from '../src/types';

// Label painting does not affect scene geometry or collision data. Keep these tests CPU-only.
let restoreLabels: () => void;
beforeAll(() => {
  const labelStub = vi.spyOn(
    FlightWorld.prototype as unknown as { makeLabel(text: string, color: string, background: string): Sprite },
    'makeLabel',
  ).mockImplementation(() => new Sprite());
  restoreLabels = () => { labelStub.mockRestore(); };
});
afterAll(() => restoreLabels());

describe.each<FlightMode>(['drone', 'plane', 'space'])('%s environment', mode => {
  let world: FlightWorld;
  const radius = mode === 'drone' ? 0.6 : mode === 'plane' ? 2.5 : 2;
  beforeAll(() => { world = new FlightWorld(mode); });
  afterAll(() => world.dispose());

  it('spawns clear of solids and terrain and survives the first neutral seconds', () => {
    const spawn = world.spawn(mode);
    expect(world.collides(spawn.position, radius)).toBe(false);
    expect(spawn.position.y - radius).toBeGreaterThan(world.groundHeight(spawn.position.x, spawn.position.z));
    const state = createFlightState(mode, spawn);
    const environment = {
      wind: new Vector3(), groundHeight: (x: number, z: number) => world.groundHeight(x, z),
      collides: (position: Vector3, r: number) => world.collides(position, r),
    };
    for (let i = 0; i < 360; i++) stepFlight(state, ZERO_INPUT, environment, 1 / 120);
    expect(state.crashed).toBe(false);
  });

  it('provides unobstructed gate centers and a navigable direct route between them', () => {
    let previous = world.spawn(mode).position;
    const sample = new Vector3();
    for (const gate of world.gates) {
      expect(gate.radius).toBeGreaterThan(radius * 2);
      expect(gate.normal.length()).toBeCloseTo(1, 8);
      const samples = Math.ceil(previous.distanceTo(gate.position) / radius);
      for (let i = 0; i <= samples; i++) {
        sample.lerpVectors(previous, gate.position, i / samples);
        expect(world.collides(sample, radius), `Blocked route at ${sample.toArray()}`).toBe(false);
        expect(sample.y - radius).toBeGreaterThan(world.groundHeight(sample.x, sample.z));
      }
      previous = gate.position;
    }
  });
});

describe('space docking approach', () => {
  it('leaves the docking hold volume clear while the rear bulkhead remains solid', () => {
    const world = new FlightWorld('space');
    try {
      const point = world.dock.position.clone();
      expect(world.collides(point, 2)).toBe(false);
      for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
        for (const sign of [-1, 1]) {
          point.copy(world.dock.position).addScaledVector(axis, sign * world.dock.radius * 0.8);
          expect(world.collides(point, 2)).toBe(false);
        }
      }
      point.copy(world.dock.position).add(new Vector3(0, 0, -30));
      expect(world.collides(point, 2)).toBe(true);
    } finally {
      world.dispose();
    }
  });
});
