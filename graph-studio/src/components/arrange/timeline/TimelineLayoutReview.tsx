import { useEffect, useRef, useState } from "react";
import type { TimelineLayoutController } from "../../../controllers/useTimelineLayout";
import { type GraphAppearance } from "../../../graph/appearance";
import type { TimelineLayoutMetrics } from "../../../layout/timeline/layout-quality";

import { TimelineMiniature } from "./TimelineMiniature";

export function TimelineLayoutReview({
  controller: c,
  appearance,
  returnFocus,
}: {
  controller: TimelineLayoutController;
  appearance: GraphAppearance;
  returnFocus: () => void;
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
    returnFocus();
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
              if (c.apply()) returnFocus();
            }}
          >
            Apply AI layout
          </button>
        </footer>
      </div>
    </div>
  );
}
