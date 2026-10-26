import { getAppearanceSchema } from "../schema/appearance/schema";
import { domainAvailability, getDomainCommand } from "./domainRegistry";
import { inspectDomain, mutateDomain, queryPage } from "./domains";
import type { QueryResult } from "./domains";
import type { DomainInstruction } from "./domainRegistry";
import { validateRuntimeInstruction, type ConsoleEnvironment } from "./runtime";
import { buildGraphDiff, diffValues, limitDiff } from "./changes";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { getGraphPresetStyle } from "../schema/appearance/commands";
import { updateAppearanceSchemaValue } from "../schema/styleProtocol";
import { getSankeyError } from "../graph/sankey";
import { getSpaceMetadata } from "../graph/space";
import { indexHierarchy } from "../graph/compound/hierarchy";
import { type GraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { type CommandResult } from "../graph/commands";
import { cloneGraphDocument } from "../graph/serialize";
import type { GraphChartType, NodeKey, NormalizedDag } from "../graph/types";
import { type AppearanceCommandResult, applyAppearanceCommand } from "../schema/appearance/commands";
import type { ConsoleInstruction } from "./dsl";
import { buildConsoleHelpText } from "./reference";

import { remapContextKey, syncUiEffects, resolveExistingNodeKey } from "./execution/context";
import { executeConsoleMutation } from "./execution/mutations";
import {
  buildDirectedPathSummary,
  buildFindResults,
  buildGraphStats,
  buildKeyList,
  buildNeighborSummary,
  buildNodeSummary,
} from "./execution/queries";
import type { ConsoleRunResult, ConsoleUiEffect } from "./execution/types";
export { buildConsoleMutationLabel } from "./execution/formatting";

export function executeConsoleInstructions(
  dag: NormalizedDag,
  instructions: ConsoleInstruction[],
  initialContextNodeKey: NodeKey | null,
  appearance: GraphAppearance = DEFAULT_GRAPH_APPEARANCE,
  chartType: GraphChartType = "node-link",
  environment: ConsoleEnvironment = {},
): ConsoleRunResult {
  let workingDag = cloneGraphDocument(dag);
  let workingAppearance = appearance;
  const referenceTime = environment.referenceTime ?? Date.now();
  const initialStyle = environment.style ?? { ...getDefaultChartStyle(chartType), appearance };
  let workingStyle = initialStyle;
  const queryResults: QueryResult[] = [];
  const runtimeEffects: DomainInstruction[] = [];
  let contextNodeKey = initialContextNodeKey;
  const results: CommandResult[] = [];
  const appearanceResults: AppearanceCommandResult[] = [];
  const uiEffects: ConsoleUiEffect[] = [];
  const outputMessages: string[] = [];

  for (const instruction of instructions) {
    try {
      switch (instruction.type) {
        case "domain": {
          const definition = getDomainCommand(instruction.family, instruction.action);
          const unavailable = domainAvailability(definition, { dag: workingDag, chartType });
          if (unavailable) throw new Error(unavailable);
          if (definition.effect === "query") {
            let result: QueryResult;
            if (instruction.family === "style") {
              if (instruction.args.path !== undefined && typeof instruction.args.path !== "string")
                throw new Error("path must be a string.");
              const fields = [...getAppearanceSchema(chartType, workingStyle).entries]
                .filter(
                  ([path, field]) =>
                    field.supported && (!instruction.args.path || path.startsWith(String(instruction.args.path))),
                )
                .map(([path, field]) => ({
                  path,
                  editable: field.editable,
                  type: field.definition.kind,
                  value: field.value,
                  description: field.definition.description,
                }));
              result = queryPage("/style inspect", fields, instruction.args);
            } else if (instruction.family === "view" || instruction.family === "layout") {
              validateRuntimeInstruction(instruction, chartType, environment);
              result = {
                command: `/${instruction.family} ${instruction.action}`,
                data:
                  instruction.family === "view"
                    ? environment.view
                    : {
                        ...environment.layout,
                        detail: environment.inspectLayout?.(instruction.args.scope as string | undefined),
                      },
              };
            } else result = inspectDomain(workingDag, instruction, referenceTime);
            queryResults.push(result);
            outputMessages.push(JSON.stringify(result, null, 2));
          } else if (definition.effect === "document") {
            const result = mutateDomain(workingDag, instruction, chartType, referenceTime);
            workingDag = result.dag;
            contextNodeKey = remapContextKey(contextNodeKey, result);
            syncUiEffects(uiEffects, result);
            results.push(result);
          } else if (definition.effect === "style") {
            if (typeof instruction.args.path !== "string" || !("value" in instruction.args))
              throw new Error("style set requires path and value.");
            workingStyle = updateAppearanceSchemaValue(
              chartType,
              workingStyle,
              instruction.args.path,
              instruction.args.value,
            );
            workingAppearance = workingStyle.appearance;
            appearanceResults.push({
              appearance: workingAppearance,
              message: `Updated ${instruction.args.path}.`,
              diff: [],
            });
          } else {
            if (instructions.length !== 1)
              throw new Error("View and layout tasks must run separately from edit batches.");
            validateRuntimeInstruction(instruction, chartType, environment);
            if (
              instruction.family === "view" &&
              instruction.action === "group" &&
              instruction.args.id !== null &&
              !indexHierarchy(workingDag).groups.has(String(instruction.args.id))
            )
              throw new Error("Unknown group.");
            if (instruction.family === "view" && instruction.action === "set") {
              const patch = instruction.args.patch as Record<string, unknown>;
              const metadata = getSpaceMetadata(workingDag)!;
              const dimensions = Math.max(3, metadata.dimensions);
              if (Array.isArray(patch.axes) && patch.axes.some((axis) => axis >= dimensions))
                throw new Error("Projection axis exceeds coordinate dimensions.");
              if (patch.projection === "map" && !["geographic", "spherical"].includes(metadata.coordinateSystem))
                throw new Error("Map projection requires geographic or spherical coordinates.");
            }
            if (
              instruction.family === "view" &&
              instruction.action === "timeline" &&
              instruction.args.track &&
              !Object.values(workingDag.nodes).some((node) => node.track === instruction.args.track)
            )
              throw new Error("Unknown track. Assign an event to this track first.");
            runtimeEffects.push(instruction);
          }
          break;
        }
        case "help": {
          outputMessages.push(buildConsoleHelpText({ dag: workingDag, chartType }, instruction.all));
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
          workingStyle =
            instruction.command.type === "resetAppearance" || instruction.command.type === "applyPreset"
              ? getGraphPresetStyle(
                  chartType,
                  instruction.command.type === "applyPreset" ? instruction.command.presetId : "default",
                )
              : { ...workingStyle, appearance: workingAppearance };
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
          const next = executeConsoleMutation(instruction, {
            workingDag,
            referenceTime,
            contextNodeKey,
            results,
            uiEffects,
            outputMessages,
          });
          workingDag = next.workingDag;
          if (chartType === "sankey" || workingDag.diagram === "sankey") {
            const error = getSankeyError(workingDag.nodes, workingDag.edges);
            if (error) throw new Error(error);
          }
          contextNodeKey = next.contextNodeKey;
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The console instruction failed.";
      return { ok: false, line: instruction.line, message, contextNodeKey: initialContextNodeKey };
    }
  }

  return {
    ok: true,
    dag: workingDag,
    style: workingStyle,
    queryResults,
    runtimeEffects,
    referenceTime,
    diff: limitDiff([...buildGraphDiff(dag, workingDag), ...diffValues(initialStyle, workingStyle, "style")]),
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
