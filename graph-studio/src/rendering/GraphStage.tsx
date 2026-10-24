import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import { type GraphAppearance, appearanceToStageStyle } from "../graph/appearance";
import type { StageData } from "../layout/types";
import SpatialNode from "./SpatialNode";
import GraphBackdrop from "./GraphBackdrop";
import GraphDefs from "./GraphDefs";
import GraphEdge from "./GraphEdge";
import GraphNode from "./GraphNode";
import { GroupHeader, GroupControls } from "./GraphGroup";
import TimelineBackdrop, { TimelineRuler } from "./TimelineBackdrop";
import TimelineNode from "./TimelineNode";

const EMPTY_CONNECTED_KEYS = new Set<string>();
function groupBackgroundFill(palettes: string[][], familyIndex: number, depth: number): string {
  const palette = palettes[familyIndex % palettes.length];
  return palette[Math.min(palette.length - 1, Math.max(0, depth))];
}

interface GraphStageProps {
  onGroupToggle?: (id: string) => void;
  onGroupEnter?: (id: string) => void;
  stage: StageData;
  focusedKey: string | null;
  hideNodeBorders: boolean;
  appearance: GraphAppearance;
  svgRef: React.RefObject<SVGSVGElement>;
  onTimelineNodePin?: (key: string, x: number) => void;
  onNodeClick: (key: string) => void;
  onNodeDoubleClick: (key: string) => void;
  onNodeContextMenu: (event: React.MouseEvent<SVGGElement>, key: string) => void;
  onBackgroundContextMenu: (event: React.MouseEvent<Element>) => void;
  onFocusChange: (key: string | null) => void;
}

