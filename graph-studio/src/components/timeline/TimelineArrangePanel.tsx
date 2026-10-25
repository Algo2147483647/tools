import { useId, useState } from "react";
import type { TimelineLayoutController } from "../../app/layout/useTimelineLayout";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import TimelineControls, { type TimelineControlsProps } from "./TimelineControls";
import MethodTabs from "../ui/MethodTabs";
import LayoutRules from "../ui/LayoutRules";
import { DEFAULT_TIMELINE_LAYOUT_PROMPT } from "../../layout/timeline/ai/prompt";
import AiActivityView from "../ui/AiActivityView";

export default function TimelineArrangePanel({
  controller: c,
  model,
  appearance: _appearance,
  ...controls
}: TimelineControlsProps & {
  controller: TimelineLayoutController;
  model: string;
  appearance: GraphAppearance;
}) {
  const [prompt, setPrompt] = useState(DEFAULT_TIMELINE_LAYOUT_PROMPT);
  const promptId = useId();
  const method = c.mode === "ai" ? "ai" : controls.settings.layout;
  return (
    <section className="chart-layout-controls" aria-label="Timeline layout">
      <MethodTabs
        label="Timeline layout method"
        value={method}
        disabled={!c.ready || c.busy}
        options={[
          { value: "tracks", label: "Tracks" },
          { value: "flow", label: "Relation flow" },
          {
            value: "ai",
            label: "AI",
            status: c.busy ? "running" : c.errorDetail ? "error" : c.report ? "success" : "idle",
          },
        ]}
        onChange={(value) => {
          c.setMode(value === "ai" ? "ai" : "algorithm");
          if (value !== "ai") controls.onChange({ layout: value });
        }}
      >
        <LayoutRules
          label="Timeline method rules"
          rows={[
            { label: "Events", value: c.count },
            { label: "Time positions", value: "Follow event timestamps" },
            {
              label: "Placement",
              value:
                method === "ai"
                  ? "AI positions and routes"
                  : method === "tracks"
                    ? "Group events by track"
                    : "Arrange related events in branches",
            },
          ]}
        />
        <fieldset className="layout-rule-fields" disabled={c.busy}>
          <TimelineControls {...controls} showLayoutChoice={false} />
        </fieldset>
        {method === "ai" && (
          <form
            className="layout-ai-form"
            onSubmit={(event) => {
              event.preventDefault();
              void c.generate(prompt);
            }}
          >
            <label htmlFor={promptId}>Layout instructions</label>
            <textarea
              className="studio-field"
              id={promptId}
              rows={4}
              value={prompt}
              disabled={c.busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Bring related tracks together and give overlapping branches more room…"
            />
            <div className="layout-actions">
              <span className="layout-model" title={model}>
                {model || "Choose a model in AI settings"}
              </span>
              <button className="studio-button primary" type="submit" disabled={!c.ready || c.busy || !prompt.trim()}>
                {c.busy ? "Generating…" : "Arrange"}
              </button>
              {c.busy && (
                <button className="studio-button" type="button" onClick={c.cancel}>
                  Cancel
                </button>
              )}
            </div>
            <AiActivityView activity={c.activity} busy={c.busy} />
          </form>
        )}
        {c.message && (
          <p className="layout-status" role="status">
            {c.message}
          </p>
        )}
        {c.warning && (
          <p className="layout-warning" role="alert">
            {c.warning}
          </p>
        )}
        {c.errorDetail && (
          <details>
            <summary>Error details</summary>
            <p>{c.errorDetail}</p>
          </details>
        )}
        {c.quality && (
          <section aria-label="Layout quality">
            <h3>Layout quality</h3>
            <table className="schema-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  {c.report && <th>Before</th>}
                  <th>Current</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["crossings", "Crossings"],
                    ["labelOverlaps", "Label collisions"],
                    ["routeLength", "Route length"],
                    ["width", "Canvas width"],
                    ["height", "Canvas height"],
                  ] as const
                ).map(([key, label]) => (
                  <tr key={key}>
                    <th>{label}</th>
                    {c.report && <td>{Math.round(c.report.before[key]).toLocaleString()}</td>}
                    <td>{Math.round(c.quality![key]).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.quality.sampled && <p>Crossing and collision metrics are sampled.</p>}
            {c.report && (
              <>
                <p>{c.report.summary}</p>
                <p>
                  {c.report.evaluations} evaluations ·{" "}
                  {c.report.changed ? "Arrangement changed" : "Arrangement unchanged"}
                </p>
              </>
            )}
          </section>
        )}
      </MethodTabs>
    </section>
  );
}
