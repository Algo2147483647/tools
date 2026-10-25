import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import { layoutFingerprint, type CompoundLayoutData, type LayoutMetrics, type LayoutProblem } from "../layout-plan";
import { compareLayoutMetrics, measureLayout } from "../layout-quality";
import { directionWarnings } from "../constraints";
import { portWarnings, routingPreferences } from "../layout-solver";
import { createLayoutResult, type LayoutResultDocument } from "../../../schema/layoutResult";
import { applyLayoutResult } from "../../shared/applyLayoutResult";
import { compoundAiContext, requestCompoundLayoutDecision } from "./request";
import { executeCompoundDecision, type CompoundExecutionInput, type CompoundExecutionResult } from "./execute";
import { inspectDraft } from "./geometry";
import type { CompoundAiDecision } from "./decision";
import {
  CompoundBudgetError,
  DEFAULT_COMPOUND_AI_BUDGET,
  requestUsage,
  type CompoundAiBudget,
  type CompoundRequestUsage,
  type CompoundStopReason,
} from "./budget";

export interface CompoundAiEvaluation {
  candidateId: string;
  revision: number;
  hypothesis: string;
  status: "evaluated" | "failed" | "reused";
  metrics?: LayoutMetrics;
  error?: string;
  positionedNodes?: number;
  reroutedEdgeIds?: string[];
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
  precise: boolean;
}

export function compoundExecutionFeedback(before: LayoutProblem, stage: StageData) {
  const problem = stage.compoundLayout!;
  const observation = compoundAiContext(problem).context;
  const metrics = measureLayout(before, problem.baseline),
    previous = measureLayout(before, before.baseline);
  const content = Object.values(problem.baseline.boxes),
    points = Object.values(problem.baseline.routes).flatMap((r) => r.points);
  return {
    before: previous,
    after: metrics,
    delta: Object.fromEntries(
      (Object.keys(metrics) as (keyof LayoutMetrics)[]).map((key) => [key, metrics[key] - previous[key]]),
    ),
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
    diagnosticTotals: observation.diagnosticTotals,
  };
}
interface Draft {
  candidateId: string;
  revision: number;
  layout: LayoutResultDocument;
  data: CompoundLayoutData;
  stage?: StageData;
  precise: boolean;
  trial?: CompoundAiEvaluation;
}

