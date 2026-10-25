import { type Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../shared/browser/clipboard";
import { buildAiContextPacket } from "../../ai/context/packet";
import { shouldExecuteValidatedBatch } from "../../ai/execution/policy";
import { validateCommandBatch } from "../../ai/execution/validation";
import {
  attachValidationToHarness,
  createTurnId,
  installPlan,
  markPendingBatchExecuted,
} from "../../ai/session/harness";
import { createPlanFromAiResponse } from "../../ai/session/plans";
import { formatValidationReport } from "../../ai/session/presentation";
import { requestAiPlan, testAiConnection } from "../../ai/transport/providers";
import type { AiHarnessState, AiSettings } from "../../ai/types";
import { buildConsoleReviewCard } from "../../console/reviewCards";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { useAiSession } from "./useAiSession";
import { useAiActivity } from "./useAiActivity";
import type { ConsoleController } from "../console/useConsoleController";

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
  const { setHarness, graphRevision, runtimeHarness } = useAiSession(state, upsertReview);
  const [busy, setBusy] = useState(false);
  const { activity, onProgress, clear: clearActivity } = useAiActivity();
  useEffect(clearActivity, [state.document.generation, clearActivity]);
  const busyRef = useRef(false);
  const requestGeneration = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const current = useRef({
    dag: state.dag,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
  });
  current.current = {
    dag: state.dag,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
  };

  useEffect(() => {
    requestGeneration.current += 1;
    requestAbort.current?.abort();
    busyRef.current = false;
    setBusy(false);
    return () => {
      requestGeneration.current += 1;
      requestAbort.current?.abort();
    };
  }, [state.document.generation]);
  // Every path (new plan, continued plan and Apply) shares validation and execution.
  const validateAndExecute = useCallback(
    (next: AiHarnessState): AiHarnessState => {
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
      if (!shouldExecuteValidatedBatch(validation)) {
        appendMessage("error", formatValidationReport(validation));
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
    [appearance, appendMessage, contextNodeKey, graphRevision, state.chartType, runSource, state.dag, upsertReview],
  );

  const request = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message || busyRef.current) return;
      const turnId = createTurnId();
      let next = runtimeHarness();
      recordInput("ask>", message);
      if (isExecutionApproval(message) && next.pendingCommandBatch) {
        setHarness(validateAndExecute(next));
        return;
      }
      if (!settings.baseUrl.trim() || !settings.model.trim()) {
        appendMessage("error", "AI requires a base URL and model in the controls panel.");
        setHarness(next);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      clearActivity();
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
        const response = await requestAiPlan({
          settings,
          context,
          message,
          signal: abort.signal,
          onProgress: (event) => {
            if (isCurrent() && !abort.signal.aborted) onProgress(event);
          },
        });
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
          return;
        }
        const messageText = error instanceof Error ? error.message : "AI request failed.";
        appendMessage("error", messageText);
        setHarness(next);
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
      onProgress,
      clearActivity,
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
      setHarness(validateAndExecute(next));
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
    activity,
    request,
    applyReview,
    dismissReview,
    copyReview,
    testConnection,
  };
}

export type AiController = ReturnType<typeof useAiController>;

function isExecutionApproval(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase();
  return /^(apply( it)?|approve|execute|run it|do it|执行|应用|继续执行)[.!。！]?$/u.test(normalized);
}
