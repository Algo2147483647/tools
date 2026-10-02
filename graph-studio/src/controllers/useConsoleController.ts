import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseConsoleSource } from "../console/dsl";
import { buildConsoleMutationLabel, executeConsoleInstructions } from "../console/executor";
import {
  buildConsolePrompt,
  buildConsoleSuccessMessage,
  getConsoleSuggestions,
  requiresGraphForConsoleInstruction,
} from "../console/presentation";
import type { ConsoleEntry, ConsoleReviewCard } from "../console/types";
import type { GraphAppearance } from "../graph/appearance";
import { buildAppearanceMutationLabel } from "../graph/appearanceCommands";
import { createGraphDocument } from "../graph/normalize";
import type { NodeKey } from "../graph/types";
import type { GraphAppState } from "../state/initialState";
import type { GraphTransactionsController } from "./useGraphTransactions";

type Ask = (message: string) => Promise<void>;

export function useConsoleController({
  state,
  appearance,
  transactions,
  commitAppearance,
  openNodeDetail,
}: {
  state: GraphAppState;

  appearance: GraphAppearance;
  transactions: Pick<GraphTransactionsController, "commitBatch">;
  commitAppearance: (next: GraphAppearance, label: string) => void;
  openNodeDetail: (key: NodeKey, focus?: "fields" | "raw") => void;
}) {
  const [input, setInput] = useState("");
  const [contextNodeKey, setContextNodeKey] = useState<NodeKey | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([{ id: 1, tone: "info", text: "Graph console ready." }]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const nextEntryId = useRef(2);
  useEffect(() => {
    setEntries([{ id: nextEntryId.current++, tone: "info", text: "Graph console ready." }]);
    setInput("");
    setContextNodeKey(null);
    setHistory([]);
    setHistoryIndex(null);
    setActiveSuggestionIndex(0);
  }, [state.document.generation]);
  const suggestions = useMemo(() => getConsoleSuggestions(input), [input]);

  useEffect(() => {
    if (contextNodeKey && !state.dag?.nodes[contextNodeKey]) setContextNodeKey(null);
  }, [contextNodeKey, state.dag]);

  const appendMessage = useCallback((tone: Exclude<ConsoleEntry["tone"], "ai-review">, text: string) => {
    const entry = { id: nextEntryId.current++, tone, text };
    setEntries((current) => [...current, entry]);
  }, []);

  const recordInput = useCallback(
    (prompt: string, source: string) => {
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => appendMessage("input", `${prompt} ${line}`));
      setHistory((current) => (current[current.length - 1] === source ? current : [...current, source]));
      setHistoryIndex(null);
    },
    [appendMessage],
  );

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
        commitAppearance(executed.appearance, label);
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
      appendMessage,
      clear,
      commitAppearance,
      contextNodeKey,
      openNodeDetail,
      recordInput,
      state.dag,
      transactions.commitBatch,
    ],
  );

  const changeInput = useCallback((value: string) => {
    setInput(value);
    setHistoryIndex(null);
    setActiveSuggestionIndex(0);
  }, []);

  function submit(source: string, ask: Ask) {
    if (!source.trim()) return;
    if (source.trimStart().startsWith("/")) runSource(source);
    else void ask(source);
    changeInput("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, ask: Ask) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit(input, ask);
    } else if (event.key === "Tab" && suggestions.length) {
      event.preventDefault();
      changeInput(suggestions[activeSuggestionIndex]?.insertText || input);
    } else if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestionIndex((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (history.length && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (event.key === "ArrowDown" && historyIndex === null) return;
      const next =
        event.key === "ArrowUp"
          ? historyIndex === null
            ? history.length - 1
            : Math.max(0, historyIndex - 1)
          : historyIndex! + 1;
      setHistoryIndex(next >= history.length ? null : next);
      setInput(history[next] || "");
      setActiveSuggestionIndex(0);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>, ask: Ask) {
    const pasted = event.clipboardData.getData("text");
    if (!/\r?\n/.test(pasted)) return;
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    const start = selectionStart ?? value.length;
    event.preventDefault();
    submit(`${value.slice(0, start)}${pasted}${value.slice(selectionEnd ?? start)}`, ask);
  }

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
    handleKeyDown,
    handlePaste,
  };
}

export type ConsoleController = ReturnType<typeof useConsoleController>;
