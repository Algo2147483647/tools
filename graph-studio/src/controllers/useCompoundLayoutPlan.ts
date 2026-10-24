import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import type { CompoundView } from "../graph/types";
import {
  defaultLayoutIntent,
  layoutFingerprint,
  parseLayoutIntent,
  type LayoutIntent,
  type LayoutProblem,
  type LayoutSolveResult,
} from "../layout/compound-layout-plan";
import { validateLayoutGeometry } from "../layout/compound-layout-quality";
import { diagnoseCompoundLayout, inspectCompoundLayout } from "../ai/layoutContext";
import { validateLayoutConstraints } from "../layout/compound-layout-solver";
import { applyLayoutSnapshot } from "../layout/compound-layout-stage";
import type { StageData } from "../layout/types";

interface LayoutReview {
  key: string;
  intent: LayoutIntent;
  problem: LayoutProblem;
  stage: StageData;
  result: LayoutSolveResult;
  status: "ready" | "applied" | "dismissed";
}
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
    problem?.fingerprint,
  ]);
  const runtime = useRef({ signature, history: state.editHistory, epoch: 0 });
  if (runtime.current.signature !== signature || runtime.current.history !== state.editHistory)
    runtime.current = { signature, history: state.editHistory, epoch: runtime.current.epoch + 1 };
  const key = `${runtime.current.epoch}:${signature}`;
  const ready = state.chartType === "compound" && !!problem && !!state.dag && !viewport.compoundLayout.loading;
  const current = useRef({ state, key, ready, problem, stage: viewport.stage });
  current.current = { state, key, ready, problem, stage: viewport.stage };
  const [review, setReview] = useState<LayoutReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(0);
  const [showCandidate, setShowCandidate] = useState(false);
  const pending = useRef<{ worker: Worker; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  const sequence = useRef(0);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const cancel = useCallback(() => {
    sequence.current++;
    const active = pending.current;
    if (active) {
      pending.current = null;
      clearTimeout(active.timer);
      active.worker.terminate();
      active.reject(new Error("Layout calculation cancelled."));
      setMessage("Layout calculation cancelled.");
    }
    setBusy(false);
  }, []);
  useEffect(() => {
    cancel();
    setShowCandidate(false);
  }, [key, cancel]);
  useEffect(
    () => () => {
      const active = pending.current;
      if (active) {
        clearTimeout(active.timer);
        active.worker.terminate();
        active.reject(new Error("Layout calculation cancelled."));
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
    async (rawIntent: unknown, autoApply = false) => {
      const initial = current.current;
      if (!initial.ready || !initial.problem || !initial.stage)
        throw new Error("Wait for a nested graph to finish rendering before arranging it.");
      const intent = parseLayoutIntent(rawIntent);
      cancel();
      const requestSequence = sequence.current;
      setReview(null);
      reviewRef.current = null;
      setShowCandidate(false);
      setMessage("Calculating layout candidates…");
      setBusy(true);
      const jobId = crypto.randomUUID();
      try {
        const result = await new Promise<LayoutSolveResult>((resolve, reject) => {
          const worker = new Worker(new URL("../layout/compound-layout.worker.ts", import.meta.url), {
            type: "module",
          });
          const finish = () => {
            if (pending.current?.worker === worker) {
              clearTimeout(pending.current.timer);
              pending.current = null;
            }
            worker.terminate();
          };
          const timer = setTimeout(() => {
            finish();
            reject(new Error("Layout search exceeded 15 seconds. Use a smaller scope or fewer visible nodes."));
          }, 15000);
          pending.current = { worker, reject, timer };
          worker.onerror = (event) => {
            finish();
            reject(new Error(event.message || "Layout worker failed."));
          };
          worker.onmessage = (event: MessageEvent<{ jobId: string; result?: LayoutSolveResult; error?: string }>) => {
            if (event.data.jobId !== jobId) return;
            finish();
            if (event.data.error || !event.data.result)
              reject(new Error(event.data.error || "Invalid layout worker response."));
            else resolve(event.data.result);
          };
          worker.postMessage({ jobId, problem: initial.problem, intent });
        });
        if (requestSequence !== sequence.current || current.current.key !== initial.key || !current.current.ready)
          return "Layout result discarded because its graph or view changed.";
        const next: LayoutReview = {
          key: initial.key,
          intent,
          problem: initial.problem,
          stage: initial.stage,
          result,
          status: "ready",
        };
        reviewRef.current = next;
        setReview(next);
        setSelected(0);
        setShowCandidate(result.candidates.length > 0);
        const summary = result.candidates.length
          ? `${result.candidates.length} legal layout candidate${result.candidates.length === 1 ? "" : "s"} ready for review.`
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
  const stale = !!review && review.status === "ready" && (review.key !== key || !ready);
  const candidate = review?.result.candidates[selected];
  const previewStage = useMemo(
    () =>
      review && candidate && showCandidate && !stale && review.status === "ready"
        ? applyLayoutSnapshot(review.stage, candidate.snapshot)
        : null,
    [review, candidate, showCandidate, stale],
  );
  const dismiss = () => {
    cancel();
    setReview(null);
    reviewRef.current = null;
    setShowCandidate(false);
    setMessage("Layout preview dismissed.");
  };
  const diagnostics = useMemo(() => (problem ? diagnoseCompoundLayout(problem) : null), [problem]);
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
        ? {
            protocolVersion: 1,
            defaultIntent,
            ...inspect(),
            supportedConstraints: ["direction", "pin", "unpin", "prefer-outer-route", "port-side"],
            pending:
              review && !stale && review.status === "ready"
                ? { intent: review.intent, candidateIds: review.result.candidates.map((c) => c.id) }
                : null,
          }
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
    propose,
    apply,
    dismiss,
    cancel,
    inspect,
    focusedKey: focused?.id ?? null,
  };
}
export type CompoundLayoutController = ReturnType<typeof useCompoundLayoutPlan>;