export default function GraphStage({
  stage,
  focusedKey,
  hideNodeBorders,
  appearance,
  svgRef,
  onTimelineNodePin,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onBackgroundContextMenu,
  onFocusChange,
  onGroupToggle,
  onGroupEnter,
}: GraphStageProps) {
  const hoveredKeyRef = useRef<string | null>(null);
  const focusedKeyRef = useRef<string | null>(focusedKey);
  const appliedInteractiveKeyRef = useRef<string | null>(null);
  const nodeElementsByKeyRef = useRef(new Map<string, SVGGElement[]>());
  const edgeElementsByNodeKeyRef = useRef(new Map<string, SVGGElement[]>());
  const connectedNodeElementsRef = useRef(new Set<SVGGElement>());
  const activeEdgeElementsRef = useRef(new Set<SVGGElement>());
  const currentNodeElementRef = useRef<SVGGElement[]>([]);
  const isDenseStage =
    stage.nodes.length >= appearance.performance.denseThresholds[0] ||
    stage.edges.length >= appearance.performance.denseThresholds[1] ||
    stage.stageWidth * stage.stageHeight >= appearance.performance.denseThresholds[2];
  const stageStyle = appearanceToStageStyle(appearance) as CSSProperties;

  const clearInteractiveClasses = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }

    svgElement.dataset.hasInteractiveNode = "false";

    currentNodeElementRef.current.forEach((element) => {
      element.dataset.hovered = "false";
      element.dataset.focused = "false";
    });
    currentNodeElementRef.current = [];

    connectedNodeElementsRef.current.forEach((nodeElement) => {
      nodeElement.dataset.connected = "false";
    });
    connectedNodeElementsRef.current.clear();

    activeEdgeElementsRef.current.forEach((edgeElement) => {
      edgeElement.dataset.active = "false";
    });
    activeEdgeElementsRef.current.clear();
  }, [svgRef]);

  const applyInteractiveKey = useCallback(
    (nextKey: string | null) => {
      const svgElement = svgRef.current;
      if (!svgElement) {
        return;
      }

      const previousKey = appliedInteractiveKeyRef.current;
      if (previousKey === nextKey) {
        if (nextKey) {
          const currentNodeElement = nodeElementsByKeyRef.current.get(nextKey);
          currentNodeElement?.forEach((element) => {
            element.dataset.hovered = hoveredKeyRef.current === nextKey ? "true" : "false";
            element.dataset.focused = focusedKeyRef.current === nextKey ? "true" : "false";
          });
        }
        return;
      }

      if (!nextKey) {
        clearInteractiveClasses();
        appliedInteractiveKeyRef.current = null;
        return;
      }

      const nextNodeElement = nodeElementsByKeyRef.current.get(nextKey);
      if (!nextNodeElement) {
        clearInteractiveClasses();
        appliedInteractiveKeyRef.current = null;
        return;
      }

      const previousConnectedKeys = getAdjacentKeys(previousKey, stage);
      const nextConnectedKeys = getAdjacentKeys(nextKey, stage);

      const previousEdgeElements = new Set(edgeElementsByNodeKeyRef.current.get(previousKey || "") || []);
      const nextEdgeElements = new Set(edgeElementsByNodeKeyRef.current.get(nextKey) || []);

      if (!previousKey) {
        svgElement.dataset.hasInteractiveNode = "true";
      }

      if (currentNodeElementRef.current !== nextNodeElement) {
        currentNodeElementRef.current.forEach((element) => {
          element.dataset.hovered = "false";
          element.dataset.focused = "false";
        });
      }

      nextNodeElement.forEach((element) => {
        element.dataset.hovered = hoveredKeyRef.current === nextKey ? "true" : "false";
        element.dataset.focused = focusedKeyRef.current === nextKey ? "true" : "false";
      });
      currentNodeElementRef.current = nextNodeElement;

      previousConnectedKeys.forEach((connectedKey) => {
        if (nextConnectedKeys.has(connectedKey)) {
          return;
        }
        const connectedNodeElement = nodeElementsByKeyRef.current.get(connectedKey);
        if (!connectedNodeElement) {
          return;
        }
        connectedNodeElement.forEach((element) => {
          element.dataset.connected = "false";
          connectedNodeElementsRef.current.delete(element);
        });
      });

      nextConnectedKeys.forEach((connectedKey) => {
        const connectedNodeElement = nodeElementsByKeyRef.current.get(connectedKey);
        if (!connectedNodeElement) {
          return;
        }
        connectedNodeElement.forEach((element) => {
          element.dataset.connected = "true";
          connectedNodeElementsRef.current.add(element);
        });
      });

      previousEdgeElements.forEach((edgeElement) => {
        if (nextEdgeElements.has(edgeElement)) {
          return;
        }
        edgeElement.dataset.active = "false";
        activeEdgeElementsRef.current.delete(edgeElement);
      });

      nextEdgeElements.forEach((edgeElement) => {
        edgeElement.dataset.active = "true";
        activeEdgeElementsRef.current.add(edgeElement);
      });

      appliedInteractiveKeyRef.current = nextKey;
    },
    [clearInteractiveClasses, stage.connectedKeysByNode, svgRef],
  );

  useEffect(() => {
    focusedKeyRef.current = focusedKey;
    if (!hoveredKeyRef.current) {
      applyInteractiveKey(resolveVisibleNodeKey(focusedKey, stage));
    }
  }, [applyInteractiveKey, focusedKey, stage]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }

    nodeElementsByKeyRef.current = collectNodeElements(svgElement);
    edgeElementsByNodeKeyRef.current = collectEdgeElements(svgElement);
    syncInteractiveKey(hoveredKeyRef.current);
    let frameHandle = 0;
    let pendingKey: string | null = null;

    const scheduleInteractiveKey = (nextKey: string | null) => {
      pendingKey = nextKey;
      if (frameHandle) {
        return;
      }
      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = 0;
        if (hoveredKeyRef.current === pendingKey) {
          return;
        }
        syncInteractiveKey(pendingKey);
      });
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || svgElement.closest("[data-gesturing=true]")) return;
      scheduleInteractiveKey(resolveNodeKey(event.target));
    };

    const handlePointerLeave = () => {
      if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
      if (!hoveredKeyRef.current) {
        return;
      }
      syncInteractiveKey(null);
    };

    svgElement.addEventListener("pointerover", handlePointerOver);
    svgElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
      }
      svgElement.removeEventListener("pointerover", handlePointerOver);
      svgElement.removeEventListener("pointerleave", handlePointerLeave);
      hoveredKeyRef.current = null;
      appliedInteractiveKeyRef.current = null;
      clearInteractiveClasses();
      nodeElementsByKeyRef.current = new Map();
      edgeElementsByNodeKeyRef.current = new Map();
    };
  }, [applyInteractiveKey, clearInteractiveClasses, stage, svgRef]);

  return (
    <svg
      className="dag-graph"
      data-layout={stage.layoutMode}
      data-dense-shadows={appearance.performance.denseShadows}
      data-density={isDenseStage ? "dense" : "normal"}
      data-borderless={hideNodeBorders ? "true" : "false"}
      data-has-interactive-node="false"
      ref={svgRef}
      viewBox={`0 0 ${stage.stageWidth} ${stage.stageHeight}`}
      width={stage.stageWidth}
      height={stage.stageHeight}
      style={stageStyle}
      role={
        stage.layoutMode === "spatial" || stage.layoutMode === "compound" || stage.layoutMode === "timeline"
          ? "group"
          : "img"
      }
      aria-label={`${stage.layoutMode === "spatial" ? "Spatial" : stage.layoutMode === "timeline" ? "Timeline" : stage.layoutMode === "compound" ? "Nested graph" : stage.layoutMode === "sankey" ? "Sankey flow" : "DAG"} view focused on ${stage.selection.label}`}
      onContextMenu={onBackgroundContextMenu}
    >
      <GraphDefs
        edgeArrowStyle={appearance.display.edgeArrowStyle}
        appearanceCss={appearance.css}
        timelineColors={Array.from(
          new Set(stage.edges.flatMap((edge) => (edge.timeline ? [edge.timeline.color] : []))),
        )}
      />
      {stage.spatial ? (
        <g className="spatial-guides" aria-hidden="true" pointerEvents="none">
          {stage.spatial.guides.map((guide, index) => (
            <g key={index}>
              <path d={guide.path} />
              {guide.label && (
                <text x={guide.x} y={guide.y}>
                  {guide.label}
                </text>
              )}
            </g>
          ))}
        </g>
      ) : stage.timeline ? (
        <TimelineBackdrop stage={stage} />
      ) : (
        stage.layoutMode !== "sankey" && stage.layoutMode !== "compound" && <GraphBackdrop stage={stage} />
      )}
      <g className="dag-group-backgrounds">
        {stage.groups?.map((group) => (
          <rect
            key={group.id}
            data-group-id={group.id}
            data-depth={group.depth}
            className="dag-group-background"
            style={
              {
                "--dag-group-fill": groupBackgroundFill(appearance.palette.groups, group.colorFamilyIndex, group.depth),
                ...(appearance.display.showGroupBorders ? {} : { stroke: "none" }),
              } as CSSProperties
            }
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx={12}
          />
        ))}
      </g>
      {stage.timeline && (
        <g className="timeline-leader-layer" aria-hidden="true" pointerEvents="none">
          {stage.nodes.map((node) => (
            <TimelineNode
              key={node.key}
              layer="leader"
              node={node}
              isActive={node.key === stage.root}
              onClick={onNodeClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ))}
        </g>
      )}
      <g className="dag-edge-layer">
        {stage.edges.map((edge) => (
          <GraphEdge key={edge.id} edge={edge} showLabel={appearance.display.showEdgeLabels} />
        ))}
      </g>
      <g className="dag-node-layer">
        {stage.nodes.map((node) =>
          node.spatial ? (
            <SpatialNode
              key={node.key}
              node={node}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ) : (
            <GraphNode
              key={node.key}
              node={node}
              showGroupStats={appearance.display.showGroupStats}
              nodeCornerRadius={appearance.display.nodeCornerRadius}
              isActive={node.key === stage.root}
              onTimelineNodePin={onTimelineNodePin}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ),
        )}
      </g>
      <g className="dag-group-headers">
        {stage.groups?.map((group) => (
          <GroupHeader
            key={group.id}
            group={group}
            showStats={appearance.display.showGroupStats}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onFocusChange={onFocusChange}
            onToggle={onGroupToggle}
            onEnter={onGroupEnter}
          />
        ))}
        {stage.nodes
          .filter((node) => node.kind === "group")
          .map((node) => (
            <GroupControls
              key={node.key}
              id={node.key}
              x={node.x + node.width / 2 - 64}
              y={node.y - node.height / 2 + 8}
              collapsed
              external={node.external}
              onToggle={onGroupToggle}
              onEnter={onGroupEnter}
            />
          ))}
      </g>
      {stage.timeline && (
        <g className="timeline-label-layer">
          {stage.nodes.map((node) => (
            <TimelineNode
              key={node.key}
              layer="label"
              node={node}
              isActive={node.key === stage.root}
              onPin={onTimelineNodePin}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ))}
        </g>
      )}
      {stage.timeline && <TimelineRuler stage={stage} svgRef={svgRef} />}
    </svg>
  );

  function syncInteractiveKey(nextHoveredKey: string | null) {
    hoveredKeyRef.current = resolveVisibleNodeKey(nextHoveredKey, stage);
    applyInteractiveKey(hoveredKeyRef.current || resolveVisibleNodeKey(focusedKeyRef.current, stage));
  }
}

