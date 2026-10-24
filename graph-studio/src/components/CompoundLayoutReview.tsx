import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CompoundLayoutController } from "../controllers/useCompoundLayoutPlan";
import type { LayoutDirection, LayoutMetrics, LayoutObjective } from "../layout/compound-layout-plan";
import type { StageData } from "../layout/types";

export default function CompoundLayoutReview({ controller: c }: { controller: CompoundLayoutController }) {
  const [direction, setDirection] = useState<LayoutDirection>("AUTO");
  const [objective, setObjective] = useState<LayoutObjective>("readability");
  const [routesOnly, setRoutesOnly] = useState(false);
  const [resize, setResize] = useState(false);
  const [pin, setPin] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (c.review?.status === "ready" && c.review.result.candidates.length && !c.stale) setOpen(true);
  }, [c.review, c.stale]);
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  const generate = () => {
    const intent = {
      ...c.defaultIntent,
      objective,
      operation: routesOnly ? ("route-only" as const) : ("layout-and-route" as const),
      boundaryPolicy: resize ? ("allow-ancestor-resize" as const) : ("strict" as const),
      constraints: [...c.defaultIntent.constraints],
    };
    if (!routesOnly && direction !== "AUTO")
      intent.constraints.push({ type: "direction", scopeId: intent.scope.groupId, value: direction, strength: "soft" });
    if (pin && c.focusedKey)
      intent.constraints.push({ type: "pin", nodeId: c.focusedKey, space: "canvas", strength: "hard" });
    void c.propose(intent).catch(() => {});
  };
  const baseline = c.review?.result.baselineMetrics,
    candidate = c.candidate;
  return (
    <section className="compound-layout-tools" aria-label="Layout assistant">
      <h3>Layout assistant</h3>
      <p>
        Scope: <strong>{c.defaultIntent.scope.groupId ?? "Current root"}</strong>. Use the console to describe a layout
        in English.
      </p>
      <div className="compound-panel-actions">
        <select
          aria-label="Layout direction"
          value={direction}
          disabled={routesOnly}
          onChange={(e) => setDirection(e.target.value as LayoutDirection)}
        >
          <option value="AUTO">Automatic direction</option>
          <option value="RIGHT">Left to right</option>
          <option value="DOWN">Top to bottom</option>
        </select>
        <select
          aria-label="Layout objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value as LayoutObjective)}
        >
          <option value="readability">Readability</option>
          <option value="stability">Stability</option>
          <option value="compact">Compactness</option>
        </select>
      </div>
      <label>
        <input type="checkbox" checked={routesOnly} onChange={(e) => setRoutesOnly(e.target.checked)} /> Only arrange
        connections
      </label>
      <label>
        <input type="checkbox" checked={resize} disabled={routesOnly} onChange={(e) => setResize(e.target.checked)} />{" "}
        Allow surrounding groups to move and resize
      </label>
      <label>
        <input type="checkbox" checked={pin} disabled={!c.focusedKey} onChange={(e) => setPin(e.target.checked)} /> Lock
        selected node{c.focusedKey ? ` (${c.focusedKey})` : ""}
      </label>
      <div className="compound-panel-actions">
        <button disabled={!c.ready || c.busy} onClick={generate}>
          Preview layout
        </button>
        {c.busy && <button onClick={c.cancel}>Cancel</button>}
        {candidate && c.review?.status === "ready" && <button onClick={() => setOpen(true)}>Review</button>}
      </div>
      {c.message && <p role="status">{c.message}</p>}
      {c.stale && <p role="alert">The graph or view changed. Generate a new preview.</p>}
      {open &&
        c.review &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="compound-layout-backdrop" onClick={() => setOpen(false)}>
            <div
              ref={dialog}
              className="compound-layout-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Review nested layout"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
                if (e.key === "Tab") {
                  const elements = Array.from(
                    dialog.current?.querySelectorAll<HTMLElement>(
                      'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]',
                    ) ?? [],
                  );
                  const first = elements[0],
                    last = elements.at(-1);
                  if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
                    e.preventDefault();
                    last?.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                  }
                }
              }}
            >
              <header>
                <div>
                  <h2>Review nested layout</h2>
                  <p>
                    {c.review.intent.operation === "route-only"
                      ? "Connections only. Node rectangles are fixed."
                      : `Scope: ${c.review.intent.scope.groupId ?? "Current root"}`}
                  </p>
                </div>
                <button aria-label="Close layout review" onClick={() => setOpen(false)}>
                  Close
                </button>
              </header>
              {c.stale && <p role="alert">This preview is stale and cannot be applied.</p>}
              <div className="compound-layout-choice">
                <label>
                  Candidate{" "}
                  <select
                    value={c.selected}
                    onChange={(e) => {
                      c.setSelected(Number(e.target.value));
                      c.setShowCandidate(true);
                    }}
                  >
                    {c.review.result.candidates.map((item, i) => (
                      <option key={item.id} value={i}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={c.showCandidate}
                    onChange={(e) => c.setShowCandidate(e.target.checked)}
                  />{" "}
                  Show proposed arrangement
                </label>
              </div>
              <div className="compound-layout-previews">
                <figure>
                  <figcaption>Current layout</figcaption>
                  <LayoutMiniature stage={c.review.stage} />
                </figure>
                <figure>
                  <figcaption>{c.showCandidate ? "Proposed layout" : "Current layout"}</figcaption>
                  <LayoutMiniature
                    stage={c.previewStage ?? c.review.stage}
                    moved={c.showCandidate ? candidate?.changedNodeIds : undefined}
                  />
                </figure>
              </div>
              {baseline && candidate && (
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Current</th>
                      <th>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["crossings", "Crossings"],
                        ["labelCollisions", "Label collisions"],
                        ["bends", "Bends"],
                        ["length", "Route length"],
                        ["area", "Content area"],
                        ["movedNodes", "Moved rectangles"],
                        ["movement", "Total movement"],
                        ["changedEdges", "Changed visible connections"],
                      ] as [keyof LayoutMetrics, string][]
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <td>{label}</td>
                        <td>
                          {key === "movement" || key === "movedNodes" || key === "changedEdges"
                            ? "0"
                            : Math.round(baseline[key]).toLocaleString("en-US")}
                        </td>
                        <td>{Math.round(candidate.metrics[key]).toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {candidate && (
                <p>
                  {candidate.changedNodeIds.length} rectangles changed; {candidate.changedEdgeIds.length} original
                  connections affected.
                  {candidate.expandedGroupIds.length
                    ? ` Resized groups: ${candidate.expandedGroupIds.join(", ")}.`
                    : ""}
                </p>
              )}
              {candidate?.unmetPreferences.map((text) => (
                <p key={text} role="status">
                  {text}
                </p>
              ))}
              <footer>
                <button
                  onClick={() => {
                    c.dismiss();
                    setOpen(false);
                  }}
                >
                  Dismiss
                </button>
                <button
                  disabled={c.stale || c.busy || c.review.status !== "ready" || !candidate}
                  onClick={() => {
                    if (c.apply(candidate?.id)) setOpen(false);
                  }}
                >
                  Apply layout
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

function LayoutMiniature({ stage, moved = [] }: { stage: StageData; moved?: string[] }) {
  const changed = new Set(moved);
  return (
    <svg
      viewBox={`0 0 ${Math.max(stage.stageWidth, 1)} ${Math.max(stage.stageHeight, 1)}`}
      role="img"
      aria-label="Nested layout preview"
    >
      {stage.groups?.map((group) => (
        <g key={group.id}>
          <rect
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx={12}
            fill="#eff4fb"
            fillOpacity={0.6}
            stroke={changed.has(group.id) ? "#c6691b" : "#9aaec4"}
          />
          <text x={group.x + 14} y={group.y + 26} fontSize={16} fill="#324a64">
            {group.title.slice(0, 45)}
          </text>
        </g>
      ))}
      {stage.edges.map((edge) => (
        <g key={edge.id}>
          <path d={edge.path} fill="none" stroke="#778aa3" strokeWidth={2} />
          <title>{edge.description ?? edge.label}</title>
        </g>
      ))}
      {stage.nodes.map((node) => (
        <g key={node.key}>
          <rect
            x={node.x - node.width / 2}
            y={node.y - node.height / 2}
            width={node.width}
            height={node.height}
            rx={12}
            fill={changed.has(node.key) ? "#fff0db" : "#fff"}
            stroke={changed.has(node.key) ? "#c6691b" : "#6683a5"}
            strokeWidth={2}
          />
          <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize={15} fill="#18324e">
            {node.title.slice(0, Math.max(6, Math.floor(node.width / 9)))}
          </text>
          <title>{node.title}</title>
        </g>
      ))}
      {stage.compoundLayout?.showLabels &&
        stage.edges
          .filter((edge) => edge.label)
          .map((edge) => (
            <text
              key={edge.id}
              x={edge.labelPosition.x}
              y={edge.labelPosition.y + 1}
              textAnchor="middle"
              fontSize={10}
              fill="#18324e"
            >
              {edge.label}
            </text>
          ))}
    </svg>
  );
}
