import { type Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../adapters/clipboard";
import { buildAiContextPacket } from "../ai/contextPacket";
import { shouldExecuteValidatedBatch } from "../ai/executionPolicy";
import {
  appendAiEvents,
  attachValidationToHarness,
  createAiEvent,
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
}: {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;

  appearance: GraphAppearance;
  settings: AiSettings;
  consoleController: AiConsole;
}) {
  const { entries, contextNodeKey, appendMessage, recordInput, upsertReview, setReviewStatus, runSource } =
    consoleController;
  const [harness, setHarness] = useState(() => createInitialAiHarnessState(settings.executionMode));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const restoredGraph = useRef<string | null>(null);
  const restoredReview = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const [runtimeId] = useState(() => crypto.randomUUID());
  const requestAbort = useRef<AbortController | null>(null);
  const graphId = state.document.id;
  const graphRevision = `${runtimeId}:${state.document.generation}:${state.editHistory.revision}`;
  const current = useRef({ dag: state.dag, settings, appearance, contextNodeKey, graphRevision });
  current.current = { dag: state.dag, settings, appearance, contextNodeKey, graphRevision };

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
    (next: AiHarnessState, turnId: string, approved = false): AiHarnessState => {
      const batch = next.pendingCommandBatch;
      if (!batch) return next;
      const validation = validateCommandBatch({ batch, dag: state.dag, contextNodeKey, appearance, graphRevision });
      next = attachValidationToHarness(next, validation, turnId);
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
        return appendAiEvents(next, [
          createAiEvent(next, turnId, "error", { message: "AI command execution failed." }),
        ]);
      }
      next = markPendingBatchExecuted(next, turnId);
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
      runSource,
      settings.executionMode,
      state.dag,
      upsertReview,
    ],
  );

  const request = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message || busyRef.current) return;
      const turnId = createTurnId();
      const runtime = runtimeHarness();
      let next = appendAiEvents(runtime, [createAiEvent(runtime, turnId, "user.message", { message })]);
      recordInput("ask>", message);
      if (referencesPreviousWork(message) && next.pendingCommandBatch) {
        setHarness(
          validateAndExecute(next, turnId, settings.executionMode === "review" && isExecutionApproval(message)),
        );
        return;
      }
      if (!settings.baseUrl.trim() || !settings.model.trim()) {
        appendMessage("error", "AI requires a base URL and model in the controls panel.");
        setHarness(
          appendAiEvents(next, [
            createAiEvent(next, turnId, "error", { message: "AI requires a base URL and model." }),
          ]),
        );
        return;
      }
      busyRef.current = true;
      setBusy(true);
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
        if (response.kind === "answer" || response.kind === "clarify") {
          const missingInformation = response.kind === "clarify" ? response.missingInformation || [] : [];
          const missing = missingInformation.length
            ? `\nMissing information:\n${missingInformation.map((item) => `- ${item.field}: ${item.reason}`).join("\n")}`
            : "";
          appendMessage("ai", `${response.answer}${missing}`);
          setHarness(
            appendAiEvents(next, [
              createAiEvent(next, turnId, "assistant.answer", { answer: response.answer, missingInformation }),
            ]),
          );
          return;
        }
        const plan = createPlanFromAiResponse({ response, harness: next, turnId, userMessage: message });
        next = installPlan(next, plan, turnId);
        appendMessage("ai", response.answer);
        if (!next.pendingCommandBatch) appendMessage("ai-action", plan.ui.displaySummary);
        setHarness(validateAndExecute(next, turnId));
      } catch (error) {
        if (!isCurrent()) return;
        const messageText = error instanceof Error ? error.message : "AI request failed.";
        appendMessage("error", messageText);
        setHarness(appendAiEvents(next, [createAiEvent(next, turnId, "error", { message: messageText })]));
      } finally {
        if (generation === requestGeneration.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [
      appearance,
      appendMessage,
      contextNodeKey,
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
      const turnId = createTurnId();
      const approved = appendAiEvents(next, [createAiEvent(next, turnId, "user.approved", { planId })]);
      setHarness(validateAndExecute(approved, turnId, true));
    },
    [appendMessage, runtimeHarness, validateAndExecute],
  );

  const dismissReview = useCallback(
    (planId: string) => {
      if (busyRef.current) return;
      const currentHarness = runtimeHarness();
      if (currentHarness.activePlan?.id !== planId) return;
      const turnId = createTurnId();
      const dismissedPlan = {
        ...currentHarness.activePlan,
        status: "cancelled" as const,
        timestamps: { ...currentHarness.activePlan.timestamps, updatedAt: Date.now() },
      };
      setHarness(
        appendAiEvents(
          {
            ...currentHarness,
            activePlan: dismissedPlan,
            pendingCommandBatch: undefined,
            workingMemory: { ...currentHarness.workingMemory, activePlanId: planId, pendingCommandBatchId: undefined },
          },
          [createAiEvent(currentHarness, turnId, "user.rejected", { planId })],
        ),
      );
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

  return { harness, busy, request, applyReview, dismissReview, copyReview, testConnection };
}

export type AiController = ReturnType<typeof useAiController>;

function isExecutionApproval(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase();
  return ["apply", "approve", "execute", "run it", "do it", "complete"].some((phrase) => normalized.includes(phrase));
}
