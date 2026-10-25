import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { CompoundLayoutData, LayoutMetrics, LayoutProblem } from "../layout-plan";
import { measureLayout, validateLayoutGeometry } from "../layout-quality";
import { directionWarnings } from "../constraints";
import { applyLayoutResult, createLayoutResult } from "../../../schema/layoutResult";
import { compoundAiContext, requestCompoundLayoutDecision } from "./request";

export interface CompoundAiEvaluation {
  candidateId: string;
  hypothesis: string;
  status: "evaluated" | "failed" | "reused";
  metrics?: LayoutMetrics;
  error?: string;
  positionedNodes?: number;
}
export interface CompoundAiReport {
  candidateId: string;
  summary: string;
  evaluations: number;
  decisions: number;
  before: LayoutMetrics;
  after: LayoutMetrics;
  changed: boolean;
  trials: CompoundAiEvaluation[];
  precise: boolean;
}

/** Observations only: the model, not a threshold or ranker, decides what to do next. */
export function compoundExecutionFeedback(before: LayoutProblem, stage: StageData) {
  const problem = stage.compoundLayout!;
  const observation = compoundAiContext(problem).context;
  const metrics = measureLayout(before, problem.baseline);
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
  onStatus?(message: string): void;
  onProgress?: AiProgressListener;
  onEvaluation?(evaluation: CompoundAiEvaluation): void;
}) {
  const { problem, signal } = options;
  const checkCancelled = () => {
    if (signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
  };
  const candidates = new Map<string, { data: CompoundLayoutData; stage: StageData; precise?: boolean }>();
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
  const trials: CompoundAiEvaluation[] = [];
  const recordTrial = (trial: CompoundAiEvaluation) => {
    trials.push(trial);
    options.onEvaluation?.(trial);
  };
  let evaluations = 0,
    observed = problem;
  let observedStage = options.currentStage;
  for (let decisionIndex = 0; ; decisionIndex++) {
    checkCancelled();
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
        canEvaluate: true,
        candidateIds: new Set(candidates.keys()),
        currentLayout: createLayoutResult(observedStage, "compound"),
        requireEvaluation: !evaluations,
        onProgress: options.onProgress,
      },
    );
    checkCancelled();
    if (decision.action === "finish") {
      const chosen = candidates.get(decision.candidateId)!;
      const before = measureLayout(problem, problem.baseline),
        after = measureLayout(problem, chosen.stage.compoundLayout!.baseline);
      const report: CompoundAiReport = {
        candidateId: decision.candidateId,
        summary: decision.summary,
        evaluations,
        decisions: decisionIndex + 1,
        before,
        after,
        changed: after.movedNodes > 0 || after.changedEdges > 0,
        trials,
        precise: !!chosen.precise,
      };
      return {
        report,
        data: chosen.data,
        stage: { ...chosen.stage, layoutQuality: { ...chosen.stage.layoutQuality!, aiAssessment: decision.summary } },
      };
    }
    const data: CompoundLayoutData = { ...problem.stored, method: "ai", constraints: [] };
    const signature = JSON.stringify(decision.layout);
    const reused = signatures.get(signature);
    if (reused) {
      observations.push({ kind: "reused-evaluation", candidateId: reused, hypothesis: decision.hypothesis });
      observedStage = candidates.get(reused)!.stage;
      observed = observedStage.compoundLayout!;
      recordTrial({
        candidateId: reused,
        hypothesis: decision.hypothesis,
        status: "reused",
        metrics: measureLayout(problem, observed.baseline),
        positionedNodes: decision.layout.geometry.nodes.length,
      });
      continue;
    }
    const candidateId = `trial-${++evaluations}`;
    options.onStatus?.(`Evaluating layout ${evaluations}…`);
    try {
      const stage = applyLayoutResult(decision.layout, options.currentStage);
      stage.compoundLayout = { ...stage.compoundLayout!, stored: data };
      checkCancelled();
      const validation = validateLayoutGeometry(stage.compoundLayout!, stage.compoundLayout!.baseline);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      const feedback = compoundExecutionFeedback(problem, stage);
      candidates.set(candidateId, { data, stage, precise: true });
      signatures.set(signature, candidateId);
      observed = stage.compoundLayout!;
      observedStage = stage;
      observations.push({
        candidateId,
        kind: "evaluated",
        hypothesis: decision.hypothesis,
        declaration: data,
        layout: decision.layout,
        result: feedback,
      });
      recordTrial({
        candidateId,
        hypothesis: decision.hypothesis,
        status: "evaluated",
        metrics: feedback.after,
        positionedNodes: decision.layout.geometry.nodes.length,
      });
    } catch (error) {
      checkCancelled();
      const message = error instanceof Error ? error.message : "Layout solve failed.";
      observations.push({
        candidateId,
        kind: "failed",
        selectable: false,
        hypothesis: decision.hypothesis,
        declaration: data,
        layout: decision.layout,
        error: message,
      });
      recordTrial({
        candidateId,
        hypothesis: decision.hypothesis,
        status: "failed",
        error: message,
        positionedNodes: decision.layout.geometry.nodes.length,
      });
    }
  }
}
