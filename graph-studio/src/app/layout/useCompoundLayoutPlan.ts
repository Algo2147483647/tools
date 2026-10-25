import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { buildCompoundLayoutContext } from "../../layout/compound/ai/context";
import { diagnoseCompoundLayout, inspectCompoundLayout } from "../../layout/compound/inspection";
import { defaultLayoutIntent, parseLayoutIntent, type CompoundLayoutData, type LayoutResult } from "../../layout/compound/layout-plan";
import { compileConstraints, layoutScopeMembers } from "../../layout/compound/constraints";
import { compareLayoutMetrics } from "../../layout/compound/layout-quality";
import { automaticIntent } from "../../layout/compound/automatic";
import type { LayoutFeedback } from "../../layout/compound/feedback";
import type { StageData } from "../../layout/shared/types";
import type { CompoundWorkerInput } from "../../layout/workers/protocol";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import type { useCompoundStage } from "./useCompoundStage";
import { startLayoutWorker, type LayoutWorkerJob } from "./workerJob";

export function useCompoundLayoutPlan(state: GraphAppState, dispatch: Dispatch<GraphAction>, viewport: {
  stage: StageData | null; focusedKey: string | null;
  compoundLayout: ReturnType<typeof useCompoundStage>;
}) {
  const problem = viewport.stage?.compoundLayout;
  const settings = state.layoutDocument.data.charts.compound;
  const key = JSON.stringify([state.document.generation, state.editHistory.revision, viewport.compoundLayout.inputKey, state.chartType]);
  const ready = state.chartType === "compound" && !!problem && !viewport.compoundLayout.loading;
  const current = useRef({ state, key, ready, problem, input: viewport.compoundLayout.input, stage: viewport.stage });
  current.current = { state, key, ready, problem, input: viewport.compoundLayout.input, stage: viewport.stage };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const pending = useRef<LayoutWorkerJob<LayoutResult> | null>(null);
  // Only declarations and measured scores survive evaluation, never candidate geometry.
  const evaluated = useRef<{ key: string; data: CompoundLayoutData; feedback: LayoutFeedback } | null>(null);
  const cancel = useCallback(() => { sequence.current++; pending.current?.cancel(); pending.current = null; evaluated.current = null; setBusy(false); }, []);
  useEffect(() => { cancel(); setMessage(""); return cancel; }, [key, cancel]);
  const change = useCallback((patch: Partial<CompoundLayoutData>) => {
    const now = current.current.state;
    dispatch({ type: "layoutDocumentChanged", generation: now.document.generation,
      data: { ...now.layoutDocument.data, charts: { ...now.layoutDocument.data.charts,
        compound: { ...now.layoutDocument.data.charts.compound, ...patch } } } });
  }, [dispatch]);
  const defaultIntent = useMemo(() => ({ ...defaultLayoutIntent(problem?.projection.focusGroupId ?? null), objective: settings.objective,
    constraints: settings.direction === "AUTO" ? [] : [{ type: "direction" as const, scopeId: problem?.projection.focusGroupId ?? null, value: settings.direction, strength: "soft" as const }] }), [problem?.projection.focusGroupId, settings.objective, settings.direction]);
  const inspect = useCallback((groupId?: string | null) => {
    const p = current.current.problem;
    if (!p) throw new Error("No nested layout is available.");
    return { ...inspectCompoundLayout(p, groupId === undefined ? p.projection.focusGroupId : groupId), ...diagnoseCompoundLayout(p) };
  }, []);
  const context = useMemo(() => ready ? buildCompoundLayoutContext(defaultIntent, inspect(), null) : undefined, [ready, defaultIntent, inspect, problem]);
  const finishAi = useCallback(() => {
    const value = evaluated.current;
    if (!value || value.key !== current.current.key) return false;
    change(value.data);
    evaluated.current = null;
    setMessage("Layout configuration applied.");
    return true;
  }, [change]);
  const propose = useCallback(async (rawIntent: unknown, autoApply = true, options?: { background?: boolean; retainBest?: boolean }) => {
    const initial = current.current;
    if (!initial.ready || !initial.problem || !initial.input) throw new Error("Wait for the nested graph to finish arranging.");
    const intent = parseLayoutIntent(rawIntent);
    const previous = options?.retainBest && evaluated.current?.key === initial.key ? evaluated.current : null;
    cancel();
    const id = sequence.current;
    const compiled = compileConstraints(initial.problem, intent, layoutScopeMembers(initial.problem, intent));
    const data: CompoundLayoutData = { ...compiled, method: "ai", objective: intent.objective };
    setBusy(true); setMessage("Arranging…");
    try {
      const { buildCompoundStage } = await import("../../layout/compound/layout");
      const stage = await buildCompoundStage({ ...initial.input, layout: data, solve: problem => {
        if (id !== sequence.current || current.current.key !== initial.key) throw new Error("Layout cancelled.");
        const job = startLayoutWorker<CompoundWorkerInput, LayoutResult>({
          createWorker: () => new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
          payload: { problem, intent: automaticIntent(problem) }, timeoutMs: 15000,
          timeoutMessage: "Layout exceeded 15 seconds. Reduce the visible scope.", failureMessage: "Layout worker failed.",
          invalidMessage: "Invalid layout result.", cancelMessage: "Layout cancelled.",
        }); pending.current = job; return job.result;
      } });
      if (id !== sequence.current || current.current.key !== initial.key) throw new Error("Layout context changed.");
      const metrics = stage.layoutQuality!.metrics;
      const feedback: LayoutFeedback = { intent, baseline: initial.stage!.layoutQuality!.metrics,
        candidate: { id: "evaluated", metrics, warnings: stage.warnings, movedNodeIds: [], changedEdgeIds: [] },
        diagnostics: stage.warnings, retainedEarlierCandidate: false };
      const retain = previous?.feedback.candidate && compareLayoutMetrics(previous.feedback.candidate.metrics, metrics, intent.objective) <= 0;
      evaluated.current = retain && previous ? { ...previous, feedback: { ...previous.feedback, retainedEarlierCandidate: true } } : { key: initial.key, data, feedback };
      if (autoApply) finishAi();
      return "Layout evaluated.";
    } catch (error) {
      if (id === sequence.current) setMessage(error instanceof Error ? error.message : "Layout failed.");
      throw error;
    } finally { if (id === sequence.current) { pending.current = null; setBusy(false); } }
  }, [cancel, finishAi]);
  return { ready, key, context, busy, message, settings, change, defaultIntent, inspect, propose, finishAi, cancel,
    getFeedback: () => evaluated.current?.feedback ?? null,
    scopeTitle: problem?.projection.focusGroupId ?? "Current view",
    quality: viewport.stage?.layoutQuality, diagnostics: viewport.stage?.warnings ?? [],
    loading: viewport.compoundLayout.loading, error: viewport.compoundLayout.error,
  };
}
export type CompoundLayoutController = ReturnType<typeof useCompoundLayoutPlan>;
