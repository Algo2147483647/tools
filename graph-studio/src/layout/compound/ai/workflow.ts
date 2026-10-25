import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import { requestToolTurn } from "../../../ai/transport/toolConversation";
import type { ModelToolCall, ToolMessage } from "../../../ai/transport/toolTypes";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { CompoundLayoutData, LayoutMetrics, LayoutProblem } from "../layout-plan";
import { measureLayout } from "../layout-quality";
import { createLayoutResult, type LayoutResultDocument } from "../../../schema/layoutResult";
import { layoutIdentity } from "../../../schema/layoutGeometry";
import { applyLayoutResult } from "../../shared/applyLayoutResult";
import { executeCompoundDecision, type CompoundExecutionInput, type CompoundExecutionResult } from "./execute";
import type { CompoundDesign } from "./design";
import { graphOverview, inspectGraph, inspectLayout } from "./observation";
import {
  LAYOUT_TOOLS,
  parseToolArguments,
  type CandidateRef,
  type LayoutReview,
  type LayoutToolName,
} from "./protocol";
import { COMPOUND_PLANNER_INSTRUCTIONS } from "./prompt";
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
  status: "evaluated" | "failed";
  metrics?: LayoutMetrics;
  error?: string;
  reroutedEdgeIds?: string[];
  design?: CompoundDesign;
}
export interface LayoutCandidate extends CandidateRef {
  parentId?: string;
  layout: LayoutResultDocument;
  data: CompoundLayoutData;
  design?: CompoundDesign;
  valid: boolean;
  error?: string;
  inspectedAt?: number;
}
export interface LayoutToolTrace {
  id: string;
  name: string;
  arguments: string;
  result: unknown;
  elapsedMs: number;
  ok: boolean;
}
export interface CompoundCheckpoint {
  version: 1;
  contextKey: string;
  modelKey: string;
  message: string;
  messages: ToolMessage[];
  candidates: LayoutCandidate[];
  pending: ModelToolCall[];
  pendingIndex: number;
  completed: { id: string; signature: string; result: unknown }[];
  trials: CompoundAiEvaluation[];
  trace: LayoutToolTrace[];
  usage: CompoundRequestUsage[];
  requests: number;
  requestLimit: number;
  elapsedMs: number;
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
  review: LayoutReview;
  tools: LayoutToolTrace[];
  observationMode: "structure-only";
  design?: CompoundDesign;
}
export function compoundContextKey(problem: LayoutProblem, stage: StageData) {
  return layoutIdentity({
    overview: graphOverview(problem),
    current: createLayoutResult(stage, "compound"),
    settings: problem.stored,
    sizes: problem.minimumSizes,
  });
}
export async function runCompoundAiLayout(options: {
  settings: AiSettings;
  problem: LayoutProblem;
  currentStage: StageData;
  message: string;
  signal: AbortSignal;
  budget?: Partial<CompoundAiBudget>;
  checkpoint?: CompoundCheckpoint;
  execute?(input: CompoundExecutionInput, signal: AbortSignal): Promise<CompoundExecutionResult>;
  onStatus?(message: string): void;
  onProgress?: AiProgressListener;
  onEvaluation?(evaluation: CompoundAiEvaluation): void;
  onCheckpoint?(checkpoint: CompoundCheckpoint): void;
}) {
  const { problem } = options,
    budget = { ...DEFAULT_COMPOUND_AI_BUDGET, ...options.budget };
  if (Object.values(budget).some((v) => !Number.isSafeInteger(v) || v <= 0))
    throw new Error("AI layout budgets must be positive integers.");
  const contextKey = compoundContextKey(problem, options.currentStage),
    modelKey = JSON.stringify([options.settings.provider, options.settings.baseUrl, options.settings.model]);
  if (
    options.checkpoint &&
    (options.checkpoint.version !== 1 ||
      options.checkpoint.contextKey !== contextKey ||
      options.checkpoint.modelKey !== modelKey)
  )
    throw new Error("Layout or model context changed. Start a new design.");
  const initialLayout = createLayoutResult(options.currentStage, "compound");
  let initialValid = true;
  try {
    applyLayoutResult(initialLayout, options.currentStage);
  } catch {
    initialValid = false;
  }
  const state: CompoundCheckpoint = options.checkpoint
    ? structuredClone(options.checkpoint)
    : {
        version: 1,
        contextKey,
        modelKey,
        message: options.message,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              request: options.message,
              graph: graphOverview(problem),
              initialCandidate: { candidateId: "current", revision: 0, valid: initialValid },
            }),
          },
        ],
        candidates: [
          { candidateId: "current", revision: 0, layout: initialLayout, data: problem.stored, valid: initialValid },
        ],
        pending: [],
        pendingIndex: 0,
        completed: [],
        trials: [],
        trace: [],
        usage: [],
        requests: 0,
        requestLimit: 0,
        elapsedMs: 0,
      };
  const started = Date.now(),
    priorElapsed = state.elapsedMs,
    requestStart = state.requests;
  state.requestLimit += budget.maxRequests;
  let toolCount = 0,
    idle = false,
    timedOut = false,
    idleTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController(),
    cancel = () => abort.abort();
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, budget.timeoutMs);
  const progress: AiProgressListener = (e) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idle = true;
      cancel();
    }, budget.idleTimeoutMs);
    options.onProgress?.(e);
  };
  const check = () => {
    if (options.signal.aborted)
      throw new LayoutRequestError("cancelled", "Layout cancelled. Resume is available for this unchanged context.");
    if (idle) throw new CompoundBudgetError("idle-timeout");
    if (timedOut || abort.signal.aborted) throw new CompoundBudgetError("deadline");
  };
  const checkpoint = () => {
    state.elapsedMs = priorElapsed + Date.now() - started;
    options.onCheckpoint?.(structuredClone(state));
  };
  const candidate = (ref: CandidateRef) => {
    const c = state.candidates.find((c) => c.candidateId === ref.candidateId);
    if (!c || c.revision !== ref.revision)
      throw new Error(
        "Unknown candidate or stale revision. Use the exact candidateId and revision returned by a tool.",
      );
    return c;
  };
  let selected: { candidate: LayoutCandidate; summary: string; review: LayoutReview } | undefined;
  const observation = (c: LayoutCandidate, scopeId: string | null = null, nodeIds: string[] = [], routes = false) => ({
    candidateId: c.candidateId,
    revision: c.revision,
    parentId: c.parentId,
    valid: c.valid,
    error: c.error,
    ...inspectLayout(problem, c.layout, c.design, scopeId, nodeIds, routes),
  });
  const execute = async (call: ModelToolCall): Promise<unknown> => {
    let raw: unknown;
    try {
      raw = JSON.parse(call.arguments);
    } catch {
      throw new Error("Tool arguments must be one complete JSON object.");
    }
    const name = call.name as LayoutToolName;
    if (name === "inspect_graph") {
      const a = parseToolArguments(name, raw);
      return inspectGraph(problem, a.scopeId, a.nodeIds);
    }
    if (name === "inspect_layout") {
      const a = parseToolArguments(name, raw),
        c = candidate(a),
        result = observation(c, a.scopeId, a.nodeIds, a.includeRoutes);
      if (a.scopeId === null && a.nodeIds.length === 0) c.inspectedAt = state.requests;
      return result;
    }
    if (name === "compare_layouts") {
      const a = parseToolArguments(name, raw),
        left = candidate(a.left),
        right = candidate(a.right);
      const l = observation(left),
        r = observation(right);
      left.inspectedAt = right.inspectedAt = state.requests;
      const positions = (c: LayoutCandidate) => [...c.layout.geometry.nodes, ...(c.layout.geometry.groups ?? [])];
      const before = new Map(positions(left).map((n) => [n.id, n]));
      return {
        left: l,
        right: r,
        changed: positions(right).filter((n) => JSON.stringify(n) !== JSON.stringify(before.get(n.id))),
        instruction: "Choose by communication intent and evidence; no metric-based winner is assigned.",
      };
    }
    if (name === "finish_layout") {
      const a = parseToolArguments(name, raw),
        c = candidate(a);
      if (c.candidateId === "current" || !c.valid) throw new Error("Finish requires a legal generated candidate.");
      if (c.inspectedAt === undefined || c.inspectedAt >= state.requests)
        throw new Error(
          "Inspect the whole candidate and consume its tool result in a subsequent model turn before finishing.",
        );
      if (state.pendingIndex !== state.pending.length - 1)
        throw new Error("finish_layout must be the final tool call in the turn.");
      selected = { candidate: c, summary: a.summary, review: a.review };
      return { selected: c.candidateId, revision: c.revision };
    }
    if (name !== "compose_layout" && name !== "edit_layout") throw new Error(`Unknown layout tool: ${name}.`);
    const a = parseToolArguments(name, raw),
      base = candidate(a);
    let design = base.design;
    let decision: CompoundExecutionInput["decision"];
    if (name === "compose_layout") {
      const plan = parseToolArguments("compose_layout", raw).design;
      const scopes = new Map(base.design?.scopes.map((s) => [s.groupId, s]) ?? []);
      for (const s of plan.scopes) scopes.set(s.groupId === problem.projection.focusGroupId ? null : s.groupId, s);
      design = { ...plan, scopes: [...scopes.values()] };
      decision = { action: "compose", design };
    } else decision = { action: "edit", changes: parseToolArguments("edit_layout", raw).changes };
    const baseStage = base.valid
      ? applyLayoutResult(base.layout, { ...options.currentStage, compoundLayout: { ...problem, stored: base.data } })
      : undefined;
    const input: CompoundExecutionInput = {
      problem: { ...problem, baseline: baseStage?.compoundLayout!.baseline ?? problem.baseline, stored: base.data },
      baseLayout: base.layout,
      decision,
    };
    options.onStatus?.(`${name === "compose_layout" ? "Composing" : "Editing"} from ${base.candidateId}…`);
    const result = await (options.execute ? options.execute(input, abort.signal) : executeCompoundDecision(input));
    check();
    const id = `trial-${state.trials.length + 1}`;
    const trial: CompoundAiEvaluation = {
      candidateId: id,
      revision: base.revision + 1,
      hypothesis: a.hypothesis,
      status: "evaluated",
      reroutedEdgeIds: result.reroutedEdgeIds,
      design,
    };
    let error = result.error;
    try {
      if (error) throw new Error(error);
      const stage = applyLayoutResult(result.layout, {
        ...options.currentStage,
        compoundLayout: { ...problem, stored: result.data },
      });
      trial.metrics = measureLayout(problem, stage.compoundLayout!.baseline);
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid geometry";
      trial.status = "failed";
      trial.error = error;
    }
    const next: LayoutCandidate = {
      candidateId: id,
      revision: trial.revision,
      parentId: base.candidateId,
      layout: result.layout,
      data: result.data,
      design,
      valid: !error,
      error,
    };
    state.candidates.push(next);
    state.trials.push(trial);
    options.onEvaluation?.(trial);
    // Invalid compositions can contain unknown IDs; don't inspect an unrealized intent.
    return error
      ? { candidateId: id, revision: next.revision, valid: false, error, issues: result.issues }
      : observation(next);
  };
  checkpoint();
  try {
    for (;;) {
      check();
      while (state.pendingIndex < state.pending.length) {
        check();
        if (toolCount++ >= budget.maxToolCalls) throw new CompoundBudgetError("tool-budget");
        const call = state.pending[state.pendingIndex],
          signature = JSON.stringify([call.name, call.arguments]);
        const cached = state.completed.find((c) => c.id === call.id);
        let result: unknown,
          ok = true;
        const began = Date.now();
        try {
          if (cached) {
            if (cached.signature !== signature) throw new Error("Tool call ID was reused with different arguments.");
            result = cached.result;
          } else result = await execute(call);
        } catch (e) {
          check();
          ok = false;
          result = { error: e instanceof Error ? e.message : "Tool failed", recoverable: true };
        }
        check();
        if (!cached) state.completed.push({ id: call.id, signature, result });
        state.messages.push({ role: "tool", callId: call.id, name: call.name, content: JSON.stringify(result) });
        state.trace.push({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          result,
          elapsedMs: Date.now() - began,
          ok,
        });
        state.pendingIndex++;
        checkpoint();
      }
      state.pending = [];
      state.pendingIndex = 0;
      if (selected) {
        const c = selected.candidate,
          stage = applyLayoutResult(c.layout, {
            ...options.currentStage,
            compoundLayout: { ...problem, stored: c.data },
          });
        const before = measureLayout(problem, problem.baseline),
          after = measureLayout(problem, stage.compoundLayout!.baseline);
        const report: CompoundAiReport = {
          candidateId: c.candidateId,
          summary: selected.summary,
          evaluations: state.trials.length,
          decisions: state.trace.length,
          requests: state.requests,
          requestLimit: state.requestLimit,
          elapsedMs: state.elapsedMs,
          stopReason: "selected",
          usage: state.usage,
          before,
          after,
          changed: after.movedNodes > 0 || after.changedEdges > 0,
          trials: state.trials,
          review: selected.review,
          tools: state.trace,
          observationMode: "structure-only",
          design: c.design,
        };
        return {
          report,
          data: c.data,
          stage: { ...stage, layoutQuality: { ...stage.layoutQuality!, aiAssessment: selected.summary } },
        };
      }
      if (state.requests - requestStart >= budget.maxRequests) throw new CompoundBudgetError("request-budget");
      const remaining = {
        requests: budget.maxRequests - (state.requests - requestStart),
        toolCalls: budget.maxToolCalls - toolCount,
        timeMs: Math.max(0, budget.timeoutMs - (Date.now() - started)),
      };
      options.onStatus?.(`Designing with tools · request ${state.requests + 1}…`);
      state.requests++;
      state.usage.push({});
      checkpoint();
      const reply = await requestToolTurn(
        options.settings,
        COMPOUND_PLANNER_INSTRUCTIONS +
          "\n" +
          JSON.stringify({
            remaining,
            candidates: state.candidates.map((c) => ({
              candidateId: c.candidateId,
              revision: c.revision,
              valid: c.valid,
              parentId: c.parentId,
            })),
          }),
        state.messages,
        LAYOUT_TOOLS,
        abort.signal,
        progress,
      );
      clearTimeout(idleTimer);
      check();
      state.usage[state.requests - 1] = requestUsage(reply);
      state.messages.push(reply.assistant);
      state.pending = reply.assistant.calls;
      state.pendingIndex = 0;
      if (!state.pending.length)
        state.messages.push({
          role: "user",
          content:
            "Continue using the layout tools. A text answer does not install a layout; inspect a candidate and call finish_layout when ready.",
        });
      checkpoint();
    }
  } catch (e) {
    checkpoint();
    if (options.signal.aborted)
      throw new LayoutRequestError("cancelled", "Layout cancelled. Completed work is available to resume.");
    const reason = idle
      ? "Model output stalled"
      : timedOut
        ? "Design time limit reached"
        : e instanceof Error
          ? e.message
          : "Tool session stopped";
    throw new LayoutRequestError("solve", `${reason} Layout work saved for Resume; current canvas kept.`);
  } finally {
    clearTimeout(timer);
    clearTimeout(idleTimer);
    options.signal.removeEventListener("abort", cancel);
  }
}