/** Bounded Compound-only session. Drafts are immutable; only legal candidates can be installed. */
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
  const { problem } = options;
  const budget = { ...DEFAULT_COMPOUND_AI_BUDGET, ...options.budget };
  if (Object.values(budget).some((v) => !Number.isSafeInteger(v) || v <= 0))
    throw new Error("AI layout budgets must be positive integers.");
  const started = Date.now(),
    deadline = started + budget.timeoutMs;
  const abort = new AbortController();
  const cancel = () => abort.abort();
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) abort.abort();
  const timer = setTimeout(cancel, budget.timeoutMs);
  const check = () => {
    if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
    if (abort.signal.aborted || Date.now() >= deadline) throw new CompoundBudgetError("deadline");
  };
  const candidates = new Map<string, Draft>(),
    drafts = new Map<string, Draft>(),
    signatures = new Map<string, string>();
  const trials: CompoundAiEvaluation[] = [],
    usage: CompoundRequestUsage[] = [];
  let requests = 0,
    decisions = 0,
    evaluations = 0,
    stagnant = 0;
  let selectionData = problem.stored;
  let observedStage = options.currentStage;
  let working: Draft = {
    candidateId: "current",
    revision: 0,
    layout: createLayoutResult(options.currentStage, "compound"),
    data: problem.stored,
    precise: false,
  };
  drafts.set("current", working);
  let observedDraft = working;
  const directionErrors = (stage: StageData) =>
    problem.stored.direction === "AUTO"
      ? []
      : directionWarnings(problem, stage.compoundLayout!.baseline, {
          ...problem.stored,
          constraints: [
            {
              type: "direction",
              scopeId: problem.projection.focusGroupId,
              value: problem.stored.direction,
              strength: "soft",
            },
            ...problem.projection.items
              .filter((i) => i.kind === "group" && !i.collapsed)
              .map((i) => ({
                type: "direction" as const,
                scopeId: i.id,
                value: problem.stored.direction,
                strength: "soft" as const,
              })),
          ],
        });
  const preferences = (draft: Draft) => {
    const geometry = draft.stage!.compoundLayout!.baseline;
    const routing = routingPreferences(problem, selectionData);
    return (
      directionWarnings(problem, geometry, selectionData).length +
      portWarnings(problem, geometry, routing.portSides).length
    );
  };
  const compare = (a: Draft, b: Draft) =>
    preferences(a) - preferences(b) ||
    compareLayoutMetrics(
      measureLayout(problem, a.stage!.compoundLayout!.baseline),
      measureLayout(problem, b.stage!.compoundLayout!.baseline),
      problem.stored.objective,
    );
  const best = () => [...candidates.values()].sort(compare)[0];
  let feedback: unknown;
  const record = (trial: CompoundAiEvaluation) => {
    trials.push(trial);
    options.onEvaluation?.(trial);
  };
  const finish = (reason: CompoundStopReason, detail: string, selected?: Draft) => {
    if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
    const chosen = selected ?? best();
    if (!chosen)
      throw new LayoutRequestError("solve", `${detail} No legal candidate was available. Current layout kept.`);
    const before = measureLayout(problem, problem.baseline),
      after = measureLayout(problem, chosen.stage!.compoundLayout!.baseline);
    const summary = `${detail} ${chosen.candidateId === "current" ? "Kept current layout." : `Selected ${chosen.candidateId}.`}`;
    const report: CompoundAiReport = {
      candidateId: chosen.candidateId,
      summary,
      evaluations,
      decisions,
      requests,
      requestLimit: budget.maxRequests,
      elapsedMs: Date.now() - started,
      stopReason: reason,
      usage,
      before,
      after,
      changed: after.movedNodes > 0 || after.changedEdges > 0,
      trials,
      precise: chosen.precise,
    };
    return {
      report,
      data: chosen.data,
      stage: { ...chosen.stage!, layoutQuality: { ...chosen.stage!.layoutQuality!, aiAssessment: summary } },
    };
  };
  try {
    check();
    try {
      const stage = applyLayoutResult(working.layout, options.currentStage);
      if (!directionErrors(stage).length) {
        working.stage = stage;
        candidates.set("current", working);
      }
    } catch {
      /* An invalid starting layout can be revised but never selected. */
    }
    feedback = working.stage
      ? compoundExecutionFeedback(problem, working.stage)
      : { issues: inspectDraft(working.layout, problem) };
    for (;;) {
      check();
      if (requests >= budget.maxRequests) return finish("request-budget", "Request budget reached.");
      if (stagnant >= budget.maxStagnant)
        return finish("no-improvement", "Stopped after consecutive evaluations without improvement.");
      let decision: CompoundAiDecision;
      try {
        decision = await requestCompoundLayoutDecision(
          options.settings,
          observedStage.compoundLayout!,
          options.message,
          abort.signal,
          () => options.onStatus?.("Correcting the layout decision…"),
          {
            selectedDirection: problem.stored.direction,
            observations: trials,
            candidateIds: new Set(candidates.keys()),
            currentLayout: working.layout,
            drafts: new Map([...drafts].map(([id, d]) => [id, d.revision])),
            workingDraft: { candidateId: working.candidateId, revision: working.revision },
            feedback,
            budget: {
              remainingRequests: budget.maxRequests - requests,
              remainingMs: Math.max(0, deadline - Date.now()),
            },
            requireEvaluation: !evaluations,
            onProgress: options.onProgress,
            beforeRequest: () => {
              check();
              if (requests >= budget.maxRequests) throw new CompoundBudgetError("request-budget");
              requests++;
              usage.push({});
              options.onStatus?.(`Planning layout · request ${requests}/${budget.maxRequests}…`);
            },
            onReply: (reply) => {
              usage[requests - 1] = requestUsage(reply);
            },
          },
        );
        check();
      } catch (error) {
        if (options.signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
        const reason =
          abort.signal.aborted || Date.now() >= deadline
            ? "deadline"
            : error instanceof CompoundBudgetError
              ? error.reason
              : "request-error";
        return finish(reason, error instanceof Error ? error.message : "Model request failed.");
      }
      decisions++;
      if (decision.action === "finish")
        return finish("selected", decision.summary, candidates.get(decision.candidateId));
      const base = decision.action === "revise" ? drafts.get(decision.baseCandidateId)! : observedDraft;
      const { hypothesis, ...payload } = decision;
      const signature = layoutFingerprint({
        payload,
        ...(decision.action === "evaluate" ? {} : { base: base.layout, data: base.data }),
      });
      const reused = signatures.get(signature);
      if (reused) {
        working = drafts.get(reused)!;
        if (working.stage) {
          observedStage = working.stage;
          observedDraft = working;
        }
        record({ ...working.trial!, hypothesis, status: "reused" });
        stagnant++;
        feedback = {
          reused: true,
          error: working.trial?.error,
          issues: inspectDraft(working.layout, problem).slice(0, 20),
        };
        continue;
      }
      const candidateId = `trial-${++evaluations}`;
      const previousBest = best();
      options.onStatus?.(
        decision.action === "evaluate"
          ? `Validating ${candidateId}…`
          : `Calculating layout and routes for ${candidateId}…`,
      );
      let execution: CompoundExecutionResult;
      try {
        const input: CompoundExecutionInput = {
          problem: { ...observedStage.compoundLayout!, stored: base.data },
          baseLayout: base.layout,
          decision,
        };
        execution = options.execute ? await options.execute(input, abort.signal) : executeCompoundDecision(input);
        check();
      } catch (error) {
        check();
        execution = {
          layout: decision.action === "evaluate" ? decision.layout : base.layout,
          data: base.data,
          precise: decision.action === "evaluate",
          reroutedEdgeIds: [],
          issues: [],
          error: error instanceof Error ? error.message : "Calculation failed.",
        };
      }
      working = {
        candidateId,
        revision: decision.action === "revise" ? base.revision + 1 : 1,
        layout: execution.layout,
        data: execution.data,
        precise: execution.precise,
      };
      drafts.set(candidateId, working);
      signatures.set(signature, candidateId);
      try {
        if (execution.error) throw new Error(execution.error);
        const stage = applyLayoutResult(working.layout, {
          ...options.currentStage,
          compoundLayout: { ...problem, stored: working.data },
        });
        const errors = directionErrors(stage);
        if (errors.length) throw new Error(errors.join(" "));
        working.stage = stage;
        candidates.set(candidateId, working);
        observedStage = stage;
        observedDraft = working;
        if (decision.action === "propose") selectionData = working.data;
        feedback = compoundExecutionFeedback(problem, stage);
        working.trial = {
          candidateId,
          revision: working.revision,
          hypothesis,
          status: "evaluated",
          metrics: measureLayout(problem, stage.compoundLayout!.baseline),
          positionedNodes: decision.action === "evaluate" ? working.layout.geometry.nodes.length : undefined,
          reroutedEdgeIds: execution.reroutedEdgeIds,
        };
        stagnant = !previousBest || compare(working, previousBest) < 0 ? 0 : stagnant + 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Layout validation failed.";
        const issues = execution.issues.length ? execution.issues : [{ code: "validation", message }];
        feedback = {
          candidateId,
          revision: working.revision,
          error: message,
          issues: issues.slice(0, 20),
          issueCount: issues.length,
          diagnosticsTruncated: issues.length > 20,
        };
        working.trial = {
          candidateId,
          revision: working.revision,
          hypothesis,
          status: "failed",
          error: message,
          reroutedEdgeIds: execution.reroutedEdgeIds,
        };
        stagnant++;
      }
      record(working.trial);
    }
  } catch (error) {
    if (error instanceof CompoundBudgetError) return finish(error.reason, error.message);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
  }
}
