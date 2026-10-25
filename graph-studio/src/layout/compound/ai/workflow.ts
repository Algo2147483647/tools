import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { CompoundLayoutData, LayoutMetrics, LayoutProblem } from "../layout-plan";
import { measureLayout, validateLayoutGeometry } from "../layout-quality";
import { directionWarnings } from "../constraints";
import { applyCompoundAiPlan } from "./protocol";
import { compoundAiContext, requestCompoundLayoutDecision } from "./request";

export const COMPOUND_AI_BUDGET = { evaluations: 4, decisions: 6, timeoutMs: 240000 } as const;

/** Observations only: the model, not a threshold or ranker, decides what to do next. */
export function compoundExecutionFeedback(before: LayoutProblem, stage: StageData) {
  const problem = stage.compoundLayout!;
  const observation = compoundAiContext(problem).context;
  const metrics = measureLayout(problem, problem.baseline);
  const previous = measureLayout(before, before.baseline);
  const delta = Object.fromEntries(
    (Object.keys(metrics) as (keyof LayoutMetrics)[]).map((key) => [key, metrics[key] - previous[key]]),
  );
  const content = Object.values(problem.baseline.boxes);
  const points = Object.values(problem.baseline.routes).flatMap((route) => route.points);
  return {
    before: previous,
    after: metrics,
    delta,
    diagnostics: [...new Set([...stage.warnings, ...directionWarnings(problem, problem.baseline, problem.stored)])],
    canvas: {
      width: problem.baseline.width,
      height: problem.baseline.height,
      contentRight: Math.max(0, ...content.map((b) => b.x + b.width)),
      contentBottom: Math.max(0, ...content.map((b) => b.y + b.height)),
      routeRight: Math.max(0, ...points.map((p) => p.x)),
      routeBottom: Math.max(0, ...points.map((p) => p.y)),
    },
    crossings: observation.crossings,
    sharedRuns: observation.sharedRuns,
    detours: observation.detours,
    crowdedPorts: observation.crowdedPorts,
    groupConnections: observation.groupConnections,
    containerPassages: observation.containerPassages,
    diagnosticsTruncated: observation.diagnosticsTruncated,
  };
}

/** Ephemeral evaluation session. Only an explicit finish action installs a result. */
export async function runCompoundAiLayout(options: {
  settings: AiSettings;
  problem: LayoutProblem;
  currentStage: StageData;
  message: string;
  signal: AbortSignal;
  compute(data: CompoundLayoutData): Promise<StageData>;
  onStatus?(message: string): void;
  onProgress?: AiProgressListener;
}) {
  const { problem, signal } = options;
  const replacement = compoundAiContext(problem);
  const checkCancelled = () => {
    if (signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
  };
  const candidates = new Map<string, { data: CompoundLayoutData; stage: StageData }>();
  if (validateLayoutGeometry(problem, problem.baseline).valid)
    candidates.set("current", { data: problem.stored, stage: options.currentStage });
  const observations: unknown[] = [
    {
      candidateId: "current",
      kind: "starting-layout",
      selectable: candidates.has("current"),
      declaration: problem.stored,
      result: compoundExecutionFeedback(problem, options.currentStage),
    },
  ];
  const signatures = new Map<string, string>();
  let evaluations = 0,
    observed = problem;
  for (let decisionIndex = 0; decisionIndex < COMPOUND_AI_BUDGET.decisions; decisionIndex++) {
    checkCancelled();
    const canEvaluate =
      evaluations < COMPOUND_AI_BUDGET.evaluations && decisionIndex < COMPOUND_AI_BUDGET.decisions - 1;
    options.onStatus?.(decisionIndex ? "AI is examining layout results…" : "AI is planning the layout…");
    const decision = await requestCompoundLayoutDecision(
      options.settings,
      observed,
      options.message,
      signal,
      () => options.onStatus?.("Correcting the layout response…"),
      {
        selectedDirection: problem.stored.direction,
        observations,
        canEvaluate,
        candidateIds: new Set(candidates.keys()),
        evaluationsRemaining: COMPOUND_AI_BUDGET.evaluations - evaluations,
        decisionsRemaining: COMPOUND_AI_BUDGET.decisions - decisionIndex,
        onProgress: options.onProgress,
      },
    );
    checkCancelled();
    if (decision.action === "finish") {
      const chosen = candidates.get(decision.candidateId)!;
      return {
        data: chosen.data,
        stage: { ...chosen.stage, layoutQuality: { ...chosen.stage.layoutQuality!, aiAssessment: decision.summary } },
      };
    }
    const data = applyCompoundAiPlan(problem.stored, decision.plan, problem.projection.focusGroupId, replacement);
    const signature = JSON.stringify(data);
    const reused = signatures.get(signature);
    if (reused) {
      observations.push({ kind: "reused-evaluation", candidateId: reused, hypothesis: decision.hypothesis });
      observed = candidates.get(reused)!.stage.compoundLayout!;
      continue;
    }
    const candidateId = `trial-${++evaluations}`;
    options.onStatus?.(`Evaluating layout ${evaluations} of ${COMPOUND_AI_BUDGET.evaluations}…`);
    try {
      const stage = await options.compute(data);
      checkCancelled();
      const validation = validateLayoutGeometry(stage.compoundLayout!, stage.compoundLayout!.baseline);
      if (!validation.valid) throw new Error(validation.errors.slice(0, 4).join(" "));
      candidates.set(candidateId, { data, stage });
      signatures.set(signature, candidateId);
      observed = stage.compoundLayout!;
      observations.push({
        candidateId,
        kind: "evaluated",
        hypothesis: decision.hypothesis,
        declaration: data,
        result: compoundExecutionFeedback(problem, stage),
      });
    } catch (error) {
      checkCancelled();
      observations.push({
        candidateId,
        kind: "failed",
        selectable: false,
        hypothesis: decision.hypothesis,
        declaration: data,
        error: error instanceof Error ? error.message.slice(0, 1500) : "Layout solve failed.",
      });
    }
  }
  throw new LayoutRequestError("completion", "AI did not select a layout within the planning budget.");
}
