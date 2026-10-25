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
      graphRevision: input.harness.graphRevision,
      currentSelection: formatSelectionKeys(input.selection),
      focusedNodes: input.contextNodeKey ? [input.contextNodeKey] : [],
    },
    tools: {
      availableCommands: graphContext.commandReference,
      commandExamples: [
        "/find Group",
        "/neighbors Group 2",
        "/add Subgroup -p Group",
        '/set Group define "A group is a set with an associative binary operation, an identity element, and inverses."',
        "/edge Group Representation_Theory",
        "/style-preset default",
        '/style-var --dag-node-fill "rgba(18, 24, 38, 0.94)"',
        '/style-css append ".dag-node[data-type=\\"service\\"] .dag-node__shape { fill: #eef6ff; }"',
        "/appearance-set nodes.spacing.row 34",
      ],
      constraints: [
        "All commands must start with /.",
        "Use /find, /ls, /neighbors, /path, or /graph when more graph facts are needed.",
        "Do not reference missing nodes unless the same command batch creates them first or uses /edge --create-missing.",
        "Use /set for title, type, define, and other non-relation fields.",
        "Use /parents, /children, /edge, or /rm-edge for relation fields.",
        "Use /style-var, /style-css, /style-preset, /style-reset, and /appearance-set for UI appearance changes.",
        "Only use --dag-* CSS variables and stable .dag-* SVG selectors for appearance CSS.",
      ],
    },
    memory: {
      consoleHistory: input.consoleEntries.map(({ tone, text }) => ({ tone, text })),
      activePlan: input.harness.activePlan,
      workingMemory: input.harness.workingMemory,
    },
    execution: {
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
