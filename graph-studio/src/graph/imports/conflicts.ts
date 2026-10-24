import type { ImportConflict,ImportGraphDocument,ImportResolutions } from "./types";
export function createImportDecisions(documents: ImportGraphDocument[], resolutions: ImportResolutions) {
  const conflicts: ImportConflict[] = [];
  const unresolved: ImportConflict[] = [];
  const decide = (
    index: number,
    path: string,
    kind: ImportConflict["kind"],
    existing: unknown,
    incoming: unknown,
    canMerge: boolean,
    canRename: boolean,
    canReplace = false,
  ) => {
    const id = JSON.stringify([index, path, kind]);
    const resolution = resolutions[id];
    const conflict: ImportConflict = {
      id,
      source: documents[index].name,
      path,
      kind,
      existing: structuredClone(existing),
      incoming: structuredClone(incoming),
      canMerge,
      canRename,
      canReplace,
      resolution,
    };
    conflicts.push(conflict);
    if (
      !resolution ||
      !["keep", "merge", "rename", "replace"].includes(resolution.strategy) ||
      (resolution.strategy === "replace" && !canReplace) ||
      (resolution.strategy === "merge" && !canMerge) ||
      (resolution.strategy === "rename" && !canRename)
    ) {
      unresolved.push(conflict);
      return undefined;
    }
    return resolution;
  };
return { conflicts, unresolved, decide };
}
export type ImportDecision = ReturnType<typeof createImportDecisions>["decide"];