function resolveNodeKey(target: EventTarget | null): string | null {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") {
    return null;
  }
  return element.closest<SVGGElement>(".dag-node[data-key]")?.dataset.key || null;
}

function collectNodeElements(svgElement: SVGSVGElement): Map<string, SVGGElement[]> {
  const nodeElementsByKey = new Map<string, SVGGElement[]>();
  svgElement.querySelectorAll<SVGGElement>(".dag-node[data-key]").forEach((nodeElement) => {
    const nodeKey = nodeElement.dataset.key;
    if (nodeKey) {
      nodeElementsByKey.set(nodeKey, [...(nodeElementsByKey.get(nodeKey) ?? []), nodeElement]);
    }
  });
  return nodeElementsByKey;
}

function collectEdgeElements(svgElement: SVGSVGElement): Map<string, SVGGElement[]> {
  const edgeElementsByNodeKey = new Map<string, SVGGElement[]>();
  svgElement.querySelectorAll<SVGGElement>(".dag-edge[data-source][data-target]").forEach((edgeElement) => {
    const sourceKey = edgeElement.dataset.source;
    const targetKey = edgeElement.dataset.target;
    if (sourceKey) {
      const sourceEdges = edgeElementsByNodeKey.get(sourceKey) || [];
      sourceEdges.push(edgeElement);
      edgeElementsByNodeKey.set(sourceKey, sourceEdges);
    }
    if (targetKey && targetKey !== sourceKey) {
      const targetEdges = edgeElementsByNodeKey.get(targetKey) || [];
      targetEdges.push(edgeElement);
      edgeElementsByNodeKey.set(targetKey, targetEdges);
    }
  });
  return edgeElementsByNodeKey;
}

function resolveVisibleNodeKey(nodeKey: string | null, stage: StageData): string | null {
  return nodeKey && stage.nodeMap[nodeKey] ? nodeKey : null;
}

function getAdjacentKeys(nodeKey: string | null, stage: StageData): ReadonlySet<string> {
  if (!nodeKey) {
    return EMPTY_CONNECTED_KEYS;
  }

  const connectedKeys = stage.connectedKeysByNode.get(nodeKey);
  if (!connectedKeys) {
    return EMPTY_CONNECTED_KEYS;
  }

  return new Set(Array.from(connectedKeys).filter((connectedKey) => connectedKey !== nodeKey));
}
