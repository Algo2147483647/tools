import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { CompoundLayoutData, LayoutMetrics, LayoutProblem } from "../layout-plan";
import { measureLayout } from "../layout-quality";
import { createLayoutResult, type LayoutResultDocument } from "../../../schema/layoutResult";
import { applyLayoutResult } from "../../shared/applyLayoutResult";
import { compoundAiContext, requestCompoundLayoutDecision } from "./request";
import { executeCompoundDecision, type CompoundExecutionInput, type CompoundExecutionResult } from "./execute";
import { inspectDraft } from "./geometry";
import type { CompoundAiDecision, DesignReview } from "./decision";
import type { CompoundDesign } from "./design";
import { CompoundBudgetError, DEFAULT_COMPOUND_AI_BUDGET, requestUsage, type CompoundAiBudget, type CompoundRequestUsage, type CompoundStopReason } from "./budget";

export interface CompoundAiEvaluation {
  candidateId: string;
  revision: number;
  hypothesis: string;
  status: "evaluated" | "failed";
  metrics?: LayoutMetrics;
  error?: string;
  reroutedEdgeIds?: string[];
  design?: CompoundDesign;
}
export interface CompoundAiReport {
  candidateId: string;
  summary: string;
  evaluations: number;
  decisions: number;
  requests: number;
  requestLimit: number;
  elapsedMs: number;
  stopReason: CompoundStopReason;
  usage: CompoundRequestUsage[];
  before: LayoutMetrics;
  after: LayoutMetrics;
  changed: boolean;
  trials: CompoundAiEvaluation[];
  reviews: { review: DesignReview; mode: string }[];
  observationMode: "structure-only";
  design?: CompoundDesign;
}
export function compoundExecutionFeedback(before: LayoutProblem, stage: StageData) {
  const problem = stage.compoundLayout!, observation = compoundAiContext(problem).context;
  const metrics = measureLayout(before, problem.baseline), previous = measureLayout(before, before.baseline);
  const points = Object.values(problem.baseline.routes).flatMap((r) => r.points);
  return {
    original: previous, candidate: metrics,
    delta: Object.fromEntries((Object.keys(metrics) as (keyof LayoutMetrics)[]).map((key) => [key, metrics[key] - previous[key]])),
    diagnostics: stage.warnings,
    canvas: { width: problem.baseline.width, height: problem.baseline.height, routeRight: Math.max(0, ...points.map((p) => p.x)), routeBottom: Math.max(0, ...points.map((p) => p.y)) },
    crossings: observation.crossings, sharedRuns: observation.sharedRuns, detours: observation.detours,
  };
}
interface Draft {
  candidateId: string;
  revision: number;
  layout: LayoutResultDocument;
  data: CompoundLayoutData;
  stage?: StageData;
  design?: CompoundDesign;
}

