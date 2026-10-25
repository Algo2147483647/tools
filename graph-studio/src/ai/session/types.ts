import { type AiRiskLevel, type CommandBatch, type ValidationReport } from "../execution/types";
import { type ProposedChange } from "../protocol/types";

export interface WorkingMemory {
  activeTopic?: string;
  currentIntent?: {
    type:
      | "analyze_graph"
      | "modify_graph"
      | "continue_previous_plan"
      | "translate_content"
      | "execute_pending_commands"
      | "inspect_node"
      | "clarify";
    confidence: number;
    sourceUserMessage: string;
  };
  focus: {
    nodeIds: string[];
    edgeIds: string[];
    concepts: string[];
  };
  activePlanId?: string;
  pendingCommandBatchId?: string;
  userPreferences: {
    preferredLanguage?: "English" | "Chinese" | "auto";
  };
  unresolvedQuestions: string[];
}

export interface ActionPlan {
  id: string;
  sessionId: string;
  graphId: string;
  status:
    | "draft"
    | "proposed"
    | "approved"
    | "validating"
    | "ready"
    | "executing"
    | "applied"
    | "failed"
    | "cancelled"
    | "superseded";
  title: string;
  goal: string;
  source: {
    userTurnId: string;
    createdFromMessage: string;
  };
  scope: {
    targetNodes: string[];
    targetEdges: string[];
    affectedConcepts: string[];
    graphRevisionBase: string;
  };
  assumptions: string[];
  changes: ProposedChange[];
  commandBatch?: CommandBatch;
  validation?: ValidationReport;
  ui: {
    displaySummary: string;
    riskLevel: AiRiskLevel;
  };
  timestamps: {
    createdAt: number;
    updatedAt: number;
  };
}

export interface AiHarnessState {
  sessionId: string;
  graphId: string;
  graphRevision: string;
  workingMemory: WorkingMemory;
  activePlan?: ActionPlan;
  pendingCommandBatch?: CommandBatch;
}
