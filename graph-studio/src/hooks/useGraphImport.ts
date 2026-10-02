import { type ChangeEvent, type Dispatch, useRef, useState } from "react";
import { downloadJsonFile } from "../adapters/download";
import { type RecentLocation } from "../adapters/recentImport";
import { readWorkspaceDirectory, requestReadAccess, workspaceFromFiles } from "../adapters/workspaceAccess";
import { normalizeDagInput } from "../graph/normalize";
import { getInitialSelection } from "../graph/selectors";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import { createWorkspaceManifest, discoverWorkspace, readGraphFile, WORKSPACE_MANIFEST } from "../workspace/discovery";
import { loadExampleWorkspace } from "../workspace/examples";
import { documentIdentity, prepareWorkspace, prepareWorkspaceGraph } from "../workspace/opening";
import type { GraphWorkspace, WorkspaceFile, WorkspaceFolder } from "../workspace/types";
import { useRecentLocations } from "./useRecentLocations";

export function useGraphImport({ dispatch, state }: { dispatch: Dispatch<GraphAction>; state: GraphAppState }) {
  const [workspace, setWorkspace] = useState<GraphWorkspace | null>(null);
  const { recents, remember, remove } = useRecentLocations();
  const [homeVisible, setHomeVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  function mayReplace() {
    return (
      !stateRef.current.source.dirty ||
      window.confirm(
        `"${stateRef.current.source.fileName}" has unsaved changes. Discard them and open another document?`,
      )
    );
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
      dispatch({ type: "statusChanged", status: message });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function commit(dag: ReturnType<typeof normalizeDagInput>, entry: WorkspaceFile, locationId: string) {
    dispatch({
      type: "graphLoaded",
      documentId: documentIdentity(locationId, entry.path),
      dag,
      fileName: entry.path,
      fileHandle: entry.handle,
      selection: getInitialSelection(dag),
      status: `${Object.keys(dag.nodes).length} nodes loaded from ${entry.path}.`,
    });
    setHomeVisible(false);
  }
  async function loadFile(entry: WorkspaceFile, recentId?: string) {
    const dag = await readGraphFile(entry);
    const locationId = await remember({
      id: recentId,
      kind: "file",
      name: entry.path,
      location: entry.path,
      handle: entry.handle || undefined,
    });
    if (!mayReplace()) return;
    setWorkspace(null);
    commit(dag, entry, locationId);
  }
  async function loadFolder(folder: WorkspaceFolder, recent?: RecentLocation) {
    const { workspace: found, entry, dag } = await prepareWorkspace(folder, recent?.lastGraph);
    const recentId = await remember({
      id: recent?.id,
      kind: "workspace",
      name: found.name,
      location: folder.handle?.name || folder.name,
      handle: folder.handle || undefined,
      lastGraph: found.activePath || undefined,
      exampleId: folder.exampleId,
    });
    if (!mayReplace()) return;
    setWorkspace({ ...found, recentId });
    setExplorerOpen(true);
    setHomeVisible(false);
    if (dag && entry) commit(dag, entry, recentId);
    else
      dispatch({
        type: "graphClosed",
        status: found.graphs.length
          ? "Choose a graph from the workspace."
          : "No graph documents found. Add a Graph Studio v3 JSON file to this folder.",
      });
  }
  function selectFile() {
    if (lock.current) return;
    if (!window.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }
    void run(async () => {
      const handles = await window.showOpenFilePicker!({
        multiple: false,
        types: [{ description: "Graph Studio graph", accept: { "application/json": [".json"] } }],
      });
      if (handles[0]) await loadFile({ path: handles[0].name, handle: handles[0] }, undefined);
    });
  }
  function selectWorkspace() {
    if (lock.current) return;
    if (!window.showDirectoryPicker) {
      folderInputRef.current?.click();
      return;
    }
    void run(async () => {
      const handle = await window.showDirectoryPicker!({ mode: "read", id: "graph-studio-workspace" });
      await loadFolder(await readWorkspaceDirectory(handle), undefined);
    });
  }
  function openFile() {
    selectFile();
  }
  function openWorkspace() {
    selectWorkspace();
  }
  function openExample(id: string, recent?: RecentLocation) {
    void run(async () => loadFolder(await loadExampleWorkspace(id, import.meta.env.BASE_URL), recent));
  }
  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files[0]) await run(() => loadFile({ path: files[0].name, file: files[0], handle: null }, undefined));
  }
  async function onFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length)
      await run(async () => {
        const folder = workspaceFromFiles(files);
        await loadFolder(folder, undefined);
      });
  }
  async function handleDroppedFiles(files: FileList | File[]) {
    if (!files.length) return;
    await run(async () => {
      if (files.length !== 1) throw new Error("Open one graph file at a time, or use Open workspace for a folder.");
      await loadFile({ path: files[0].name, file: files[0], handle: null });
    });
  }
  function openRecent(item: RecentLocation) {
    if (item.exampleId) {
      openExample(item.exampleId, item);
      return;
    }
    if (!item.handle) {
      setNotice(`Select "${item.location}" again to restore access.`);
      if (item.kind === "workspace") selectWorkspace();
      else selectFile();
      return;
    }
    void run(async () => {
      if (!(await requestReadAccess(item.handle!)))
        throw new Error(
          `Access to "${item.location}" was not granted. Use Open ${item.kind === "workspace" ? "workspace" : "file"} to select it again.`,
        );
      if (item.kind === "workspace")
        await loadFolder(await readWorkspaceDirectory(item.handle as FileSystemDirectoryHandle), item);
      else await loadFile({ path: item.location, handle: item.handle as FileSystemFileHandle }, item.id);
    });
  }
  function openWorkspaceGraph(path: string) {
    if (!workspace || path === workspace.activePath) {
      setHomeVisible(false);
      return;
    }
    const folder = workspace;
    void run(async () => {
      const { entry, dag } = await prepareWorkspaceGraph(folder, path);
      const recentId = await remember({
        id: folder.recentId,
        kind: "workspace",
        name: folder.name,
        location: folder.rootName,
        handle: folder.handle || undefined,
        lastGraph: path,
        exampleId: folder.exampleId,
      });
      if (!mayReplace()) return;
      commit(dag, entry, recentId);
      setWorkspace({ ...folder, activePath: path, recentId });
    });
  }
  function refreshWorkspace() {
    if (!workspace) return;
    const folder = workspace;
    if (folder.exampleId) {
      void run(async () => {
        const found = await discoverWorkspace(
          await loadExampleWorkspace(folder.exampleId!, import.meta.env.BASE_URL),
          folder.activePath || undefined,
        );
        setWorkspace({ ...found, activePath: folder.activePath, recentId: folder.recentId });
        setNotice("Example files refreshed. The open document and its edits were kept unchanged.");
      });
      return;
    }
    if (!folder.handle) {
      setNotice("Choose the folder again to refresh files in this browser.");
      selectWorkspace();
      return;
    }
    void run(async () => {
      const found = await discoverWorkspace(
        await readWorkspaceDirectory(folder.handle!),
        folder.activePath || undefined,
      );
      // Refresh only updates the explorer. Unsaved graph edits stay in memory.
      setWorkspace({ ...found, activePath: folder.activePath, recentId: folder.recentId });
      setNotice("Workspace file list refreshed. The open document was kept unchanged.");
    });
  }
  function closeWorkspace() {
    if (lock.current || !mayReplace()) return;
    setWorkspace(null);
    setHomeVisible(true);
    dispatch({ type: "graphClosed", status: "" });
  }
  function prepareNewDocument() {
    if (lock.current || !mayReplace()) return false;
    setWorkspace(null);
    setHomeVisible(false);
    setNotice("");
    return true;
  }
  function exportWorkspaceManifest() {
    if (workspace) downloadJsonFile(JSON.stringify(createWorkspaceManifest(workspace), null, 2), WORKSPACE_MANIFEST);
  }
  async function removeRecent(id: string) {
    await run(() => remove(id));
  }
  return {
    workspace,
    recents,
    homeVisible,
    setHomeVisible,
    busy,
    notice,
    setNotice,
    explorerOpen,
    setExplorerOpen,
    fileInputRef,
    folderInputRef,
    onFileChange,
    onFolderChange,
    openFile,
    openWorkspace,
    openRecent,
    removeRecent,
    openWorkspaceGraph,
    refreshWorkspace,
    closeWorkspace,
    prepareNewDocument,
    exportWorkspaceManifest,
    handleDroppedFiles,
    openExample,
  };
}

export type WorkspaceControls = ReturnType<typeof useGraphImport>;
