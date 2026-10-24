import { useRef, useState } from "react";
import Icon from "../ui/Icon";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import ExampleGallery from "./ExampleGallery";
import RecentProjects from "./RecentProjects";

export default function WelcomeScreen({
  files,
  onNew,
  hasDocument,
}: {
  files: WorkspaceControls;
  onNew: () => void;
  hasDocument: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const createButton = useRef<HTMLButtonElement>(null);
  function cancelCreate() {
    setCreating(false);
    files.setNotice("");
    createButton.current?.focus();
  }
  return (
    <main className="welcome-screen">
      <div className="welcome-inner">
        <RecentProjects files={files} />
        <section className="welcome-actions" aria-labelledby="welcome-open-title">
          <div className="welcome-section-heading">
            <h2 id="welcome-open-title">Get started</h2>
          </div>
          <button
            ref={createButton}
            className="welcome-action primary"
            disabled={files.busy}
            aria-expanded={creating}
            aria-controls="welcome-create-workspace"
            onClick={() => setCreating((value) => !value)}
          >
            <Icon name="plus" size={25} />
            <span>
              <strong>Create workspace</strong>
              <small>Start a new folder with your first graph</small>
            </span>
            <span aria-hidden="true">+</span>
          </button>
          {creating && (
            <form
              id="welcome-create-workspace"
              className="welcome-create-workspace"
              aria-label="Create workspace"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!files.busy && name.trim() && (await files.createWorkspace(name))) setCreating(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !files.busy) {
                  event.preventDefault();
                  cancelCreate();
                }
              }}
            >
              <label htmlFor="workspace-name">Workspace name</label>
              <input
                id="workspace-name"
                className="inline-input"
                autoFocus
                required
                maxLength={255}
                placeholder="My workspace"
                aria-describedby="workspace-create-help"
                value={name}
                disabled={files.busy}
                onChange={(event) => setName(event.target.value)}
              />
              <p id="workspace-create-help">Choose a location to create a new folder with this name.</p>
              <div className="welcome-create-actions">
                <button className="studio-button primary" type="submit" disabled={files.busy || !name.trim()}>
                  Choose location & create
                </button>
                <button className="studio-button" type="button" disabled={files.busy} onClick={cancelCreate}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <button className="welcome-action" disabled={files.busy} onClick={files.openWorkspace}>
            <Icon name="folder" size={25} />
            <span>
              <strong>Open workspace</strong>
              <small>Choose a folder of graphs and notes</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
          <button className="welcome-action" disabled={files.busy} onClick={files.openFile}>
            <Icon name="file" size={25} />
            <span>
              <strong>Open graph file</strong>
              <small>Work with one Graph Studio JSON file</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
          <div className="welcome-quick">
            <button onClick={onNew} disabled={files.busy}>
              + Create a graph
            </button>
            {(hasDocument || files.workspace) && (
              <button onClick={() => files.setHomeVisible(false)}>Return to current session →</button>
            )}
          </div>
        </section>
        <ExampleGallery onOpen={files.openExample} busy={files.busy} />
      </div>
    </main>
  );
}
