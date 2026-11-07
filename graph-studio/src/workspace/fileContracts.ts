export interface ReferenceLocation {
  source: string;
  target: string;
  raw: string;
  line: number;
  context: string;
  locator: string;
}
export interface FileIndexEntry {
  id: string;
  path: string;
  revision: string;
  status: "complete" | "opaque" | "failed";
  message?: string;
}
export interface WorkspaceReferenceIndex {
  files: FileIndexEntry[];
  references: ReferenceLocation[];
  complete: boolean;
}
export interface FileMutationRequest {
  kind: "rename" | "delete";
  path: string;
  name?: string;
}
export interface FileMutationPlan {
  id: string;
  kind: "rename" | "delete" | "undo";
  path: string;
  newPath?: string;
  references: ReferenceLocation[];
  changes: Array<{ path: string; before: string | null; after: string | null }>;
}
export interface FileMutationResult {
  caseInsensitive: boolean;
  transactionId: string;
  undoId: string;
  kind: FileMutationPlan["kind"];
  path: string;
  newPath?: string;
  changedPaths: string[];
}
