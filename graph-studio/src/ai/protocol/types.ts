import { type AiRiskLevel } from "../execution/types";
import { type WorkingMemory } from "../session/types";

export type AiResponse =
  | {
      kind: "propose_layout";
      answer: string;
      layoutProtocolVersion: 1;
      intent: import("../../graph/compound/layoutData").LayoutIntent;
    }
  | { kind: "inspect_layout"; answer: string; scopeId?: string | null }
  | { kind: "answer"; answer: string; memoryPatch?: Partial<WorkingMemory> }
  | {
      kind: "propose_changes";
      answer: string;
      plan: {
        title: string;
        goal: string;
        assumptions?: string[];
        affectedNodes?: string[];
        changes: ProposedChange[];
      };
      draftCommands?: ConsoleCommandDraft[];
      nextAction?: {
        type: "await_user_confirmation" | "validate_then_execute" | "needs_inspection";
        message: string;
      };
      memoryPatch?: Partial<WorkingMemory>;
    }
  | {
      kind: "run_console";
      answer: string;
      commandBatch: {
        title?: string;
        commands: string[];
        expectedGraphEffects?: string[];
        riskLevel?: AiRiskLevel;
      };
      preflightRequired?: boolean;
      memoryPatch?: Partial<WorkingMemory>;
    }
  | {
      kind: "clarify";
      answer: string;
      missingInformation?: Array<{ field: string; reason: string; candidates?: string[] }>;
      fallbackActions?: string[];
      memoryPatch?: Partial<WorkingMemory>;
    }
  | {
      kind: "inspect";
      answer: string;
      commands: string[];
      memoryPatch?: Partial<WorkingMemory>;
    };

export interface ConsoleCommandDraft {
  command: string;
  rationale?: string;
  risk?: AiRiskLevel;
}

export interface ProposedChange {
  id?: string;
  kind:
    "add_node" | "set_property" | "add_edge" | "remove_edge" | "merge_node" | "rename_node" | "restructure_subgraph";
  target?: {
    nodeId?: string;
    edgeId?: string;
    property?: string;
  };
  rationale: string;
  draftCommands: string[];
  dependencies?: string[];
  risk?: AiRiskLevel;
}

export type LegacyAiPlan =
  { type: "answer"; text: string } | { type: "run_console"; explanation: string; commands: string[] };
