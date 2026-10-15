import { type ReactNode, useMemo, useState } from "react";
import type { WorkspaceControls } from "../../controllers/useWorkspaceController";
import { PlusIcon } from "../topbar/TopbarIcons";
import WorkspaceIcon from "./WorkspaceIcon";
export default function WorkspaceExplorer({
  files,
  onOpenAsset,
  dirty,
  children,
}: {
  files: WorkspaceControls;
  onOpenAsset: (path: string) => void;
  dirty: boolean;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [fileName, setFileName] = useState("");
  const workspace = files.workspace!;
  const canCreate = Boolean(workspace.handle?.getFileHandle && workspace.handle?.removeEntry);
  const graphs = workspace.graphs.filter((graph) =>
    `${graph.path} ${graph.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  const assets = useMemo(() => {
    const graphPaths = new Set(workspace.graphs.map((graph) => graph.path));
    return [...workspace.files.keys()].filter((path) => !graphPaths.has(path)).sort();
  }, [workspace]);
  const matchingAssets = assets.filter((path) => path.toLowerCase().includes(query.toLowerCase()));
  return (
    <aside className="workspace-explorer" aria-label="Workspace explorer">
      <div className="explorer-heading">
        <div className="explorer-workspace">
          <WorkspaceIcon name="folder" size={18} />
          <strong title={workspace.name}>{workspace.name}</strong>
        </div>
        <div className="explorer-actions">
          <button
            title="Create graph file"
            aria-label="Create graph file"
            disabled={files.busy}
            aria-expanded={creating}
            onClick={() => setCreating((value) => !value)}
          >
            <PlusIcon />
          </button>
          <button
            title="Refresh workspace files"
            aria-label="Refresh workspace files"
            disabled={files.busy}
            onClick={files.refreshWorkspace}
          >
            <WorkspaceIcon name="refresh" size={16} />
          </button>
          <button title="Hide explorer" aria-label="Hide explorer" onClick={() => files.setExplorerOpen(false)}>
            <WorkspaceIcon name="panel" size={16} />
          </button>
        </div>
      </div>
      <label className="explorer-search">
        <WorkspaceIcon name="search" size={15} />
        <input
          aria-label="Find workspace files"
          placeholder="Find a file…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="explorer-files">
        <h3>
          Graphs <span>{workspace.graphs.length}</span>
        </h3>
        {creating &&
          (canCreate ? (
            <form
              className="explorer-create"
              aria-label="Create graph file"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await files.createGraph(fileName)) {
                  setCreating(false);
                  setFileName("");
                  setQuery("");
                }
              }}
            >
              <WorkspaceIcon name="graph" size={17} />
              <input
                id="new-graph-file-name"
                aria-label="New graph file"
                autoFocus
                placeholder="New graph.json"
                value={fileName}
                disabled={files.busy}
                onChange={(event) => setFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCreating(false);
                }}
              />
              <button
                type="submit"
                className="explorer-create-confirm"
                title="Create"
                aria-label="Create"
                disabled={files.busy || !fileName.trim()}
              >
                <WorkspaceIcon name="check" size={15} />
              </button>
              <button
                type="button"
                title="Cancel"
                aria-label="Cancel"
                disabled={files.busy}
                onClick={() => setCreating(false)}
              >
                <WorkspaceIcon name="close" size={14} />
              </button>
            </form>
          ) : (
            <div className="explorer-create-unavailable">
              <p>Open a local workspace to create files.</p>
              <button className="studio-button" disabled={files.busy} onClick={files.openWorkspace}>
                Open workspace
              </button>
            </div>
          ))}
        {graphs.map((graph) => (
          <button
            key={graph.path}
            className={`explorer-file${workspace.activePath === graph.path ? " is-active" : ""}${graph.error ? " has-error" : ""}`}
            aria-current={workspace.activePath === graph.path ? "page" : undefined}
            disabled={files.busy}
            onClick={() => files.openWorkspaceGraph(graph.path)}
            title={graph.error || `${graph.path} · ${graph.nodeCount} nodes · ${graph.edgeCount} edges`}
          >
            <WorkspaceIcon name="graph" size={17} />
            <span>
              <strong>{graph.title}</strong>
              <small>{graph.path}</small>
            </span>
            {graph.error ? (
              <b>!</b>
            ) : workspace.activePath === graph.path && dirty ? (
              <b aria-label="Unsaved changes">●</b>
            ) : null}
          </button>
        ))}
        {!graphs.length && (
          <p className="explorer-empty">{query ? "No matching graphs." : "No graph files detected."}</p>
        )}
        <details open={Boolean(query)}>
          <summary>
            Linked files <span>{assets.length}</span>
          </summary>
          {matchingAssets.slice(0, 200).map((path) => (
            <button key={path} className="explorer-file asset-file" title={path} onClick={() => onOpenAsset(path)}>
              <WorkspaceIcon name="file" size={16} />
              <span>{path}</span>
            </button>
          ))}
          {matchingAssets.length > 200 && <p className="explorer-empty">Refine your search to see more files.</p>}
        </details>
        {children}
      </div>
      <footer>
        <span className="workspace-detection-dot" />
        {workspace.exampleId ? "Example workspace" : workspace.manifest ? "Workspace manifest" : "Auto-detected"}
        <small>
          {workspace.files.size} files ·{" "}
          {workspace.exampleId ? "Editable copy" : workspace.handle ? "Folder access" : "Selected files"}
        </small>
      </footer>
    </aside>
  );
}
