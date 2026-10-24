import { getTimelineClock } from "../../graph/timeline/clock";
import type { StudioViewProps } from "../studio/types";
import LayoutRules from "../ui/LayoutRules";
import TimelineRangeFilter from "./TimelineRangeFilter";
export default function TimelineViewControls({ session, viewport }: Pick<StudioViewProps, "session" | "viewport">) {
  const canLocate = Boolean(viewport.focusedKey && viewport.stage?.nodeMap[viewport.focusedKey]);
  return (
    <section className="chart-layout-controls timeline-view-controls" aria-label="Timeline view">
      <LayoutRules
        label="Timeline view filters"
        rows={[
          {
            label: "Track",
            value: (
              <select
                className="studio-field"
                aria-label="Filter timeline by track"
                value={viewport.activeTrack}
                onChange={(event) => viewport.changeTrack(event.target.value)}
              >
                <option value="">All tracks</option>
                {viewport.trackOptions.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            ),
          },
          { label: "Time range", value: viewport.activeTimelineRange ? "Filtered" : "All time" },
        ]}
      />
      <TimelineRangeFilter
        clock={getTimelineClock(session.state.dag?.metadata)}
        range={viewport.activeTimelineRange}
        onChange={viewport.changeTimelineRange}
      />
      <div className="layout-actions">
        <button
          className="studio-button"
          disabled={!canLocate}
          onClick={() => {
            if (viewport.focusedKey) viewport.zoom.locateNode(viewport.focusedKey);
          }}
        >
          Locate selected event
        </button>
        <button className="studio-button" onClick={viewport.showAll}>
          Show all events
        </button>
      </div>
    </section>
  );
}
