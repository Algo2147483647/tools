import { boundedInspectionResult } from "../session/inspection";
import { getConsoleCommandReference } from "../../console/reference";
import { type GraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../../schema/appearance/defaults";
import type {
  GraphChartType,
  GraphLayoutMode,
  GraphMode,
  GraphSelection,
  NodeKey,
  NormalizedDag,
} from "../../graph/types";
import type { AiContextPacket, AiHarnessState } from "../types";
import { buildAiGraphContext } from "./graph";

interface ConsoleHistoryEntry {
  tone: string;
  text: string;
}

interface BuildContextInput {
  harness: AiHarnessState;
  environment?: import("../../console/runtime").ConsoleEnvironment;
  executionKey?: string;
  readOnly?: boolean;
  dag: NormalizedDag | null;
  mode: GraphMode;
  layoutMode: GraphLayoutMode;
  chartType?: GraphChartType;
  selection: GraphSelection | null;
  contextNodeKey: NodeKey | null;

  appearance?: GraphAppearance;
  consoleEntries: ConsoleHistoryEntry[];
}

export function buildAiContextPacket(input: BuildContextInput): AiContextPacket {
  const graphContext = buildAiGraphContext({
    dag: input.dag,
    mode: input.mode,
    layoutMode: input.layoutMode,
    chartType: input.chartType,
    selection: input.selection,
    contextNodeKey: input.contextNodeKey,
    appearance: input.appearance || DEFAULT_GRAPH_APPEARANCE,
  });
  return {
    system: {
      role: "graph_editing_agent",
      language: "auto",
      responseProtocolVersion: "v2",
      editPolicy: {
        execution: "validate_then_execute",
      },
    },
    graph: {
      ...graphContext,
      domain: boundedInspectionResult(graphContext.domain) as Record<string, unknown>,
      graphRevision: input.harness.graphRevision,
      currentSelection: formatSelectionKeys(input.selection),
      focusedNodes: input.contextNodeKey ? [input.contextNodeKey] : [],
    },
    tools: {
      availableCommands: graphContext.commandReference,
      commandExamples: getConsoleCommandReference({ dag: input.dag, chartType: input.chartType ?? "node-link" })
        .filter((command) => !command.label.startsWith("/compound-layout"))
        .slice(0, 16)
        .map((command) => command.insertText),
      constraints: [
        "All commands must start with /.",
        "Domain commands take one JSON object. Consult the current capability catalog; never invent commands.",
        "Ordinary edges and hierarchy_edges are independent. /rm -r traverses ordinary edges; /group delete traverses containment.",
        "Times follow the document clock; coordinates follow metadata.space. Camera and layout changes must not rewrite domain data.",
        "Domain query pages include total and nextOffset; request additional pages rather than assuming omitted records are absent.",
        "View and layout commands form separate workflow steps between atomic edit batches. Return commands in dependency order. Query results are returned automatically for another reasoning turn.",
        "Use /find, /ls, /neighbors, /path, or /graph when more graph facts are needed.",
        "Do not reference missing nodes unless the same command batch creates them first or uses /edge --create-missing.",
        "Use /set for title, type, define, and other non-relation fields.",
        "Use /parents, /children, /edge, or /rm-edge for relation fields.",
        "Use /style-var, /style-css, /style-preset, /style-reset, and /appearance-set for UI appearance changes.",
        "Only use --dag-* CSS variables and stable .dag-* SVG selectors for appearance CSS.",
      ],
    },
    memory: {
      consoleHistory: input.consoleEntries.slice(-40).map(({ tone, text }) => ({ tone, text: text.slice(0, 4000) })),
      activePlan: input.harness.activePlan,
      workingMemory: input.harness.workingMemory,
    },
    execution: {
      executionKey: input.executionKey,
      readOnly: input.readOnly,
      view: input.environment?.view,
      pendingCommandBatch: input.harness.pendingCommandBatch,
      lastValidation: input.harness.pendingCommandBatch?.validation || input.harness.activePlan?.validation,
    },
  };
}

function formatSelectionKeys(selection: GraphSelection | null): string[] {
  if (!selection) {
    return [];
  }
  if (selection.type === "node") {
    return [selection.key];
  }
  if ("keys" in selection) {
    return selection.keys;
  }
  return [];
}
