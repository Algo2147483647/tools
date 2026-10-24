import { useCallback, useEffect, useRef, useState } from "react";
import { parseConsoleSource } from "../console/dsl";
import { buildConsoleMutationLabel, executeConsoleInstructions } from "../console/executor";
import {
  buildConsolePrompt,
  buildConsoleSuccessMessage,
  requiresGraphForConsoleInstruction,
} from "../console/presentation";
import type { ConsoleEntry, ConsoleReviewCard } from "../console/types";
import type { GraphAppearance } from "../graph/appearance";
import { createGraphDocument } from "../graph/normalize";
import type { TimelineViewSettings } from "../graph/timeline/settings";
import type { NodeKey } from "../graph/types";
import { buildAppearanceMutationLabel, getGraphPresetStyle } from "../schema/appearanceCommands";
import type { GraphAppState } from "../state/initialState";
import { useConsoleInput } from "./console/useConsoleInput";
import type { GraphTransactionsController } from "./useGraphTransactions";

type Ask = (message: string) => Promise<void>;

export function useConsoleController({
  state,
  appearance,
  transactions,
  commitAppearance,
  openNodeDetail,
  runLayoutCommand,
}: {
  state: GraphAppState;

  appearance: GraphAppearance;
  transactions: Pick<GraphTransactionsController, "commitBatch">;
  commitAppearance: (
    next: GraphAppearance,
    label: string,
    resetDisplay?: boolean,
    timeline?: TimelineViewSettings,
  ) => void;
  openNodeDetail: (key: NodeKey, focus?: "fields" | "raw") => void;
  runLayoutCommand?: (source: string) => boolean;
}) {
  const [contextNodeKey, setContextNodeKey] = useState<NodeKey | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([{ id: 1, tone: "info", text: "Graph console ready." }]);
  const nextEntryId = useRef(2);
  useEffect(() => {
    setEntries([{ id: nextEntryId.current++, tone: "info", text: "Graph console ready." }]);
    setContextNodeKey(null);
  }, [state.document.generation]);

  useEffect(() => {
    if (contextNodeKey && !state.dag?.nodes[contextNodeKey]) setContextNodeKey(null);
  }, [contextNodeKey, state.dag]);

  const appendMessage = useCallback((tone: Exclude<ConsoleEntry["tone"], "ai-review">, text: string) => {
    const entry = { id: nextEntryId.current++, tone, text };
    setEntries((current) => [...current, entry]);
  }, []);

  const inputState = useConsoleInput(state.document.generation, appendMessage);
  const { input, suggestions, activeSuggestionIndex, recordInput, changeInput } = inputState;
  const upsertReview = useCallback((review: ConsoleReviewCard) => {
    const entry: ConsoleEntry = { id: nextEntryId.current++, tone: "ai-review", text: review.title, review };
    setEntries((current) =>
      current.some((item) => item.tone === "ai-review" && item.review.planId === review.planId)
        ? current.map((item) =>
            item.tone === "ai-review" && item.review.planId === review.planId ? { ...entry, id: item.id } : item,
          )
        : [...current, entry],
    );
  }, []);

  const setReviewStatus = useCallback((planId: string, status: ConsoleReviewCard["status"]) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.tone === "ai-review" && entry.review.planId === planId
          ? { ...entry, review: { ...entry.review, status, canApply: false } }
          : entry,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    const entry: ConsoleEntry = { id: nextEntryId.current++, tone: "info", text: "Console cleared." };
    setEntries([entry]);
  }, []);

  const runSource = useCallback(
    (rawSource: string): boolean => {
      const source = rawSource.trim();
      if (!source) return false;
      recordInput(buildConsolePrompt(contextNodeKey), source);
      if (/^\/compound-layout(?:\s|$)/.test(source)) {
        if (runLayoutCommand) return runLayoutCommand(source);
        appendMessage("error", "Nested layout commands are unavailable.");
        return false;
      }
      if (source === "/clear" || source === "/cls") {
        clear();
        return true;
      }
      const parsed = parseConsoleSource(source);
      if (!parsed.ok) {
        appendMessage("error", `Line ${parsed.error.line}: ${parsed.error.message}`);
        return false;
      }
      if (!parsed.instructions.length) {
        appendMessage("info", "No instructions were found.");
        return false;
      }
      if (parsed.instructions.some((instruction) => instruction.type === "clear")) clear();
      if (
        !state.dag &&
        parsed.instructions.some((instruction) => requiresGraphForConsoleInstruction(instruction.type))
      ) {
        appendMessage("error", "No graph loaded. Load or initialize a graph before running console instructions.");
        return false;
      }
      const executed = executeConsoleInstructions(
        state.dag || createGraphDocument(),
        parsed.instructions,
        contextNodeKey,
        appearance,
        state.chartType,
      );
      setContextNodeKey(executed.contextNodeKey);
      if (!executed.ok) {
        appendMessage(
          "error",
          executed.message.startsWith("Line ") ? executed.message : `Line ${executed.line}: ${executed.message}`,
        );
        return false;
      }
      executed.outputMessages.forEach((message) => appendMessage("info", message));
      if (executed.appearanceMutationCount > 0) {
        const label = buildAppearanceMutationLabel(
          executed.appearanceMutationCount,
          executed.appearanceResults.at(-1)?.message,
        );
        const resetCommand = parsed.instructions
          .flatMap((instruction) =>
            instruction.type === "appearance" &&
            (instruction.command.type === "resetAppearance" || instruction.command.type === "applyPreset")
              ? [instruction.command]
              : [],
          )
          .at(-1);
        const resetStyle = resetCommand
          ? getGraphPresetStyle(
              state.chartType,
              resetCommand.type === "applyPreset" ? resetCommand.presetId : "default",
            )
          : undefined;
        commitAppearance(executed.appearance, label, Boolean(resetStyle), resetStyle?.timeline);
        appendMessage("success", label);
      }
      if (executed.mutationCount > 0) {
        const label = buildConsoleMutationLabel(executed.mutationCount, executed.results.at(-1)?.message);
        if (!transactions.commitBatch(executed.results, label)) return false;
      }
      const finalUiEffect = executed.uiEffects.filter((effect) => effect.nodeKey).at(-1);
      if (finalUiEffect) openNodeDetail(finalUiEffect.nodeKey, finalUiEffect.type === "json" ? "raw" : "fields");
      appendMessage(
        "success",
        buildConsoleSuccessMessage(
          executed.instructionCount,
          executed.mutationCount,
          executed.appearanceMutationCount,
          executed.contextNodeKey,
          finalUiEffect?.type,
        ),
      );
      return true;
    },
    [
      appearance,
      runLayoutCommand,
      appendMessage,
      clear,
      commitAppearance,
      contextNodeKey,
      openNodeDetail,
      recordInput,
      state.dag,
      state.chartType,
      transactions.commitBatch,
    ],
  );

  return {
    entries,
    input,
    contextNodeKey,
    suggestions,
    activeSuggestionIndex,
    appendMessage,
    recordInput,
    upsertReview,
    setReviewStatus,
    runSource,
    changeInput,
    handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, ask: Ask) =>
      inputState.handleKeyDown(event, ask, runSource),
    handlePaste: (event: React.ClipboardEvent<HTMLInputElement>, ask: Ask) =>
      inputState.handlePaste(event, ask, runSource),
  };
}

export type ConsoleController = ReturnType<typeof useConsoleController>;
