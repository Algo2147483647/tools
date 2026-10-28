import { useEffect, useRef } from "react";
import { getGraphChartLabel } from "../../graph/types";
import CompoundPanel from "../compound/CompoundPanel";
import TimelineViewControls from "../timeline/TimelineViewControls";
import SpatialControls from "../spatial/SpatialControls";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import TypeFilterControls from "./TypeFilterControls";
import type { StudioViewProps } from "./types";

export function WorkbenchPanel(
  props: Pick<StudioViewProps, "session" | "viewport" | "ui" | "files" | "transactions"> & {
    open: boolean;
    onClose(): void;
  },
) {
  const {
    session: { state },
    files,
    viewport,
    ui,
    transactions,
    open,
    onClose,
  } = props;
  const panel = useRef<HTMLElement>(null);
  const visible = open && !files.homeVisible && !state.ui.settingsOpen && !!state.dag;
  useEffect(() => {
    if (visible) panel.current?.focus();
  }, [visible]);
  const close = () => {
    onClose();
    document.getElementById("chart-tools-toggle")?.focus();
  };
  if (files.homeVisible || state.ui.settingsOpen || !state.dag || !open) return null;
  return (
    <aside
      id="chart-tools-panel"
      ref={panel}
      className="chart-tools-panel"
      tabIndex={-1}
      aria-label="Workbench"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <header className="chart-tools-heading">
        <div>
          <Icon name="workbench" size={20} />
          <div>
            <h2>Workbench</h2>
            <small>{getGraphChartLabel(state.chartType)}</small>
          </div>
        </div>
        <IconButton variant="quiet" label="Close workbench" icon={<Icon name="close" size={18} />} onClick={close} />
      </header>
      <div className="chart-tools-body">
        <div className="workbench-summary">
          <span>{viewport.stage?.nodes.length ?? 0} nodes</span>
          <span>{viewport.stage?.edges.length ?? 0} connections</span>
          <button className="workbench-text-button" onClick={viewport.zoom.zoomFit}>
            Fit view
          </button>
        </div>
        {state.chartType === "compound" && (
          <CompoundPanel
            dag={state.dag}
            view={viewport.compound.view}
            onViewChange={viewport.compound.setView}
            onCommand={transactions.commitCommand}
            onSelect={viewport.setFocusedKey}
            onOpenNode={ui.openNodeDetail}
            onMemberContextMenu={viewport.handleNodeContextMenu}
          />
        )}
        <TypeFilterControls
          options={viewport.typeOptions}
          value={viewport.typeFilter}
          onChange={viewport.changeTypeFilter}
        />
        {state.chartType === "timeline" && (
          <section className="workbench-section">
            <h3>Time & tracks</h3>
            <TimelineViewControls session={props.session} viewport={viewport} />
          </section>
        )}
        {state.chartType === "spatial" && (
          <section className="workbench-section">
            <h3>Projection & camera</h3>
            <SpatialControls spatial={viewport.spatialView} layout={viewport.stage?.spatial} />
          </section>
        )}
        {(state.chartType === "node-link" || state.chartType === "sankey") && (
          <section className="workbench-section">
            <h3>{state.chartType === "sankey" ? "Flow view" : "Explore"}</h3>
            <p className="workbench-hint">
              {state.chartType === "sankey"
                ? "Filtering retains original flow values and connections."
                : "Select a node to explore its relationships. Double-click to open details."}
            </p>
            <div className="workbench-actions">
              <button onClick={viewport.showAll}>Show whole graph</button>
              <button
                disabled={!viewport.focusedKey || !viewport.stage?.nodeMap[viewport.focusedKey]}
                onClick={() => viewport.focusedKey && viewport.zoom.locateNode(viewport.focusedKey)}
              >
                Locate selected node
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
