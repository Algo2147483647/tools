import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadJsonFile } from "../adapters/download";
import { analyzeGraphImport, type ImportGraphDocument, type ImportResolutions, type ConflictStrategy } from "../graph/importMerge";

export default function ImportConflictModal({ documents, onConfirm, onCancel }: {
  documents: ImportGraphDocument[];
  onConfirm: (resolutions: ImportResolutions) => void;
  onCancel: () => void;
}) {
  const [resolutions, setResolutions] = useState<ImportResolutions>({});
  const [commitError, setCommitError] = useState("");
  const [initialReport] = useState(() => analyzeGraphImport(documents));
  const lastReport = useRef(initialReport);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  const result = useMemo(() => {
    try {
      return { analysis: analyzeGraphImport(documents, resolutions), error: "" };
    } catch (error) {
      return { analysis: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [documents, resolutions]);
  if (result.analysis) lastReport.current = result.analysis;
  // Keep the editable rows visible when an invalid rename blocks analysis.
  const report = result.analysis ?? lastReport.current;

  function update(id: string, strategy: ConflictStrategy | "", name?: string) {
    setCommitError("");
    setResolutions(current => {
      const next = { ...current };
      if (strategy) next[id] = { strategy, name };
      else delete next[id];
      return next;
    });
  }

  return createPortal(
    <div className="import-conflict-overlay">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="import-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-conflict-title"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if ((event.ctrlKey || event.metaKey) && ["s", "z", "y"].includes(event.key.toLowerCase())) {
            event.preventDefault();
          } else if (event.key === "Tab") {
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select, input")];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
              event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault(); first?.focus();
            }
          }
        }}
      >
        <h2 id="import-conflict-title">Import conflict report</h2>
        <p>{documents.length} files · {report.conflicts.length} conflicts · {report.unresolved.length} unresolved</p>
        <p>Keep uses the existing value. Merge combines objects or arrays and asks about conflicting fields. Rename preserves the incoming value under a new name.</p>
        <p>Renaming a node also updates its incoming and outgoing edges from that file. Nothing is loaded until you apply the import.</p>
        <p>Renamed document headers and edge payload fields are kept in metadata. Files are processed in this order: {documents.map(doc => doc.name).join(" → ")}.</p>
        <div className="import-conflict-list">
          {report.conflicts.map(conflict => (
            <article key={conflict.id} className="import-conflict-item">
              <strong>{conflict.source} · {conflict.path}</strong>
              <div className="import-conflict-values">
                <div><span>Existing</span><pre>{JSON.stringify(conflict.existing, null, 2)}</pre></div>
                <div><span>Incoming</span><pre>{JSON.stringify(conflict.incoming, null, 2)}</pre></div>
              </div>
              <label>
                Strategy
                <select
                  aria-label={`Strategy for ${conflict.source} ${conflict.path}`}
                  value={resolutions[conflict.id]?.strategy || ""}
                  onChange={event => update(conflict.id, event.target.value as ConflictStrategy)}
                >
                  <option value="">Choose a strategy</option>
                  <option value="keep">Keep existing</option>
                  {conflict.canMerge && <option value="merge">Merge fields</option>}
                  {conflict.canRename && <option value="rename">Rename incoming</option>}
                </select>
              </label>
              {resolutions[conflict.id]?.strategy === "rename" && (
                <label>
                  New name (optional)
                  <input
                    aria-label={`New name for ${conflict.source} ${conflict.path}`}
                    placeholder="Generate a unique name"
                    value={resolutions[conflict.id]?.name || ""}
                    onChange={event => update(conflict.id, "rename", event.target.value)}
                  />
                </label>
              )}
            </article>
          ))}
        </div>
        {(result.error || commitError) && <p role="alert">{result.error || commitError}</p>}
        <footer>
          <button type="button" className="ghost-btn" onClick={() => downloadJsonFile(
            JSON.stringify({ files: documents.map(doc => doc.name), conflicts: report.conflicts, resolutions, error: result.error || undefined }, null, 2),
            "import-conflicts.json",
          )}>Download report</button>
          <button type="button" className="ghost-btn" onClick={onCancel}>Cancel import</button>
          <button
            type="button"
            className="primary-btn"
            disabled={Boolean(result.error) || report.unresolved.length > 0}
            onClick={() => {
              try { onConfirm(resolutions); }
              catch (error) { setCommitError(error instanceof Error ? error.message : String(error)); }
            }}
          >Apply import</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
