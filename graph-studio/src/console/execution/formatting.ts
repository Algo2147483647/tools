import { getRelationKeys } from "../../graph/relations";
import type { NodeKey } from "../../graph/types";

export function buildConsoleMutationLabel(mutationCount: number, fallbackMessage: string | undefined): string {
  if (mutationCount <= 1) {
    return fallbackMessage || "Executed 1 console command.";
  }
  return `Executed ${mutationCount} console commands.`;
}

export function formatScalarPreview(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "(empty)";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function formatRelationPreview(value: unknown): string {
  const keys = getRelationKeys(value);
  if (!keys.length) {
    return "(none)";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return keys.map((key) => `${key}:${formatScalarPreview((value as Record<string, unknown>)[key])}`).join(", ");
  }
  return keys.join(", ");
}

export function formatKeySample(keys: NodeKey[], limit = 18): string {
  if (!keys.length) {
    return "(none)";
  }
  const shown = keys.slice(0, limit);
  return `${shown.join(", ")}${keys.length > shown.length ? `, ... +${keys.length - shown.length}` : ""}`;
}
