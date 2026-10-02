import type { AiRiskLevel } from "./types";

export const MAX_RECENT_EVENTS = 40;

export function maxRisk(values: Array<AiRiskLevel | undefined>): AiRiskLevel {
  if (values.includes("high")) {
    return "high";
  }
  if (values.includes("medium")) {
    return "medium";
  }
  return "low";
}

export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
