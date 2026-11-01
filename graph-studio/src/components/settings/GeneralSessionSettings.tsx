import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import { useGeneralPreferences, type FileOpenMode } from "../../workspace/generalPreferences";

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
  showFileOpening = true,
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
  showFileOpening?: boolean;
}) {
  const workspace = files.workspace;
  const preferences = useGeneralPreferences();
  return (
    <>
      {showFileOpening && (
        <section className="settings-section">
          <h3>Files</h3>
          <label className="settings-field-label" htmlFor="file-open-mode">
            <span>Open linked files</span>
            <select
              id="file-open-mode"
              className="settings-select-input"
              value={preferences.fileOpenMode}
              disabled={!preferences.loaded || preferences.saving}
              onChange={(event) => void preferences.setFileOpenMode(event.target.value as FileOpenMode)}
            >
              <option value="preview">Graph Studio preview</option>
              <option value="external">System default application</option>
            </select>
          </label>
          <p className="settings-help">
            Applies to files such as Markdown opened from the explorer, node details, and document links. Saved
            automatically for this computer.
          </p>
          {preferences.error && (
            <p className="settings-help" role="alert">
              {preferences.error}
            </p>
          )}
        </section>
      )}
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
                <dd>{workspace ? workspace.absolutePath || workspace.rootName : fileName || "No file open"}</dd>
              </div>
              {workspace && (
                <>
                  <div>
                    <dt>Discovery</dt>
                    <dd>
                      {workspace.manifest ? "Automatic detection with configured ordering" : "Automatic detection"}
                    </dd>
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
                Place the manifest in the workspace root as <code>graph-studio.workspace.json</code> to name the
                workspace and order its graphs.
              </p>
            )}
          </details>
        </section>
      )}
    </>
  );
}
