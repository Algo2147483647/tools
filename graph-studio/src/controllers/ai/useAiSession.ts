import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialAiHarnessState, syncHarnessRuntime } from "../../ai/session/harness";
import { loadPersistedAiHarnessState, savePersistedAiHarnessState } from "../../ai/session/persistence";
import type { AiSettings } from "../../ai/types";
import { buildConsoleReviewCard } from "../../console/reviewCards";
import type { GraphAppState } from "../../state/initialState";
import type { ConsoleController } from "../useConsoleController";

export function useAiSession(
  state: GraphAppState,
  settings: AiSettings,
  upsertReview: ConsoleController["upsertReview"],
) {
  const [harness, setHarness] = useState(() => createInitialAiHarnessState(settings.executionMode));
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
    const restored = graphChanged && graphId ? loadPersistedAiHarnessState(graphId, settings.executionMode) : null;
    const base = restored || (graphChanged ? createInitialAiHarnessState(settings.executionMode) : null);
    restoredGraph.current = graphId;
    setHarness((previous) =>
      syncHarnessRuntime(base || previous, { graphId, graphRevision, mode: settings.executionMode }),
    );
  }, [graphId, graphRevision, settings.executionMode]);

  useEffect(() => {
    if (
      graphId &&
      harness.graphId === graphId &&
      harness.graphRevision === graphRevision &&
      harness.mode === settings.executionMode
    ) {
      savePersistedAiHarnessState(harness);
    }
  }, [graphId, graphRevision, harness, settings.executionMode]);

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
        mode: settings.executionMode,
      }),
    [graphId, graphRevision, harness, settings.executionMode],
  );

  return { harness, setHarness, graphRevision, runtimeHarness };
}
