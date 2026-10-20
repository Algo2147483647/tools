import type { WorkspaceControls } from "./workspaceControls";
import { type ChangeEvent, type Dispatch, useEffect, useRef, useState } from "react";
import { downloadJsonFile } from "../adapters/download";
import { type RecentLocation } from "../workspace/locations";
import { readWorkspaceDirectory, requestReadAccess, workspaceFromFiles } from "../adapters/workspaceAccess";
import { normalizeDagInput } from "../graph/normalize";
import { getInitialSelection } from "../graph/selectors";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import { createWorkspaceManifest, discoverWorkspace, readGraphFile, WORKSPACE_MANIFEST } from "../workspace/discovery";
import { loadExampleWorkspace } from "../workspace/examples";
import { documentIdentity, prepareWorkspace, prepareWorkspaceGraph } from "../workspace/opening";
import { createWorkspaceGraph } from "../workspace/creation";
import type { WorkspaceSession, WorkspaceFile, WorkspaceFolder } from "../workspace/types";
import { useRecentLocations } from "./useRecentLocations";
import { createWorkspaceOperations, openPreparedDocument, type OperationContext } from "../workspace/operations";
import { readLinkedStyle } from "../workspace/linkedStyle";

export function useWorkspaceController({
  dispatch,
  state,
}: {
  dispatch: Dispatch<GraphAction>;
  state: GraphAppState;
}): WorkspaceControls {
  const [workspace, setWorkspace] = useState<WorkspaceSession | null>(null);
  const { recents, remember, remove, identify } = useRecentLocations();
  const [homeVisible, setHomeVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRecent = useRef<RecentLocation>();
  const pendingFolderRecent = useRef<RecentLocation>();
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
  const [operations] = useState(() =>
    createWorkspaceOperations({
      busy: setBusy,
      generation: () => stateRef.current.document.generation,
      notice: (message) => {
        setNotice(message);
        if (message) dispatch({ type: "statusChanged", status: message });
      },
    }),
  );
  useEffect(() => () => operations.invalidate(), [operations]);
  const run = operations.run;
  function commit(
    dag: ReturnType<typeof normalizeDagInput>,
    entry: WorkspaceFile,
    locationId: string,
    style: Awaited<ReturnType<typeof readLinkedStyle>> = {},
  ) {
    dispatch({
      type: "graphLoaded",
      documentId: documentIdentity(locationId, entry.path),
      dag,
      linkedStyle: style.linkedStyle,
      fileName: entry.path,
      fileHandle: entry.handle,
      selection: getInitialSelection(dag),
      status: `${Object.keys(dag.nodes).length} nodes loaded from ${entry.path}.${style.styleNotice ? ` ${style.styleNotice}` : ""}`,
    });
    setHomeVisible(false);
  }
  async function loadFile(entry: WorkspaceFile, recentId: string | undefined, context: OperationContext) {
    await openPreparedDocument(
      context,
      async () => {
        const dag = await readGraphFile(entry);
        const input = {
          id: recentId,
          kind: "file" as const,
          name: entry.path,
          location: entry.path,
          handle: entry.handle || undefined,
        };
        const id = await identify(input);
        return { dag, input: { ...input, id }, ...(await readLinkedStyle(dag, entry.path)) };
      },
      mayReplace,
      ({ dag, input, ...style }) => {
        setWorkspace(null);
        commit(dag, entry, input.id, style);
      },
      ({ input }) => remember(input),
    );
  }
  async function loadFolder(folder: WorkspaceFolder, recent: RecentLocation | undefined, context: OperationContext) {
    await openPreparedDocument(
      context,
      async () => {
        const prepared = await prepareWorkspace(folder, recent?.lastGraph);
        const input = {
          id: recent?.id,
          kind: "workspace" as const,
          name: prepared.workspace.name,
          location: folder.handle?.name || folder.name,
          handle: folder.handle || undefined,
          lastGraph: prepared.workspace.activePath || undefined,
          exampleId: folder.exampleId,
        };
        const id = await identify(input);
        return { ...prepared, input: { ...input, id } };
      },
      mayReplace,
      ({ workspace: found, entry, dag, input, ...style }) => {
        setWorkspace({ ...found, locationId: input.id });
        setExplorerOpen(true);
        setHomeVisible(false);
        if (dag && entry) commit(dag, entry, input.id, style);
        else
          dispatch({
            type: "graphClosed",
            status: found.graphs.length
              ? "Choose a graph from the workspace."
              : "No graph documents found. Add a Graph Studio v3 JSON file to this folder.",
          });
      },
      ({ input }) => remember(input),
    );
  }
  function selectFile(recent?: RecentLocation) {
    if (operations.isBusy()) return;
    if (!window.showOpenFilePicker) {
      pendingFileRecent.current = recent;
      fileInputRef.current?.click();
      return;
    }
    void run(async (context) => {
      const handles = await window.showOpenFilePicker!({
        multiple: false,
        types: [{ description: "Graph Studio graph", accept: { "application/json": [".json"] } }],
      });
      if (handles[0])
        await loadFile(
          { path: handles[0].name, handle: handles[0] },
          recent?.location === handles[0].name ? recent.id : undefined,
          context,
        );
    });
  }
  function selectWorkspace(recent?: RecentLocation) {
    if (operations.isBusy()) return;
    if (!window.showDirectoryPicker) {
      pendingFolderRecent.current = recent;
      folderInputRef.current?.click();
      return;
    }
    void run(async (context) => {
      const handle = await window.showDirectoryPicker!({ mode: "read", id: "graph-studio-workspace" });
      await loadFolder(
        await readWorkspaceDirectory(handle),
        recent?.location === handle.name ? recent : undefined,
        context,
      );
    });
  }
  function openFile() {
    selectFile();
  }
  function openWorkspace() {
    selectWorkspace();
  }
  function openExample(id: string, recent?: RecentLocation) {
    void run(async (context) => loadFolder(await loadExampleWorkspace(id, import.meta.env.BASE_URL), recent, context));
  }
  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const recent = pendingFileRecent.current;
    pendingFileRecent.current = undefined;
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files[0])
      await run((context) =>
        loadFile(
          { path: files[0].name, file: files[0], handle: null },
          recent?.location === files[0].name ? recent.id : undefined,
          context,
        ),
      );
  }
  async function onFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const recent = pendingFolderRecent.current;
    pendingFolderRecent.current = undefined;
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length)
      await run(async (context) => {
        const folder = workspaceFromFiles(files);
        await loadFolder(folder, recent?.location === folder.name ? recent : undefined, context);
      });
  }
  async function handleDroppedFiles(files: FileList | File[]) {
    if (!files.length) return;
    await run(async (context) => {
      if (files.length !== 1) throw new Error("Open one graph file at a time, or use Open workspace for a folder.");
      await loadFile({ path: files[0].name, file: files[0], handle: null }, undefined, context);
    });
  }
  function openRecent(item: RecentLocation) {
    if (item.exampleId) {
      openExample(item.exampleId, item);
      return;
    }
    if (!item.handle) {
      setNotice(`Select "${item.location}" again to restore access.`);
      if (item.kind === "workspace") selectWorkspace(item);
      else selectFile(item);
      return;
    }
    void run(async (context) => {
      if (!(await requestReadAccess(item.handle!)))
        throw new Error(
          `Access to "${item.location}" was not granted. Use Open ${item.kind === "workspace" ? "workspace" : "file"} to select it again.`,
        );
      if (item.kind === "workspace")
        await loadFolder(await readWorkspaceDirectory(item.handle as FileSystemDirectoryHandle), item, context);
      else await loadFile({ path: item.location, handle: item.handle as FileSystemFileHandle }, item.id, context);
    });
  }
  function openWorkspaceGraph(path: string) {
    if (!workspace || path === workspace.activePath) {
      setHomeVisible(false);
      return;
    }
    const folder = workspace;
    void run((context) =>
      openPreparedDocument(
        context,
        () => prepareWorkspaceGraph(folder, path),
        mayReplace,
        ({ entry, dag, ...style }) => {
          commit(dag, entry, folder.locationId, style);
          setWorkspace({ ...folder, activePath: path });
        },
        () => rememberWorkspace(folder, path),
      ),
    );
  }
  function rememberWorkspace(folder: WorkspaceSession, path: string) {
    remember({
      id: folder.locationId,
      kind: "workspace",
      name: folder.name,
      location: folder.rootName,
      handle: folder.handle || undefined,
      lastGraph: path,
      exampleId: folder.exampleId,
    });
  }

  async function createGraph(input: string): Promise<boolean> {
    if (!workspace || operations.isBusy() || !mayReplace()) return false;
    const folder = workspace;
    const previousDag = stateRef.current.dag;
    let created = false;
    await run(async (context) => {
      const result = await createWorkspaceGraph(folder, input);
      created = true;
      if (!context.isCurrent()) return;
      setExplorerOpen(true);
      setHomeVisible(false);
      if (stateRef.current.dag !== previousDag && !mayReplace()) {
        setWorkspace({ ...result.workspace, locationId: folder.locationId, activePath: folder.activePath });
        setNotice(`Created ${result.entry.path}. Select it in the explorer when ready.`);
        return;
      }
      setWorkspace({ ...result.workspace, locationId: folder.locationId });
      commit(result.dag, result.entry, folder.locationId);
      rememberWorkspace(folder, result.entry.path);
    });
    return created;
  }
  function refreshWorkspace() {
    if (!workspace) return;
    const folder = workspace;
    if (folder.exampleId) {
      void run(async (context) => {
        const found = await discoverWorkspace(
          await loadExampleWorkspace(folder.exampleId!, import.meta.env.BASE_URL, fetch, { reload: true }),
          folder.activePath || undefined,
        );
        if (!context.isCurrent()) return;
        setWorkspace({ ...found, activePath: folder.activePath, locationId: folder.locationId });
        setNotice("Example files refreshed. The open document and its edits were kept unchanged.");
      });
      return;
    }
    if (!folder.handle) {
      setNotice("Choose the folder again to refresh files in this browser.");
      selectWorkspace(recents.find((item) => item.id === folder.locationId));
      return;
    }
    void run(async (context) => {
      const found = await discoverWorkspace(
        await readWorkspaceDirectory(folder.handle!),
        folder.activePath || undefined,
      );
      if (!context.isCurrent()) return;
      // Refresh only updates the explorer. Unsaved graph edits stay in memory.
      setWorkspace({ ...found, activePath: folder.activePath, locationId: folder.locationId });
      setNotice("Workspace file list refreshed. The open document was kept unchanged.");
    });
  }
  function closeWorkspace() {
    if (operations.isBusy() || !mayReplace()) return;
    setWorkspace(null);
    setHomeVisible(true);
    dispatch({ type: "graphClosed", status: "" });
  }
  function prepareNewDocument() {
    if (operations.isBusy() || !mayReplace()) return false;
    setWorkspace(null);
    setHomeVisible(false);
    setNotice("");
    return true;
  }
  function exportWorkspaceManifest() {
    if (workspace) downloadJsonFile(JSON.stringify(createWorkspaceManifest(workspace), null, 2), WORKSPACE_MANIFEST);
  }
  const removeRecent = remove;
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
    createGraph,
    refreshWorkspace,
    closeWorkspace,
    prepareNewDocument,
    exportWorkspaceManifest,
    handleDroppedFiles,
    openExample,
  };
}
