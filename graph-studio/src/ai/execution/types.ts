export type AiRiskLevel = "low" | "medium" | "high";

export interface CommandBatch {
  id: string;
  planId?: string;
  executionKey?: string;
  completedSteps?: string[];
  status: "draft" | "validated" | "ready" | "executing" | "executed" | "failed";
  title: string;
  commands: string[];
  expectedGraphEffects: string[];
  riskLevel: AiRiskLevel;
  validation?: ValidationReport;
  createdAt: number;
  executedAt?: number;
}

export interface ValidationReport {
  commandBatchId: string;
  graphRevisionBase: string;
  results: Array<{
    command: string;
    valid: boolean;
    errors: string[];
    warnings: string[];
    expectedDiff?: string[];
  }>;
  allPassed: boolean;
  riskLevel: AiRiskLevel;
  requiresConfirmation: boolean;
  summary: string;
}
