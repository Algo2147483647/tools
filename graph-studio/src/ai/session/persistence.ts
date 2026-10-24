import { getBrowserStorage, readStoredText, writeStoredText, type StorageLike } from "../../adapters/browserStorage";
import type { AiExecutionMode, AiHarnessState } from "../types";
import { parsePersistedAiHarnessState } from "./restore";

const AI_HARNESS_STORAGE_PREFIX = "graph-studio:ai-harness:";

export function loadPersistedAiHarnessState(
  graphId: string,
  mode: AiExecutionMode,
  storage: StorageLike | null = getBrowserStorage(),
): AiHarnessState | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = readStoredText(buildAiHarnessStorageKey(graphId), storage);
    return parsePersistedAiHarnessState(raw, mode);
  } catch {
    return null;
  }
}

export function savePersistedAiHarnessState(
  harness: AiHarnessState,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    writeStoredText(buildAiHarnessStorageKey(harness.graphId), JSON.stringify(harness), storage);
  } catch {
    // Ignore storage failures so AI remains usable in locked-down contexts.
  }
}

export function buildAiHarnessStorageKey(graphId: string): string {
  return `${AI_HARNESS_STORAGE_PREFIX}${encodeURIComponent(graphId || "local-graph")}`;
}

export { parsePersistedAiHarnessState } from "./restore";
