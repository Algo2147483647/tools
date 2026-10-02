import type { RecentLocation } from "../../adapters/recentImport";
import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "../workspace/WorkspaceIcon";

export default function GeneralSettings({
  files,
  hasGraph,
  fileName,
  onInitializeCanvas,
  onExport,
  consoleSidebarOpen,
  onConsoleSidebarToggle,
  onClose,
}: {
  files: WorkspaceControls;
  hasGraph: boolean;
  fileName: string;
  onInitializeCanvas: () => void;
  onExport: () => void;
  consoleSidebarOpen: boolean;
  onConsoleSidebarToggle: () => void;
  onClose: () => void;
}) {
  const workspace = files.workspace;
  return (
    <>
      <section className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3>Open & create</h3>
            <p>Choose a single document or a folder-based workspace.</p>
          </div>
        </div>
        <div className="settings-open-grid">
          <button
            disabled={files.busy}
            onClick={() => {
              onClose();
              files.openFile();
            }}
          >
            <WorkspaceIcon name="file" />
            <span>
              <strong>Open graph file</strong>
              <small>One JSON document</small>
            </span>
          </button>
          <button
            disabled={files.busy}
            onClick={() => {
              onClose();
              files.openWorkspace();
            }}
          >
            <WorkspaceIcon name="folder" />
            <span>
              <strong>Open workspace</strong>
              <small>Graphs and linked files</small>
            </span>
          </button>
        </div>
        <div className="settings-inline-actions">
          <button
            className="studio-button"
            onClick={() => {
              onInitializeCanvas();
              onClose();
            }}
          >
            + New graph
          </button>
          <button className="studio-button" disabled={!hasGraph} onClick={onExport}>
            Export current view as SVG
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h3>Current session</h3>
        <dl className="session-details">
          <div>
            <dt>Mode</dt>
            <dd>{workspace ? "Workspace" : hasGraph ? "Single file" : "Welcome"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{workspace ? workspace.rootName : fileName || "No file open"}</dd>
          </div>
          {workspace && (
            <>
              <div>
                <dt>Discovery</dt>
                <dd>{workspace.manifest ? "Workspace manifest" : "Automatic detection"}</dd>
              </div>
              <div>
                <dt>Active graph</dt>
                <dd>{workspace.activePath || "Choose a graph in the explorer"}</dd>
              </div>
              <div>
                <dt>Linked files</dt>
                <dd>Relative to each document, within this workspace</dd>
              </div>
            </>
          )}
        </dl>
        {workspace && (
          <div className="settings-inline-actions">
            <button className="studio-button" onClick={files.refreshWorkspace} disabled={files.busy}>
              Refresh file list
            </button>
            <button className="studio-button" onClick={files.exportWorkspaceManifest}>
              Download workspace manifest
            </button>
            <button
              className="studio-button subtle-danger"
              onClick={() => {
                files.closeWorkspace();
                onClose();
              }}
            >
              Close workspace
            </button>
          </div>
        )}
        {workspace && (
          <p className="settings-help">
            Place the manifest in the workspace root as <code>graph-studio.workspace.json</code> to keep the graph list
            and default graph.
          </p>
        )}
        <label className="settings-toggle-row">
          <span>
            <strong>Graph console</strong>
            <small>Run commands and work with the AI assistant.</small>
          </span>
          <input type="checkbox" role="switch" checked={consoleSidebarOpen} onChange={onConsoleSidebarToggle} />
        </label>
      </section>
      <section className="settings-section">
        <h3>Recent locations</h3>
        <p>Folder permissions may need to be renewed when reopening.</p>
        {!files.recents.length && (
          <p className="settings-help">Recently opened files and workspaces will appear here.</p>
        )}
        <ul className="settings-recent-list">
          {files.recents.map((item: RecentLocation) => (
            <li key={item.id}>
              <button
                disabled={files.busy}
                onClick={() => {
                  onClose();
                  files.openRecent(item);
                }}
              >
                <WorkspaceIcon name={item.kind === "workspace" ? "folder" : "file"} size={18} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.location}</small>
                </span>
                <span>{item.canReopen ? "Open" : "Choose again"}</span>
              </button>
              <button
                aria-label={`Remove recent location ${item.name}`}
                title="Remove from recent"
                onClick={() => void files.removeRecent(item.id)}
              >
                <WorkspaceIcon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
