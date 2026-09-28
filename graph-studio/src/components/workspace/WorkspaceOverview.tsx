import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "./WorkspaceIcon";
export default function WorkspaceOverview({files}:{files:WorkspaceControls}) {
  const workspace=files.workspace!;
  return <section className="workspace-overview">
    <WorkspaceIcon name="folder" size={42}/><p className="eyebrow">WORKSPACE</p><h1>{workspace.name}</h1>
    <p>{workspace.graphs.length?"Choose a graph in the explorer to start. Each file opens independently.":"No Graph Studio documents were found in this folder."}</p>
    {!files.explorerOpen && <button className="studio-button" onClick={()=>files.setExplorerOpen(true)}>Show explorer</button>}
    <div className="workspace-overview-cards"><div><strong>{workspace.graphs.length}</strong><span>Graph documents</span></div><div><strong>{workspace.files.size}</strong><span>Workspace files</span></div></div>
    {workspace.graphs.some(graph=>graph.error)&&<p className="workspace-warning">Some graph files need attention. Select a marked file to see the validation error.</p>}
    <details><summary>How workspace detection works</summary><p>A workspace manifest declares graph files and a default graph. Without one, Graph Studio detects v2 JSON documents. A single graph or root graph.json opens automatically.</p>{workspace.notices.map(note=><p key={note}>{note}</p>)}<button onClick={files.exportWorkspaceManifest}>Download workspace manifest</button></details>
  </section>;
}
