import { getNodeTitle } from "../../graph/accessors";
import CompoundPanel from "../compound/CompoundPanel";
import TimelineViewControls from "../timeline/TimelineViewControls";
import SpatialControls from "../spatial/SpatialControls";
import TypeFilterControls from "./TypeFilterControls";
import type { StudioViewProps } from "../studio/types";

/** View controls only; the console owns the window, tabs and focus lifecycle. */
export default function Workbench(props: Pick<StudioViewProps, "session" | "viewport" | "ui" | "transactions">) {
  const {
    session: { state },
    viewport,
    ui,
    transactions,
  } = props;
  if (!state.dag)
    return (
      <div className="workbench">
        <p className="workbench-hint">Load or initialize a graph to use the workbench.</p>
      </div>
    );
  return (
    <div className="workbench">
      <header className="workbench-overview">
        <div>
          <div className="workbench-summary">
            <span>{viewport.stage?.nodes.length ?? 0} nodes</span>
            <span>{viewport.stage?.edges.length ?? 0} connections</span>
          </div>
        </div>
      </header>
      <div className="workbench-grid">
        <div className="workbench-primary">
          {state.chartType === "compound" && (
            <div className="workbench-card">
              <CompoundPanel
                dag={state.dag}
                view={viewport.compound.view}
                onViewChange={viewport.compound.setView}
                onCommand={transactions.commitCommand}
                onSelect={viewport.setFocusedKey}
                onOpenNode={ui.openNodeDetail}
                onMemberContextMenu={viewport.handleNodeContextMenu}
              />
            </div>
          )}
          {state.chartType === "timeline" && (
            <section className="workbench-card">
              <h3>Time & tracks</h3>
              <TimelineViewControls session={props.session} viewport={viewport} />
            </section>
          )}
          {state.chartType === "spatial" && (
            <section className="workbench-card">
              <h3>Projection & camera</h3>
              <SpatialControls spatial={viewport.spatialView} layout={viewport.stage?.spatial} />
            </section>
          )}
          {(state.chartType === "node-link" || state.chartType === "sankey") && (
            <section className="workbench-card">
              <h3>{state.chartType === "sankey" ? "Flow view" : "Explore"}</h3>
              <p className="workbench-hint">
                {state.chartType === "sankey"
                  ? "Filtering retains original flow values and connections."
                  : "Select a node to explore its relationships. Double-click to open details."}
              </p>
              <div className="workbench-selection">
                <span>Selected node</span>
                <strong>
                  {viewport.focusedKey
                    ? getNodeTitle(state.dag.nodes[viewport.focusedKey] ?? {}) || viewport.focusedKey
                    : "No node selected"}
                </strong>
              </div>
              <div className="workbench-actions">
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
        <TypeFilterControls
          options={viewport.typeOptions}
          value={viewport.typeFilter}
          onChange={viewport.changeTypeFilter}
        />
      </div>
    </div>
  );
}
