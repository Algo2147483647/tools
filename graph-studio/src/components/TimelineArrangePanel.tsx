import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TimelineLayoutController } from "../controllers/useTimelineLayout";
import { type GraphAppearance } from "../graph/appearance";
import type { TimelineViewSettings } from "../graph/timeline/settings";
import type { StageData } from "../layout/shared/types";
import type { TimelineLayoutMetrics } from "../layout/timeline/layout-quality";
import GraphDefs from "../rendering/GraphDefs";
import GraphEdge from "../rendering/GraphEdge";
import TimelineBackdrop from "../rendering/TimelineBackdrop";
import TimelineNode from "../rendering/TimelineNode";
import { appearanceToStageStyle } from "../rendering/appearanceStyle";

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
function TimelineLayoutReview({
  controller: c,
  appearance,
}: {
  controller: TimelineLayoutController;
  appearance: GraphAppearance;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState("fit");
  const scale = zoom === "fit" ? null : Number(zoom);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  const review = c.review!;
  const close = () => {
    c.dismiss();
    document.getElementById("timeline-arrange-prompt")?.focus();
  };
  const rows: [keyof TimelineLayoutMetrics, string][] = [
    ["crossings", "Crossings"],
    ["labelOverlaps", "Label overlaps"],
    ["routeLength", "Route length"],
    ["width", "Canvas width"],
    ["height", "Canvas height"],
    ["movedEvents", "Moved events"],
  ];
  return (
    <div className="compound-layout-backdrop" onClick={close}>
      <div
        ref={dialog}
        className="compound-layout-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Review timeline layout"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
          if (event.key === "Tab") {
            const buttons = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, summary, [tabindex="0"]') ??
                [],
            );
            const first = buttons[0],
              last = buttons.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>Review timeline layout</h2>
          <div className="timeline-preview-tools">
            <select aria-label="Preview zoom" value={zoom} onChange={(event) => setZoom(event.target.value)}>
              <option value="fit">Fit</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
              <option value="2">200%</option>
            </select>
            <button aria-label="Close timeline preview" onClick={close}>
              Close
            </button>
          </div>
        </header>
        <div className="compound-layout-previews">
          <figure>
            <figcaption>Current</figcaption>
            <TimelineMiniature stage={review.baseline} appearance={appearance} scale={scale} />
          </figure>
          <figure>
            <figcaption>AI proposal</figcaption>
            <TimelineMiniature stage={review.stage} appearance={appearance} scale={scale} />
          </figure>
        </div>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Current</th>
              <th>Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{Math.round(Number(review.before[key])).toLocaleString("en-US")}</td>
                <td>{Math.round(Number(review.after[key])).toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(review.before.sampled || review.after.sampled) && <p>Crossing and label metrics are sampled.</p>}
        <p>Event dates and durations are unchanged.</p>
        <details>
          <summary>AI assessment</summary>
          <p>{review.explanation}</p>
        </details>
        {c.stale && <p role="alert">This preview is stale. Generate a new preview.</p>}
        <footer>
          <button onClick={close}>Discard</button>
          <button
            disabled={c.stale || c.busy}
            onClick={() => {
              if (c.apply()) document.getElementById("timeline-arrange-toggle")?.focus();
            }}
          >
            Apply AI layout
          </button>
        </footer>
      </div>
    </div>
  );
}
function TimelineMiniature({
  stage,
  appearance,
  scale,
}: {
  stage: StageData;
  appearance: GraphAppearance;
  scale: number | null;
}) {
  return (
    <div className="timeline-layout-preview" tabIndex={0} aria-label="Scrollable timeline preview">
      <svg
        className="dag-graph"
        data-layout="timeline"
        data-export="true"
        style={
          {
            ...appearanceToStageStyle(appearance),
            width: scale ? stage.stageWidth * scale : "100%",
            height: scale ? stage.stageHeight * scale : "100%",
          } as CSSProperties
        }
        viewBox={`0 0 ${stage.stageWidth} ${stage.stageHeight}`}
        role="img"
        aria-label="Timeline layout preview"
      >
        <GraphDefs
          appearanceCss={appearance.css}
          edgeArrowStyle={appearance.display.edgeArrowStyle}
          timelineColors={[...new Set(stage.edges.flatMap((edge) => (edge.timeline ? [edge.timeline.color] : [])))]}
        />
        <TimelineBackdrop stage={stage} />
        {stage.nodes.map((node) => (
          <TimelineNode
            key={node.key}
            node={node}
            layer="leader"
            readOnly
            isActive={false}
            onClick={() => {}}
            onContextMenu={() => {}}
            onFocusChange={() => {}}
          />
        ))}
        {stage.edges.map((edge) => (
          <GraphEdge key={edge.id} edge={edge} showLabel={false} />
        ))}
        {(["marker", "label"] as const).map((layer) =>
          stage.nodes.map((node) => (
            <TimelineNode
              key={`${layer}-${node.key}`}
              node={node}
              layer={layer}
              readOnly
              isActive={false}
              onClick={() => {}}
              onContextMenu={() => {}}
              onFocusChange={() => {}}
            />
          )),
        )}
      </svg>
    </div>
  );
}
