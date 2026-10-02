import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "./WorkspaceIcon";
import ExampleGallery from "./ExampleGallery";
import RecentProjects from "./RecentProjects";

export default function WelcomeScreen({files,onNew,hasDocument}:{files:WorkspaceControls;onNew:()=>void;hasDocument:boolean}) {
  return <main className="welcome-screen">
    <div className="welcome-inner">
      <RecentProjects files={files}/>
      <section className="welcome-actions" aria-labelledby="welcome-open-title">
        <div className="welcome-section-heading"><h2 id="welcome-open-title">Open</h2></div>
        <button className="welcome-action primary" disabled={files.busy} onClick={files.openWorkspace}><WorkspaceIcon name="folder" size={25}/><span><strong>Open workspace</strong><small>Choose a folder of graphs and notes</small></span><span aria-hidden="true">↗</span></button>
        <button className="welcome-action" disabled={files.busy} onClick={files.openFile}><WorkspaceIcon name="file" size={25}/><span><strong>Open graph file</strong><small>Work with one Graph Studio JSON file</small></span><span aria-hidden="true">↗</span></button>
        <div className="welcome-quick"><button onClick={onNew} disabled={files.busy}>+ Create a graph</button>{(hasDocument || files.workspace) && <button onClick={()=>files.setHomeVisible(false)}>Return to current session →</button>}</div>
      </section>
      <ExampleGallery onOpen={files.openExample} busy={files.busy}/>
    </div>
  </main>;
}
