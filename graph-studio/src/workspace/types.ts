import type { NormalizedDag } from "../graph/types";
export interface WorkspaceFile {
  path: string;
  handle: FileSystemFileHandle | null;
  file?: File;
}
export interface WorkspaceFolder {
  name: string;
  handle: FileSystemDirectoryHandle | null;
  files: Map<string, WorkspaceFile>;
}
export interface WorkspaceManifest {
  format: "graph-studio-workspace";
  version: 1;
  name?: string;
  graphs: string[];
  defaultGraph?: string;
  metadata?: Record<string, unknown>;
}
export interface WorkspaceGraph {
  path: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  error?: string;
}
export interface GraphWorkspace extends WorkspaceFolder {
  rootName: string;
  manifest: WorkspaceManifest | null;
  graphs: WorkspaceGraph[];
  activePath: string | null;
  recentId?: string;
  notices: string[];
}
export interface OpenedGraph { dag: NormalizedDag; entry: WorkspaceFile }
