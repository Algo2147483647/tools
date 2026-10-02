import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNodeTitle } from "../graph/accessors";
import type { GraphAppearance } from "../graph/appearance";
import { getFullGraphSelection, getParentLevelSelection, sanitizeNodeLabel } from "../graph/selectors";
import { getGraphTypeOptions, projectGraphByType } from "../graph/typeFilter";
import { getGraphLayoutLabel, getGraphRenderMode } from "../graph/types";
import { useGraphPan } from "../hooks/useGraphPan";
import { useGraphZoom } from "../hooks/useGraphZoom";
import { useResizeObserver } from "../hooks/useResizeObserver";
import { type StageAppearance, getStageAppearance } from "../layout/appearance";
import { buildStageData } from "../layout/stage-layout";
import { downloadSvg } from "../rendering/export-svg";
import type { DocumentSessionController } from "./useDocumentSession";

export function useGraphViewport(session: DocumentSessionController, appearance: GraphAppearance) {
  const { state, dispatch, showNodeDetail, alignNodeWidthsToMax } = session;
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const pendingNodeClickTimeoutRef = useRef<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      clearPendingNodeClick();
      resizeCleanupRef.current?.();
    },
    [],
  );
  const typeOptions = useMemo(() => (state.dag ? getGraphTypeOptions(state.dag) : []), [state.dag]);
  const activeType = typeOptions.includes(selectedType) ? selectedType : "";
  useEffect(() => {
    if (selectedType && !typeOptions.includes(selectedType)) {
      setSelectedType("");
    }
  }, [selectedType, typeOptions]);
  const displayDag = useMemo(
    () => (state.dag ? projectGraphByType(state.dag, activeType, state.chartType) : null),
    [activeType, state.dag, state.chartType],
  );
  const renderMode = getGraphRenderMode(state.chartType, state.layout.mode);
  const geometryJson = JSON.stringify(getStageAppearance(appearance));
  const geometryAppearance = useMemo(() => JSON.parse(geometryJson) as StageAppearance, [geometryJson]);
  const stage = useMemo(
    () =>
      displayDag
        ? buildStageData({
            dag: displayDag,
            colorSourceDag: state.dag ?? undefined,
            selection: activeType ? { type: "full" } : state.selection,
            layoutMode: renderMode,
            appearance: geometryAppearance,
            showNodeDetail,
            alignNodeWidthsToMax,
          })
        : null,
    [
      activeType,
      alignNodeWidthsToMax,
      geometryAppearance,
      displayDag,
      state.dag,
      showNodeDetail,
      renderMode,
      state.selection,
    ],
  );
  const parentSelection = useMemo(
    () => (!activeType && state.dag && stage ? getParentLevelSelection(state.dag, stage.topLevelKeys) : null),
    [activeType, stage, state.dag],
  );
  const status = useMemo(() => {
    if (!state.dag || !stage) {
      return state.ui.status;
    }
    const focusNode = stage.dag[stage.root];
    const focusTitle = focusNode ? getNodeTitle(focusNode) : "";
    const focusLabel = focusNode?.synthetic
      ? focusTitle || "Selected roots"
      : sanitizeNodeLabel(focusTitle || stage.root);
    const layoutLabel = getGraphLayoutLabel(stage.layoutMode);
    const warningText = stage.warnings.length ? ` ${stage.warnings[0]}` : "";
    return state.ui.status &&
      !state.ui.status.includes("loaded from") &&
      !state.ui.status.startsWith("Mode:") &&
      !state.ui.status.startsWith("Layout:") &&
      !state.ui.status.startsWith("Chart type:")
      ? state.ui.status
      : `${layoutLabel}.${activeType ? ` Type: ${activeType}.` : ` Focused on ${focusLabel}.`} ${stage.nodes.length} nodes and ${stage.edges.length} links are visible.${warningText}`;
  }, [activeType, stage, state.dag, state.layout.mode, state.ui.status]);

  const handleZoomChange = useCallback(
    (scale: number, minScale?: number) => {
      dispatch({ type: "zoomChanged", scale, minScale });
    },
    [dispatch],
  );
  const zoom = useGraphZoom({
    containerRef,
    svgRef,
    topbarRef,
    stage,
    scale: state.zoom.scale,
    minScale: state.zoom.minScale,
    maxScale: state.zoom.maxScale,
    onZoomChange: handleZoomChange,
  });

  const handleResize = useCallback(() => zoom.refresh(true), [zoom]);
  useResizeObserver(containerRef, handleResize);
  const handleChromeResize = useCallback(() => {
    const topbar = topbarRef.current;
    if (topbar)
      topbar.parentElement?.style.setProperty("--toolbar-bottom", `${topbar.offsetTop + topbar.offsetHeight + 8}px`);
    zoom.refresh(true);
  }, [zoom]);
  useResizeObserver(topbarRef, handleChromeResize);
  useGraphPan({ containerRef, enabled: Boolean(stage), onPanStart: session.closeContextMenu });

  function handleNodeClick(nodeKey: string) {
    clearPendingNodeClick();
    if (activeType) {
      setFocusedKey(nodeKey);
      return;
    }
    pendingNodeClickTimeoutRef.current = window.setTimeout(() => {
      pendingNodeClickTimeoutRef.current = null;
      if (!state.selection || state.selection.type !== "node" || state.selection.key !== nodeKey) {
        dispatch({ type: "selectionChanged", selection: { type: "node", key: nodeKey }, pushHistory: true });
      }
    }, 240);
  }

  function handleNodeDoubleClick(nodeKey: string) {
    clearPendingNodeClick();
    if (!stage?.nodeMap[nodeKey]) {
      return;
    }
    session.openNodeDetail(nodeKey);
  }

  function clearPendingNodeClick() {
    if (pendingNodeClickTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(pendingNodeClickTimeoutRef.current);
    pendingNodeClickTimeoutRef.current = null;
  }

  function handleNodeContextMenu(event: React.MouseEvent<SVGGElement>, nodeKey: string) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 368;
    dispatch({
      type: "contextMenuOpened",
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      nodeKey,
    });
  }

  function handleBackgroundContextMenu(event: React.MouseEvent<Element>) {
    if (!state.dag || (event.target instanceof Element && event.target.closest(".dag-node"))) {
      return;
    }
    event.preventDefault();
    const menuWidth = 190;
    const menuHeight = 96;
    dispatch({
      type: "contextMenuOpened",
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      nodeKey: null,
    });
  }

  const handleConsoleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      resizeCleanupRef.current?.();
      const startX = event.clientX;
      const startWidth = state.ui.consoleSidebarWidth;
      const move = (next: PointerEvent) =>
        dispatch({ type: "consoleSidebarWidthChanged", width: startWidth + next.clientX - startX });
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("blur", stop);
        resizeCleanupRef.current = null;
      };
      resizeCleanupRef.current = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      window.addEventListener("blur", stop);
    },
    [dispatch, state.ui.consoleSidebarWidth],
  );
  function handleExportSvg() {
    if (!svgRef.current) {
      dispatch({ type: "statusChanged", status: "Render a DAG first, then export the SVG." });
      return;
    }
    downloadSvg(svgRef.current);
    dispatch({ type: "statusChanged", status: "Exported current view as dag-graph.svg." });
  }

  function changeType(type: string) {
    clearPendingNodeClick();
    setFocusedKey(null);
    setSelectedType(type);
  }
  function back() {
    if (activeType) changeType("");
    else dispatch({ type: "navigateBack" });
  }
  function up() {
    if (parentSelection) dispatch({ type: "selectionChanged", selection: parentSelection, pushHistory: true });
  }
  function showAll() {
    changeType("");
    dispatch({ type: "selectionChanged", selection: getFullGraphSelection(), pushHistory: true });
  }
  return {
    containerRef,
    svgRef,
    topbarRef,
    stage,
    status,
    focusedKey,
    setFocusedKey,
    typeOptions,
    activeType,
    changeType,
    back,
    up,
    showAll,
    zoom,
    canBack: Boolean(activeType) || state.history.length > 0,
    canUp: Boolean(parentSelection),
    zoomPercent: Number((state.zoom.scale * 100).toFixed(state.zoom.scale < 0.1 ? 1 : 0)),
    canZoomOut: Boolean(stage) && state.zoom.scale > state.zoom.minScale + 0.001,
    canZoomIn: Boolean(stage) && state.zoom.scale < state.zoom.maxScale - 0.001,
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeContextMenu,
    handleBackgroundContextMenu,
    handleConsoleSidebarResizeStart,
    handleExportSvg,
  };
}

export type GraphViewportController = ReturnType<typeof useGraphViewport>;
