import type { WorkspaceControls } from "../../app/workspace/workspaceControls";

export default function GeneralSessionSettings({
  files,
  hasGraph,
  fileName,
  onExport,
  onExportHtml,
  canExportCanvas,
  onClose,
  showExport = true,
  showSession = true,
}: {
  files: WorkspaceControls;
  hasGraph: boolean;
  fileName: string;
  onExport: () => void;
  onExportHtml: () => void;
  canExportCanvas: boolean;
  onClose: () => void;
  showExport?: boolean;
  showSession?: boolean;
}) {
  const workspace = files.workspace;
  return (
    <>
      {showExport && (
        <section className="settings-section settings-export-section">
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
        <section className="settings-section settings-session-section">
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
    </>
  );
}
