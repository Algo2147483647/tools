import { useState } from "react";
import LayoutSchema from "../settings/LayoutSchema";
import { getTimelineClock } from "../../graph/timeline/clock";
import CompoundLayoutPanel from "../compound/LayoutPanel";
import LayoutRules from "../ui/LayoutRules";
import TimelineArrangePanel from "../timeline/TimelineArrangePanel";
import SpatialControls from "../spatial/SpatialControls";
import MethodTabs from "../ui/MethodTabs";
import type { StudioViewProps } from "./types";

export type ChartLayoutControlsProps = Pick<
  StudioViewProps,
  "session" | "preferences" | "ui" | "viewport" | "ai" | "compoundLayoutPlan" | "timelineLayoutPlan"
>;
export default function ChartLayoutControls(props: ChartLayoutControlsProps) {
  const [tab, setTab] = useState<"arrangement" | "schema">("arrangement");
  return (
    <>
      {props.session.state.layoutDocument.notice && (
        <p className="layout-warning" role="alert">
          {props.session.state.layoutDocument.notice}
        </p>
      )}
      <MethodTabs
        label="Layout pages"
        value={tab}
        onChange={setTab}
        options={[
          { value: "arrangement", label: "Arrangement" },
          { value: "schema", label: "Schema" },
        ]}
      >
        <div hidden={tab !== "arrangement"}>
          <ChartSpecificLayoutControls {...props} />
        </div>
        {tab === "schema" && <LayoutSchema chartType={props.session.state.chartType} stage={props.viewport.stage} />}
      </MethodTabs>
    </>
  );
}
function ChartSpecificLayoutControls({
  session,
  preferences,
  ui,
  viewport,
  compoundLayoutPlan,
  timelineLayoutPlan,
}: ChartLayoutControlsProps) {
  const { state } = session;
  if (state.chartType === "compound")
    return <CompoundLayoutPanel controller={compoundLayoutPlan} model={preferences.aiSettings.model} />;
  if (state.chartType === "timeline")
    return (
      <TimelineArrangePanel
        controller={timelineLayoutPlan}
        settings={viewport.timelineSettings}
        onChange={viewport.changeTimelineSettings}
        onReadapt={viewport.readaptTimeline}
        clock={getTimelineClock(state.dag?.metadata)}
        model={preferences.aiSettings.model}
        appearance={preferences.charts.appearance}
      />
    );
  if (state.chartType === "spatial")
    return (
      <div className="chart-layout-controls">
        <SpatialControls spatial={viewport.spatialView} layout={viewport.stage?.spatial} />
      </div>
    );
  if (state.chartType === "sankey")
    return (
      <section className="chart-layout-controls" aria-label="Sankey layout">
        <MethodTabs
          label="Sankey layout method"
          value="flow"
          onChange={() => {}}
          options={[{ value: "flow", label: "Flow" }]}
        >
          <LayoutRules
            rows={[
              { label: "Direction", value: "Left to right" },
              { label: "Node size", value: "Scaled by total flow" },
              { label: "Band width", value: "Scaled by edge weight" },
              { label: "Return flows", value: "Routed below the chart" },
            ]}
          />
        </MethodTabs>
      </section>
    );
  const mode = state.layout.mode;
  return (
    <section className="chart-layout-controls" aria-label="Node-link layout">
      <MethodTabs
        label="Node-link layout method"
        value={mode}
        onChange={ui.changeLayout}
        options={[
          { value: "sugiyama", label: "Sugiyama" },
          { value: "level", label: "BFS" },
          { value: "dagre", label: "Dagre" },
        ]}
      >
        <LayoutRules
          rows={[
            { label: "Arrangement", value: mode === "level" ? "Breadth-first levels" : "Layered directed graph" },
            {
              label: "Ordering",
              value:
                mode === "sugiyama"
                  ? "Reduce edge crossings"
                  : mode === "level"
                    ? "Follow graph levels"
                    : "Dagre rank and order",
            },
            { label: "Spacing", value: "Uses Nodes and Edges appearance settings" },
          ]}
        />
      </MethodTabs>
    </section>
  );
}
