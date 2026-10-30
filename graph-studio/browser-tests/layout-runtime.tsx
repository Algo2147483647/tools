import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useGraphLayout } from "../src/app/layout/useGraphLayout";
import { useGraphZoom } from "../src/viewport/useGraphZoom";
import { createInitialGraphState } from "../src/app/document/initialState";
import { normalizeDagInput } from "../src/graph/normalize";
import { emptyTypeFilter } from "../src/graph/typeFilter";
import type { GraphChartType } from "../src/graph/types";
import { getDefaultChartStyle } from "../src/schema/appearance/styles";
import { captureLayoutGeometry, layoutIdentity, renderingSettings } from "../src/schema/layoutGeometry";
import { axisRotation } from "../src/viewport/camera/quaternion";

const graph = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  metadata: {
    space: { dimensions: 3, coordinateSystem: "spherical" },
    timeline: { clock: { mode: "relative", unit: "day" } },
  },
  nodes: {
    g: { title: "Group", space: [1, 0, 0], time: { at: 0 } },
    a: { title: "API", type: "service", space: [1, 60, 30], time: { at: 1 } },
    b: { title: "Storage", type: "data", space: [1, 140, -40], time: { at: 3 } },
  },
  edges: [{ id: "ab", source: "a", target: "b", value: 10 }],
  hierarchy_edges: [{ id: "ga", source: "g", target: "a" }],
});
const filter = emptyTypeFilter();
function Harness() {
  const [state, setState] = useState(() => ({
    ...createInitialGraphState(),
    dag: graph,
    document: { id: "runtime-test", generation: 1, savedDag: graph },
  }));
  const [view, setView] = useState({ focusGroupId: null as string | null, collapsedGroupIds: [] as string[] });
  const [paint, setPaint] = useState(0),
    [height, setHeight] = useState(0),
    [shell, setShell] = useState(0);
  const style = useMemo(() => {
    const s = getDefaultChartStyle(state.chartType);
    if (paint) s.appearance.palette.categories = [[80, 60, 40]];
    if (height) s.appearance.nodes.height += height;
    return s;
  }, [state.chartType, paint, height]);
  const layout = useGraphLayout({
    state,
    appearance: style.appearance,
    compound: { view },
    activeType: "",
    typeFilter: filter,
    activeTrack: "",
    activeTimelineRange: null,
    showNodeDetail: false,
    alignNodeWidthsToMax: true,
  });
  const containerRef = useRef<HTMLDivElement>(null),
    svgRef = useRef<SVGSVGElement>(null),
    overlaysRef = useRef<HTMLDivElement>(null);
  const zoom = useGraphZoom({
    containerRef,
    svgRef,
    overlaysRef,
    stage: layout.stage,
    viewKey: `${state.document.generation}:${state.chartType}:${view.focusGroupId}`,
    ...state.zoom,
    onZoomChange: (scale, minScale) =>
      setState((s) => ({ ...s, zoom: { ...s.zoom, scale, minScale: minScale ?? s.zoom.minScale } })),
  });
  const api = {
    load: (chartType: GraphChartType, ai = false) => {
      setHeight(0);
      setPaint(0);
      setView({ focusGroupId: null, collapsedGroupIds: [] });
      setState((s) => ({
        ...s,
        chartType,
        document: { ...s.document, generation: s.document.generation + 1 },
        timelineSettings: getDefaultChartStyle("timeline").timeline!,
        layoutSession: {
          ...s.layoutSession,
          data: {
            ...s.layoutSession.data,
            renderings: {},
            charts: {
              ...s.layoutSession.data.charts,
              compound: { ...s.layoutSession.data.charts.compound, method: ai ? "ai" : "automatic" },
            },
          },
        },
      }));
    },
    chart: (chartType: GraphChartType) => setState((s) => ({ ...s, chartType })),
    shell: () => setShell((s) => s + 1),
    paint: () => setPaint((p) => 1 - p),
    height: (n: number) => setHeight(n),
    collapse: (collapsed: boolean) => setView((v) => ({ ...v, collapsedGroupIds: collapsed ? ["g"] : [] })),
    orbit: () => layout.spatialView.orbit(axisRotation([1, 1, 0], 110)),
    zoom: () => {
      zoom.setZoomPercent(150);
      zoom.panBy(-30, -20);
    },
    seed: async () => (await layout.compoundLayout.acquireProblem(new AbortController().signal)).baseline,
    accept: () => {
      if (!layout.stage || !layout.layoutRenderingContext) throw new Error("No geometry");
      const charts = {
        ...state.layoutSession.data.charts,
        compound: { ...state.layoutSession.data.charts.compound, method: "ai" as const },
      };
      const context = layout.layoutRenderingContext;
      setState((s) => ({
        ...s,
        layoutSession: {
          ...s.layoutSession,
          data: {
            ...s.layoutSession.data,
            charts,
            renderings: {
              compound: {
                ...context,
                settingsFingerprint: layoutIdentity(
                  renderingSettings("compound", charts, context.scope, state.timelineSettings),
                ),
                geometry: captureLayoutGeometry(layout.stage!),
              },
            },
          },
        },
      }));
    },
    snapshot: () => ({
      chart: state.chartType,
      geometry: layout.stage ? captureLayoutGeometry(layout.stage) : null,
      colors: layout.stage?.nodes.map((n) => [
        n.key,
        n.colorTokens,
        n.spatial?.color,
        n.timeline?.color,
        n.flow?.color,
      ]),
      prepared: !!layout.compoundLayout.prepared,
      loading: layout.compoundLayout.loading,
      error: layout.compoundLayout.error,
      camera: [
        state.zoom.scale,
        containerRef.current?.scrollLeft,
        containerRef.current?.scrollTop,
        svgRef.current?.style.transform,
      ],
      orientation: layout.spatialView.view.orientation,
      shell,
    }),
  };
  Object.assign(window, { layoutTest: api });
  return (
    <div ref={containerRef} style={{ width: "900px", height: "650px", overflow: "auto", position: "relative" }}>
      <div ref={overlaysRef} style={{ width: 0, height: 0 }} />
      {layout.stage && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.stage.stageWidth} ${layout.stage.stageHeight}`}
          style={{ display: "block" }}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
