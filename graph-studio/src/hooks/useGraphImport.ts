import { useEffect, useRef, useState, type ChangeEvent, type Dispatch } from "react";
import { getDefaultFieldMapping } from "../graph/fieldMapping";
import { getInitialSelection } from "../graph/selectors";
import type { GraphAction } from "../state/graphActions";
import type { GraphAppState } from "../state/initialState";
import { normalizeDagInput } from "../graph/normalize";
import { downloadJsonFile } from "../adapters/download";
import { loadRecentLocations, readRecentMetadata, rememberLocation, forgetRecentLocation, type RecentLocation } from "../adapters/recentImport";
import { readWorkspaceDirectory, requestReadAccess, workspaceFromFiles } from "../adapters/workspaceAccess";
import { createWorkspaceManifest, discoverWorkspace, readGraphFile, WORKSPACE_MANIFEST } from "../workspace/discovery";
import type { GraphWorkspace, WorkspaceFile, WorkspaceFolder } from "../workspace/types";

export function useGraphImport({dispatch,state}: {dispatch:Dispatch<GraphAction>;state:GraphAppState}) {
  const [workspace,setWorkspace]=useState<GraphWorkspace|null>(null);
  const [recents,setRecents]=useState<RecentLocation[]>(readRecentMetadata);
  const [homeVisible,setHomeVisible]=useState(true);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [explorerOpen,setExplorerOpen]=useState(true);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const folderInputRef=useRef<HTMLInputElement>(null);
  const lock=useRef(false);
  const recentRevision=useRef(0);
  const pendingRecent=useRef<RecentLocation|undefined>(undefined);
  const stateRef=useRef(state);
  stateRef.current=state;
  useEffect(()=>{let active=true;const revision=recentRevision.current;void loadRecentLocations().then(items=>{if(active && revision===recentRevision.current)setRecents(items);});return()=>{active=false;};},[]);

  function mayReplace() {
    return !stateRef.current.source.dirty || window.confirm(`"${stateRef.current.source.fileName}" has unsaved changes. Discard them and open another document?`);
  }
  async function run(action:()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setNotice("");
    try {await action();}
    catch(error) {
      if(error instanceof DOMException && error.name==="AbortError")return;
      const message=error instanceof Error?error.message:String(error);
      setNotice(message);dispatch({type:"statusChanged",status:message});
    } finally {lock.current=false;setBusy(false);}
  }
  function commit(dag: ReturnType<typeof normalizeDagInput>, entry:WorkspaceFile) {
    dispatch({type:"graphLoaded",dag,fileName:entry.path,fileHandle:entry.handle,selection:getInitialSelection(dag,getDefaultFieldMapping()),status:`${Object.keys(dag.nodes).length} nodes loaded from ${entry.path}.`});
    setHomeVisible(false);
  }
  async function remember(input:Parameters<typeof rememberLocation>[0]) {
    recentRevision.current++;
    const items=await rememberLocation(input);setRecents(items);return items[0]?.id;
  }
  async function loadFile(entry:WorkspaceFile,recentId?:string) {
    const dag=await readGraphFile(entry);
    if(!mayReplace())return;
    setWorkspace(null);commit(dag,entry);
    await remember({id:recentId,kind:"file",name:entry.path,location:entry.path,handle:entry.handle || undefined});
  }
  async function loadFolder(folder:WorkspaceFolder,recent?:RecentLocation) {
    const found=await discoverWorkspace(folder,recent?.lastGraph);
    const entry=found.activePath?folder.files.get(found.activePath)!:null;
    const dag=entry?await readGraphFile(entry):null;
    if(!mayReplace())return;
    setWorkspace(found);setExplorerOpen(true);setHomeVisible(false);
    if(dag && entry)commit(dag,entry);
    else dispatch({type:"graphClosed",status:found.graphs.length?"Choose a graph from the workspace.":"No graph documents found. Add a Graph Studio v2 JSON file to this folder."});
    const recentId=await remember({id:recent?.id,kind:"workspace",name:found.name,location:folder.handle?.name || folder.name,handle:folder.handle || undefined,lastGraph:found.activePath || undefined});
    setWorkspace({...found,recentId});
  }
  function selectFile(recent?:RecentLocation) {
    if(lock.current)return;
    pendingRecent.current=recent;
    if(!window.showOpenFilePicker){fileInputRef.current?.click();return;}
    void run(async()=>{
      const handles=await window.showOpenFilePicker!({multiple:false,types:[{description:"Graph Studio graph",accept:{"application/json":[".json"]}}]});
      if(handles[0])await loadFile({path:handles[0].name,handle:handles[0]},handles[0].name===recent?.location?recent.id:undefined);
    });
  }
  function selectWorkspace(recent?:RecentLocation) {
    if(lock.current)return;
    pendingRecent.current=recent;
    if(!window.showDirectoryPicker){folderInputRef.current?.click();return;}
    void run(async()=>{
      const handle=await window.showDirectoryPicker!({mode:"read",id:"graph-studio-workspace"});
      await loadFolder(await readWorkspaceDirectory(handle),handle.name===recent?.location?recent:undefined);
    });
  }
  function openFile(){selectFile();}
  function openWorkspace(){selectWorkspace();}
  async function onFileChange(event:ChangeEvent<HTMLInputElement>) {
    const files=Array.from(event.currentTarget.files || []);event.currentTarget.value="";
    const recent=pendingRecent.current;pendingRecent.current=undefined;
    if(files[0])await run(()=>loadFile({path:files[0].name,file:files[0],handle:null},files[0].name===recent?.location?recent.id:undefined));
  }
  async function onFolderChange(event:ChangeEvent<HTMLInputElement>) {
    const files=Array.from(event.currentTarget.files || []);event.currentTarget.value="";
    const recent=pendingRecent.current;pendingRecent.current=undefined;
    if(files.length)await run(async()=>{const folder=workspaceFromFiles(files);await loadFolder(folder,folder.name===recent?.location?recent:undefined);});
  }
  async function handleDroppedFiles(files:FileList|File[]) {
    if(!files.length)return;
    await run(async()=>{
      if(files.length!==1)throw new Error("Open one graph file at a time, or use Open workspace for a folder.");
      await loadFile({path:files[0].name,file:files[0],handle:null});
    });
  }
  function openRecent(item:RecentLocation) {
    if(!item.handle) {
      setNotice(`Select "${item.location}" again to restore access.`);
      if(item.kind==="workspace")selectWorkspace(item);else selectFile(item);
      return;
    }
    void run(async()=>{
      if(!await requestReadAccess(item.handle!))throw new Error(`Access to "${item.location}" was not granted. Use Open ${item.kind==="workspace"?"workspace":"file"} to select it again.`);
      if(item.kind==="workspace")await loadFolder(await readWorkspaceDirectory(item.handle as FileSystemDirectoryHandle),item);
      else await loadFile({path:item.location,handle:item.handle as FileSystemFileHandle},item.id);
    });
  }
  function openWorkspaceGraph(path:string) {
    if(!workspace || path===workspace.activePath){setHomeVisible(false);return;}
    const folder=workspace;
    void run(async()=>{
      const entry=folder.files.get(path);
      if(!entry || !folder.graphs.some(graph=>graph.path===path))throw new Error("Graph not found in the current workspace.");
      const dag=await readGraphFile(entry);
      if(!mayReplace())return;
      commit(dag,entry);
      const next={...folder,activePath:path};setWorkspace(next);
      const recentId=await remember({id:folder.recentId,kind:"workspace",name:folder.name,location:folder.rootName,handle:folder.handle || undefined,lastGraph:path});
      setWorkspace({...next,recentId});
    });
  }
  function refreshWorkspace() {
    if(!workspace)return;
    const folder=workspace;
    if(!folder.handle){setNotice("Choose the folder again to refresh files in this browser.");selectWorkspace(recents.find(item=>item.id===folder.recentId));return;}
    void run(async()=>{
      const found=await discoverWorkspace(await readWorkspaceDirectory(folder.handle!),folder.activePath || undefined);
      // Refresh only updates the explorer. Unsaved graph edits stay in memory.
      setWorkspace({...found,activePath:folder.activePath,recentId:folder.recentId});
      setNotice("Workspace file list refreshed. The open document was kept unchanged.");
    });
  }
  function closeWorkspace() {
    if(lock.current || !mayReplace())return;
    setWorkspace(null);setHomeVisible(true);dispatch({type:"graphClosed",status:""});
  }
  function prepareNewDocument() {
    if(lock.current || !mayReplace())return false;
    setWorkspace(null);setHomeVisible(false);setNotice("");return true;
  }
  function exportWorkspaceManifest() {
    if(workspace)downloadJsonFile(JSON.stringify(createWorkspaceManifest(workspace),null,2),WORKSPACE_MANIFEST);
  }
  async function removeRecent(id:string) {await run(async()=>{recentRevision.current++;setRecents(await forgetRecentLocation(id));});}
  return {
    workspace,recents,homeVisible,setHomeVisible,busy,notice,setNotice,explorerOpen,setExplorerOpen,
    fileInputRef,folderInputRef,onFileChange,onFolderChange,openFile,openWorkspace,openRecent,removeRecent,
    openWorkspaceGraph,refreshWorkspace,closeWorkspace,prepareNewDocument,exportWorkspaceManifest,handleDroppedFiles,
  };
}

export type WorkspaceControls = ReturnType<typeof useGraphImport>;
