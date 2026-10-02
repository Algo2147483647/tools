export interface ConsoleReviewCard {
  planId: string;
  title: string;
  goal: string;
  riskLevel: "low" | "medium" | "high";
  status: "ready" | "failed" | "applied" | "dismissed" | "stale";
  commandCount: number;
  changeCount: number;
  commands: string[];
  diffPreview: string[];
  validationSummary: string;
  canApply: boolean;
}

type ConsoleEntryTone = "input" | "success" | "error" | "info" | "ai" | "ai-action" | "ai-review";

export type ConsoleEntry =
  | { id: number; tone: Exclude<ConsoleEntryTone, "ai-review">; text: string }
  | { id: number; tone: "ai-review"; text: string; review: ConsoleReviewCard };

export interface ConsoleSuggestion {
  label: string;
  insertText: string;
}
