import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialAiHarnessState, syncHarnessRuntime } from "../../ai/session/harness";
import { loadPersistedAiHarnessState, savePersistedAiHarnessState } from "../../ai/session/persistence";
import { buildConsoleReviewCard } from "../../console/reviewCards";
import type { GraphAppState } from "../document/initialState";
import type { ConsoleController } from "../console/useConsoleController";

export function useAiSession(state: GraphAppState, upsertReview: ConsoleController["upsertReview"]) {
  const [harness, setHarness] = useState(createInitialAiHarnessState);
  const restoredGraph = useRef<string | null>(null);
  const restoredReview = useRef<string | null>(null);
  const [runtimeId] = useState(() => crypto.randomUUID());
  const graphId = state.document.id;
  const graphRevision = `${runtimeId}:${state.document.generation}:${state.editHistory.revision}`;

  useEffect(() => {
    restoredReview.current = null;
  }, [state.document.generation]);
  useEffect(() => {
    const graphChanged = restoredGraph.current !== graphId;
    const restored = graphChanged && graphId ? loadPersistedAiHarnessState(graphId) : null;
    const base = restored || (graphChanged ? createInitialAiHarnessState() : null);
    restoredGraph.current = graphId;
    setHarness((previous) => syncHarnessRuntime(base || previous, { graphId, graphRevision }));
  }, [graphId, graphRevision]);

  useEffect(() => {
    if (graphId && harness.graphId === graphId && harness.graphRevision === graphRevision) {
      savePersistedAiHarnessState(harness);
    }
  }, [graphId, graphRevision, harness]);

  useEffect(() => {
    const plan = harness.activePlan;
    if (!plan || harness.graphId !== graphId || harness.graphRevision !== graphRevision) return;
    const key = `${harness.graphId}:${plan.id}:${plan.status}`;
    if (restoredReview.current === key) return;
    if (
      (plan.status === "ready" || plan.status === "failed" || plan.status === "superseded") &&
      plan.commandBatch?.validation
    ) {
      upsertReview(
        buildConsoleReviewCard(plan, plan.commandBatch.validation, plan.status === "superseded" ? "stale" : undefined),
      );
    }
    restoredReview.current = key;
  }, [harness.activePlan, harness.graphId, harness.graphRevision, graphId, graphRevision, upsertReview]);

  const runtimeHarness = useCallback(
    () =>
      syncHarnessRuntime(harness, {
        graphId,
        graphRevision,
      }),
    [graphId, graphRevision, harness],
  );

  return { harness, setHarness, graphRevision, runtimeHarness };
}
