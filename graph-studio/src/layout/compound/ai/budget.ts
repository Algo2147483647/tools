import type { ProviderReply } from "../../../ai/transport/providerTransport";
import { isRecord } from "../../../shared/json";

export const DEFAULT_COMPOUND_AI_BUDGET = { maxRequests: 6, idleTimeoutMs: 120000, timeoutMs: 1200000 };
export type CompoundAiBudget = typeof DEFAULT_COMPOUND_AI_BUDGET;
export type CompoundStopReason = "selected" | "request-budget" | "deadline" | "idle-timeout" | "request-error";
export class CompoundBudgetError extends Error {
  constructor(readonly reason: "request-budget" | "deadline" | "idle-timeout") {
    super(
      reason === "deadline"
        ? "AI layout time budget reached."
        : reason === "idle-timeout"
          ? "AI layout response stalled."
          : "AI layout request budget reached.",
    );
  }
}
export interface CompoundRequestUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  reasoningCharacters?: number;
  finishReason?: string;
  requestId?: string;
}
export function requestUsage(reply: ProviderReply): CompoundRequestUsage {
  const usage = reply.usage ?? {};
  const numeric = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  return {
    inputTokens: numeric(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? usage.promptTokens),
    outputTokens: numeric(
      usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? usage.outputTokens,
    ),
    reasoningTokens: numeric(
      isRecord(usage.completion_tokens_details)
        ? usage.completion_tokens_details.reasoning_tokens
        : usage.thoughtsTokenCount,
    ),
    reasoningCharacters: reply.reasoningCharacters,
    finishReason: reply.finishReason,
    requestId: reply.requestId,
  };
}
