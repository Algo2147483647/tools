import IconButton from "../ui/IconButton";
import InlineNameForm from "../ui/InlineNameForm";
import Icon from "../ui/Icon";
import { type ReactNode, useMemo, useState } from "react";
import type { WorkspaceControls } from "../../controllers/workspaceControls";
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
          <Icon name="folder" size={18} />
          <strong title={workspace.name}>{workspace.name}</strong>
        </div>
        <div className="explorer-actions">
          <IconButton
            variant="quiet"
            label="Create graph file"
            disabled={files.busy}
            ariaExpanded={creating}
            onClick={() => setCreating((value) => !value)}
            icon={<Icon name="plus" size={16} />}
          />
          <IconButton
            variant="quiet"
            label="Refresh workspace files"
            disabled={files.busy}
            onClick={files.refreshWorkspace}
            icon={<Icon name="refresh" size={16} />}
          />
          <IconButton
            variant="quiet"
            label="Hide explorer"
            onClick={() => files.setExplorerOpen(false)}
            icon={<Icon name="panel" size={16} />}
          />
        </div>
      </div>
      <label className="explorer-search">
        <Icon name="search" size={15} />
        <input
          className="inline-input"
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
            <InlineNameForm
              label="Create graph file"
              inputLabel="New graph file"
              icon={<Icon name="graph" size={17} />}
              placeholder="New graph.json"
              busy={files.busy}
              onCancel={() => setCreating(false)}
              onSubmit={async (name) => {
                const created = await files.createGraph(name);
                if (created) setQuery("");
                return created;
              }}
            />
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
            <Icon name="graph" size={17} />
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
              <Icon name="file" size={16} />
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