/** Design -> execute -> structural review -> edit. Numeric quality never selects a design. */
export async function runCompoundAiLayout(options: {
  settings: AiSettings;
  problem: LayoutProblem;
  currentStage: StageData;
  message: string;
  signal: AbortSignal;
  budget?: Partial<CompoundAiBudget>;
  execute?(input: CompoundExecutionInput, signal: AbortSignal): Promise<CompoundExecutionResult>;
  onStatus?(message: string): void;
  onProgress?: AiProgressListener;
  onEvaluation?(evaluation: CompoundAiEvaluation): void;
}) {
  const { problem } = options, budget = { ...DEFAULT_COMPOUND_AI_BUDGET, ...options.budget };
  if (Object.values(budget).some((v) => !Number.isSafeInteger(v) || v <= 0)) throw new Error("AI layout budgets must be positive integers.");
  const started = Date.now(), deadline = started + budget.timeoutMs, abort = new AbortController();
  const cancel = () => abort.abort();
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(cancel, budget.timeoutMs);
  let stalled = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { stalled = true; cancel(); }, budget.idleTimeoutMs);
  };
  const check = () => {
    if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
    if (stalled) throw new CompoundBudgetError("idle-timeout");
    if (abort.signal.aborted || Date.now() >= deadline) throw new CompoundBudgetError("deadline");
  };
  const trials: CompoundAiEvaluation[] = [], usage: CompoundRequestUsage[] = [], reviews: CompoundAiReport["reviews"] = [];
  let requests = 0, decisions = 0;
  let working: Draft = { candidateId: "current", revision: 0, layout: createLayoutResult(options.currentStage, "compound"), data: problem.stored };
  let lastReviewed: Draft | undefined;
  let feedback: unknown;
  const finish = (reason: CompoundStopReason, detail: string, selected?: Draft) => {
    if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
    // On interruption only a reviewed legal draft is eligible. There is no score-based or baseline quality gate.
    const chosen = selected ?? lastReviewed;
    if (!chosen?.stage) throw new LayoutRequestError("solve", `${reason === "deadline" ? "Design time limit reached before a legal design was reviewed." : reason === "idle-timeout" ? "The model stopped producing output before a legal design was reviewed." : detail} ${trials.length} drafts evaluated; no reviewed legal design is available. Current layout kept.`);
    const before = measureLayout(problem, problem.baseline), after = measureLayout(problem, chosen.stage.compoundLayout!.baseline);
    const report: CompoundAiReport = {
      candidateId: chosen.candidateId, summary: detail, evaluations: trials.length, decisions, requests,
      requestLimit: budget.maxRequests, elapsedMs: Date.now() - started, stopReason: reason, usage, before, after,
      changed: after.movedNodes > 0 || after.changedEdges > 0, trials, reviews, design: chosen.design,
      observationMode: "structure-only",
    };
    return { report, data: chosen.data, stage: { ...chosen.stage, layoutQuality: { ...chosen.stage.layoutQuality!, aiAssessment: detail } } };
  };
  try {
    check();
    // Original is context, not an automatic competing design.
    try { working.stage = applyLayoutResult(working.layout, options.currentStage); } catch { /* Can still design from invalid starting geometry. */ }
    for (;;) {
      check();
      if (requests >= budget.maxRequests) return finish("request-budget", "Request budget reached; retained the last reviewed legal design. Review may still identify unresolved design issues.");
      const mode = !trials.length ? "design" : !working.stage ? "invalid-draft" : "structure-only";
      let decision: CompoundAiDecision;
      try {
        decision = await requestCompoundLayoutDecision(options.settings, problem, options.message, abort.signal,
          () => options.onStatus?.("Correcting the design response…"), {
            observations: trials, currentLayout: working.layout, candidateId: working.candidateId, revision: working.revision,
            valid: !!working.stage, designed: trials.length > 0, design: working.design, observationMode: mode,
            feedback: { ...((feedback ?? {}) as object), previousReview: reviews.at(-1) },
            budget: { remainingRequests: budget.maxRequests - requests, remainingMs: Math.max(0, deadline - Date.now()) },
            onProgress: (progress) => { refreshIdle(); options.onProgress?.(progress); },
            beforeRequest: () => { check(); if (requests >= budget.maxRequests) throw new CompoundBudgetError("request-budget"); refreshIdle(); requests++; usage.push({}); options.onStatus?.(`${trials.length ? "Reviewing the design" : "Designing the composition"} · request ${requests}/${budget.maxRequests}…`); },
            onReply: (reply) => { clearTimeout(idleTimer); usage[requests - 1] = requestUsage(reply); },
          });
        check();
      } catch (error) {
        check();
        return finish(error instanceof CompoundBudgetError ? error.reason : "request-error", error instanceof Error ? error.message : "Design request failed.");
      }
      decisions++;
      if (decision.review) {
        reviews.push({ review: decision.review, mode });
        if (working.stage) lastReviewed = working;
      }
      if (decision.action === "finish") return finish("selected", decision.summary, working);
      // Do not execute an edit if no request remains to inspect its actual result.
      if (requests >= budget.maxRequests) return finish("request-budget", "Reserved final selection for the last reviewed design; the suggested edit could not be inspected within this budget.");
      const candidateId = `trial-${trials.length + 1}`, base = working;
      options.onStatus?.("Building the design and routing its connections…");
      const input: CompoundExecutionInput = {
        problem: { ...problem, baseline: base.stage?.compoundLayout!.baseline ?? problem.baseline, stored: base.data },
        baseLayout: base.layout, decision,
      };
      let execution: CompoundExecutionResult;
      try { execution = await (options.execute ? options.execute(input, abort.signal) : executeCompoundDecision(input)); }
      catch (error) { check(); execution = { layout: base.layout, data: base.data, reroutedEdgeIds: [], issues: [], error: error instanceof Error ? error.message : "Design execution failed." }; }
      check();
      working = { candidateId, revision: base.revision + 1, layout: execution.layout, data: execution.data, design: decision.action === "design" ? decision.design : base.design };
      const trial: CompoundAiEvaluation = { candidateId, revision: working.revision, hypothesis: decision.hypothesis, status: "evaluated", reroutedEdgeIds: execution.reroutedEdgeIds, design: working.design };
      try {
        if (execution.error) throw new Error(execution.error);
        const stage = applyLayoutResult(working.layout, { ...options.currentStage, compoundLayout: { ...problem, stored: working.data } });
        working.stage = stage;
        trial.metrics = measureLayout(problem, stage.compoundLayout!.baseline);
        feedback = compoundExecutionFeedback(problem, stage);
      } catch (error) {
        trial.status = "failed"; trial.error = error instanceof Error ? error.message : "Invalid geometry.";
        const issues = execution.issues.length ? execution.issues : inspectDraft(working.layout, problem);
        feedback = { error: trial.error, issues: issues.slice(0, 20), issueCount: issues.length };
      }
      trials.push(trial); options.onEvaluation?.(trial);
    }
  } catch (error) {
    if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
    if (error instanceof CompoundBudgetError || abort.signal.aborted) return finish(stalled ? "idle-timeout" : "deadline", `${stalled ? "Model output stalled" : "Design time limit reached"}; retained the last reviewed legal design.`);
    throw error;
  } finally { clearTimeout(timer); clearTimeout(idleTimer); options.signal.removeEventListener("abort", cancel); }
}
