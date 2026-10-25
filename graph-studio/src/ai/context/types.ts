import { type CommandBatch, type ValidationReport } from "../execution/types";
import { type ActionPlan, type WorkingMemory } from "../session/types";
import { type AiSettings } from "../transport/types";

export interface AiGraphContext {
  summary: string;
  commandReference: string;
}

export interface AiRequest {
  onProgress?: import("../transport/streaming").AiProgressListener;
  signal?: AbortSignal;
  settings: AiSettings;
  context: AiContextPacket;
  message: string;
}

export interface AiContextPacket {
  system: {
    role: "graph_editing_agent";
    language: "zh" | "en" | "auto";
    responseProtocolVersion: "v2";
    editPolicy: {
      execution: "validate_then_execute";
    };
  };
  graph: AiGraphContext & {
    graphRevision: string;
    currentSelection?: string[];
    focusedNodes?: string[];
  };
  tools: {
    availableCommands: string;
    commandExamples: string[];
    constraints: string[];
  };
  memory: {
    consoleHistory: Array<{ tone: string; text: string }>;
    activePlan?: ActionPlan;
    workingMemory: WorkingMemory;
  };
  execution: {
    pendingCommandBatch?: CommandBatch;
    lastValidation?: ValidationReport;
  };
}
