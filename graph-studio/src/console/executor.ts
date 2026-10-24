import { type GraphAppearance,DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { type CommandResult } from "../graph/commands";
import { cloneGraphDocument } from "../graph/serialize";
import type { GraphChartType,NodeKey,NormalizedDag } from "../graph/types";
import { type AppearanceCommandResult,applyAppearanceCommand } from "../schema/appearanceCommands";
import type { ConsoleInstruction } from "./dsl";
import { buildConsoleHelpText } from "./reference";


import { resolveExistingNodeKey } from "./execution/context";
import { executeConsoleMutation } from "./execution/mutations";
import { buildDirectedPathSummary,buildFindResults,buildGraphStats,buildKeyList,buildNeighborSummary,buildNodeSummary } from "./execution/queries";
import type { ConsoleRunResult,ConsoleUiEffect } from "./execution/types";
export { buildConsoleMutationLabel } from "./execution/formatting";

export function executeConsoleInstructions(
  dag: NormalizedDag,
  instructions: ConsoleInstruction[],
  initialContextNodeKey: NodeKey | null,
  appearance: GraphAppearance = DEFAULT_GRAPH_APPEARANCE,
  chartType?: GraphChartType,
): ConsoleRunResult {
  let workingDag = cloneGraphDocument(dag);
  let workingAppearance = appearance;
  let contextNodeKey = initialContextNodeKey;
  const results: CommandResult[] = [];
  const appearanceResults: AppearanceCommandResult[] = [];
  const uiEffects: ConsoleUiEffect[] = [];
  const outputMessages: string[] = [];

  for (const instruction of instructions) {
    try {
      switch (instruction.type) {
        case "help": {
          outputMessages.push(buildConsoleHelpText());
          break;
        }
        case "clear": {
          break;
        }
        case "appearanceCssShow": {
          outputMessages.push(workingAppearance.css || "(empty CSS)");
          break;
        }
        case "appearance": {
          const result = applyAppearanceCommand(workingAppearance, instruction.command, chartType);
          workingAppearance = result.appearance;
          appearanceResults.push(result);
          outputMessages.push(result.message);
          break;
        }
        case "keys": {
          outputMessages.push(buildKeyList(workingDag));
          break;
        }
        case "graphStats": {
          outputMessages.push(buildGraphStats(workingDag));
          break;
        }
        case "find": {
          outputMessages.push(buildFindResults(workingDag, instruction.query));
          break;
        }
        case "neighbors": {
          const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
          outputMessages.push(buildNeighborSummary(key, workingDag, instruction.depth));
          break;
        }
        case "path": {
          const fromKey = resolveExistingNodeKey(instruction.fromKey, contextNodeKey, workingDag, instruction.line);
          const toKey = resolveExistingNodeKey(instruction.toKey, contextNodeKey, workingDag, instruction.line);
          outputMessages.push(buildDirectedPathSummary(fromKey, toKey, workingDag));
          break;
        }
        case "use": {
          const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
          contextNodeKey = key;
          break;
        }
        case "show": {
          const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
          uiEffects.push({ type: "show", nodeKey: key, line: instruction.line });
          break;
        }
        case "list": {
          const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
          outputMessages.push(buildNodeSummary(key, workingDag));
          break;
        }
        case "json": {
          const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
          uiEffects.push({ type: "json", nodeKey: key, line: instruction.line });
          break;
        }
        default: {
          const next = executeConsoleMutation(instruction, { workingDag, contextNodeKey, results, uiEffects, outputMessages });
          workingDag = next.workingDag;
          contextNodeKey = next.contextNodeKey;
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The console instruction failed.";
      return { ok: false, line: instruction.line, message, contextNodeKey };
    }
  }

  return {
    ok: true,
    dag: workingDag,
    appearance: workingAppearance,
    contextNodeKey,
    results,
    appearanceResults,
    uiEffects,
    outputMessages,
    instructionCount: instructions.length,
    mutationCount: results.length,
    appearanceMutationCount: appearanceResults.length,
  };
}
