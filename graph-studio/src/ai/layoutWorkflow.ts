import type { LayoutIntent, LayoutMetrics } from "../layout/compound/layout-plan";
import { compareLayoutMetrics } from "../layout/compound/layout-quality";
import type { AiResponse } from "./types";

export interface LayoutFeedback {
  intent: LayoutIntent;
  baseline: LayoutMetrics;
  candidate: {
    id: string;
    metrics: LayoutMetrics;
    warnings: string[];
    movedNodeIds: string[];
    changedEdgeIds: string[];
  } | null;
  diagnostics: string[];
  retainedEarlierCandidate: boolean;
}

export function constrainLayoutProposal(intent: LayoutIntent, boundary: LayoutIntent, panel = false) {
  if (
    intent.scope.groupId !== boundary.scope.groupId ||
    intent.scope.includeDescendants !== boundary.scope.includeDescendants
  )
    throw new Error("The proposal changes scope. Select that scope before requesting another layout.");
  if (boundary.operation === "route-only" && intent.operation !== "route-only")
    throw new Error("This request keeps nodes fixed. Choose Layout & routes to allow node movement.");
  if (boundary.boundaryPolicy === "strict" && intent.boundaryPolicy !== "strict")
    throw new Error("The proposal moves surrounding groups. Enable that option before requesting it.");
  if (intent.objective !== boundary.objective)
    throw new Error("A refinement must preserve the selected layout objective.");
  const protectedConstraints = boundary.constraints.filter(
    (c) => panel || c.type === "pin" || c.type === "unpin" || c.type === "direction",
  );
  if (
    protectedConstraints.some(
      (constraint) => !intent.constraints.some((c) => JSON.stringify(c) === JSON.stringify(constraint)),
    )
  )
    throw new Error(
      "The proposal removed a requested constraint. Existing locks and selected preferences must be preserved.",
    );
  for (const constraint of intent.constraints.filter((c) => c.type === "unpin")) {
    if (panel || !boundary.constraints.some((c) => c.type === "unpin" && c.nodeId === constraint.nodeId))
      throw new Error("A refinement cannot release additional position locks.");
  }
}

export function formatLayoutFeedback(feedback: LayoutFeedback): string {
  const { baseline, candidate, intent } = feedback;
  if (!candidate) return `No legal candidate found. The graph is unchanged. ${feedback.diagnostics.join(" ")}`;
  const improved = compareLayoutMetrics(candidate.metrics, baseline, intent.objective) < 0;
  const metric = (key: keyof LayoutMetrics) => `${Math.round(baseline[key])} → ${Math.round(candidate.metrics[key])}`;
  return [
    improved
      ? "Measured improvement; ready to compare."
      : "A legal candidate is available; the selected quality score did not improve.",
    `Crossings: ${metric("crossings")}. Shared route length: ${metric("sharedLength")} px. Bends: ${metric("bends")}.`,
    `${candidate.metrics.movedNodes} rectangles changed; ${candidate.changedEdgeIds.length} connections affected.`,
    feedback.retainedEarlierCandidate
      ? "The earlier candidate was retained because the refinement was not better."
      : "",
    ...candidate.warnings,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One proposal plus one measured feedback turn. Geometry is never automatically committed here. */
export async function runLayoutWorkflow(options: {
  response: AiResponse;
  panelIntent?: LayoutIntent;
  inspect(scopeId?: string | null): unknown;
  evaluate(intent: LayoutIntent, retainBest: boolean): Promise<LayoutFeedback>;
  ask(feedback: unknown): Promise<AiResponse>;
  isCurrent(): boolean;
  onProgress(message: string): void;
}) {
  let response = options.response;
  let initialIntent: LayoutIntent | undefined;
  let feedback: LayoutFeedback | undefined;
  let explanation = response.answer;
  let feedbackRequestFailed = false;
  for (let turn = 0; turn < 2; turn++) {
    if (!options.isCurrent()) throw new Error("Layout request cancelled or its graph context changed.");
    if (response.kind === "propose_layout") {
      if (options.panelIntent) constrainLayoutProposal(response.intent, options.panelIntent, true);
      if (initialIntent) constrainLayoutProposal(response.intent, initialIntent);
      initialIntent ??= response.intent;
      options.onProgress(turn ? "Checking a refinement…" : "Checking the proposed layout…");
      feedback = await options.evaluate(response.intent, turn > 0);
    } else if (response.kind !== "inspect_layout" && response.kind !== "answer" && response.kind !== "clarify") {
      throw new Error("Arrange accepts layout proposals and inspection only. Use the console for graph edits.");
    }
    if (!options.isCurrent()) throw new Error("Layout request cancelled or its graph context changed.");
    explanation = response.answer;
    if (turn === 1 || response.kind === "answer" || response.kind === "clarify") break;
    options.onProgress("Reviewing measured results…");
    try {
      response = await options.ask({
        inspection: response.kind === "inspect_layout" ? options.inspect(response.scopeId) : undefined,
        evaluation: feedback,
        instruction:
          "Assess measured results. Return answer to finish, or one revised propose_layout. Keep the same scope, objective, locks and movement permissions. If more space or unsupported routing features are needed, explain the limitation; do not expand scope. Never claim an unmeasured improvement.",
      });
    } catch (error) {
      if (!feedback || !options.isCurrent()) throw error;
      explanation = `The feedback request failed. Local results remain available. ${error instanceof Error ? error.message : ""}`;
      feedbackRequestFailed = true;
      break;
    }
  }
  return {
    feedback,
    explanation,
    allowAutoApply: !feedbackRequestFailed && (response.kind === "answer" || response.kind === "propose_layout"),
  };
}
