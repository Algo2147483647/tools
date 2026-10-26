import { executionFingerprint } from "../../console/snapshot";
import { parseCompoundLayoutCommand } from "../../console/compoundLayout";
import { isReadOnlyInstruction } from "../../console/presentation";
import type { ConsoleInstruction } from "../../console/dsl";
import type { ConsoleRunResult } from "../../console/execution/types";
import type { ConsoleEnvironment } from "../../console/runtime";
import type { DomainInstruction } from "../../console/domainRegistry";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseConsoleSource } from "../../console/dsl";
import { executeConsoleInstructions } from "../../console/executor";
import {
  buildConsolePrompt,
  buildConsoleSuccessMessage,
  requiresGraphForConsoleInstruction,
} from "../../console/presentation";
import type { ConsoleEntry, ConsoleReviewCard } from "../../console/types";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import { createGraphDocument } from "../../graph/normalize";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { NodeKey } from "../../graph/types";
import type { GraphAppState } from "../document/initialState";
import { useConsoleInput } from "./useConsoleInput";
import type { GraphTransactionsController } from "../document/useGraphTransactions";

type Ask = (message: string) => Promise<void>;

export function useConsoleController({
  state,
  appearance,
  transactions,
  commitAppearance,
  openNodeDetail,
  getEnvironment,
  runRuntime,
}: {
  state: GraphAppState;

  appearance: GraphAppearance;
  transactions: Pick<GraphTransactionsController, "commitPrepared">;
  commitAppearance: (
    next: GraphAppearance,
    label: string,
    resetDisplay?: boolean,
    timeline?: TimelineViewSettings,
  ) => void;
  openNodeDetail: (key: NodeKey, focus?: "fields" | "raw") => void;
  getEnvironment?: () => ConsoleEnvironment;
  runRuntime?: (instruction: DomainInstruction) => Promise<{ ok: boolean; message: string }>;
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

  const inputState = useConsoleInput(state.document.generation, appendMessage, {
    dag: state.dag,
    chartType: state.chartType,
  });
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

  const getExecutionKey = () =>
    executionFingerprint([
      state.document.generation,
      state.editHistory.revision,
      state.chartType,
      state.selection,
      state.layout.mode,
      state.timelineSettings,
      state.layoutSession.data,
      appearance,
      contextNodeKey,
      getEnvironment?.().style,
      getEnvironment?.().view,
    ]);
  const prepareSource = (rawSource: string, readOnly = false): PreparedConsoleSource => {
    let source = rawSource.trim();
    // Compatibility alias uses the same parser, validation and runtime service.
    if (/^\/compound-layout(?:\s|$)/.test(source)) {
      try {
        if (state.chartType !== "compound") throw new Error("Compound layout requires the compound view.");
        const legacy = parseCompoundLayoutCommand(source);
        source =
          legacy.type === "propose"
            ? `/layout run ${JSON.stringify({ intent: legacy.intent })}`
            : `/layout ${legacy.type}${"groupId" in legacy && legacy.groupId !== undefined ? " " + JSON.stringify({ scope: legacy.groupId ?? "root" }) : ""}`;
      } catch (error) {
        return {
          source,
          base: getExecutionKey(),
          instructions: [],
          execution: {
            ok: false,
            line: 1,
            contextNodeKey,
            message: error instanceof Error ? error.message : "Invalid layout command.",
          },
        };
      }
    }
    const base = getExecutionKey();
    const parsed = parseConsoleSource(source);
    if (!parsed.ok)
      return { source, base, instructions: [], execution: { ok: false, ...parsed.error, contextNodeKey } };
    let error = !parsed.instructions.length ? "No instructions were found." : "";
    if (!state.dag && parsed.instructions.some((instruction) => requiresGraphForConsoleInstruction(instruction.type)))
      error = "No graph loaded.";
    if (readOnly && parsed.instructions.some((instruction) => !isReadOnlyInstruction(instruction)))
      error = "Inspection only permits read-only queries.";
    return {
      source,
      base,
      instructions: parsed.instructions,
      execution: error
        ? { ok: false, line: 1, message: error, contextNodeKey }
        : executeConsoleInstructions(
            state.dag || createGraphDocument(),
            parsed.instructions,
            contextNodeKey,
            appearance,
            state.chartType,
            getEnvironment?.(),
          ),
    };
  };
  const committedBase = useRef<string | null>(null);
  const latest = useRef({ state, getExecutionKey });
  latest.current = { state, getExecutionKey };
  const executePrepared = async (prepared: PreparedConsoleSource): Promise<boolean> => {
    const executed = prepared.execution;
    if (latest.current.getExecutionKey() !== prepared.base) {
      appendMessage("error", "Document, view or settings changed. Prepare the operation again.");
      return false;
    }
    if (!executed.ok) {
      appendMessage("error", `Line ${executed.line}: ${executed.message}`);
      return false;
    }
    if (executed.mutationCount || executed.appearanceMutationCount) {
      if (committedBase.current === prepared.base) {
        appendMessage("error", "A batch already committed against this revision. Wait for the view to update.");
        return false;
      }
      committedBase.current = prepared.base;
      const label = `Console: ${executed.mutationCount} graph edit(s), ${executed.appearanceMutationCount} style edit(s).`;
      if (state.dag) {
        if (!transactions.commitPrepared(executed, label)) return false;
      } else commitAppearance(executed.appearance, label, false, executed.style.timeline);
    }
    if (prepared.instructions.some((instruction) => instruction.type === "clear")) clear();
    setContextNodeKey(
      executed.contextNodeKey && executed.dag.nodes[executed.contextNodeKey] ? executed.contextNodeKey : null,
    );
    executed.outputMessages.forEach((message) => appendMessage("info", message));
    if (executed.diff.length) appendMessage("info", executed.diff.join("\n"));
    const finalUiEffect = executed.uiEffects.filter((effect) => executed.dag.nodes[effect.nodeKey]).at(-1);
    if (finalUiEffect) openNodeDetail(finalUiEffect.nodeKey, finalUiEffect.type === "json" ? "raw" : "fields");
    for (const effect of executed.runtimeEffects) {
      if (!runRuntime) {
        appendMessage("error", "Runtime service is unavailable.");
        return false;
      }
      try {
        const result = await runRuntime(effect);
        if (latest.current.state.document.generation !== state.document.generation) return false;
        appendMessage(result.ok ? "success" : "error", result.message);
        if (!result.ok) return false;
      } catch (error) {
        appendMessage("error", error instanceof Error ? error.message : "Task failed.");
        return false;
      }
    }
    if (!executed.runtimeEffects.length)
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
  };
  const runSource = async (source: string): Promise<boolean> => {
    if (!source.trim()) return false;
    recordInput(buildConsolePrompt(contextNodeKey), source);
    return executePrepared(prepareSource(source));
  };

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
    prepareSource,
    executePrepared,
    getExecutionKey,
    getEnvironment: () => getEnvironment?.() ?? {},
    capabilityContext: { dag: state.dag, chartType: state.chartType },
    changeInput,
    handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, ask: Ask) =>
      inputState.handleKeyDown(event, ask, runSource),
    handlePaste: (event: React.ClipboardEvent<HTMLInputElement>, ask: Ask) =>
      inputState.handlePaste(event, ask, runSource),
  };
}
export type ConsoleController = ReturnType<typeof useConsoleController>;
export interface PreparedConsoleSource {
  source: string;
  base: string;
  instructions: ConsoleInstruction[];
  execution: ConsoleRunResult;
}
