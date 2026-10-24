import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { CompoundView } from "../graph/types";
import { buildCompoundLayoutContext } from "../layout/compound/ai/context";
import { diagnoseCompoundLayout, inspectCompoundLayout } from "../layout/compound/inspection";
import {
  defaultLayoutIntent,
  layoutFingerprint,
  parseLayoutIntent,
  type LayoutSolveResult,
} from "../layout/compound/layout-plan";
import { compareLayoutMetrics, validateLayoutGeometry } from "../layout/compound/layout-quality";
import { validateLayoutConstraints } from "../layout/compound/layout-solver";
import type { StageData } from "../layout/shared/types";
import type { CompoundWorkerInput } from "../layout/workers/protocol";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import { useCompoundReview, type LayoutReview } from "./layout/useCompoundReview";
import { startLayoutWorker, type LayoutWorkerJob } from "./layout/workerJob";

export function useCompoundLayoutPlan(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  viewport: {
    stage: StageData | null;
    focusedKey: string | null;
    compound: { view: CompoundView };
    compoundLayout: { inputKey: string; loading: boolean };
  },
) {
  const problem = viewport.stage?.compoundLayout;
  const signature = layoutFingerprint([
    state.document.id,
    state.document.generation,
    state.editHistory.revision,
    state.chartType,
    viewport.compoundLayout.inputKey,
    viewport.focusedKey,
    problem?.fingerprint,
  ]);
  const runtime = useRef({ signature, history: state.editHistory, epoch: 0 });
  if (runtime.current.signature !== signature || runtime.current.history !== state.editHistory)
    runtime.current = { signature, history: state.editHistory, epoch: runtime.current.epoch + 1 };
  const key = `${runtime.current.epoch}:${signature}`;
  const ready = state.chartType === "compound" && !!problem && !!state.dag && !viewport.compoundLayout.loading;
  const current = useRef({ state, key, ready, problem, stage: viewport.stage });
  current.current = { state, key, ready, problem, stage: viewport.stage };
  const {
    review,
    setReview,
    selected,
    setSelected,
    showCandidate,
    setShowCandidate,
    feedbackRef,
    reviewRef,
    stale,
    candidate,
    previewStage,
  } = useCompoundReview(key, ready);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<{ key: string; job: LayoutWorkerJob<LayoutSolveResult> } | null>(null);
  const sequence = useRef(0);
  const cancel = useCallback(() => {
    sequence.current++;
    const active = pending.current;
    if (active) {
      pending.current = null;
      active.job.cancel();
      setMessage("Layout calculation cancelled.");
    }
    setBusy(false);
  }, []);
  useEffect(() => {
    if (pending.current && pending.current.key !== key) cancel();
    if (reviewRef.current?.key !== key) setShowCandidate(false);
  }, [key, cancel]);
  useEffect(
    () => () => {
      const active = pending.current;
      if (active) {
        active.job.cancel();
        pending.current = null;
      }
    },
    [],
  );
  const apply = useCallback(
    (candidateId?: string) => {
      const active = reviewRef.current,
        now = current.current;
      const candidate =
        active?.result.candidates.find((c) => c.id === candidateId) ??
        (!candidateId ? active?.result.candidates[selected] : undefined);
      if (
        !active ||
        !candidate ||
        active.status !== "ready" ||
        active.key !== now.key ||
        !now.ready ||
        !now.state.dag
      ) {
        setMessage("This layout candidate is stale. Generate a new preview.");
        return false;
      }
      const errors = [
        ...validateLayoutGeometry(active.problem, candidate.snapshot).errors,
        ...validateLayoutConstraints(active.problem, candidate.snapshot, candidate.data, active.intent),
      ];
      if (errors.length) {
        setMessage(errors.join(" "));
        return false;
      }
      dispatch({
        type: "compoundLayoutCommitted",
        generation: now.state.document.generation,
        revision: now.state.editHistory.revision,
        beforeDag: now.state.dag,
        historyBase: now.state.editHistory,
        problem: active.problem,
        intent: active.intent,
        candidate,
      });
      const next = { ...active, status: "applied" as const };
      reviewRef.current = next;
      setReview(next);
      setShowCandidate(false);
      setMessage("Layout applied. Undo restores the previous layout.");
      return true;
    },
    [dispatch, selected],
  );
  const propose = useCallback(
    async (rawIntent: unknown, autoApply = false, options?: { background?: boolean; retainBest?: boolean }) => {
      const initial = current.current;
      if (!initial.ready || !initial.problem || !initial.stage)
        throw new Error("Wait for a nested graph to finish rendering before arranging it.");
      const intent = parseLayoutIntent(rawIntent);
      const previous = options?.retainBest && reviewRef.current?.key === initial.key ? reviewRef.current : null;
      cancel();
      const requestSequence = sequence.current;
      if (!previous) {
        setReview(null);
        reviewRef.current = null;
      }
      setShowCandidate(false);
      setMessage("Calculating layout candidates…");
      setBusy(true);
      try {
        const job = startLayoutWorker<CompoundWorkerInput, LayoutSolveResult>({
          createWorker: () =>
            new Worker(new URL("../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
          payload: { problem: initial.problem, intent },
          timeoutMs: 15000,
          timeoutMessage: "Layout search exceeded 15 seconds. Use a smaller scope or fewer visible nodes.",
          failureMessage: "Layout worker failed.",
          invalidMessage: "Invalid layout worker response.",
          cancelMessage: "Layout calculation cancelled.",
        });
        pending.current = { key: initial.key, job };
        let result: LayoutSolveResult;
        try {
          result = await job.result;
        } finally {
          if (pending.current?.job === job) pending.current = null;
        }
        if (requestSequence !== sequence.current || current.current.key !== initial.key || !current.current.ready)
          return "Layout result discarded because its graph or view changed.";
        let next: LayoutReview = {
          key: initial.key,
          intent,
          problem: initial.problem,
          stage: initial.stage,
          result,
          status: "ready",
        };
        const oldBest = previous?.result.candidates[0],
          newBest = result.candidates[0];
        const retain =
          !!oldBest && (!newBest || compareLayoutMetrics(oldBest.metrics, newBest.metrics, intent.objective) <= 0);
        if (retain && previous) next = previous;
        const retainedBest = next.result.candidates[0];
        feedbackRef.current = {
          intent: next.intent,
          baseline: next.result.baselineMetrics,
          candidate: retainedBest
            ? {
                id: retainedBest.id,
                metrics: retainedBest.metrics,
                warnings: retainedBest.unmetPreferences,
                movedNodeIds: retainedBest.changedNodeIds,
                changedEdgeIds: retainedBest.changedEdgeIds,
              }
            : null,
          diagnostics: result.diagnostics,
          retainedEarlierCandidate: retain,
        };
        reviewRef.current = next;
        setReview(next);
        setSelected(0);
        setShowCandidate(!options?.background && next.result.candidates.length > 0);
        const summary = next.result.candidates.length
          ? `${next.result.candidates.length} legal layout candidate${next.result.candidates.length === 1 ? "" : "s"} ready for review.`
          : result.diagnostics.join(" ");
        setMessage(summary);
        const best = result.candidates[0];
        let applied = false;
        if (
          autoApply &&
          best &&
          intent.boundaryPolicy === "strict" &&
          !intent.constraints.some((c) => c.type === "unpin") &&
          !best.unmetPreferences.length &&
          !best.expandedGroupIds.length
        )
          applied = apply(best.id);
        if (applied) return `Layout applied (${best.id}). Undo restores the previous layout.`;
        return result.candidates.length
          ? `${summary}\n${result.candidates.map((candidate) => `${candidate.id}: ${candidate.title}`).join("\n")}`
          : summary;
      } catch (error) {
        if (requestSequence === sequence.current && current.current.key === initial.key)
          setMessage(error instanceof Error ? error.message : "Layout failed.");
        throw error;
      } finally {
        if (requestSequence === sequence.current && current.current.key === initial.key) setBusy(false);
      }
    },
    [cancel, apply],
  );
  const focused = problem?.projection.items.find((i) => i.id === viewport.focusedKey && !i.external);
  const scopeId = focused
    ? focused.kind === "group" && !focused.collapsed
      ? focused.id
      : (focused.parentId ?? viewport.compound.view.focusGroupId)
    : viewport.compound.view.focusGroupId;
  const defaultIntent = useMemo(() => defaultLayoutIntent(scopeId), [scopeId]);
  const scopeTitle =
    problem?.projection.items.find((item) => item.id === scopeId)?.title ?? (scopeId || "Current root");
  const dismiss = () => {
    cancel();
    setReview(null);
    reviewRef.current = null;
    setShowCandidate(false);
    setMessage("Layout preview dismissed.");
  };
  const diagnostics = useMemo(() => (problem ? diagnoseCompoundLayout(problem) : null), [problem]);
  const reveal = useCallback(() => {
    if (reviewRef.current?.key === current.current.key && reviewRef.current.status === "ready") setShowCandidate(true);
  }, []);
  const getFeedback = useCallback(() => feedbackRef.current, []);
  const finishAi = useCallback(
    (autoApply: boolean) => {
      const active = reviewRef.current,
        best = active?.result.candidates[0];
      if (!active || !best || active.key !== current.current.key) return false;
      if (
        autoApply &&
        active.intent.boundaryPolicy === "strict" &&
        !active.intent.constraints.some((c) => c.type === "unpin") &&
        !best.unmetPreferences.length &&
        !best.expandedGroupIds.length &&
        compareLayoutMetrics(best.metrics, active.result.baselineMetrics, active.intent.objective) < 0
      )
        return apply(best.id);
      reveal();
      return false;
    },
    [apply, reveal],
  );
  const inspect = useCallback(
    (groupId?: string | null) => {
      const now = current.current;
      if (!now.problem) throw new Error("No nested layout is available.");
      const p = now.problem;
      const scope = groupId === undefined ? defaultIntent.scope.groupId : groupId;
      return { ...inspectCompoundLayout(p, scope), ...diagnostics };
    },
    [defaultIntent, diagnostics],
  );
  const context = useMemo(
    () =>
      ready
        ? buildCompoundLayoutContext(
            defaultIntent,
            inspect(),
            review && !stale && review.status === "ready"
              ? { intent: review.intent, candidateIds: review.result.candidates.map((c) => c.id) }
              : null,
          )
        : undefined,
    [ready, defaultIntent, inspect, review, stale],
  );
  return {
    ready,
    key,
    context,
    busy,
    message,
    review,
    candidate,
    stale,
    selected,
    setSelected,
    showCandidate,
    setShowCandidate,
    previewStage,
    defaultIntent,
    scopeTitle,
    reveal,
    getFeedback,
    finishAi,
    propose,
    apply,
    dismiss,
    cancel,
    inspect,
    focusedKey: focused?.id ?? null,
  };
}
export type CompoundLayoutController = ReturnType<typeof useCompoundLayoutPlan>;
