import { useId, useState } from "react";
import type { CompoundLayoutController } from "../../app/layout/useCompoundLayoutPlan";
import { DEFAULT_COMPOUND_LAYOUT_REQUEST } from "../../layout/compound/ai/prompt";
import type { LayoutDirection, LayoutObjective } from "../../layout/compound/layout-plan";
import MethodTabs from "../ui/MethodTabs";
import LayoutRules from "../ui/LayoutRules";

export default function CompoundLayoutPanel({
  controller: c,
  model,
}: {
  controller: CompoundLayoutController;
  model: string;
}) {
  const promptId = useId();
  const [prompt, setPrompt] = useState(DEFAULT_COMPOUND_LAYOUT_REQUEST);
  const { method, direction, objective, portMode } = c.settings;
  const busy = c.busy;
  return (
    <section className="chart-layout-controls nested-layout-controls" aria-label="Nested layout">
      <MethodTabs
        label="Nested layout method"
        value={method}
        onChange={(value) => c.change({ method: value })}
        disabled={busy}
        options={[
          { value: "automatic", label: "Automatic" },
          { value: "ai", label: "AI" },
        ]}
      >
        <fieldset className="layout-rule-fields" disabled={busy}>
          <LayoutRules
            rows={[
              { label: "Scope", value: <strong>{c.scopeTitle}</strong> },
              {
                label: "Connection ports",
                value: (
                  <select
                    className="studio-field"
                    aria-label="Connection ports"
                    value={portMode}
                    onChange={(e) => c.change({ portMode: e.target.value as "distributed" | "midpoints" })}
                  >
                    <option value="distributed">Distributed (reduce overlap)</option>
                    <option value="midpoints">Side midpoints</option>
                  </select>
                ),
              },
              {
                label: "Optimize for",
                value: (
                  <select
                    className="studio-field"
                    aria-label="Layout objective"
                    value={objective}
                    onChange={(e) => c.change({ objective: e.target.value as LayoutObjective })}
                  >
                    <option value="readability">Readability</option>
                    <option value="compact">Compactness</option>
                  </select>
                ),
              },
              {
                label: "Direction",
                value: (
                  <select
                    className="studio-field"
                    aria-label="Layout direction"
                    value={direction}
                    onChange={(e) =>
                      c.change({
                        direction: e.target.value as LayoutDirection,
                        constraints: c.settings.constraints.filter(
                          (constraint) =>
                            constraint.type !== "direction" || constraint.scopeId !== c.defaultIntent.scope.groupId,
                        ),
                      })
                    }
                  >
                    <option value="AUTO">Automatic</option>
                    <option value="RIGHT">Left to right</option>
                    <option value="DOWN">Top to bottom</option>
                  </select>
                ),
              },
            ]}
          />
        </fieldset>
        {method === "automatic" ? (
          <p className="layout-status">
            Nodes, groups and connections arrange automatically as the graph or settings change.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (c.ready && !busy && prompt.trim()) void c.generate(prompt.trim());
            }}
          >
            <div className="layout-ai-form">
              <label htmlFor={promptId}>Layout instructions</label>
              <textarea
                id={promptId}
                className="studio-field"
                rows={6}
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="layout-actions">
              <span className="layout-model" title={model}>
                {model || "Choose a model in AI settings"}
              </span>
              <button className="studio-button primary" disabled={!c.ready || busy || !prompt.trim()}>
                {busy ? "Arranging…" : "Arrange"}
              </button>
              {busy && (
                <button
                  type="button"
                  className="studio-button"
                  onClick={() => {
                    c.cancel();
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {c.detail && (
              <details className="layout-assessment">
                <summary>Error details</summary>
                <p>{c.detail}</p>
              </details>
            )}
          </form>
        )}
        {c.message && (
          <p className="layout-status" role="status">
            {c.message}
          </p>
        )}
      </MethodTabs>
      <section className="layout-quality" aria-label="Current layout quality" aria-live="polite">
        <h3>Layout quality</h3>
        {c.loading && <p>Arranging…</p>}
        {c.error && (
          <p className="layout-warning" role="alert">
            {c.error}
          </p>
        )}
        {c.quality && (
          <>
            <p>Geometry valid · {Math.round(c.quality.elapsedMs)} ms</p>
            <LayoutRules
              rows={[
                { label: "Crossings", value: c.quality.metrics.crossings },
                { label: "Label collisions", value: c.quality.metrics.labelCollisions },
                { label: "Bends", value: c.quality.metrics.bends },
              ]}
            />
            <details>
              <summary>Details</summary>
              <LayoutRules
                rows={[
                  { label: "Overlapping route length", value: `${Math.round(c.quality.metrics.sharedLength)} px` },
                  { label: "Route length", value: `${Math.round(c.quality.metrics.length)} px` },
                  { label: "Content area", value: `${Math.round(c.quality.metrics.area)} px²` },
                ]}
              />
              {c.diagnostics.map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </details>
          </>
        )}
      </section>
    </section>
  );
}
