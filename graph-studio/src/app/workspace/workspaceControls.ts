import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type { RecentLocation } from "../../workspace/locations";
import type { WorkspaceSession } from "../../workspace/types";

// Public UI contract, independent of the hook's private operations and storage.
export interface WorkspaceControls {
  workspace: WorkspaceSession | null;
  recents: RecentLocation[];
  homeVisible: boolean;
  busy: boolean;
  notice: string;
  explorerOpen: boolean;
  setHomeVisible: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setExplorerOpen: Dispatch<SetStateAction<boolean>>;
  fileInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void>;
  onFolderChange(event: ChangeEvent<HTMLInputElement>): Promise<void>;
  openFile(): void;
  openWorkspace(): void;
  createWorkspace(name: string): Promise<boolean>;
  openRecent(item: RecentLocation): void;
  removeRecent(id: string | string[]): void;
  openWorkspaceGraph(path: string): void;
  saveAndBindLayout(layout: import("../../schema/layoutConfig").LayoutConfigFile): Promise<void>;
  saveAndBindStyle(
    chartType: import("../../graph/types").GraphChartType,
    style: import("../../schema/appearance/types").ChartStyle,
  ): Promise<void>;
  createGraph(name: string): Promise<boolean>;
  refreshWorkspace(): void;
  planFileOperation(
    input: import("../../workspace/fileContracts").FileMutationRequest,
  ): Promise<import("../../workspace/fileContracts").FileMutationPlan>;
  commitFileOperation(
    plan: import("../../workspace/fileContracts").FileMutationPlan,
  ): Promise<import("../../workspace/fileContracts").FileMutationResult>;
  undoFileOperation(id: string): Promise<import("../../workspace/fileContracts").FileMutationResult>;
  closeWorkspace(): void;
  prepareNewDocument(): boolean;
  exportWorkspaceManifest(): void;
  handleDroppedFiles(files: FileList | File[]): Promise<void>;
  openExample(id: string, recent?: RecentLocation): void;
}
