import { useEffect,useRef,useState } from "react";
import { createPortal } from "react-dom";
import type { TimelineLayoutController } from "../../../controllers/useTimelineLayout";
import { type GraphAppearance } from "../../../graph/appearance";
import type { TimelineViewSettings } from "../../../graph/timeline/settings";
import { TimelineLayoutReview } from "./TimelineLayoutReview";

export default function TimelineArrangePanel({
  open,
  onClose,
  controller: c,
  settings,
  onSettingsChange,
  onReadapt,
  model,
  appearance,
}: {
  open: boolean;
  onClose(): void;
  controller: TimelineLayoutController;
  settings: TimelineViewSettings;
  onSettingsChange(patch: Partial<TimelineViewSettings>): void;
  onReadapt(): void;
  model: string;
  appearance: GraphAppearance;
}) {
  const [prompt, setPrompt] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const close = () => {
    c.cancel();
    c.dismiss();
    onClose();
    document.getElementById("timeline-arrange-toggle")?.focus();
  };
  return (
    <>
      <aside
        ref={panel}
        id="timeline-arrange-panel"
        className="arrange-panel timeline-arrange-panel"
        hidden={!open}
        aria-label="Timeline arrangement"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="subgraphs-panel-toolbar">
          <div className="subgraph-tabs" role="group" aria-label="Timeline layout engine">
            {(["algorithm", "ai"] as const).map((mode) => (
              <button key={mode} aria-pressed={c.mode === mode} disabled={!c.ready} onClick={() => c.setMode(mode)}>
                {mode === "ai" ? "AI" : "Algorithm"}
              </button>
            ))}
          </div>
          <button className="arrange-close" aria-label="Close timeline arrangement" onClick={close}>
            ×
          </button>
        </div>
        <div className="arrange-scope">
          <span>Events</span>
          <strong>{c.count}</strong>
        </div>
        {c.mode === "algorithm" ? (
          <fieldset className="arrange-fields" disabled={!c.ready || c.busy}>
            <label>
              Layout
              <select
                aria-label="Timeline algorithm"
                value={settings.layout}
                onChange={(e) => onSettingsChange({ layout: e.target.value as "tracks" | "flow" })}
              >
                <option value="tracks">Tracks</option>
                <option value="flow">Flow</option>
              </select>
            </label>
            <label>
              Connections
              <select
                aria-label="Timeline connection routing"
                value={settings.edgeRouting}
                onChange={(e) => onSettingsChange({ edgeRouting: e.target.value as "avoid" | "direct" })}
              >
                <option value="avoid">Avoid overlaps</option>
                <option value="direct">Direct</option>
              </select>
            </label>
            <button onClick={onReadapt} disabled={settings.locked}>
              Readapt
            </button>
          </fieldset>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void c.generate(prompt);
            }}
          >
            <label htmlFor="timeline-arrange-prompt">Ask AI</label>
            <textarea
              id="timeline-arrange-prompt"
              value={prompt}
              rows={4}
              disabled={c.busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Bring related tracks together and give overlapping branches more room…"
            />
            <div className="arrange-ai-footer">
              <span title={model}>{model || "Configure a model in Settings"}</span>
              <button type="submit" disabled={!c.ready || c.busy || !prompt.trim()}>
                Generate preview
              </button>
            </div>
            {c.busy && (
              <button className="timeline-cancel" type="button" onClick={c.cancel}>
                Cancel
              </button>
            )}
            {!c.hasPlan && !c.busy && !c.message && <p className="arrange-status">No saved AI layout.</p>}
          </form>
        )}
        {settings.locked && <p className="arrange-status">Time axis locked.</p>}
        {c.message && (
          <p className="arrange-status" role="status">
            {c.message}
          </p>
        )}
        {c.warning && <p role="alert">{c.warning}</p>}
        {c.stale && <p role="alert">The timeline changed. Generate a new preview.</p>}
      </aside>
      {c.review &&
        typeof document !== "undefined" &&
        createPortal(<TimelineLayoutReview controller={c} appearance={appearance} />, document.body)}
    </>
  );
}


