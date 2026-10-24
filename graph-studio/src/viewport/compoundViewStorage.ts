import { readStoredText, writeStoredText } from "../shared/browser/browserStorage";
import type { CompoundView } from "../graph/types";

export function loadCompoundView(key: string, defaultCollapsedGroupIds: string[]): CompoundView {
  try {
    const raw = JSON.parse(readStoredText(key) ?? "null");
    if (raw && Array.isArray(raw.collapsedGroupIds))
      return {
        collapsedGroupIds: raw.collapsedGroupIds.filter((id: unknown): id is string => typeof id === "string"),
        focusGroupId: typeof raw.focusGroupId === "string" ? raw.focusGroupId : null,
      };
  } catch {
    /* Private storage may be unavailable. */
  }
  return { collapsedGroupIds: defaultCollapsedGroupIds, focusGroupId: null };
}

export function saveCompoundView(key: string, view: CompoundView) {
  try {
    writeStoredText(key, JSON.stringify(view));
  } catch {
    /* The in-memory view remains usable. */
  }
}
