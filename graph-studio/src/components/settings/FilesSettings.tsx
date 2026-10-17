import Icon from "../ui/Icon";
import type { RecentLocation } from "../../workspace/locations";
import type { WorkspaceControls } from "../../controllers/workspaceControls";

export default function FilesSettings({
  files,
  hasGraph,
  fileName,
  onInitializeCanvas,
  onExport,
  onExportHtml,
  canExportCanvas,
  onClose,
  showFiles = true,
  showSession = true,
}: {
  files: WorkspaceControls;
  hasGraph: boolean;
  fileName: string;
  onInitializeCanvas: () => void;
  onExport: () => void;
  onExportHtml: () => void;
  canExportCanvas: boolean;
  onClose: () => void;
  showFiles?: boolean;
  showSession?: boolean;
}) {
  const workspace = files.workspace;
  return (
    <>
      {showFiles && (
        <section className="settings-section">
          <div className="settings-section-header">
            <div>
              <h3>Open & create</h3>
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
              <Icon name="file" />
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
              <Icon name="folder" />
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
          </div>
        </section>
      )}
      {showFiles && (
        <section className="settings-section">
          <h3>Export current view</h3>
          <div className="settings-inline-actions">
            <button className="studio-button" disabled={!canExportCanvas} onClick={onExport}>
              Export SVG
            </button>
            <button className="studio-button" disabled={!canExportCanvas} onClick={onExportHtml}>
              Export interactive HTML
            </button>
          </div>
        </section>
      )}
      {showSession && (
        <section className="settings-section">
          <details className="settings-disclosure">
            <summary>Current session · {workspace?.rootName || fileName || "No file open"}</summary>
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
                Place the manifest in the workspace root as <code>graph-studio.workspace.json</code> to keep the graph
                list and default graph.
              </p>
            )}
          </details>
        </section>
      )}
      {showFiles && (
        <section className="settings-section">
          <h3>Recent locations</h3>
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
                  <Icon name={item.kind === "workspace" ? "folder" : "file"} size={18} />
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
                  <Icon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
