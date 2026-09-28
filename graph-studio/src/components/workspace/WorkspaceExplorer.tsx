import { useMemo, useState } from "react";
import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "./WorkspaceIcon";
export default function WorkspaceExplorer({files,onOpenAsset,dirty}:{files:WorkspaceControls;onOpenAsset:(path:string)=>void;dirty:boolean}) {
  const [query,setQuery]=useState("");
  const workspace=files.workspace!;
  const graphs=workspace.graphs.filter(graph=>`${graph.path} ${graph.title}`.toLowerCase().includes(query.toLowerCase()));
  const assets=useMemo(()=>{const graphPaths=new Set(workspace.graphs.map(graph=>graph.path));return [...workspace.files.keys()].filter(path=>!graphPaths.has(path)).sort();},[workspace]);
  const matchingAssets=assets.filter(path=>path.toLowerCase().includes(query.toLowerCase()));
  return <aside className="workspace-explorer" aria-label="Workspace explorer">
    <div className="explorer-heading"><span>EXPLORER</span><div><button title="Refresh workspace files" aria-label="Refresh workspace files" disabled={files.busy} onClick={files.refreshWorkspace}><WorkspaceIcon name="refresh" size={16}/></button><button title="Hide explorer" aria-label="Hide explorer" onClick={()=>files.setExplorerOpen(false)}><WorkspaceIcon name="panel" size={16}/></button></div></div>
    <div className="explorer-workspace"><WorkspaceIcon name="folder"/><strong title={workspace.name}>{workspace.name}</strong></div>
    <label className="explorer-search"><WorkspaceIcon name="search" size={15}/><input aria-label="Find workspace files" placeholder="Find a file…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="explorer-files">
      <h3>Graphs <span>{workspace.graphs.length}</span></h3>
      {graphs.map(graph=><button key={graph.path} className={`explorer-file${workspace.activePath===graph.path?" is-active":""}${graph.error?" has-error":""}`} aria-current={workspace.activePath===graph.path?"page":undefined} disabled={files.busy} onClick={()=>files.openWorkspaceGraph(graph.path)} title={graph.error || `${graph.path} · ${graph.nodeCount} nodes · ${graph.edgeCount} edges`}>
        <WorkspaceIcon name="graph" size={17}/><span><strong>{graph.title}</strong><small>{graph.path}</small></span>{graph.error?<b>!</b>:workspace.activePath===graph.path&&dirty?<b aria-label="Unsaved changes">●</b>:null}
      </button>)}
      {!graphs.length && <p className="explorer-empty">{query?"No matching graphs.":"No graph files detected."}</p>}
      <details open={Boolean(query)}><summary>Linked files <span>{assets.length}</span></summary>{matchingAssets.slice(0,200).map(path=><button key={path} className="explorer-file asset-file" title={path} onClick={()=>onOpenAsset(path)}><WorkspaceIcon name="file" size={16}/><span>{path}</span></button>)}{matchingAssets.length>200&&<p className="explorer-empty">Refine your search to see more files.</p>}</details>
    </div>
    <footer><span className="workspace-detection-dot"/>{workspace.manifest?"Workspace manifest":"Auto-detected"}<small>{workspace.files.size} files · {workspace.handle?"Folder access":"Selected files"}</small></footer>
  </aside>;
}
