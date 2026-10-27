import assert from "node:assert/strict";
import { crossesBox } from "../layout/compound/routing/geometry";
import { uniquePorts } from "../layout/compound/routing/ports";
import { simpleRoutes } from "../layout/compound/routing/search";
import { ObstacleIndex, segmentBounds } from "../layout/compound/routing/spatial-index";
import { EPSILON, type Port } from "../layout/compound/routing/types";
import { defineSuite, defineTest } from "./harness";

export const simpleRoutingSuite = defineSuite("Simple routing invariants", [
  defineTest("port identity includes point, stub and direction, preserving first occurrence", () => {
    const first: Port = { point: { x: 0, y: 0 }, stub: { x: 10, y: 0 }, direction: 0 };
    const longer = { ...first, stub: { x: 20, y: 0 } };
    const otherDirection = { ...first, direction: 1 };
    const nearby = { ...first, point: { x: EPSILON / 2, y: 0 } };
    const input = [first, longer, structuredClone(first), otherDirection, nearby, structuredClone(longer)];
    const result = uniquePorts(input);
    assert.deepEqual(result, [first, longer, otherDirection, nearby]);
    assert.equal(result[0], first);
    assert.equal(result[1], longer);
  }),
  defineTest("direct routes keep narrow-gap and containing-obstacle exemptions", () => {
    const source: Port = { point: { x: 0, y: 0 }, stub: { x: 20, y: 0 }, direction: 0 };
    const target: Port = { point: { x: 10, y: 0 }, stub: { x: -10, y: 0 }, direction: 2 };
    const direct = [[source.point, target.point]];
    assert.deepEqual(simpleRoutes([source, source], [target, target], []), direct);
    assert.deepEqual(simpleRoutes([source], [target], [{ x: -1, y: -1, width: 6, height: 2 }]), direct);
    assert.deepEqual(simpleRoutes([source], [target], [{ x: 5, y: -1, width: 6, height: 2 }]), direct);
    assert.deepEqual(simpleRoutes([source], [target], [{ x: 4, y: -1, width: 2, height: 2 }]), []);
    assert.deepEqual(simpleRoutes([source], [{ ...target, direction: 0 }], []), []);
  }),
  defineTest("four trunk forms retain order and exempt only endpoint approaches", () => {
    const source: Port = { point: { x: 0, y: 0 }, stub: { x: 10, y: 0 }, direction: 0 };
    const target: Port = { point: { x: 30, y: 30 }, stub: { x: 20, y: 30 }, direction: 2 };
    const expected = [
      [
        [0, 0],
        [10, 0],
        [10, 30],
        [30, 30],
      ],
      [
        [0, 0],
        [20, 0],
        [20, 30],
        [30, 30],
      ],
      [
        [0, 0],
        [15, 0],
        [15, 30],
        [30, 30],
      ],
      [
        [0, 0],
        [10, 0],
        [10, 15],
        [20, 15],
        [20, 30],
        [30, 30],
      ],
    ].map((route) => route.map(([x, y]) => ({ x, y })));
    const approachObstacle = { x: 2, y: -1, width: 2, height: 2 };
    assert.deepEqual(simpleRoutes([source, source], [target, target], [approachObstacle]), expected);
    assert.ok(crossesBox(expected[0][0], expected[0][1], approachObstacle));
    // This obstacle contains the source but also intersects each original trunk.
    assert.deepEqual(simpleRoutes([source], [target], [{ x: -1, y: -1, width: 17, height: 35 }]), []);
  }),
  defineTest("failed checks do not suppress a later identical output with a different trunk", () => {
    const short: Port = { point: { x: 0, y: 0 }, stub: { x: 10, y: 0 }, direction: 0 };
    const long = { ...short, stub: { x: 20, y: 0 } };
    const target: Port = { point: { x: 40, y: 30 }, stub: { x: 30, y: 30 }, direction: 2 };
    const obstacle = { x: 12, y: -1, width: 4, height: 2 };
    const route = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 40, y: 30 },
    ];
    assert.ok(!simpleRoutes([short], [target], [obstacle]).some((p) => JSON.stringify(p) === JSON.stringify(route)));
    const result = simpleRoutes([short, long, short], [target, target], [obstacle]);
    assert.ok(result.some((p) => JSON.stringify(p) === JSON.stringify(route)));
    assert.equal(new Set(result.map((p) => JSON.stringify(p))).size, result.length);
  }),
  defineTest("boolean index queries prune branches and entries and stop at the first exact hit", () => {
    const boxes = Array.from({ length: 40 }, (_, i) => ({ x: (39 - i) * 10, y: 0, width: 4, height: 4 }));
    const index = new ObstacleIndex(boxes);
    const all = { minX: -1, minY: -1, maxX: 400, maxY: 5 };
    assert.deepEqual(index.query(all), boxes, "ordered query still retains input order");
    let calls = 0; // Instrumentation only: production predicates are pure.
    assert.equal(
      index.some(all, () => {
        calls++;
        return true;
      }),
      true,
    );
    assert.equal(calls, 1);
    assert.equal(
      index.some({ ...all, minY: 10, maxY: 20 }, () => {
        throw new Error("pruned branch");
      }),
      false,
    );
    const one = { minX: 19, maxX: 25, minY: 1, maxY: 2 };
    const seen: unknown[] = [];
    assert.equal(
      index.some(one, (box) => {
        seen.push(box);
        return false;
      }),
      false,
    );
    assert.deepEqual(seen, [boxes[37]], "leaf bounds are checked before the exact predicate");
    assert.equal(
      new ObstacleIndex([]).some(all, () => {
        throw new Error("empty tree");
      }),
      false,
    );
  }),
  defineTest("segmentSome matches ordered collision checks at boundaries, zero length and precision limits", () => {
    const boxes = Array.from({ length: 24 }, (_, i) => ({
      x: (i % 6) * 10,
      y: Math.floor(i / 6) * 10,
      width: 6,
      height: 6,
    }));
    const index = new ObstacleIndex(boxes);
    const coordinates = [-1, 0, EPSILON / 2, EPSILON, EPSILON * 2, 3, 6 - EPSILON, 6, 7, 30, 60];
    for (const x of coordinates)
      for (const y of coordinates)
        for (const b of [
          { x, y },
          { x: 60, y },
          { x, y: 40 },
          { x: x + EPSILON / 2, y: 40 },
        ]) {
          const a = { x, y };
          const predicate = (box: (typeof boxes)[number]) => crossesBox(a, b, box);
          assert.equal(index.segmentSome(a, b, predicate), index.segment(a, b).some(predicate));
          assert.equal(index.some(segmentBounds(a, b), predicate), index.query(segmentBounds(a, b)).some(predicate));
        }
  }),
]);
