import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlowEdge, Point, ServiceNode, Workspace } from './model';
import { moveSegment, roundedPath, routeEdge } from './routing';
import Icon from './Icon';

export type Selection = { type: 'node' | 'edge'; id: string } | null;
export type View = { x: number; y: number; scale: number };
type Drag = {
  type: 'node' | 'resize' | 'segment' | 'pan';
  id: string;
  index?: number;
  start: Point;
  node?: ServiceNode;
  edge?: FlowEdge;
  view?: View;
};
type Props = {
  workspace: Workspace;
  graphId: string;
  selection: Selection;
  view: View;
  connecting: string | null;
  connectMode: boolean;
  onView: (view: View) => void;
  onSelect: (selection: Selection) => void;
  onEnter: (node: ServiceNode) => void;
  onNode: (id: string, patch: Partial<ServiceNode>) => void;
  onEdge: (id: string, patch: Partial<FlowEdge>) => void;
  onConnect: (node: ServiceNode) => void;
  onAdd: () => void;
};

export default function Canvas(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [activeDrag, setActiveDrag] = useState(false);
  const [pointer, setPointer] = useState<Point | null>(null);
  const nodes = p.workspace.nodes.filter((n) => n.graphId === p.graphId);
  const edges = p.workspace.edges
    .filter((e) => e.graphId === p.graphId)
    .map((e) =>
      e.points.length
        ? e
        : {
            ...e,
            points: routeEdge(
              nodes.find((n) => n.key === e.source)!,
              nodes.find((n) => n.key === e.target)!,
              e.sourceSide,
              e.targetSide,
            ),
          },
    );
  function point(e: { clientX: number; clientY: number }): Point {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - p.view.x) / p.view.scale,
      y: (e.clientY - rect.top - p.view.y) / p.view.scale,
    };
  }
  function begin(e: ReactPointerEvent, next: Drag) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = next;
    setActiveDrag(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: ReactPointerEvent) {
    const pos = point(e);
    setPointer(pos);
    const current = drag.current;
    if (!current) return;
    const dx = pos.x - current.start.x,
      dy = pos.y - current.start.y;
    if (current.type === 'pan') {
      p.onView({
        ...current.view!,
        x: current.view!.x + e.clientX - current.start.x,
        y: current.view!.y + e.clientY - current.start.y,
      });
    } else if (current.type === 'node') {
      p.onNode(current.id, { x: Math.round(current.node!.x + dx), y: Math.round(current.node!.y + dy) });
    } else if (current.type === 'resize') {
      p.onNode(current.id, {
        width: Math.max(160, Math.round(current.node!.width + dx)),
        height: Math.max(88, Math.round(current.node!.height + dy)),
      });
    } else {
      const edge = current.edge!,
        index = current.index!;
      const horizontal = edge.points[index].y === edge.points[index + 1].y;
      const coordinate = horizontal ? edge.points[index].y + dy : edge.points[index].x + dx;
      p.onEdge(current.id, { points: moveSegment(edge.points, index, Math.round(coordinate)) });
    }
  }
  const source = nodes.find((n) => n.id === p.connecting);
  return (
    <div className={`canvas-wrap ${p.connectMode ? 'connect-mode' : ''} ${activeDrag ? 'is-dragging' : ''}`}>
      <svg
        ref={svg}
        className="graph-canvas"
        data-testid="graph-canvas"
        aria-label="Service graph canvas"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).classList.contains('canvas-background')) {
            p.onSelect(null);
            begin(e, { type: 'pan', id: '', start: { x: e.clientX, y: e.clientY }, view: p.view });
          }
        }}
        onPointerMove={pointerMove}
        onPointerUp={(e) => {
          drag.current = null;
          setActiveDrag(false);
          if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setActiveDrag(false);
        }}
        onWheel={(e) => {
          const rect = svg.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left,
            sy = e.clientY - rect.top;
          const scale = Math.max(0.2, Math.min(2.5, p.view.scale * Math.exp(-e.deltaY * 0.001)));
          p.onView({
            scale,
            x: sx - ((sx - p.view.x) * scale) / p.view.scale,
            y: sy - ((sy - p.view.y) * scale) / p.view.scale,
          });
        }}
      >
        <defs>
          <pattern
            id="grid"
            width={24 * p.view.scale}
            height={24 * p.view.scale}
            patternUnits="userSpaceOnUse"
            x={p.view.x}
            y={p.view.y}
          >
            <circle cx={1} cy={1} r={0.8} fill="#d1d8db" />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M1 1 9 5 1 9" fill="none" stroke="#829497" strokeWidth="1.7" strokeLinejoin="round" />
          </marker>
          <marker
            id="arrow-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M1 1 9 5 1 9" fill="none" stroke="#218773" strokeWidth="1.7" strokeLinejoin="round" />
          </marker>
          <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1b3d43" floodOpacity=".06" />
          </filter>
        </defs>
        <rect className="canvas-background" width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${p.view.x} ${p.view.y}) scale(${p.view.scale})`}>
          {edges.map((edge) => {
            const selected = p.selection?.type === 'edge' && p.selection.id === edge.id;
            let mid = { x: 0, y: 0 };
            let longest = -1;
            for (let i = 0; i < edge.points.length - 1; i++) {
              const a = edge.points[i],
                b = edge.points[i + 1];
              const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
              if (length > longest) {
                longest = length;
                mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              }
            }
            const label = edge.weights.filter(Boolean).join(' · ');
            return (
              <g
                key={edge.id}
                data-testid={`edge-${edge.id}`}
                className={`flow-edge ${selected ? 'selected' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  p.onSelect({ type: 'edge', id: edge.id });
                }}
              >
                <path
                  d={roundedPath(edge.points)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                  className="edge-hit"
                />
                <path
                  className="edge-line"
                  d={roundedPath(edge.points)}
                  fill="none"
                  markerEnd={`url(#${selected ? 'arrow-selected' : 'arrow'})`}
                />
                {label && (
                  <g className="edge-label" transform={`translate(${mid.x} ${mid.y - 15})`}>
                    <rect
                      x={-Math.min(220, label.length * 6.2 + 20) / 2}
                      y={-12}
                      width={Math.min(220, label.length * 6.2 + 20)}
                      height={24}
                      rx={6}
                    />
                    <text textAnchor="middle" y={4}>
                      {label.length > 30 ? label.slice(0, 29) + '…' : label}
                    </text>
                  </g>
                )}
                {selected &&
                  edge.points.slice(0, -1).map((a, index) => {
                    const b = edge.points[index + 1];
                    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 12) return null;
                    return (
                      <rect
                        key={index}
                        data-testid={`segment-${index}`}
                        className="segment-handle"
                        x={(a.x + b.x) / 2 - 5}
                        y={(a.y + b.y) / 2 - 5}
                        width={10}
                        height={10}
                        rx={3}
                        style={{ cursor: a.y === b.y ? 'ns-resize' : 'ew-resize' }}
                        onPointerDown={(e) =>
                          begin(e, {
                            type: 'segment',
                            id: edge.id,
                            index,
                            start: point(e),
                            edge: structuredClone(edge),
                          })
                        }
                      >
                        <title>Drag this segment to edit the path</title>
                      </rect>
                    );
                  })}
              </g>
            );
          })}
          {source && pointer && (
            <path
              d={`M${source.x + source.width} ${source.y + source.height / 2} H${pointer.x} V${pointer.y}`}
              stroke="#218773"
              strokeWidth={2}
              strokeDasharray="6 5"
              fill="none"
              pointerEvents="none"
            />
          )}
          {nodes.map((node) => {
            const selected = p.selection?.type === 'node' && p.selection.id === node.id;
            const count = p.workspace.nodes.filter((n) => n.graphId === node.childGraphId).length;
            return (
              <g
                key={node.id}
                data-testid={`node-${node.key}`}
                className={`service-node ${selected ? 'selected' : ''} ${p.connecting === node.id ? 'connecting' : ''}`}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(e) => {
                  if (p.connectMode) {
                    e.stopPropagation();
                    p.onConnect(node);
                    return;
                  }
                  p.onSelect({ type: 'node', id: node.id });
                  begin(e, { type: 'node', id: node.id, start: point(e), node: { ...node } });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onEnter(node);
                }}
              >
                <rect
                  className="node-body"
                  width={node.width}
                  height={node.height}
                  rx={12}
                  filter="url(#node-shadow)"
                />
                <rect className="node-icon-bg" x={16} y={16} width={29} height={29} rx={7} />
                <path
                  d="M24 24h13v13H24z M27 28h7 M27 32h5"
                  fill="none"
                  stroke="#3f8475"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                <text className="node-kind" x={55} y={28}>
                  SERVICE
                </text>
                <text className="node-key" x={16} y={66}>
                  <title>{node.key}</title>
                  {node.key.length > Math.floor((node.width - 32) / 8)
                    ? node.key.slice(0, Math.floor((node.width - 32) / 8) - 1) + '…'
                    : node.key}
                </text>
                {node.height >= 105 && (
                  <>
                    <line
                      x1={16}
                      x2={node.width - 16}
                      y1={node.height - 35}
                      y2={node.height - 35}
                      stroke="#edf0ef"
                    />
                    <text className="node-foot" x={16} y={node.height - 14}>
                      {count
                        ? `${count} internal service${count === 1 ? '' : 's'}`
                        : 'Explore internal structure'}
                    </text>
                    <path
                      d={`m${node.width - 25} ${node.height - 22} 5 5-5 5`}
                      stroke="#7b8c8a"
                      fill="none"
                      strokeWidth={1.5}
                    />
                  </>
                )}
                {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
                  <circle
                    key={side}
                    className="node-port"
                    cx={side === 'left' ? 0 : side === 'right' ? node.width : node.width / 2}
                    cy={side === 'top' ? 0 : side === 'bottom' ? node.height : node.height / 2}
                    r={4}
                  />
                ))}
                {selected && (
                  <rect
                    data-testid="resize-handle"
                    className="resize-handle"
                    x={node.width - 6}
                    y={node.height - 6}
                    width={12}
                    height={12}
                    rx={3}
                    onPointerDown={(e) =>
                      begin(e, { type: 'resize', id: node.id, start: point(e), node: { ...node } })
                    }
                  >
                    <title>Resize service</title>
                  </rect>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!nodes.length && (
        <div className="empty-graph">
          <span className="empty-icon">
            <Icon name="layers" size={30} />
          </span>
          <h2>
            {p.graphId === p.workspace.rootGraphId
              ? 'Every system starts with a service.'
              : 'A closer look starts here.'}
          </h2>
          <p>
            {p.graphId === p.workspace.rootGraphId
              ? 'Add your first service, then connect the flow of data.'
              : 'Map the components and data flows inside this service.'}
          </p>
          <button className="primary" onClick={p.onAdd}>
            <Icon name="plus" />
            Add service
          </button>
          <span className="micro">One workspace. Every layer of your architecture.</span>
        </div>
      )}
      <div className="canvas-caption">
        <span className="live-dot" />
        {p.connectMode
          ? p.connecting
            ? 'Choose the destination service'
            : 'Choose the source service'
          : 'Drag canvas to pan · Scroll to zoom · Double-click a service to explore'}
      </div>
      <div className="canvas-coordinates">
        {nodes.length} services <span> / </span>
        {edges.length} flows
      </div>
    </div>
  );
}
