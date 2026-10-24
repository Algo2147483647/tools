import { useId, useRef, useState } from "react";
import type { AiController } from "../../app/ai/useAiController";
import type { CompoundLayoutController } from "../../app/layout/useCompoundLayoutPlan";
import type { LayoutDirection, LayoutIntent, LayoutObjective } from "../../layout/compound/layout-plan";
import MethodTabs from "../ui/MethodTabs";
import LayoutRules, { type LayoutRule } from "../ui/LayoutRules";
import CompoundLayoutReview from "./CompoundLayoutReview";

export default function CompoundLayoutPanel({
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
  const [method, setMethod] = useState<"routes" | "layout" | "ai">("routes");
  const [aiRoutesOnly, setAiRoutesOnly] = useState(true);
  const routesOnly = method === "routes" || (method === "ai" && aiRoutesOnly);
  const promptId = useId();
  const controlsRef = useRef<HTMLElement>(null);
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
  const rules: LayoutRule[] = [
    { label: "Scope", value: <strong>{c.scopeTitle}</strong> },
    {
      label: "Optimize for",
      value: (
        <select
          className="studio-field"
          aria-label="Layout objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value as LayoutObjective)}
        >
          <option value="readability">Readability</option>
          <option value="stability">Stability</option>
          <option value="compact">Compactness</option>
        </select>
      ),
    },
    {
      label: "Node positions",
      value:
        method === "ai" ? (
          <select
            className="studio-field"
            aria-label="AI node movement"
            value={aiRoutesOnly ? "fixed" : "move"}
            onChange={(e) => setAiRoutesOnly(e.target.value === "fixed")}
          >
            <option value="fixed">Keep fixed</option>
            <option value="move">Allow rearrangement</option>
          </select>
        ) : routesOnly ? (
          "Keep fixed"
        ) : (
          "Allow rearrangement"
        ),
    },
    ...(!routesOnly
      ? [
          {
            label: "Direction",
            value: (
              <select
                className="studio-field"
                aria-label="Layout direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as LayoutDirection)}
              >
                <option value="AUTO">Automatic</option>
                <option value="RIGHT">Left to right</option>
                <option value="DOWN">Top to bottom</option>
              </select>
            ),
          },
          {
            label: "Group boundaries",
            value: (
              <select
                className="studio-field"
                aria-label="Group boundaries"
                value={resize ? "resize" : "strict"}
                onChange={(e) => setResize(e.target.value === "resize")}
              >
                <option value="strict">Keep surrounding groups fixed</option>
                <option value="resize">Allow surrounding groups to resize</option>
              </select>
            ),
          },
          {
            label: "Selected node",
            value: (
              <label className="layout-rule-check">
                <input
                  type="checkbox"
                  checked={pin}
                  disabled={!c.focusedKey}
                  onChange={(e) => setPin(e.target.checked)}
                />
                <span>{c.focusedKey ? "Lock " + c.focusedKey : "No node selected"}</span>
              </label>
            ),
          },
        ]
      : []),
  ];
  return (
    <section
      ref={controlsRef}
      tabIndex={-1}
      className="chart-layout-controls nested-layout-controls"
      aria-label="Nested layout"
    >
      <MethodTabs
        label="Nested layout method"
        value={method}
        onChange={setMethod}
        disabled={busy}
        options={[
          { value: "routes", label: "Routes" },
          { value: "layout", label: "Layout & routes" },
          { value: "ai", label: "AI" },
        ]}
      >
        <fieldset className="layout-rule-fields" disabled={busy}>
          <LayoutRules rows={rules} />
        </fieldset>
        {method === "ai" ? (
          <form
            className="layout-ai-form"
            onSubmit={(event) => {
              event.preventDefault();
              void ai.request(prompt, { layoutIntent: intent() });
            }}
          >
            <label htmlFor={promptId}>Layout instructions</label>
            <textarea
              className="studio-field"
              id={promptId}
              rows={4}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Reduce crossings and keep related nodes together…"
            />
            <div className="layout-actions">
              <span className="layout-model" title={model}>
                {model || "Choose a model in AI settings"}
              </span>
              <button className="studio-button primary" type="submit" disabled={!prompt.trim() || !c.ready || busy}>
                {ai.layoutBusy ? "Generating…" : "Generate preview"}
              </button>
            </div>
            {ai.layoutMessage && (
              <p className="layout-status" role="status">
                {ai.layoutMessage}
              </p>
            )}
            {ai.layoutExplanation && (
              <details className="layout-assessment">
                <summary>AI assessment</summary>
                <p>{ai.layoutExplanation}</p>
              </details>
            )}
          </form>
        ) : (
          <div className="layout-actions">
            <button
              className="studio-button primary"
              disabled={!c.ready || busy}
              onClick={() => void c.propose(intent()).catch(() => {})}
            >
              {c.busy ? "Calculating…" : "Preview arrangement"}
            </button>
          </div>
        )}
        <div className="layout-actions">
          {c.review?.status === "ready" && c.candidate && (
            <button className="studio-button" disabled={c.stale || busy} onClick={c.reveal}>
              Compare preview
            </button>
          )}
          {(c.busy || ai.layoutBusy) && (
            <button
              className="studio-button"
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
          <p className="layout-status" role="status">
            {c.message}
          </p>
        )}
        {c.stale && (
          <p className="layout-warning" role="alert">
            The graph or view changed. Generate a new preview.
          </p>
        )}
      </MethodTabs>
      <CompoundLayoutReview
        controller={c}
        returnFocus={() => {
          const target = controlsRef.current;
          if (target?.getClientRects().length) target.focus();
          else document.getElementById("chart-tools-toggle")?.focus();
        }}
      />
    </section>
  );
}
