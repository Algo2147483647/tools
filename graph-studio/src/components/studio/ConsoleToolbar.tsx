import type { StudioViewProps } from "./types";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import ZoomInput from "../ui/ZoomInput";

/** Canvas navigation belongs to the Workbench tab. */
export default function ConsoleToolbar({
  viewport,
  hasGraph,
}: Pick<StudioViewProps, "viewport"> & { hasGraph: boolean }) {
  return (
    <div className="console-toolbar" aria-label="Canvas controls">
      <div role="group" aria-label="Graph navigation controls">
        <IconButton
          id="back-btn"
          label="Back"
          disabled={!viewport.canBack}
          onClick={viewport.back}
          icon={<Icon name="arrow-left" />}
        />
        <IconButton
          id="up-btn"
          label="Up"
          disabled={!viewport.canUp}
          onClick={viewport.up}
          icon={<Icon name="arrow-up" />}
        />
        <IconButton
          id="all-btn"
          label="Show whole graph"
          disabled={!hasGraph}
          onClick={viewport.showAll}
          icon={<Icon name="roots" />}
        />
      </div>
      <div role="group" aria-label="Graph zoom controls">
        <IconButton
          id="zoom-out-btn"
          label="Zoom out"
          disabled={!viewport.stage || !viewport.canZoomOut}
          onClick={viewport.zoom.zoomOut}
          icon={<Icon name="minus" />}
        />
        <ZoomInput value={viewport.zoomPercent} disabled={!viewport.stage} onCommit={viewport.zoom.setZoomPercent} />
        <IconButton
          id="zoom-in-btn"
          label="Zoom in"
          disabled={!viewport.stage || !viewport.canZoomIn}
          onClick={viewport.zoom.zoomIn}
          icon={<Icon name="plus" />}
        />
        <IconButton
          id="zoom-fit-btn"
          label="Fit graph to viewport"
          disabled={!viewport.stage}
          onClick={viewport.zoom.zoomFit}
          icon={<Icon name="fit" />}
        />
      </div>
    </div>
  );
}
