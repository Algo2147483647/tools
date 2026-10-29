import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { executionFingerprint } from "../../console/snapshot";
import { parseToolOperations } from "../../ai/tools/catalog";
import { executeConsoleInstructions } from "../../console/executor";
import type { ConsoleEnvironment } from "../../console/runtime";
import type { DomainInstruction } from "../../console/domainRegistry";
import type { ConsoleEntry } from "../../console/types";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import { createGraphDocument } from "../../graph/normalize";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { NodeKey } from "../../graph/types";
import type { GraphAppState } from "../document/initialState";
import type { GraphTransactionsController } from "../document/useGraphTransactions";
import { useConsoleInput } from "./useConsoleInput";
import type { ToolResult } from "../../ai/tools/loop";

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
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const nextEntryId = useRef(1);
  useEffect(() => setEntries([]), [state.document.generation]);
  const appendMessage = useCallback((tone: ConsoleEntry["tone"], text: string) => {
    const entry = { id: nextEntryId.current++, tone, text };
    setEntries((current) => [...current, entry]);
  }, []);
  const inputState = useConsoleInput(state.document.generation);
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
      getEnvironment?.().style,
      getEnvironment?.().view,
    ]);
  const latest = useRef({ state, getExecutionKey });
  latest.current = { state, getExecutionKey };
  const runTool = async (name: string, args: unknown, readOnly: boolean, signal: AbortSignal): Promise<ToolResult> => {
    const base = getExecutionKey();
    const failure = (code: string, message: string, operation?: number): ToolResult => ({
      ok: false,
      tool: name,
      revision: latest.current.getExecutionKey(),
      error: { code, message, operation },
    });
    if (signal.aborted) return failure("CANCELLED", "Request cancelled.");
    let instructions;
    try {
      instructions = parseToolOperations(name, args, { dag: state.dag, chartType: state.chartType }, readOnly);
    } catch (error) {
      return failure("INVALID_ARGUMENTS", error instanceof Error ? error.message : "Invalid tool arguments.");
    }
    const executed = executeConsoleInstructions(
      state.dag ?? createGraphDocument(),
      instructions,
      appearance,
      state.chartType,
      getEnvironment?.(),
    );
    if (!executed.ok) return failure("VALIDATION_FAILED", executed.message, executed.line);
    if (signal.aborted || latest.current.getExecutionKey() !== base)
      return failure("STALE_CONTEXT", "Document, view or settings changed before execution.");
    if (executed.mutationCount || executed.appearanceMutationCount) {
      let committed = true;
      flushSync(() => {
        const label = `AI: ${name} (${instructions.length} operations)`;
        if (state.dag) committed = transactions.commitPrepared(executed, label);
        else commitAppearance(executed.appearance, label, false, executed.style.timeline);
      });
      if (!committed) return failure("COMMIT_FAILED", "Transaction could not be committed.");
    }
    for (const effect of executed.uiEffects)
      flushSync(() => openNodeDetail(effect.nodeKey, effect.type === "json" ? "raw" : "fields"));
    const runtimeResults = [];
    for (const effect of executed.runtimeEffects) {
      if (!runRuntime) return failure("UNAVAILABLE", "Runtime service is unavailable.");
      let pending!: Promise<{ ok: boolean; message: string }>;
      flushSync(() => {
        pending = runRuntime(effect);
      });
      const result = await pending.catch((error) => ({
        ok: false,
        message: error instanceof Error ? error.message : "Runtime failed.",
      }));
      if (
        latest.current.state.document.generation !== state.document.generation ||
        (effect.family === "layout" && latest.current.state.chartType !== state.chartType)
      )
        return failure("STALE_CONTEXT", "Document or chart changed during runtime execution.");
      if (!result.ok) return failure("RUNTIME_FAILED", result.message);
      runtimeResults.push(result);
    }
    const result: ToolResult = {
      ok: true,
      tool: name,
      revision: latest.current.getExecutionKey(),
      data: { queries: executed.queryResults, messages: executed.outputMessages, runtime: runtimeResults },
      effects: {
        graphEdits: executed.mutationCount,
        styleEdits: executed.appearanceMutationCount,
        runtime: executed.runtimeEffects.length,
        viewers: executed.uiEffects.length,
      },
      diff: executed.diff,
    };
    appendMessage("ai-action", `${name}: completed${executed.diff.length ? "\n" + executed.diff.join("\n") : ""}`);
    return result;
  };
  return {
    ...inputState,
    entries,
    appendMessage,
    runTool,
    getExecutionKey,
    getEnvironment: () => getEnvironment?.() ?? {},
    capabilityContext: { dag: state.dag, chartType: state.chartType },
    cancelLayout: () => runRuntime?.({ type: "domain", family: "layout", action: "cancel", args: {}, line: 1 }),
  };
}
export type ConsoleController = ReturnType<typeof useConsoleController>;
