import { type GraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import type {
  GraphChartType,
  GraphLayoutMode,
  GraphMode,
  GraphSelection,
  NodeKey,
  NormalizedDag,
} from "../graph/types";
import { buildAiGraphContext } from "./context";
import { MAX_RECENT_EVENTS } from "./harnessUtils";
import type { AiContextPacket, AiEvent, AiHarnessState } from "./types";

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

const MAX_RECENT_CONSOLE_LINES = 16;

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
  const recentConsoleEvents = input.consoleEntries
    .slice(-MAX_RECENT_CONSOLE_LINES)
    .map((entry, index) => createSyntheticConsoleEvent(input.harness, index, entry));

  return {
    system: {
      role: "graph_editing_agent",
      language: "auto",
      responseProtocolVersion: "v2",
      editPolicy: {
        mode: input.harness.mode,
        autoEditEnabled: input.harness.mode === "auto-edit",
        requireReviewForDestructiveChanges: true,
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
        "/style-preset slate",
        '/style-var --dag-node-fill "rgba(18, 24, 38, 0.94)"',
        '/style-css append ".dag-node[data-type=\\"service\\"] .dag-node__shape { fill: #eef6ff; }"',
        "/layout rowGap 34",
      ],
      constraints: [
        "All commands must start with /.",
        "Use /find, /ls, /neighbors, /path, or /graph when more graph facts are needed.",
        "Do not reference missing nodes unless the same command batch creates them first or uses /edge --create-missing.",
        "Use /set for title, type, define, and other non-relation fields.",
        "Use /parents, /children, /edge, or /rm-edge for relation fields.",
        "Use /style-var, /style-css, /style-preset, /style-reset, and /layout for UI appearance changes.",
        "Only use --dag-* CSS variables and stable .dag-* SVG selectors for appearance CSS.",
      ],
    },
    memory: {
      recentEvents: [...input.harness.recentEvents, ...recentConsoleEvents].slice(-MAX_RECENT_EVENTS),
      activePlan: input.harness.activePlan,
      workingMemory: input.harness.workingMemory,
    },
    execution: {
      pendingCommandBatch: input.harness.pendingCommandBatch,
      lastValidation: input.harness.pendingCommandBatch?.validation || input.harness.activePlan?.validation,
    },
    budget: {
      maxInputTokens: 9000,
      reservedOutputTokens: 1400,
      compressionLevel: "light",
    },
  };
}

function createSyntheticConsoleEvent(harness: AiHarnessState, index: number, entry: ConsoleHistoryEntry): AiEvent {
  return {
    id: `console-${index}`,
    sessionId: harness.sessionId,
    turnId: "console-history",
    type: entry.tone === "input" ? "user.message" : "assistant.answer",
    timestamp: Date.now() - (MAX_RECENT_CONSOLE_LINES - index),
    graphRevisionBefore: harness.graphRevision,
    payload: {
      tone: entry.tone,
      text: entry.text,
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
