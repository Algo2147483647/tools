import type { LegacyAiPlan } from "../types";

export function parseLegacyAiPlan(record: Record<string, unknown>): LegacyAiPlan {
  if (record.type === "answer" && typeof record.text === "string") {
    return { type: "answer", text: record.text };
  }
  if (
    record.type === "run_console" &&
    typeof record.explanation === "string" &&
    Array.isArray(record.commands) &&
    record.commands.every((command) => typeof command === "string" && command.trim().startsWith("/"))
  ) {
    return {
      type: "run_console",
      explanation: record.explanation,
      commands: record.commands.map((command) => command.trim()).filter(Boolean),
    };
  }
  throw new Error("AI response did not match the expected response protocol.");
}
