import type { FileMutationRequest, FileMutationPlan, FileMutationResult } from "../../workspace/fileContracts";
import {
  chooseLocalPath,
  openLocalWorkspace,
  openLocalFile,
  fetchWorkspace,
  localJson,
  localEntry,
  workspaceFromSnapshot,
  subscribeLocalChanges,
  type WorkspaceSnapshot,
} from "../../workspace/localApi";
import { saveWorkspaceLayout, saveServedLayout } from "../../workspace/saveLayout";
import type { SavedLinkedDocument } from "../../workspace/linkedDocument";
import type { LayoutConfigFile } from "../../schema/layoutConfig";
import { saveServedStyle, saveWorkspaceStyle } from "../../workspace/saveStyle";
import type { ChartStyle } from "../../schema/appearance/types";
import type { GraphChartType } from "../../graph/types";
import type { LinkedLayout } from "../../workspace/linkedLayout";
import { type ChangeEvent, type Dispatch, useEffect, useRef, useState } from "react";
import { downloadJsonFile } from "../../shared/browser/download";
import { workspaceFromFiles } from "../../workspace/browserAccess";
import { normalizeDagInput } from "../../graph/normalize";
import { getInitialSelection } from "../../graph/selectors";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { createWorkspaceGraph } from "../../workspace/creation";
import { createWorkspaceManifest, WORKSPACE_MANIFEST } from "../../workspace/discovery";
import { readLinkedStyle } from "../../workspace/linkedStyle";
import { type RecentLocation } from "../../workspace/locations";
import {
  documentIdentity,
  prepareFileLocation,
  prepareWorkspaceGraph,
  prepareWorkspaceLocation,
} from "../../workspace/opening";
import { createWorkspaceOperations, openPreparedDocument, type OperationContext } from "../../workspace/operations";
import type { WorkspaceFile, WorkspaceFolder, WorkspaceSession } from "../../workspace/types";
import { useRecentLocations } from "./useRecentLocations";
import type { WorkspaceControls } from "./workspaceControls";

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
  const mutationBusy = useRef(false);
  const ownTransactions = useRef(new Set<string>());
  const mutationUndo = useRef<{
    id: string;
    state: GraphAppState;
    revision: number;
    savedRevision: number;
    generation: number;
  }>();
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
    style: Awaited<ReturnType<typeof readLinkedStyle>> & LinkedLayout = {},
  ) {
    dispatch({
      type: "graphLoaded",
      documentId: documentIdentity(locationId, entry.path),
      dag,
      linkedStyle: style.linkedStyle,
      linkedChartType: style.linkedChartType,
      linkedLayout: style.linkedLayout,
      layoutNotice: style.layoutNotice,
      fileName: entry.path,
      fileHandle: entry.handle,
      localFile: entry.local ? { ...entry.local } : undefined,
      selection: getInitialSelection(dag),
      status: `${Object.keys(dag.nodes).length} nodes loaded from ${entry.path}.${style.styleNotice ? ` ${style.styleNotice}` : ""}`,
    });
    setHomeVisible(false);
  }
  async function loadFile(entry: WorkspaceFile, recentId: string | undefined, context: OperationContext) {
    await openPreparedDocument(
      context,
      () => prepareFileLocation(entry, recentId, identify),
      mayReplace,
      ({ dag, input, ...style }) => {
        setWorkspace(null);
        commit(dag, entry, input.id, style);
      },
      ({ input }) => remember(input),
    );
  }
  async function loadFolder(
    folder: WorkspaceFolder,
    recent: RecentLocation | undefined,
    context: OperationContext,
    canReplace = mayReplace,
  ) {
    return openPreparedDocument(
      context,
      () => prepareWorkspaceLocation(folder, recent, identify),
      canReplace,
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
    void run(async (context) => {
      const path = await chooseLocalPath("file");
      if (!path || !context.isCurrent()) return;
      const { record, entry } = await openLocalFile(path, recent?.id);
      await loadFile(entry, record.id, context);
    });
  }
  function selectWorkspace(recent?: RecentLocation) {
    if (operations.isBusy()) return;
    void run(async (context) => {
      const path = await chooseLocalPath("directory");
      if (!path || !context.isCurrent()) return;
      await loadFolder(await openLocalWorkspace(path, recent?.id), recent, context);
    });
  }
  function openFile() {
    selectFile();
  }
  function openWorkspace() {
    selectWorkspace();
  }
  async function createWorkspace(input: string): Promise<boolean> {
    if (operations.isBusy() || !mayReplace()) return false;
    let created = false;
    await run(async (context) => {
      const parent = await chooseLocalPath("directory");
      if (!parent || !context.isCurrent()) return;
      const snapshot = await localJson<WorkspaceSnapshot>("/workspaces", "POST", { parent, name: input });
      created = true;
      await loadFolder(workspaceFromSnapshot(snapshot), undefined, context);
    });
    return created;
  }
  function openExample(id: string, recent?: RecentLocation) {
    void run(async (context) =>
      loadFolder(
        workspaceFromSnapshot(await localJson<WorkspaceSnapshot>("/examples/open", "POST", { id })),
        recent,
        context,
      ),
    );
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
    if (!item.canReopen) {
      if (item.kind === "workspace") selectWorkspace(item);
      else selectFile(item);
      return;
    }
    void run(async (context) => {
      if (item.kind === "workspace") await loadFolder(await fetchWorkspace(item.id), item, context);
      else await loadFile(localEntry(item.id, item.name), item.id, context);
    });
  }
  function openWorkspaceGraph(path: string) {
    if (!workspace) {
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
  async function planFileOperation(input: FileMutationRequest) {
    if (!workspace?.localId) throw new Error("Open a local workspace to modify files.");
    if (input.kind === "delete" && workspace.activePath === input.path && stateRef.current.source.dirty)
      throw new Error("Save the open graph before deleting it. Unsaved edits have been kept.");
    return localJson<FileMutationPlan>(`/workspaces/${workspace.localId}/file-plan`, "POST", input);
  }
  async function runFileMutation(operation: () => Promise<FileMutationResult>, undo = false) {
    if (!workspace?.localId || operations.isBusy() || mutationBusy.current)
      throw new Error("Another workspace operation is running.");
    const folder = workspace;
    const before = stateRef.current;
    if (
      undo &&
      mutationUndo.current &&
      (before.document.generation !== mutationUndo.current.generation ||
        (before.dag &&
          (before.editHistory.revision !== mutationUndo.current.revision ||
            before.editHistory.savedRevision !== mutationUndo.current.savedRevision)))
    )
      throw new Error("The open graph changed after this operation. Undo would overwrite newer edits.");
    const outcome = await operations.run(async (context) => {
      mutationBusy.current = true;
      dispatch({ type: "workspaceFileMutationState", pending: true });
      try {
        const result = await operation();
        ownTransactions.current.add(result.transactionId);
        const found = await fetchWorkspace(folder.localId!);
        if (!context.isCurrent()) return result;
        const active = folder.activePath === result.path ? result.newPath : folder.activePath;
        setWorkspace({ ...found, locationId: folder.locationId, activePath: active || null });
        const current = stateRef.current;
        if (undo && mutationUndo.current) {
          const prior = mutationUndo.current.state;
          const entry = found.files.get(prior.source.fileName);
          if (entry) {
            const prepared = await prepareWorkspaceGraph(found, prior.source.fileName);
            dispatch({
              type: "workspaceDocumentRestored",
              snapshot: prior,
              revision: prepared.entry.local?.revision || "",
            });
            setWorkspace({ ...found, locationId: folder.locationId, activePath: prior.source.fileName });
          }
          mutationUndo.current = undefined;
        } else if (current.dag && current.source.localFile?.locationId === folder.localId) {
          if (!active) dispatch({ type: "graphClosed", status: "File deleted." });
          else {
            const prepared = await prepareWorkspaceGraph(found, active);
            dispatch({
              type: "workspaceDocumentRebased",
              caseInsensitive: result.caseInsensitive,
              path: result.path,
              newPath: result.newPath,
              revision: prepared.entry.local?.revision || "",
              fileName: active,
            });
          }
          mutationUndo.current = {
            id: result.undoId,
            state: current,
            revision: current.editHistory.revision,
            savedRevision: current.editHistory.savedRevision,
            generation: current.document.generation + 1,
          };
        }
        setNotice("");
        return result;
      } finally {
        mutationBusy.current = false;
        dispatch({ type: "workspaceFileMutationState", pending: false });
      }
    }, true);
    if (!outcome) throw new Error("Another workspace operation is running.");
    return outcome;
  }
  function commitFileOperation(plan: FileMutationPlan) {
    if (plan.kind === "delete" && workspace?.activePath === plan.path && stateRef.current.source.dirty)
      return Promise.reject(new Error("Save the open graph before deleting it."));
    return runFileMutation(() =>
      localJson<FileMutationResult>(`/workspaces/${workspace!.localId}/file-commit`, "POST", { planId: plan.id }),
    );
  }
  function undoFileOperation(id: string) {
    return runFileMutation(
      () => localJson<FileMutationResult>(`/workspaces/${workspace!.localId}/file-undo`, "POST", { transactionId: id }),
      true,
    );
  }
  function refreshWorkspace() {
    if (!workspace?.localId) return;
    const folder = workspace;
    void run(async (context) => {
      const found = await fetchWorkspace(folder.localId!);
      if (!context.isCurrent()) return;
      setWorkspace({ ...found, activePath: folder.activePath, locationId: folder.locationId });
      setNotice("Workspace files refreshed. Unsaved graph edits were kept.");
    });
  }
  useEffect(() => {
    const id = workspace?.localId;
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeLocalChanges((event) => {
      if (event.locationId && event.locationId !== id) return;
      if (mutationBusy.current || (event.transactionId && ownTransactions.current.has(event.transactionId))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchWorkspace(id)
          .then((found) => {
            if (cancelled) return;
            setWorkspace((current) =>
              current?.localId === id
                ? { ...found, activePath: current.activePath, locationId: current.locationId }
                : current,
            );
            if (event.locationId)
              setNotice(
                "Workspace files changed on disk. The open graph and unsaved edits were kept; select its entry again to reload it.",
              );
          })
          .catch((error) => {
            if (!cancelled) setNotice(error.message);
          });
      }, 350);
    }, id);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [workspace?.localId]);
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
  async function saveAndBind(
    kind: "style" | "layout",
    save: (
      folder: WorkspaceSession,
      path: string,
      reference: unknown,
      isCurrent: () => boolean,
    ) => Promise<SavedLinkedDocument>,
  ) {
    const snapshot = stateRef.current,
      folder = workspace;
    if (!snapshot.dag) return;
    await run(async (context) => {
      if (!folder || folder.activePath !== snapshot.source.fileName)
        throw new Error(`Open the graph's workspace to update its ${kind} file.`);
      if (!folder.localId && !folder.handle && !folder.exampleId)
        throw new Error("The graph's folder has no write access.");
      if (folder.localId && snapshot.source.localFile) {
        const entry = folder.files.get(snapshot.source.fileName);
        if (entry) entry.local = { ...snapshot.source.localFile };
      }
      const saved = await save(folder, snapshot.source.fileName, snapshot.dag!.metadata?.[kind], context.isCurrent);
      if (!context.isCurrent()) return;
      if (snapshot.source.localFile && saved.graphEntry?.local)
        snapshot.source.localFile.revision = saved.graphEntry.local.revision;
      setWorkspace((current) => {
        if (current?.locationId !== folder.locationId) return current;
        const files = new Map(current.files).set(saved.entry.path, saved.entry);
        if (saved.graphEntry) files.set(saved.graphEntry.path, saved.graphEntry);
        return { ...current, files };
      });
      if (kind === "layout") {
        if (!saved.persistedDag) throw new Error("Layout association was not persisted.");
        dispatch({
          type: "layoutReferenceBound",
          generation: snapshot.document.generation,
          reference: saved.reference,
          persistedDag: saved.persistedDag,
        });
      } else
        dispatch({
          type: "styleReferenceBound",
          generation: snapshot.document.generation,
          reference: saved.reference,
          persistedDag: saved.persistedDag,
        });
    });
  }
  function saveAndBindStyle(chartType: GraphChartType, style: ChartStyle) {
    return saveAndBind("style", (folder, path, reference, isCurrent) =>
      folder.localId || folder.handle
        ? saveWorkspaceStyle(folder, path, chartType, style, isCurrent, reference)
        : saveServedStyle(folder.exampleId!, path, chartType, style, reference),
    );
  }
  function saveAndBindLayout(config: LayoutConfigFile) {
    return saveAndBind("layout", (folder, path, reference, isCurrent) =>
      folder.localId || folder.handle
        ? saveWorkspaceLayout(folder, path, config, isCurrent, reference)
        : saveServedLayout(folder.exampleId!, path, config, reference),
    );
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
    createWorkspace,
    openRecent,
    removeRecent,
    openWorkspaceGraph,
    createGraph,
    refreshWorkspace,
    planFileOperation,
    commitFileOperation,
    undoFileOperation,
    closeWorkspace,
    prepareNewDocument,
    exportWorkspaceManifest,
    saveAndBindStyle,
    saveAndBindLayout,
    handleDroppedFiles,
    openExample,
  };
}
