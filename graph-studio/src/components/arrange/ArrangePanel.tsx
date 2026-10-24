import { useState } from "react";
import type { AiController } from "../../controllers/useAiController";
import type { CompoundLayoutController } from "../../controllers/useCompoundLayoutPlan";
import type { LayoutDirection,LayoutIntent,LayoutObjective } from "../../layout/compound/layout-plan";
import CompoundLayoutReview from "./compound/CompoundLayoutReview";

export default function ArrangePanel({
  controller: c,
  ai,
  model,
}: {
  controller: CompoundLayoutController;
  ai: AiController;
  model: string;
}) {
  const [direction, setDirection] = useState<LayoutDirection>("AUTO");
  const [objective, setObjective] = useState<LayoutObjective>("readability");
  const [routesOnly, setRoutesOnly] = useState(true);
  const [resize, setResize] = useState(false);
  const [pin, setPin] = useState(false);
  const [prompt, setPrompt] = useState("");
  const intent = (): LayoutIntent => ({
    ...c.defaultIntent,
    objective,
    operation: routesOnly ? "route-only" : "layout-and-route",
    boundaryPolicy: !routesOnly && resize ? "allow-ancestor-resize" : "strict",
    constraints: [
      ...(!routesOnly && direction !== "AUTO"
        ? [
            {
              type: "direction" as const,
              scopeId: c.defaultIntent.scope.groupId,
              value: direction,
              strength: "soft" as const,
            },
          ]
        : []),
      ...(pin && c.focusedKey
        ? [{ type: "pin" as const, nodeId: c.focusedKey, space: "canvas" as const, strength: "hard" as const }]
        : []),
    ],
  });
  const busy = c.busy || ai.busy;
  return (
    <>
      <section className="arrange-content" aria-label="Layout tools">
        <div className="arrange-scope">
          <span>Scope</span>
          <strong>{c.scopeTitle}</strong>
        </div>
        <fieldset disabled={busy} className="arrange-fields">
          <label>
            Action
            <select
              aria-label="Arrangement action"
              value={routesOnly ? "routes" : "layout"}
              onChange={(e) => setRoutesOnly(e.target.value === "routes")}
            >
              <option value="routes">Routes only</option>
              <option value="layout">Layout &amp; routes</option>
            </select>
          </label>
          {!routesOnly && (
            <label>
              Direction
              <select
                aria-label="Layout direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as LayoutDirection)}
              >
                <option value="AUTO">Automatic</option>
                <option value="RIGHT">Left to right</option>
                <option value="DOWN">Top to bottom</option>
              </select>
            </label>
          )}
          <details className="arrange-advanced">
            <summary>Advanced</summary>
            <label>
              Optimize for
              <select
                aria-label="Layout objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value as LayoutObjective)}
              >
                <option value="readability">Readability</option>
                <option value="stability">Stability</option>
                <option value="compact">Compactness</option>
              </select>
            </label>
            {!routesOnly && (
              <label className="arrange-check">
                <input type="checkbox" checked={resize} onChange={(e) => setResize(e.target.checked)} />
                Allow surrounding groups to adjust
              </label>
            )}
            <label className="arrange-check">
              <input
                type="checkbox"
                checked={pin}
                disabled={!c.focusedKey}
                onChange={(e) => setPin(e.target.checked)}
              />
              Lock selected node{c.focusedKey ? ` (${c.focusedKey})` : ""}
            </label>
          </details>
        </fieldset>
        <div className="arrange-actions">
          <button disabled={!c.ready || busy} onClick={() => void c.propose(intent()).catch(() => {})}>
            Preview
          </button>
          {c.review?.status === "ready" && c.candidate && (
            <button disabled={c.stale || busy} onClick={c.reveal}>
              Compare
            </button>
          )}
          {(c.busy || ai.layoutBusy) && (
            <button
              onClick={() => {
                ai.cancelLayout();
                c.cancel();
              }}
            >
              Cancel
            </button>
          )}
        </div>
        {c.message && (
          <p className="arrange-status" role="status">
            {c.message}
          </p>
        )}
        {c.stale && <p role="alert">The graph or view changed. Generate a new preview.</p>}
        <form
          className="arrange-ai"
          onSubmit={(event) => {
            event.preventDefault();
            void ai.request(prompt, { layoutIntent: intent() });
          }}
        >
          <label htmlFor="arrange-prompt">Ask AI</label>
          <textarea
            id="arrange-prompt"
            rows={3}
            value={prompt}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Reduce crossings in this group and preserve node positions…"
          />
          <div className="arrange-ai-footer">
            <span title={model}>{model || "Configure a model in Settings"}</span>
            <button type="submit" disabled={!prompt.trim() || !c.ready || busy}>
              {ai.layoutBusy ? "Working…" : "Suggest layout"}
            </button>
          </div>
          {ai.layoutMessage && (
            <p className="arrange-ai-result" role="status">
              {ai.layoutMessage}
            </p>
          )}
          {ai.layoutExplanation && (
            <details className="arrange-assessment">
              <summary>AI assessment</summary>
              <p>{ai.layoutExplanation}</p>
            </details>
          )}
        </form>
      </section>
      <CompoundLayoutReview controller={c} />
    </>
  );
}
