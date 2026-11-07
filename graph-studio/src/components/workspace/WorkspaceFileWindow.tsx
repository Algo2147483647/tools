import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon";
import { useFloatingWindow } from "../ui/useFloatingWindow";
import { localJson } from "../../workspace/localApi";
import { readWorkspaceFile } from "../../workspace/browserAccess";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import type {
  FileMutationPlan,
  FileMutationResult,
  ReferenceLocation,
  WorkspaceReferenceIndex,
} from "../../workspace/fileContracts";

export default function WorkspaceFileWindow({
  path,
  files,
  index,
  onClose,
  onMutation,
}: {
  path: string;
  files: WorkspaceControls;
  index: WorkspaceReferenceIndex | null;
  onClose(): void;
  onMutation(result: FileMutationResult): void;
}) {
  const floating = useFloatingWindow("graph-studio.file-window.v1");
  const [source, setSource] = useState<{ reference: ReferenceLocation; text: string } | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"rename" | null>(null);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<FileMutationPlan | null>(null);
  const [working, setWorking] = useState(false);
  const request = useRef(0);
  const workspace = files.workspace!;
  useEffect(() => {
    request.current++;
    setSource(null);
    setError("");
    setMode(null);
    setPlan(null);
  }, [path]);
  useEffect(() => {
    floating.ref.current?.focus();
    return () => {
      request.current++;
    };
  }, []);
  const refs = index?.references.filter((r) => r.target === path) || [];
  async function run(task: () => Promise<void>) {
    setError("");
    setWorking(true);
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function showSource(reference: ReferenceLocation) {
    const token = ++request.current;
    await run(async () => {
      const entry = workspace.files.get(reference.source);
      if (!entry) throw new Error("Source file no longer exists.");
      const text = await (await readWorkspaceFile(entry)).text();
      if (token === request.current) setSource({ reference, text });
    });
  }
  const disabled = working || files.busy;
  return createPortal(
    <section
      ref={floating.ref}
      style={floating.style}
      className="floating-window workspace-file-window"
      role="dialog"
      aria-label="File details"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !disabled) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="floating-window__header" {...floating.headerProps}>
        <Icon name={workspace.graphs.some((g) => g.path === path) ? "graph" : "file"} size={17} />
        <div className="wf-title">
          <strong>{path.split("/").pop()}</strong>
          <span title={path}>{path}</span>
        </div>
        <div className="wf-actions">
          <button
            className="icon-button"
            title="Open with default app"
            aria-label="Open with default app"
            disabled={disabled || !workspace.localId}
            onClick={() =>
              void run(async () => {
                await localJson(`/workspaces/${workspace.localId}/open-external`, "POST", { path });
              })
            }
          >
            <Icon name="enter-group" size={17} />
          </button>
          <button
            className="icon-button"
            title="Rename"
            aria-label="Rename file"
            disabled={disabled || !workspace.localId}
            onClick={() => {
              setName(path.split("/").pop()!);
              setMode("rename");
              setPlan(null);
            }}
          >
            <Icon name="edit" size={17} />
          </button>
          <button
            className="icon-button wf-danger"
            title="Delete"
            aria-label="Delete file"
            disabled={disabled || !workspace.localId}
            onClick={() =>
              void run(async () => {
                setMode(null);
                setPlan(await files.planFileOperation({ kind: "delete", path }));
              })
            }
          >
            <Icon name="trash" size={17} />
          </button>
          <button
            className="floating-window__close"
            aria-label="Close file details"
            disabled={disabled}
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      </header>
      <div className="wf-body">
        {error && (
          <p className="wf-error" role="alert">
            {error}
          </p>
        )}
        {!workspace.localId && (
          <p className="wf-note">Open a local workspace to rename, delete or open files externally.</p>
        )}
        {mode === "rename" && !plan && (
          <form
            className="wf-operation"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => setPlan(await files.planFileOperation({ kind: "rename", path, name })));
            }}
          >
            <label>
              File name
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={disabled} />
            </label>
            <div className="wf-operation-actions">
              <button type="button" className="studio-button" onClick={() => setMode(null)}>
                Cancel
              </button>
              <button className="studio-button" disabled={disabled || !name.trim()}>
                Review rename
              </button>
            </div>
          </form>
        )}
        {plan && (
          <div className="wf-operation">
            <h3>
              {plan.kind === "delete" ? "Delete file and remove references" : "Rename file and update references"}
            </h3>
            <p>{plan.newPath || plan.path}</p>
            <p>
              {plan.references.length} references · {plan.changes.length} affected files
            </p>
            <ul>
              {plan.changes.map((change) => (
                <li key={change.path}>
                  {change.path}
                  <small>
                    {change.after === null ? "Remove" : change.before === null ? "Create" : "Update references"}
                  </small>
                </li>
              ))}
            </ul>
            <div className="wf-operation-actions">
              <button
                className="studio-button"
                disabled={disabled}
                onClick={() => {
                  setPlan(null);
                  setMode(null);
                }}
              >
                Cancel
              </button>
              <button
                className={`studio-button ${plan.kind === "delete" ? "wf-danger" : ""}`}
                disabled={disabled}
                onClick={() =>
                  void run(async () => {
                    const result = await files.commitFileOperation(plan);
                    setPlan(null);
                    setMode(null);
                    onMutation(result);
                  })
                }
              >
                {plan.kind === "delete" ? "Delete & remove references" : "Rename & update references"}
              </button>
            </div>
          </div>
        )}
        <h2 className="wf-section">
          REFERENCES<span>{index ? `${refs.length} locations` : "Scanning…"}</span>
        </h2>
        {index && !index.complete && (
          <p className="wf-error">Some files could not be scanned. Reference counts are incomplete.</p>
        )}
        {refs.map((reference, i) => (
          <button
            className="wf-reference"
            key={`${reference.source}:${reference.locator}:${i}`}
            onClick={() => void showSource(reference)}
          >
            <div className="wf-ref-head">
              <Icon name={workspace.graphs.some((g) => g.path === reference.source) ? "graph" : "file"} size={17} />
              <strong>{reference.source.split("/").pop()}</strong>
              <span className="wf-ref-path" title={reference.source}>
                {reference.source}
              </span>
              <span>L{reference.line} ↗</span>
            </div>
            <code>
              {reference.context.includes(reference.raw) ? (
                <>
                  {reference.context.slice(0, reference.context.indexOf(reference.raw))}
                  <mark>{reference.raw}</mark>
                  {reference.context.slice(reference.context.indexOf(reference.raw) + reference.raw.length)}
                </>
              ) : (
                reference.context
              )}
            </code>
          </button>
        ))}
        {index && !refs.length && <p className="wf-note">No references found in supported file formats.</p>}
        {source && (
          <section className="wf-source">
            <header>
              <strong>
                {source.reference.source} · Line {source.reference.line}
              </strong>
              <button className="icon-button" aria-label="Close reference source" onClick={() => setSource(null)}>
                <Icon name="close" size={16} />
              </button>
            </header>
            <div>
              {source.text
                .split("\n")
                .slice(Math.max(0, source.reference.line - 6), source.reference.line + 8)
                .map((line, i) => {
                  const number = Math.max(1, source.reference.line - 5) + i;
                  return (
                    <pre key={number} className={number === source.reference.line ? "is-hit" : ""}>
                      <span>{number}</span>
                      <code>{line || " "}</code>
                    </pre>
                  );
                })}
            </div>
          </section>
        )}
      </div>
    </section>,
    document.body,
  );
}
