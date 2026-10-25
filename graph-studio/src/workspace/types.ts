export interface WorkspaceFile {
  path: string;
  handle: FileSystemFileHandle | null;
  file?: File;
  loadFile?: () => Promise<File>;
}
export interface WorkspaceFolder {
  exampleId?: string;
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
  layouts?: Record<string, string>;
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
  notices: string[];
}

export interface WorkspaceSession extends GraphWorkspace {
  locationId: string;
}
