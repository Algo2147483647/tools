import { useEffect, useRef, useState } from "react";
import { getGraphChartLabel } from "../../graph/types";
import CompoundPanel from "../arrange/compound/CompoundPanel";
import TimelineViewControls from "../timeline/TimelineViewControls";
import Icon from "../ui/Icon";
import IconButton from "../ui/IconButton";
import MethodTabs from "../ui/MethodTabs";
import ChartLayoutControls, { type ChartLayoutControlsProps } from "./ChartLayoutControls";
import type { StudioViewProps } from "./types";

export function StudioLayoutPanels(
  props: ChartLayoutControlsProps &
    Pick<StudioViewProps, "files" | "transactions"> & {
      open: boolean;
      onClose(): void;
    },
) {
  const { session, files, viewport, ui, transactions, open, onClose } = props;
  const { state } = session;
  const [tab, setTab] = useState<"layout" | "structure" | "view">("layout");
  const panel = useRef<HTMLElement>(null);
  const visible = open && !files.homeVisible && !state.ui.settingsOpen && !!state.dag;
  useEffect(() => {
    if (visible) panel.current?.focus();
  }, [visible]);
  const close = () => {
    onClose();
    document.getElementById("chart-tools-toggle")?.focus();
  };
  if (files.homeVisible || state.ui.settingsOpen || !state.dag) return null;
  const options = [
    { value: "layout" as const, label: "Layout" },
    ...(state.chartType === "compound" ? [{ value: "structure" as const, label: "Structure" }] : []),
    ...(state.chartType === "timeline" ? [{ value: "view" as const, label: "View" }] : []),
  ];
  const active = options.some((option) => option.value === tab) ? tab : "layout";
  const layout = <ChartLayoutControls {...props} />;
  return (
    <aside
      id="chart-tools-panel"
      ref={panel}
      className="chart-tools-panel"
      hidden={!open}
      tabIndex={-1}
      aria-label="Chart controls"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header className="chart-tools-heading">
        <div>
          <Icon name="layout" size={18} />
          <h2>{getGraphChartLabel(state.chartType)}</h2>
        </div>
        <IconButton
          variant="quiet"
          label="Close chart controls"
          icon={<Icon name="close" size={18} />}
          onClick={close}
        />
      </header>
      <div className="chart-tools-body">
        {options.length > 1 ? (
          <MethodTabs label="Chart controls" value={active} options={options} onChange={setTab}>
            <div hidden={active !== "layout"}>{layout}</div>
            {state.chartType === "compound" && (
              <div hidden={active !== "structure"}>
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
              </div>
            )}
            {state.chartType === "timeline" && (
              <div hidden={active !== "view"}>
                <TimelineViewControls session={session} viewport={viewport} />
              </div>
            )}
          </MethodTabs>
        ) : (
          layout
        )}
      </div>
    </aside>
  );
}
