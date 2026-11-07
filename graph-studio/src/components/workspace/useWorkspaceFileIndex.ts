import { useEffect, useState } from "react";
import type { WorkspaceSession } from "../../workspace/types";
import type { WorkspaceReferenceIndex } from "../../workspace/fileContracts";
import { localJson } from "../../workspace/localApi";
import { readWorkspaceFile } from "../../workspace/browserAccess";
import { analyzeReferences, referenceTextFile } from "../../workspace/referenceAdapters";

export function useWorkspaceFileIndex(workspace: WorkspaceSession) {
  const [index, setIndex] = useState<WorkspaceReferenceIndex | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    setError("");
    const scan = async () => {
      if (workspace.localId)
        return localJson<WorkspaceReferenceIndex>(`/workspaces/${workspace.localId}/reference-index`);
      const result: WorkspaceReferenceIndex = { files: [], references: [], complete: true };
      for (const [path, entry] of workspace.files) {
        try {
          const file = await readWorkspaceFile(entry);
          if (referenceTextFile.test(path)) result.references.push(...analyzeReferences(path, await file.text()).links);
          result.files.push({
            id: path,
            path,
            revision: String(file.lastModified),
            status: referenceTextFile.test(path) ? "complete" : "opaque",
          });
        } catch (error) {
          result.complete = false;
          result.files.push({ id: path, path, revision: "", status: "failed", message: (error as Error).message });
        }
      }
      return result;
    };
    void scan()
      .then((value) => {
        if (!cancelled) setIndex(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.localId, workspace.files]);
  return { index, error };
}
