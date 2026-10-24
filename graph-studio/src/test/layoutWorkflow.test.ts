import assert from "node:assert/strict";
import {
  constrainLayoutProposal,
  formatLayoutFeedback,
  runLayoutWorkflow,
  type LayoutFeedback,
} from "../ai/layout/compoundWorkflow";
import { routingHotspots } from "../ai/layout/compoundDiagnostics";
import { defaultLayoutIntent, type LayoutMetrics } from "../layout/compound/layout-plan";
import type { AiResponse } from "../ai/types";
import { normalizeDagInput } from "../graph/normalize";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const intent = { ...defaultLayoutIntent(), operation: "route-only" as const };
const proposal: AiResponse = { kind: "propose_layout", layoutProtocolVersion: 1, answer: "Try routes only.", intent };
const metrics: LayoutMetrics = {
  crossings: 4,
  sharedLength: 20,
  labelCollisions: 0,
  bends: 5,
  length: 400,
  area: 5000,
  movedNodes: 0,
  movement: 0,
  changedEdges: 2,
};
const feedback: LayoutFeedback = {
  intent,
  baseline: metrics,
  candidate: {
    id: "candidate",
    metrics: { ...metrics, crossings: 2 },
    warnings: [],
    movedNodeIds: [],
    changedEdgeIds: ["ab", "ac"],
  },
  diagnostics: [],
  retainedEarlierCandidate: false,
};
const base = () => ({ response: proposal, inspect: () => ({}), isCurrent: () => true, onProgress: () => {} });

export const layoutWorkflowSuite = defineSuite("AI layout feedback", [
  defineTest("feedback is sent once and refinement has a fixed two-evaluation budget", async () => {
    let asks = 0;
    const retained: boolean[] = [];
    await runLayoutWorkflow({
      ...base(),
      evaluate: async (_, retain) => {
        retained.push(retain);
        return feedback;
      },
      ask: async (report) => {
        asks++;
        assert.ok(JSON.stringify(report).includes('"crossings":2'));
        return proposal;
      },
    });
    assert.equal(asks, 1);
    assert.deepEqual(retained, [false, true]);
  }),
  defineTest("panel permissions and refinements reject scope expansion, movement and pin release", () => {
    assert.throws(
      () => constrainLayoutProposal({ ...intent, operation: "layout-and-route" }, intent, true),
      /nodes fixed/,
    );
    assert.throws(
      () => constrainLayoutProposal({ ...intent, scope: { groupId: "other", includeDescendants: true } }, intent),
      /scope/,
    );
    assert.throws(
      () => constrainLayoutProposal({ ...intent, boundaryPolicy: "allow-ancestor-resize" }, intent),
      /surrounding/,
    );
    assert.throws(
      () => constrainLayoutProposal({ ...intent, constraints: [{ type: "unpin", nodeId: "a" }] }, intent, true),
      /release/,
    );
    const locked = {
      ...intent,
      constraints: [{ type: "pin" as const, nodeId: "a", space: "canvas" as const, strength: "hard" as const }],
    };
    assert.throws(() => constrainLayoutProposal(intent, locked), /removed/);
  }),
  defineTest("inspection feeds a scoped result back before proposing geometry", async () => {
    let evaluations = 0;
    const outcome = await runLayoutWorkflow({
      ...base(),
      response: { kind: "inspect_layout", answer: "Inspect first.", scopeId: "g" },
      inspect: (id) => ({ scopeId: id }),
      evaluate: async () => {
        evaluations++;
        return feedback;
      },
      ask: async (report) => {
        assert.ok(JSON.stringify(report).includes('"scopeId":"g"'));
        return proposal;
      },
    });
    assert.equal(evaluations, 1);
    assert.equal(outcome.feedback, feedback);
  }),
  defineTest("a failed feedback request preserves locally computed results", async () => {
    const outcome = await runLayoutWorkflow({
      ...base(),
      evaluate: async () => feedback,
      ask: async () => {
        throw new Error("Network unavailable");
      },
    });
    assert.equal(outcome.feedback, feedback);
    assert.match(outcome.explanation, /Network unavailable/);
  }),
  defineTest("cancellation prevents additional model requests and graph commands are rejected", async () => {
    let current = true,
      asks = 0;
    await assert.rejects(
      () =>
        runLayoutWorkflow({
          ...base(),
          isCurrent: () => current,
          evaluate: async () => {
            current = false;
            return feedback;
          },
          ask: async () => {
            asks++;
            return proposal;
          },
        }),
      /cancelled/,
    );
    assert.equal(asks, 0);
    await assert.rejects(
      () =>
        runLayoutWorkflow({
          ...base(),
          response: { kind: "inspect", answer: "Inspect", commands: ["/rm a"] },
          evaluate: async () => feedback,
          ask: async () => proposal,
        }),
      /appearance-set proposals/,
    );
  }),
  defineTest("the result summary does not claim improvement for equal or worse metrics", () => {
    assert.match(formatLayoutFeedback(feedback), /4 → 2/);
    assert.match(
      formatLayoutFeedback({ ...feedback, candidate: { ...feedback.candidate!, metrics } }),
      /did not improve/,
    );
    assert.match(formatLayoutFeedback({ ...feedback, candidate: null }), /unchanged/);
  }),
  defineTest("routing diagnostics identify original edges, crowded ports and unrelated containers", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {}, c: {}, d: {}, g: {}, x: {} },
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ac", source: "a", target: "c" },
        { id: "ad", source: "a", target: "d" },
      ],
      hierarchy_edges: [{ id: "gx", source: "g", target: "x" }],
    });
    const problem = (await layoutFixture(dag)).compoundLayout!;
    problem.baseline.boxes.g = { x: 40, y: 40, width: 100, height: 100 };
    const paths = [
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ],
      [
        { x: 0, y: 100 },
        { x: 180, y: 100 },
      ],
    ];
    problem.projection.edges.forEach((edge, i) => {
      problem.baseline.routes[edge.id] = { ...problem.baseline.routes[edge.id], points: paths[i] };
    });
    const issues = routingHotspots(problem);
    assert.ok(issues.crossings.some((issue) => issue.edgeIds.includes("ab") && issue.edgeIds.includes("ac")));
    assert.ok(issues.sharedRuns.some((issue) => issue.edgeIds.includes("ad")));
    assert.ok(issues.crowdedPorts.some((issue) => issue.nodeId === "a"));
    assert.ok(issues.containerPassages.some((issue) => issue.groupId === "g"));
  }),
]);
