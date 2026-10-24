import { useId, useState } from "react";
import { createPortal } from "react-dom";
import type { TimelineLayoutController } from "../../../controllers/useTimelineLayout";
import type { GraphAppearance } from "../../../graph/appearance";
import TimelineControls, { type TimelineControlsProps } from "../../timeline/TimelineControls";
import MethodTabs from "../../ui/MethodTabs";
import LayoutRules from "../LayoutRules";
import { TimelineLayoutReview } from "./TimelineLayoutReview";

export default function TimelineArrangePanel({
  controller: c,
  model,
  appearance,
  ...controls
}: TimelineControlsProps & {
  controller: TimelineLayoutController;
  model: string;
  appearance: GraphAppearance;
}) {
  const [prompt, setPrompt] = useState("");
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
          { value: "ai", label: "AI" },
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
                  ? "AI proposal with preview"
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
              <button
                className="studio-button layout-primary"
                type="submit"
                disabled={!c.ready || c.busy || !prompt.trim()}
              >
                {c.busy ? "Generating…" : "Generate preview"}
              </button>
              {c.busy && (
                <button className="studio-button" type="button" onClick={c.cancel}>
                  Cancel
                </button>
              )}
            </div>
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
        {c.stale && (
          <p className="layout-warning" role="alert">
            The timeline changed. Generate a new preview.
          </p>
        )}
      </MethodTabs>
      {c.review &&
        typeof document !== "undefined" &&
        createPortal(
          <TimelineLayoutReview
            controller={c}
            appearance={appearance}
            returnFocus={() => {
              const target = document.getElementById(promptId);
              if (target?.getClientRects().length) target.focus();
              else document.getElementById("chart-tools-toggle")?.focus();
            }}
          />,
          document.body,
        )}
    </section>
  );
}
