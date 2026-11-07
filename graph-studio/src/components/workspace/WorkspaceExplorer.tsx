import IconButton from "../ui/IconButton";
import InlineNameForm from "../ui/InlineNameForm";
import Icon from "../ui/Icon";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import type { FileMutationResult } from "../../workspace/fileContracts";
import { useWorkspaceFileIndex } from "./useWorkspaceFileIndex";
import WorkspaceFileWindow from "./WorkspaceFileWindow";

const types = [
  ["all", "All file types"],
  ["image", "Images"],
  ["document", "Documents"],
  ["json", "JSON"],
  ["css", "Stylesheets"],
  ["html", "Pages"],
  ["other", "Other"],
] as const;
function fileType(path: string) {
  if (/\.(svg|png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(path)) return "image";
  if (/\.(md|mdown|markdown|txt|pdf)$/i.test(path)) return "document";
  if (/\.json$/i.test(path)) return "json";
  if (/\.css$/i.test(path)) return "css";
  if (/\.html?$/i.test(path)) return "html";
  return "other";
}
export default function WorkspaceExplorer({
  files,
  dirty,
  children,
}: {
  files: WorkspaceControls;
  dirty: boolean;
  children?: ReactNode;
}) {
  const workspace = files.workspace!;
  const { index, error } = useWorkspaceFileIndex(workspace);
  const [tab, setTab] = useState<"graphs" | "assets">("graphs");
  const [queries, setQueries] = useState({ graphs: "", assets: "" });
  const [type, setType] = useState("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [undo, setUndo] = useState<FileMutationResult | null>(null);
  const [operationError, setOperationError] = useState("");
  const [width, setWidth] = useState(() => {
    try {
      return Math.max(220, Math.min(520, Number(localStorage.getItem("graph-studio.explorer-width")) || 280));
    } catch {
      return 280;
    }
  });
  const drag = useRef<{ id: number; x: number; width: number }>();
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("graph-studio.explorer-width", String(width));
    } catch {
      /* Keep resizing available without storage. */
    }
  }, [width]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (selected && !workspace.files.has(selected)) setSelected(null);
  }, [workspace.files, selected]);
  const counts = new Map<string, number>();
  for (const reference of index?.references || [])
    counts.set(reference.target, (counts.get(reference.target) || 0) + 1);
  const graphPaths = new Set(workspace.graphs.map((g) => g.path));
  const assets = [...workspace.files.keys()].filter((path) => !graphPaths.has(path)).sort();
  const rows = (
    tab === "graphs"
      ? workspace.graphs.map((g) => ({ path: g.path, title: g.title, error: g.error }))
      : assets.map((path) => ({ path, title: path.split("/").pop()!, error: undefined }))
  )
    .filter((file) => (file.title + " " + file.path).toLowerCase().includes(queries[tab].toLowerCase()))
    .filter((file) => tab === "graphs" || type === "all" || fileType(file.path) === type);
  if (tab === "assets" && index?.complete) rows.sort((a, b) => Number(counts.has(b.path)) - Number(counts.has(a.path)));
  const unused = tab === "assets" && index?.complete ? rows.findIndex((file) => !counts.has(file.path)) : -1;
  function mutation(result: FileMutationResult) {
    setUndo(result);
    setSelected(result.newPath || null);
    setOperationError("");
  }
  const resize = (next: number) => setWidth(Math.max(220, Math.min(520, window.innerWidth - 16, next)));
  return (
    <>
      <aside
        id="workspace-explorer"
        className="workspace-explorer"
        aria-label="Workspace explorer"
        style={{ width, flexBasis: width }}
      >
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
              onClick={() => setCreating(!creating)}
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
        <nav className="wf-tabs" role="tablist" aria-label="File categories">
          {(["graphs", "assets"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                  event.preventDefault();
                  setTab(value === "graphs" ? "assets" : "graphs");
                  (event.currentTarget.parentElement?.querySelector(`[aria-selected="false"]`) as HTMLElement)?.focus();
                }
              }}
            >
              {value === "graphs" ? "Graphs" : "Assets"}
              <small>{value === "graphs" ? workspace.graphs.length : assets.length}</small>
            </button>
          ))}
        </nav>
        <label className="explorer-search">
          <Icon name="search" size={15} />
          <input
            className="inline-input"
            aria-label="Find workspace files"
            placeholder={`Search ${tab}…`}
            value={queries[tab]}
            onChange={(event) => setQueries({ ...queries, [tab]: event.target.value })}
          />
        </label>
        {tab === "assets" && (
          <details
            ref={picker}
            className="wf-type-picker"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary>
              <Icon name="filter" size={14} />
              <span>{types.find((item) => item[0] === type)?.[1]}</span>
              <Icon name="chevron" size={14} />
            </summary>
            <div>
              {types.map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={type === value}
                  onClick={() => {
                    setType(value);
                    if (picker.current) {
                      picker.current.open = false;
                      picker.current.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <Icon name="check" size={14} />
                  {label}
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="explorer-files">
          {creating && (
            <InlineNameForm
              label="Create graph file"
              inputLabel="New graph file"
              icon={<Icon name="graph" size={17} />}
              placeholder="New graph.json"
              busy={files.busy}
              onCancel={() => setCreating(false)}
              onSubmit={async (name) => {
                const created = await files.createGraph(name);
                if (created) {
                  setQueries({ ...queries, graphs: "" });
                  setTab("graphs");
                }
                return created;
              }}
            />
          )}
          {rows.map((file, i) => (
            <Fragment key={file.path}>
              {i === unused && i > 0 && <hr className="wf-divider" aria-label="Unreferenced files" />}
              <button
                className={`explorer-file${(selected || workspace.activePath) === file.path ? " is-active" : ""}${file.error ? " has-error" : ""}`}
                title={file.error || file.title}
                disabled={files.busy}
                onClick={() => {
                  setSelected(file.path);
                  if (tab === "graphs" && workspace.activePath !== file.path) files.openWorkspaceGraph(file.path);
                }}
              >
                <Icon name={tab === "graphs" ? "graph" : "file"} size={17} />
                <span>
                  <strong>{file.title}</strong>
                </span>
                {file.error ? (
                  <b>!</b>
                ) : workspace.activePath === file.path && dirty ? (
                  <b aria-label="Unsaved changes">●</b>
                ) : null}
                <small
                  className="wf-count"
                  title={index?.complete ? `${counts.get(file.path) || 0} references` : "Reference scan incomplete"}
                >
                  {index?.complete ? counts.get(file.path) || 0 : "—"}
                </small>
              </button>
            </Fragment>
          ))}
          {!rows.length && <p className="explorer-empty">No matching files.</p>}
          {(error || operationError) && (
            <p className="wf-error" role="alert">
              {error || operationError}
            </p>
          )}
          {index && !index.complete && (
            <details className="wf-scan-errors">
              <summary>Reference scan incomplete</summary>
              {index.files
                .filter((f) => f.status === "failed")
                .map((f) => (
                  <p key={f.path}>
                    {f.path}: {f.message}
                  </p>
                ))}
            </details>
          )}
          {undo && (
            <div className="wf-undo">
              <span>{undo.kind === "delete" ? "File deleted" : "File renamed"}</span>
              <button
                disabled={files.busy}
                onClick={() => {
                  void files
                    .undoFileOperation(undo.undoId)
                    .then(() => {
                      setUndo(null);
                      setSelected(null);
                    })
                    .catch((error) => setOperationError(error.message));
                }}
              >
                Undo
              </button>
              <button aria-label="Dismiss operation" onClick={() => setUndo(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {children}
        </div>
        <div
          className="wf-sidebar-resizer"
          role="separator"
          aria-label="Resize file sidebar"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={520}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault();
              resize(width + (event.key === "ArrowRight" ? 10 : -10));
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            drag.current = { id: event.pointerId, x: event.clientX, width };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (drag.current?.id === event.pointerId) resize(drag.current.width + event.clientX - drag.current.x);
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
          onLostPointerCapture={() => {
            drag.current = undefined;
          }}
        />
      </aside>
      {selected && workspace.files.has(selected) && (
        <WorkspaceFileWindow
          key={workspace.locationId}
          path={selected}
          files={files}
          index={index}
          onClose={() => setSelected(null)}
          onMutation={mutation}
        />
      )}
    </>
  );
}
