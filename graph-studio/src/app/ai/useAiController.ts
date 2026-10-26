import { splitCommandStages } from "../../console/workflow";
import { runInspectionLoop, isAnalysisOnlyRequest } from "../../ai/session/inspection";
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
  | "entries"
  | "contextNodeKey"
  | "appendMessage"
  | "recordInput"
  | "upsertReview"
  | "setReviewStatus"
  | "runSource"
  | "prepareSource"
  | "executePrepared"
  | "getExecutionKey"
  | "getEnvironment"
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
  const {
    entries,
    contextNodeKey,
    appendMessage,
    recordInput,
    upsertReview,
    setReviewStatus,
    prepareSource,
    executePrepared,
    getExecutionKey,
    getEnvironment,
  } = consoleController;
  const liveConsole = useRef(consoleController);
  liveConsole.current = consoleController;
  const liveState = useRef(state);
  liveState.current = state;
  const { setHarness, graphRevision, runtimeHarness } = useAiSession(state, upsertReview);
  const [busy, setBusy] = useState(false);
  const { activity, onProgress, clear: clearActivity } = useAiActivity();
  useEffect(clearActivity, [state.document.generation, clearActivity]);
  const busyRef = useRef(false);
  const runningLayout = useRef(false);
  const requestGeneration = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const current = useRef({
    dag: state.dag,
    documentGeneration: state.document.generation,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
    executionKey: getExecutionKey(),
  });
  current.current = {
    dag: state.dag,
    documentGeneration: state.document.generation,
    settings,
    appearance,
    contextNodeKey,
    graphRevision,
    executionKey: getExecutionKey(),
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
    async (next: AiHarnessState): Promise<AiHarnessState> => {
      const batch = next.pendingCommandBatch;
      if (!batch) return next;
      if (batch.executionKey && batch.executionKey !== getExecutionKey()) {
        appendMessage("error", "This plan belongs to an older document, mode or scope. Ask AI to prepare it again.");
        return next;
      }
      let stages: string[][];
      try {
        stages = splitCommandStages(batch.commands);
      } catch (error) {
        appendMessage("error", error instanceof Error ? error.message : "Invalid command workflow.");
        return next;
      }
      const completed = [...(batch.completedSteps ?? [])];
      const validations: import("../../ai/types").ValidationReport[] = [];
      const remaining = (index: number) => stages.slice(index).flat();
      for (let index = 0; index < stages.length; index++) {
        if (liveState.current.document.generation !== state.document.generation) return next;
        if (requestAbort.current?.signal.aborted) return next;
        const controller = liveConsole.current;
        const stageState = liveState.current;
        if (index > 0)
          next = {
            ...next,
            graphRevision: current.current.graphRevision,
            activePlan: next.activePlan
              ? {
                  ...next.activePlan,
                  scope: { ...next.activePlan.scope, graphRevisionBase: current.current.graphRevision },
                }
              : undefined,
          };
        const prepared = controller.prepareSource(stages[index].join("\n"));
        const stageBatch = {
          ...batch,
          commands: stages[index],
          completedSteps: completed,
          executionKey: controller.getExecutionKey(),
        };
        const validation = validateCommandBatch({
          prepared: prepared.execution,
          batch: stageBatch,
          dag: stageState.dag,
          contextNodeKey: controller.contextNodeKey,
          appearance: controller.getEnvironment().style?.appearance ?? appearance,
          graphRevision: `${graphRevision}:step-${index}`,
          chartType: stageState.chartType,
        });
        validations.push(validation);
        next = attachValidationToHarness(next, validation);
        if (next.activePlan) upsertReview(buildConsoleReviewCard(next.activePlan, validation));
        if (!shouldExecuteValidatedBatch(validation)) {
          const pending = {
            ...batch,
            commands: remaining(index),
            completedSteps: completed,
            executionKey: controller.getExecutionKey(),
            validation,
          };
          next = {
            ...next,
            pendingCommandBatch: pending,
            activePlan: next.activePlan ? { ...next.activePlan, commandBatch: pending } : undefined,
          };
          appendMessage(
            "error",
            `${completed.length} step(s) completed. Remaining steps were not applied. ${formatValidationReport(validation)}`,
          );
          return next;
        }
        if (stages.length > 1) appendMessage("info", `Step ${index + 1}/${stages.length}: ${stages[index].join("; ")}`);
        recordInput("ai>", stages[index].join("\n"));
        runningLayout.current =
          prepared.execution.ok &&
          prepared.execution.runtimeEffects.some((effect) => effect.family === "layout" && effect.action !== "cancel");
        const applied = await controller.executePrepared(prepared);
        runningLayout.current = false;
        if (!applied) {
          const pending = {
            ...batch,
            commands: remaining(index),
            completedSteps: completed,
            executionKey: liveConsole.current.getExecutionKey(),
          };
          appendMessage(
            "error",
            `Step failed. ${completed.length} completed step(s) remain undoable; later steps were not applied.`,
          );
          return {
            ...next,
            pendingCommandBatch: pending,
            activePlan: next.activePlan ? { ...next.activePlan, commandBatch: pending } : undefined,
          };
        }
        completed.push(stages[index].join("\n"));
        if (index < stages.length - 1) {
          const pending = {
            ...batch,
            commands: remaining(index + 1),
            completedSteps: [...completed],
            executionKey: "stale",
          };
          next = {
            ...next,
            pendingCommandBatch: pending,
            activePlan: next.activePlan ? { ...next.activePlan, commandBatch: pending } : undefined,
          };
        }
        if (index < stages.length - 1) {
          // React must publish the preceding transaction before preparing dependent work.
          const execution = prepared.execution;
          if (!execution.ok) return next;
          const expectedDag = execution.mutationCount ? execution.dag : stageState.dag;
          const needsCommit = execution.mutationCount > 0 || execution.appearanceMutationCount > 0;
          const deadline = Date.now() + 5000;
          do {
            await new Promise((resolve) => window.setTimeout(resolve, 16));
            if (liveState.current.document.generation !== state.document.generation) return next;
            if (!needsCommit || liveState.current.editHistory.revision !== stageState.editHistory.revision) break;
          } while (Date.now() < deadline);
          if (
            needsCommit &&
            (liveState.current.dag !== expectedDag ||
              liveState.current.editHistory.revision === stageState.editHistory.revision)
          ) {
            appendMessage("error", "Document changed before the next dependent step. Completed steps remain undoable.");
            const pending = {
              ...batch,
              commands: remaining(index + 1),
              completedSteps: completed,
              executionKey: "stale",
            };
            return {
              ...next,
              pendingCommandBatch: pending,
              activePlan: next.activePlan ? { ...next.activePlan, commandBatch: pending } : undefined,
            };
          }
          if (next.pendingCommandBatch) next.pendingCommandBatch.executionKey = liveConsole.current.getExecutionKey();
          // Layout may be recomputing because the prior step edited graph structure.
          if (stages[index + 1][0].startsWith("/layout ")) {
            const waitUntil = Date.now() + 10000;
            while (
              !liveConsole.current.getEnvironment().layout?.ready &&
              Date.now() < waitUntil &&
              !requestAbort.current?.signal.aborted
            )
              await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
        }
      }
      if (validations.length) {
        const validation = {
          ...validations.at(-1)!,
          results: validations.flatMap((report) => report.results),
          summary: `Completed ${completed.length} step(s). Each edit batch is independently undoable.`,
          riskLevel: batch.riskLevel,
        };
        next = { ...next, pendingCommandBatch: { ...batch, completedSteps: completed, validation } };
        next = attachValidationToHarness(next, validation);
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
      prepareSource,
      executePrepared,
      getExecutionKey,
      recordInput,
      state.dag,
      upsertReview,
    ],
  );

  const request = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message || busyRef.current) return;
      const turnId = createTurnId();
      let next = runtimeHarness();
      recordInput("ask>", message);
      if (isExecutionApproval(message) && next.pendingCommandBatch) {
        requestAbort.current = new AbortController();
        busyRef.current = true;
        setBusy(true);
        try {
          const result = await validateAndExecute(next);
          if (current.current.documentGeneration === state.document.generation) setHarness(result);
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
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
      const timeout = window.setTimeout(() => abort.abort(), 180000);
      const isCurrent = () =>
        generation === requestGeneration.current &&
        snapshot.executionKey === current.current.executionKey &&
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
          environment: getEnvironment(),
          executionKey: snapshot.executionKey,
          readOnly: isAnalysisOnlyRequest(message),
        });
        const response = await runInspectionLoop({
          context,
          signal: abort.signal,
          isCurrent,
          request: (packet) =>
            requestAiPlan({
              settings,
              context: packet,
              message,
              signal: abort.signal,
              onProgress: (event) => {
                if (isCurrent() && !abort.signal.aborted) onProgress(event);
              },
            }),
          inspect: async (commands) => {
            const prepared = prepareSource(commands.join("\n"), true);
            const result = prepared.execution;
            return result.ok
              ? { ok: true, queries: result.queryResults, output: result.outputMessages }
              : { ok: false, code: "INSPECTION_FAILED", line: result.line, message: result.message };
          },
          onInspection: (round, commands) => appendMessage("info", `AI inspection ${round}: ${commands.join("; ")}`),
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
        if (context.execution.readOnly)
          throw new Error("This request is analysis-only. AI attempted an edit; no changes were applied.");
        const plan = createPlanFromAiResponse({ response, harness: next, turnId, userMessage: message });
        if (plan.commandBatch) plan.commandBatch.executionKey = snapshot.executionKey;
        next = installPlan(next, plan);
        appendMessage("ai", response.answer);
        if (!next.pendingCommandBatch) appendMessage("ai-action", plan.ui.displaySummary);
        const applied = await validateAndExecute(next);
        if (
          generation === requestGeneration.current &&
          current.current.documentGeneration === state.document.generation
        )
          setHarness(applied);
      } catch (error) {
        if (!isCurrent()) {
          if (generation === requestGeneration.current)
            appendMessage("info", "AI response discarded because its document, mode, scope or settings changed.");
          return;
        }
        const messageText = error instanceof Error ? error.message : "AI request failed.";
        appendMessage("error", messageText);
        setHarness(next);
      } finally {
        window.clearTimeout(timeout);
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
      state.document.generation,
      state.chartType,
      state.layout.mode,
      state.mode,
      state.selection,
      validateAndExecute,
      getEnvironment,
      prepareSource,
    ],
  );

  const applyReview = useCallback(
    async (planId: string) => {
      if (busyRef.current) return;
      const next = runtimeHarness();
      if (next.activePlan?.id !== planId || !next.pendingCommandBatch) {
        appendMessage("error", "No matching pending AI plan is available.");
        return;
      }
      requestAbort.current = new AbortController();
      busyRef.current = true;
      setBusy(true);
      try {
        const applied = await validateAndExecute(next);
        if (current.current.documentGeneration === state.document.generation) setHarness(applied);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [appendMessage, runtimeHarness, validateAndExecute, state.document.generation],
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
    cancel: () => {
      requestAbort.current?.abort();
      if (runningLayout.current) void liveConsole.current.runSource("/layout cancel");
    },
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
