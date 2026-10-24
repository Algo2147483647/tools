import ArrangePanel from "../arrange/ArrangePanel";
import CompoundPanel from "../arrange/compound/CompoundPanel";
import SubgraphsPanel from "../arrange/compound/SubgraphsPanel";
import TimelineArrangePanel from "../arrange/timeline/TimelineArrangePanel";


import type { Dispatch,SetStateAction } from "react";
import type { StudioViewProps } from "./types";
export type GraphTools = "arrange" | "subgraphs" | null;
export function StudioLayoutPanels({session, preferences, ui, files, transactions, ai, viewport, compoundLayoutPlan, timelineLayoutPlan, graphTools, setGraphTools, timelineArrangeOpen, setTimelineArrangeOpen}: Pick<StudioViewProps, "session" | "preferences" | "ui" | "files" | "transactions" | "ai" | "viewport" | "compoundLayoutPlan" | "timelineLayoutPlan"> & {
 graphTools: GraphTools; setGraphTools: Dispatch<SetStateAction<GraphTools>>;
 timelineArrangeOpen: boolean; setTimelineArrangeOpen: Dispatch<SetStateAction<boolean>>;
}) {
 const {state} = session;
 const {appearance} = preferences.charts;
  const compoundPanel =
    state.chartType === "compound" && state.dag ? (
      <CompoundPanel
        key={state.document.generation}
        dag={state.dag}
        view={viewport.compound.view}
        onViewChange={viewport.compound.setView}
        onCommand={transactions.commitCommand}
        onSelect={viewport.setFocusedKey}
        onOpenNode={ui.openNodeDetail}
        onMemberContextMenu={viewport.handleNodeContextMenu}
      />
    ) : null;

 return <>      {state.chartType === "compound" && state.dag && !files.homeVisible && (
        <SubgraphsPanel
          key={state.document.generation}
          open={graphTools !== null}
          onClose={() => setGraphTools(null)}
          tab={graphTools === "arrange" ? "arrange" : "structure"}
          onTabChange={(tab) => setGraphTools(tab === "arrange" ? "arrange" : "subgraphs")}
          structure={compoundPanel}
          arrange={<ArrangePanel controller={compoundLayoutPlan} ai={ai} model={preferences.aiSettings.model} />}
        />
      )}
      {state.chartType === "timeline" && state.dag && !files.homeVisible && (
        <TimelineArrangePanel
          appearance={appearance}
          key={state.document.generation}
          open={timelineArrangeOpen}
          onClose={() => setTimelineArrangeOpen(false)}
          controller={timelineLayoutPlan}
          settings={viewport.timelineSettings}
          onSettingsChange={viewport.changeTimelineSettings}
          onReadapt={viewport.readaptTimeline}
          model={preferences.aiSettings.model}
        />
      )}
</>;
}
