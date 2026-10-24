import { type Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../adapters/clipboard";
import { buildAiContextPacket } from "../ai/contextPacket";
import { shouldExecuteValidatedBatch } from "../ai/executionPolicy";
import {
  attachValidationToHarness,
  createInitialAiHarnessState,
  createTurnId,
  installPlan,
  markPendingBatchExecuted,
  syncHarnessRuntime,
} from "../ai/harness";
import { loadPersistedAiHarnessState, savePersistedAiHarnessState } from "../ai/persistence";
import { createPlanFromAiResponse } from "../ai/plans";
import { formatReviewInstruction, formatValidationReport, referencesPreviousWork } from "../ai/presentation";
import { requestAiPlan, testAiConnection } from "../ai/providers";
import type { AiHarnessState, AiSettings } from "../ai/types";
import { validateCommandBatch } from "../ai/validation";
import { buildConsoleReviewCard } from "../console/reviewCards";
import type { GraphAppearance } from "../graph/appearance";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import type { ConsoleController } from "./useConsoleController";
import type { CompoundLayoutController } from "./useCompoundLayoutPlan";
import type { LayoutIntent } from "../layout/compound-layout-plan";
import { formatLayoutFeedback, runLayoutWorkflow } from "../ai/layoutWorkflow";

type AiConsole = Pick<
  ConsoleController,
  "entries" | "contextNodeKey" | "appendMessage" | "recordInput" | "upsertReview" | "setReviewStatus" | "runSource"
>;

export function useAiController({
  state,
  dispatch,
  appearance,
  settings,
  consoleController,
  compoundLayout,
}: {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;

  appearance: GraphAppearance;
  settings: AiSettings;
  consoleController: AiConsole;
  compoundLayout?: CompoundLayoutController;
}) {
  const { entries, contextNodeKey, appendMessage, recordInput, upsertReview, setReviewStatus, runSource } =
    consoleController;
  const [harness, setHarness] = useState(() => createInitialAiHarnessState(settings.executionMode));
  const [busy, setBusy] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutExplanation, setLayoutExplanation] = useState("");
  const layoutActive = useRef(false);
  const layoutRequestKey = useRef<string>();
  const busyRef = useRef(false);
  const restoredGraph = useRef<string | null>(null);
  const restoredReview = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const [runtimeId] = useState(() => crypto.randomUUID());
  const requestAbort = useRef<AbortController | null>(null);
  const graphId = state.document.id;
  const cancelLayout = useCallback(() => {
    if (!layoutActive.current) return;
    layoutActive.current = false;
    requestGeneration.current++;
    requestAbort.current?.abort();
    compoundLayout?.cancel();
    busyRef.current = false;
    setBusy(false);
    setLayoutBusy(false);
    setLayoutMessage("Layout request cancelled. The graph is unchanged.");
  }, [compoundLayout?.cancel]);
  useEffect(() => {
    if (layoutActive.current && layoutRequestKey.current === compoundLayout?.key) return;
    cancelLayout();
    setLayoutMessage("");
    setLayoutExplanation("");
  }, [compoundLayout?.key, cancelLayout]);
  const graphRevision = `${runtimeId}:${state.document.generation}:${state.editHistory.revision}`;
  const current = useRef({
    dag: state.dag,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
    layoutKey: compoundLayout?.key,
  });
  current.current = {
    dag: state.dag,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
    layoutKey: compoundLayout?.key,
  };

  useEffect(() => {
    requestGeneration.current += 1;
    requestAbort.current?.abort();
    restoredReview.current = null;
    busyRef.current = false;
    setBusy(false);
    return () => {
      requestGeneration.current += 1;
      requestAbort.current?.abort();
    };
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

  // Every path (new plan, continued plan and Apply) shares validation and execution.
  const validateAndExecute = useCallback(
    (next: AiHarnessState, approved = false): AiHarnessState => {
      const batch = next.pendingCommandBatch;
      if (!batch) return next;
      const validation = validateCommandBatch({
        batch,
        dag: state.dag,
        contextNodeKey,
        appearance,
        graphRevision,
        chartType: state.chartType,
      });
      next = attachValidationToHarness(next, validation);
      if (next.activePlan) upsertReview(buildConsoleReviewCard(next.activePlan, validation));
      if (!validation.allPassed) {
        appendMessage("error", formatValidationReport(validation));
        return next;
      }
      if (!approved && !shouldExecuteValidatedBatch(settings.executionMode, validation)) {
        appendMessage("info", formatReviewInstruction(settings.executionMode));
        return next;
      }
      if (!runSource(batch.commands.join("\n"))) {
        appendMessage("error", "AI command execution failed.");
        return next;
      }
      next = markPendingBatchExecuted(next);
      if (next.activePlan?.commandBatch?.validation) {
        upsertReview(buildConsoleReviewCard(next.activePlan, next.activePlan.commandBatch.validation, "applied"));
      }
      return next;
    },
    [
      appearance,
      appendMessage,
      contextNodeKey,
      graphRevision,
      state.chartType,
      runSource,
      settings.executionMode,
      state.dag,
      upsertReview,
    ],
  );

  const request = useCallback(
    async (rawMessage: string, options?: { layoutIntent: LayoutIntent }) => {
      const message = rawMessage.trim();
      if (!message || busyRef.current) return;
      const turnId = createTurnId();
      let next = runtimeHarness();
      recordInput("ask>", message);
      if (!options && referencesPreviousWork(message) && next.pendingCommandBatch) {
        setHarness(validateAndExecute(next, settings.executionMode === "review" && isExecutionApproval(message)));
        return;
      }
      if (!settings.baseUrl.trim() || !settings.model.trim()) {
        if (options) setLayoutMessage("Configure a Base URL and model in Settings → AI.");
        appendMessage("error", "AI requires a base URL and model in the controls panel.");
        setHarness(next);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      if (options) {
        layoutActive.current = true;
        layoutRequestKey.current = compoundLayout?.key;
        setLayoutBusy(true);
        setLayoutMessage("Diagnosing the selected scope…");
        setLayoutExplanation("");
      }
      const generation = ++requestGeneration.current;
      const abort = new AbortController();
      requestAbort.current = abort;
      const snapshot = current.current;
      const isCurrent = () =>
        generation === requestGeneration.current &&
        snapshot.graphRevision === current.current.graphRevision &&
        snapshot.dag === current.current.dag &&
        snapshot.settings === current.current.settings &&
        snapshot.appearance === current.current.appearance &&
        snapshot.layoutKey === current.current.layoutKey &&
        snapshot.contextNodeKey === current.current.contextNodeKey;
      try {
        const context = buildAiContextPacket({
          harness: next,
          dag: state.dag,
          mode: state.mode,
          layoutMode: state.layout.mode,
          chartType: state.chartType,
          selection: state.selection,
          contextNodeKey,
          appearance,
          consoleEntries: entries,
          layoutContext: compoundLayout?.context
            ? { ...compoundLayout.context, requestPolicy: options?.layoutIntent }
            : undefined,
        });
        const response = await requestAiPlan({ settings, context, message, signal: abort.signal });
        if (!isCurrent()) {
          if (generation === requestGeneration.current)
            appendMessage(
              "info",
              "AI response discarded because its document, context or settings changed. Please try again.",
            );
          return;
        }
        if (options || response.kind === "propose_layout" || response.kind === "inspect_layout") {
          if (!compoundLayout?.ready)
            throw new Error("Open a rendered Nested node-link chart before requesting layout changes.");
          layoutActive.current = true;
          layoutRequestKey.current = compoundLayout.key;
          setLayoutBusy(true);
          // A geometry plan supersedes an old command batch; continuing must not execute unrelated edits.
          next = {
            ...next,
            activePlan: undefined,
            pendingCommandBatch: undefined,
            workingMemory: { ...next.workingMemory, activePlanId: undefined, pendingCommandBatchId: undefined },
          };
          const outcome = await runLayoutWorkflow({
            response,
            panelIntent: options?.layoutIntent,
            inspect: compoundLayout.inspect,
            isCurrent,
            onProgress: setLayoutMessage,
            evaluate: async (intent, retainBest) => {
              await compoundLayout.propose(intent, false, { background: true, retainBest });
              if (!isCurrent()) throw new Error("Layout context changed.");
              const feedback = compoundLayout.getFeedback();
              if (!feedback) throw new Error("No layout evaluation is available.");
              return feedback;
            },
            ask: (feedback) =>
              requestAiPlan({
                settings,
                context: { ...context, compoundLayout: { ...context.compoundLayout, feedback } },
                message,
                signal: abort.signal,
              }),
          });
          if (!isCurrent()) return;
          // End the request before a commit changes its graph revision.
          layoutActive.current = false;
          const applied = outcome.feedback
            ? compoundLayout.finishAi(!options && outcome.allowAutoApply && settings.executionMode === "auto-edit")
            : false;
          const detail = [
            applied ? "Layout applied. Undo restores the previous layout." : "",
            outcome.feedback ? formatLayoutFeedback(outcome.feedback) : outcome.explanation,
          ]
            .filter(Boolean)
            .join("\n");
          setLayoutMessage(detail);
          setLayoutExplanation(outcome.explanation);
          if (outcome.explanation) appendMessage("ai", outcome.explanation);
          appendMessage("ai-action", detail);
          setHarness(next);
          return;
        }
        if (response.kind === "answer" || response.kind === "clarify") {
          const missingInformation = response.kind === "clarify" ? response.missingInformation || [] : [];
          const missing = missingInformation.length
            ? `\nMissing information:\n${missingInformation.map((item) => `- ${item.field}: ${item.reason}`).join("\n")}`
            : "";
          appendMessage("ai", `${response.answer}${missing}`);
          setHarness(next);
          return;
        }
        const plan = createPlanFromAiResponse({ response, harness: next, turnId, userMessage: message });
        next = installPlan(next, plan);
        appendMessage("ai", response.answer);
        if (!next.pendingCommandBatch) appendMessage("ai-action", plan.ui.displaySummary);
        setHarness(validateAndExecute(next));
      } catch (error) {
        if (!isCurrent()) {
          if (generation === requestGeneration.current && layoutActive.current)
            setLayoutMessage("The graph, view or settings changed. Request a new layout.");
          return;
        }
        const messageText = error instanceof Error ? error.message : "AI request failed.";
        if (layoutActive.current) {
          setLayoutMessage(messageText);
          compoundLayout?.reveal();
        }
        appendMessage("error", messageText);
        setHarness(next);
      } finally {
        if (generation === requestGeneration.current) {
          layoutActive.current = false;
          setLayoutBusy(false);
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      appearance,
      appendMessage,
      contextNodeKey,
      compoundLayout,
      entries,
      recordInput,
      runtimeHarness,
      settings,
      state.dag,
      state.chartType,
      state.layout.mode,
      state.mode,
      state.selection,
      validateAndExecute,
    ],
  );

  const applyReview = useCallback(
    (planId: string) => {
      if (busyRef.current) return;
      const next = runtimeHarness();
      if (next.activePlan?.id !== planId || !next.pendingCommandBatch) {
        appendMessage("error", "No matching pending AI plan is available.");
        return;
      }
      setHarness(validateAndExecute(next, true));
    },
    [appendMessage, runtimeHarness, validateAndExecute],
  );

  const dismissReview = useCallback(
    (planId: string) => {
      if (busyRef.current) return;
      const currentHarness = runtimeHarness();
      if (currentHarness.activePlan?.id !== planId) return;
      const dismissedPlan = {
        ...currentHarness.activePlan,
        status: "cancelled" as const,
        timestamps: { ...currentHarness.activePlan.timestamps, updatedAt: Date.now() },
      };
      setHarness({
        ...currentHarness,
        activePlan: dismissedPlan,
        pendingCommandBatch: undefined,
        workingMemory: { ...currentHarness.workingMemory, activePlanId: planId, pendingCommandBatchId: undefined },
      });
      setReviewStatus(planId, "dismissed");
      appendMessage("info", "AI plan dismissed.");
    },
    [appendMessage, runtimeHarness, setReviewStatus],
  );

  const copyReview = useCallback(
    (commands: string[]) => {
      void copyTextToClipboard(commands.join("\n"))
        .then(() => appendMessage("success", "Copied AI commands."))
        .catch((error) => appendMessage("error", error instanceof Error ? error.message : "Copy failed."));
    },
    [appendMessage],
  );

  async function testConnection() {
    if (busyRef.current) return false;
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      dispatch({ type: "statusChanged", status: "AI requires a base URL and model before testing." });
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    const generation = ++requestGeneration.current;
    const abort = new AbortController();
    requestAbort.current = abort;
    try {
      await testAiConnection(settings, abort.signal);
      if (generation !== requestGeneration.current || settings !== current.current.settings) return false;
      dispatch({ type: "statusChanged", status: `AI connection succeeded for ${settings.model}.` });
      return true;
    } catch (error) {
      if (generation === requestGeneration.current && settings === current.current.settings) {
        dispatch({ type: "statusChanged", status: error instanceof Error ? error.message : "AI connection failed." });
      }
      return false;
    } finally {
      if (generation === requestGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  return {
    busy,
    request,
    applyReview,
    dismissReview,
    copyReview,
    testConnection,
    layoutBusy,
    layoutMessage,
    layoutExplanation,
    cancelLayout,
  };
}

export type AiController = ReturnType<typeof useAiController>;

function isExecutionApproval(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase();
  return ["apply", "approve", "execute", "run it", "do it", "complete"].some((phrase) => normalized.includes(phrase));
}
