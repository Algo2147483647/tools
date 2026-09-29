import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "./WorkspaceIcon";

export default function WelcomeScreen({files,onNew,hasDocument}:{files:WorkspaceControls;onNew:()=>void;hasDocument:boolean}) {
  const workspaces=files.recents.filter(item=>item.kind==="workspace");
  const singleFiles=files.recents.filter(item=>item.kind==="file");
  return <main className="welcome-screen">
    <div className="welcome-inner">
      <div className="welcome-heading">
        <span className="welcome-mark"><WorkspaceIcon size={30}/></span>
        <p className="eyebrow">GRAPH STUDIO / LOCAL WORKSPACE</p>
        <h1>Your graphs,<br/><span>in one place.</span></h1>
        <p>Open a single graph, or bring your graphs and linked notes together in a workspace.</p>
      </div>
      <div className="welcome-actions">
        <button className="welcome-action primary" disabled={files.busy} onClick={files.openWorkspace}><WorkspaceIcon name="folder" size={25}/><span><strong>Open workspace</strong><small>Choose a folder of graphs and notes</small></span><span aria-hidden="true">↗</span></button>
        <button className="welcome-action" disabled={files.busy} onClick={files.openFile}><WorkspaceIcon name="file" size={25}/><span><strong>Open graph file</strong><small>Work with one Graph Studio JSON file</small></span><span aria-hidden="true">↗</span></button>
        <div className="welcome-quick"><button onClick={onNew} disabled={files.busy}>+ Create a graph</button><button onClick={files.openSankeyExample} disabled={files.busy}>Try a Sankey diagram →</button>{(hasDocument || files.workspace) && <button onClick={()=>files.setHomeVisible(false)}>Return to current session →</button>}</div>
      </div>
      <section className="welcome-recents" aria-labelledby="recent-workspaces-title">
        <div className="welcome-section-heading"><h2 id="recent-workspaces-title"><WorkspaceIcon name="recent"/>Recent workspaces</h2><span>{workspaces.length ? `${workspaces.length} saved`:"Saved on this browser"}</span></div>
        {workspaces.length ? <ul className="recent-list">{workspaces.map(item=><li key={item.id}>
          <button className="recent-open" disabled={files.busy} onClick={()=>files.openRecent(item)}><span className="recent-icon"><WorkspaceIcon name="folder"/></span><span><strong>{item.name}</strong><small title={item.location}>{item.location}{item.lastGraph?` / ${item.lastGraph}`:""}</small></span><span className="recent-meta">{item.canReopen?new Date(item.openedAt).toLocaleDateString():"Choose folder again"}<span aria-hidden="true"> →</span></span></button>
          <button className="recent-remove" title={`Remove ${item.name} from recent workspaces`} aria-label={`Remove ${item.name} from recent workspaces`} onClick={()=>void files.removeRecent(item.id)}><WorkspaceIcon name="close" size={15}/></button>
        </li>)}</ul>:<div className="recent-empty"><WorkspaceIcon name="folder" size={28}/><div><strong>Your next workspace starts here</strong><p>Folders you open appear here for quick access. Your files stay on your computer.</p></div><button onClick={files.openWorkspace} disabled={files.busy}>Choose a folder</button></div>}
      </section>
      {singleFiles.length>0 && <section className="welcome-recent-files"><h2>Recent files</h2><div>{singleFiles.slice(0,6).map(item=><button disabled={files.busy} key={item.id} title={item.location} onClick={()=>files.openRecent(item)}><WorkspaceIcon name="file" size={16}/>{item.name}<span>↗</span></button>)}</div></section>}
      <p className="welcome-footnote">Workspace folders enable linked files. Single-file mode opens only the selected graph.</p>
    </div>
  </main>;
}
