import { readStoredText, writeStoredText } from "../shared/browser/browserStorage";
import type { CompoundView } from "../graph/types";

export function sanitizeCompoundView(view: CompoundView, groupIds: string[]): CompoundView {
  const valid = new Set(groupIds);
  return {
    collapsedGroupIds: [...new Set(view.collapsedGroupIds)].filter((id) => valid.has(id)),
    focusGroupId: view.focusGroupId && valid.has(view.focusGroupId) ? view.focusGroupId : null,
  };
}
export function compoundViewKey(documentId: string) {
  return JSON.stringify(["graph-studio:compound-view:v2", documentId]);
}
export function loadCompoundView(
  key: string,
  defaultCollapsedGroupIds: string[],
  initial?: CompoundView,
): CompoundView {
  try {
    const raw = JSON.parse(readStoredText(key) ?? "null");
    if (raw && Array.isArray(raw.collapsedGroupIds))
      return sanitizeCompoundView(
        {
          collapsedGroupIds: raw.collapsedGroupIds.filter((id: unknown): id is string => typeof id === "string"),
          focusGroupId: typeof raw.focusGroupId === "string" ? raw.focusGroupId : null,
        },
        defaultCollapsedGroupIds,
      );
  } catch {
    /* Private storage may be unavailable. */
  }
  return sanitizeCompoundView(
    initial ?? { collapsedGroupIds: defaultCollapsedGroupIds, focusGroupId: null },
    defaultCollapsedGroupIds,
  );
}

export function saveCompoundView(key: string, view: CompoundView) {
  try {
    writeStoredText(key, JSON.stringify(view));
  } catch {
    /* The in-memory view remains usable. */
  }
}
