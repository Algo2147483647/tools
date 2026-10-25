import { useRef, useState, type Dispatch } from "react";
import type { GraphAppState } from "../../app/document/initialState";
import type { GraphAction } from "../../app/document/graphActions";
import { defaultLayoutDocument, parseLayoutDocument } from "../../schema/layoutProtocol";
import { downloadJsonFile } from "../../shared/browser/download";

export default function LayoutDocumentControls({ state, dispatch }: { state: GraphAppState; dispatch: Dispatch<GraphAction> }) {
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(state.document.generation);
  generation.current = state.document.generation;
  const [error, setError] = useState<{ generation: number; text: string } | null>(null);
  const layout = state.layoutDocument;
  const modified = JSON.stringify(layout.data) !== JSON.stringify(layout.saved);
  return <section className="layout-document-controls" aria-label="Layout file">
    <p className="layout-status">Source: {layout.source}{modified ? " · Modified" : ""}</p>
    <div className="layout-actions">
      <button className="studio-button" disabled={!state.dag} onClick={() => input.current?.click()}>Import Layout</button>
      <button className="studio-button" disabled={!state.dag} onClick={() => {
        const source = state.source.fileName.replace(/\.json$/i, "") + ".layout.json";
        downloadJsonFile(JSON.stringify(parseLayoutDocument(layout.data), null, 2), source);
        dispatch({ type: "layoutDocumentSaved", generation: state.document.generation, data: layout.data, source });
      }}>Save Layout</button>
      <button className="studio-button" disabled={!state.dag} onClick={() => {
        setError(null);
        dispatch({ type: "layoutDocumentChanged", generation: state.document.generation, data: defaultLayoutDocument(), source: "Default" });
      }}>Reset to default</button>
    </div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const expected = state.document.generation;
      try {
        if (file.size > 16 * 1024 * 1024) throw new Error("Layout exceeds 16 MB.");
        const data = parseLayoutDocument(JSON.parse(await file.text()));
        if (generation.current !== expected) return;
        setError(null);
        dispatch({ type: "layoutDocumentChanged", generation: expected, data, source: file.name });
      } catch (cause) {
        if (generation.current === expected) setError({ generation: expected, text: cause instanceof Error ? cause.message : "Invalid layout file." });
      }
    }} />
    {(layout.notice || error?.generation === state.document.generation) && <p className="layout-warning" role="alert">{error?.generation === state.document.generation ? error.text : layout.notice}</p>}
  </section>;
}
