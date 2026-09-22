import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlowEdge, Point, ServiceNode, Side, Workspace } from './model';
import { anchor, moveSegment, roundedPath, routeEdge } from './routing';
import Icon from './Icon';

export type Selection = { type: 'node' | 'edge'; id: string } | null;
export type View = { x: number; y: number; scale: number };
export type CanvasContext = { x: number; y: number; point: Point; target: Selection };
type Drag = {
  type: 'node' | 'resize' | 'segment' | 'pan' | 'connect';
  id: string;
  index?: number;
  start: Point;
  node?: ServiceNode;
  edge?: FlowEdge;
  view?: View;
  side?: Side;
};
type Props = {
  workspace: Workspace;
  graphId: string;
  selection: Selection;
  view: View;
  onView: (view: View) => void;
  onSelect: (selection: Selection) => void;
  onEnter: (node: ServiceNode) => void;
  onNode: (id: string, patch: Partial<ServiceNode>) => void;
  onEdge: (id: string, patch: Partial<FlowEdge>) => void;
  onConnect: (source: ServiceNode, target: ServiceNode, sourceSide: Side, targetSide: Side) => void;
  onContextMenu: (context: CanvasContext) => void;
  onAdd: () => void;
};

export default function Canvas(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [activeDrag, setActiveDrag] = useState(false);
  const [preview, setPreview] = useState<{ points: Point[]; targetId?: string; radius?: number } | null>(
    null,
  );
  const portSides: Side[] = ['left', 'right', 'top', 'bottom'];
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
  function cancelDrag() {
    drag.current = null;
    setActiveDrag(false);
    setPreview(null);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelDrag();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  function targetAt(pos: Point) {
    const threshold = 16 / p.view.scale;
    for (const node of [...nodes].reverse()) {
      const candidates = portSides.map((side) => ({ side, point: anchor(node, side) }));
      candidates.sort(
        (a, b) =>
          Math.hypot(a.point.x - pos.x, a.point.y - pos.y) - Math.hypot(b.point.x - pos.x, b.point.y - pos.y),
      );
      const nearest = candidates[0];
      if (
        Math.hypot(nearest.point.x - pos.x, nearest.point.y - pos.y) <= threshold ||
        (pos.x >= node.x && pos.x <= node.x + node.width && pos.y >= node.y && pos.y <= node.y + node.height)
      ) {
        return { node, side: nearest.side };
      }
    }
    return null;
  }
  function portRadius(key: string, side: Side) {
    if (side === 'top' || side === 'bottom') return 6;
    const degree = edges.filter((edge) => (side === 'left' ? edge.target : edge.source) === key).length;
    return degree > 99 ? 14 : 11;
  }
  function pointerMove(e: ReactPointerEvent) {
    const pos = point(e);
    const current = drag.current;
    if (!current) return;
    const dx = pos.x - current.start.x,
      dy = pos.y - current.start.y;
    if (current.type === 'connect') {
      const target = targetAt(pos);
      const valid = target && (target.node.id !== current.id || target.side !== current.side);
      if (valid)
        setPreview({
          points: routeEdge(current.node!, target.node, current.side!, target.side),
          targetId: target.node.id,
          radius: portRadius(target.node.key, target.side),
        });
      else {
        const start = anchor(current.node!, current.side!);
        const horizontal = current.side === 'left' || current.side === 'right';
        const stub = {
          x: start.x + (current.side === 'left' ? -32 : current.side === 'right' ? 32 : 0),
          y: start.y + (current.side === 'top' ? -32 : current.side === 'bottom' ? 32 : 0),
        };
        setPreview({
          points: [start, stub, horizontal ? { x: pos.x, y: stub.y } : { x: stub.x, y: pos.y }, pos],
        });
      }
    } else if (current.type === 'pan') {
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
        height: Math.max(64, Math.round(current.node!.height + dy)),
      });
    } else {
      const edge = current.edge!,
        index = current.index!;
      const horizontal = edge.points[index].y === edge.points[index + 1].y;
      const coordinate = horizontal ? edge.points[index].y + dy : edge.points[index].x + dx;
      p.onEdge(current.id, { points: moveSegment(edge.points, index, Math.round(coordinate)) });
    }
  }
  return (
    <div
      className={`canvas-wrap ${preview ? 'is-connecting' : ''} ${activeDrag ? 'is-dragging' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelDrag();
        const element = event.target as Element;
        const node = element.closest('[data-node-id]');
        const edge = element.closest('[data-edge-id]');
        p.onContextMenu({
          x: event.clientX,
          y: event.clientY,
          point: point(event),
          target: node
            ? { type: 'node', id: node.getAttribute('data-node-id')! }
            : edge
              ? { type: 'edge', id: edge.getAttribute('data-edge-id')! }
              : null,
        });
      }}
    >
      <svg
        ref={svg}
        className="graph-canvas"
        data-testid="graph-canvas"
        aria-label="Service graph canvas"
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          if (e.target === e.currentTarget || (e.target as Element).classList.contains('canvas-background')) {
            p.onSelect(null);
            begin(e, { type: 'pan', id: '', start: { x: e.clientX, y: e.clientY }, view: p.view });
          }
        }}
        onPointerMove={pointerMove}
        onPointerUp={(e) => {
          const current = drag.current;
          if (current?.type === 'connect') {
            const pos = point(e),
              target = targetAt(pos);
            if (
              target &&
              (target.node.id !== current.id || target.side !== current.side) &&
              Math.hypot(pos.x - current.start.x, pos.y - current.start.y) * p.view.scale > 4
            ) {
              p.onConnect(current.node!, target.node, current.side!, target.side);
            }
          }
          cancelDrag();
          const capture = e.target as Element;
          if (capture.hasPointerCapture?.(e.pointerId)) capture.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
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
            <circle cx={1} cy={1} r={0.8} fill="var(--grid-color)" />
          </pattern>
          {[false, true].flatMap((selected) =>
            [0, 6, 11, 14].map((radius) => (
              <marker
                key={`${selected}-${radius}`}
                id={`arrow${selected ? '-selected' : ''}-${radius}`}
                viewBox="0 0 10 10"
                refX={9 + (radius ? radius + 2 : 0)}
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path
                  d="M1 1 9 5 1 9"
                  fill="none"
                  stroke={selected ? 'var(--accent)' : 'var(--edge-color)'}
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </marker>
            )),
          )}
          <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="6"
              floodColor="var(--shadow-color)"
              floodOpacity=".06"
            />
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
                data-edge-id={edge.id}
                className={`flow-edge ${selected ? 'selected' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
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
                  markerEnd={`url(#arrow${selected ? '-selected' : ''}-${portRadius(edge.target, edge.targetSide)})`}
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
              </g>
            );
          })}
          {preview && (
            <path
              data-testid="connection-preview"
              d={roundedPath(preview.points)}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 5"
              fill="none"
              pointerEvents="none"
              markerEnd={`url(#arrow-selected-${preview.radius ?? 0})`}
            />
          )}
          {nodes.map((node) => {
            const selected = p.selection?.type === 'node' && p.selection.id === node.id;
            const incoming = edges.filter((edge) => edge.target === node.key).length;
            const outgoing = edges.filter((edge) => edge.source === node.key).length;
            return (
              <g
                key={node.id}
                data-testid={`node-${node.key}`}
                data-node-id={node.id}
                className={`service-node ${selected ? 'selected' : ''} ${preview?.targetId === node.id ? 'connecting' : ''}`}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
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
                <rect className="node-icon-bg" x={12} y={12} width={20} height={20} rx={5} />
                <path
                  d="M17 17h10v10H17z M20 20h4 M20 24h3"
                  fill="none"
                  stroke="var(--node-icon-color)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                <text
                  className="node-key"
                  x={node.width / 2}
                  y={Math.max(49, node.height / 2 + 5)}
                  textAnchor="middle"
                >
                  <title>{node.key}</title>
                  {node.key.length > Math.floor((node.width - 32) / 8)
                    ? node.key.slice(0, Math.floor((node.width - 32) / 8) - 1) + '…'
                    : node.key}
                </text>
                {portSides.map((side) => {
                  const center = anchor({ ...node, x: 0, y: 0 }, side);
                  const degree = side === 'left' ? incoming : side === 'right' ? outgoing : null;
                  return (
                    <g
                      key={side}
                      className="node-port"
                      data-testid={`port-${node.key}-${side}`}
                      role="button"
                      aria-label={`${node.key} ${side} anchor${degree !== null ? `, ${degree} ${side === 'left' ? 'incoming' : 'outgoing'} flows` : ''}`}
                      transform={`translate(${center.x} ${center.y})`}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        begin(event, { type: 'connect', id: node.id, start: point(event), node, side });
                        setPreview({ points: [anchor(node, side), anchor(node, side)] });
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <circle className="port-hit" r={16} fill="transparent" />
                      <circle className="port-body" r={degree === null ? 6 : degree > 99 ? 14 : 11} />
                      {degree !== null && (
                        <text className="port-count" textAnchor="middle" dominantBaseline="central">
                          {degree}
                        </text>
                      )}
                      <title>
                        {side === 'left'
                          ? `${incoming} incoming flows`
                          : side === 'right'
                            ? `${outgoing} outgoing flows`
                            : 'Drag to connect'}{' '}
                        · Drag to another service
                      </title>
                    </g>
                  );
                })}
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
          {edges
            .filter((edge) => p.selection?.type === 'edge' && p.selection.id === edge.id)
            .map((edge) => (
              <g key={`handles-${edge.id}`} className="edge-handles" data-edge-id={edge.id}>
                {edge.points.slice(0, -1).map((a, index) => {
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
            ))}
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
        {preview
          ? 'Drop on a service anchor to connect · Esc to cancel'
          : 'Drag an anchor to connect · Double-click to explore · Right-click for actions'}
      </div>
      <div className="canvas-coordinates">
        {nodes.length} services <span> / </span>
        {edges.length} flows
      </div>
    </div>
  );
}
