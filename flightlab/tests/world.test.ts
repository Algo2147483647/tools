import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Material, Mesh, Sprite, Vector3 } from 'three';
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

  it('gives every gate an authored route label', () => {
    expect(world.routeLabels).toHaveLength(world.gates.length);
    expect(world.routeLabels.every(label => label.trim().length > 3)).toBe(true);
  });

  it('starts lessons safely at rest and survives neutral ground contact', () => {
    const spawn = world.trainingSpawn(mode);
    expect(spawn.velocity.length()).toBe(0);
    expect(spawn.throttle).toBe(0);
    expect(world.collides(spawn.position, radius)).toBe(false);
    const state = createFlightState(mode, spawn);
    const environment = {
      wind: new Vector3(), groundHeight: (x: number, z: number) => world.groundHeight(x, z),
      collides: (position: Vector3, r: number) => world.collides(position, r),
    };
    for (let i = 0; i < 120; i++) stepFlight(state, ZERO_INPUT, environment, 1 / 120);
    expect(state.crashed).toBe(false);
    if (mode === 'space') expect(spawn.position.distanceTo(world.dock.position)).toBe(150);
    else expect(state.grounded).toBe(true);
  });
});

describe('coastal route perception', () => {
  it('builds physical warehouse walls and ceiling with a clear pass-through aisle', () => {
    const world = new FlightWorld('drone');
    try {
      expect(world.routeLabels).toContain('Under the bridge');
      expect(world.routeLabels).toContain('Cliffside');
      for (let z = -40; z <= 50; z++) expect(world.collides(new Vector3(0, 10, z), 0.6)).toBe(false);
      expect(world.collides(new Vector3(10.5, 10, 6), 0.6)).toBe(true);
      expect(world.collides(new Vector3(0, 21, 6), 0.6)).toBe(true);
      expect(world.collides(new Vector3(50, 14, -500), 0.6)).toBe(false);
      expect(world.collides(new Vector3(50, 29, -500), 0.6)).toBe(true);
    } finally { world.dispose(); }
  });

  it('reports real pad, ground, warehouse, and bridge surface distances', () => {
    const world = new FlightWorld('drone');
    try {
      expect(world.groundHeight(0, 120)).toBe(world.landingPad.position.y);
      expect(world.proximity(new Vector3(0, 3.25, 120))).toBeCloseTo(3);
      expect(world.proximity(new Vector3(8, 10, 6))).toBeCloseTo(1.5);
      expect(world.proximity(new Vector3(50, 25.35, -500))).toBeCloseTo(2);
      expect(world.proximity(new Vector3(10.5, 10, 6))).toBe(0);
      expect(world.proximity(new Vector3(0, 500, 120), 25)).toBe(25);
    } finally { world.dispose(); }
  });

  it('uses supplied wind for windsocks and preserves calm when no wind is supplied', () => {
    const world = new FlightWorld('drone');
    try {
      const state = createFlightState('drone', world.spawn());
      const internals = world as unknown as { windCues: { pivot: { rotation: { y: number } }; cloth: { rotation: { y: number; z: number } } }[] };
      world.update(1 / 60, 1, state, new Vector3(8, 0, 0));
      expect(internals.windCues[0].pivot.rotation.y).toBeCloseTo(0);
      expect(internals.windCues[0].cloth.rotation.z).toBeCloseTo(0);
      world.update(1 / 60, 2, state, new Vector3(0, 0, 8));
      expect(internals.windCues[0].pivot.rotation.y).toBeCloseTo(-Math.PI / 2);
      world.update(1 / 60, 3, state);
      expect(internals.windCues[0].cloth.rotation.y).toBeCloseTo(0);
      expect(internals.windCues[0].cloth.rotation.z).toBeCloseTo(-1.35);
    } finally { world.dispose(); }
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

  it('shows optional guidance without introducing obstacles into the approach corridor', () => {
    const world = new FlightWorld('space');
    try {
      const guidance = world.scene.getObjectByName('Dock guidance')!;
      expect(guidance.visible).toBe(false);
      world.setDockGuidance(true);
      expect(guidance.visible).toBe(true);
      for (let z = world.dock.position.z; z <= world.trainingSpawn().position.z; z++) {
        expect(world.collides(new Vector3(0, 8, z), 2)).toBe(false);
      }
      expect(world.proximity(world.dock.position)).toBeCloseTo(20);
      expect(world.proximity(new Vector3(112, 8, -550))).toBe(0);
      world.setDockGuidance(false);
      expect(guidance.visible).toBe(false);
    } finally { world.dispose(); }
  });
});

describe('world lifecycle', () => {
  it('disposes shared scene resources once when rebuilding another environment', () => {
    const world = new FlightWorld('drone');
    const resources = new Set<BufferGeometry | Material>();
    const disposalCounts = new Map<BufferGeometry | Material, number>();
    world.scene.traverse(object => {
      const mesh = object as Mesh;
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
    });
    for (const resource of resources) resource.addEventListener('dispose', () => disposalCounts.set(resource, (disposalCounts.get(resource) ?? 0) + 1));
    world.setMode('space');
    expect(resources.size).toBeGreaterThan(20);
    for (const resource of resources) expect(disposalCounts.get(resource)).toBe(1);
    expect(world.routeLabels).toHaveLength(world.gates.length);
    expect(world.scene.getObjectByName('Dock guidance')).toBeDefined();
    world.dispose();
    expect(world.scene.children).toHaveLength(0);
  });
});
