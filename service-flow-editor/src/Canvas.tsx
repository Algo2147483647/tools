import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlowEdge, Point, ServiceNode, Side, Workspace } from './model';
import { canvasSettings, snapCoordinate } from './model';
import { anchor, moveSegment, roundedPath, routeEdge } from './routing';
import { CONTAINER_HEADER, scene, type SceneEdge, type SceneNode } from './hierarchy';
import Icon from './Icon';

export type Selection = { type: 'node' | 'edge'; id: string } | null;
export type View = { x: number; y: number; scale: number };
export type CanvasContext = { x: number; y: number; point: Point; target: Selection };
type Drag = {
  type: 'node' | 'resize' | 'segment' | 'pan' | 'connect';
  id: string;
  index?: number;
  start: Point;
  node?: SceneNode;
  edge?: SceneEdge;
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
  onAddInside?: (node: ServiceNode) => void;
};

function wrapLabel(text: string, width: number, fontSize: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '',
    length = 0;
  for (const character of text) {
    const advance = fontSize * (character.codePointAt(0)! > 255 ? 1 : 0.62);
    if (line && length + advance > width) {
      lines.push(line.trim());
      line = '';
      length = 0;
    }
    line += character;
    length += advance;
  }
  if (line) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

export default function Canvas(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const latest = useRef(p);
  latest.current = p;
  const settings = canvasSettings(p.workspace);
  const snap = (value: number) => snapCoordinate(value, settings);
  const drag = useRef<Drag | null>(null);
  const [activeDrag, setActiveDrag] = useState(false);
  const [preview, setPreview] = useState<{ points: Point[]; targetId?: string; radius?: number } | null>(
    null,
  );
  const portSides: Side[] = ['left', 'right', 'top', 'bottom'];
  const { nodes, edges } = useMemo(() => scene(p.workspace, p.graphId), [p.workspace, p.graphId]);
  const degrees = useMemo(() => {
    const result = new Map(p.workspace.nodes.map((node) => [node.id, { incoming: 0, outgoing: 0 }]));
    const idsByKey = new Map(p.workspace.nodes.map((node) => [node.key, node.id]));
    for (const edge of p.workspace.edges) {
      const source = result.get(edge.sourceNodeId ?? idsByKey.get(edge.source) ?? '');
      const target = result.get(edge.targetNodeId ?? idsByKey.get(edge.target) ?? '');
      if (source) source.outgoing++;
      if (target) target.incoming++;
    }
    return result;
  }, [p.workspace]);
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
    svg.current?.focus({ preventScroll: true });
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
  useEffect(() => {
    const element = wrapper.current!;
    const zoom = (factor: number, clientX: number, clientY: number) => {
      const current = latest.current;
      const rect = svg.current!.getBoundingClientRect();
      const sx = clientX - rect.left,
        sy = clientY - rect.top;
      const scale = Math.max(0.2, Math.min(2.5, current.view.scale * factor));
      const view = {
        scale,
        x: sx - ((sx - current.view.x) * scale) / current.view.scale,
        y: sy - ((sy - current.view.y) * scale) / current.view.scale,
      };
      latest.current = { ...current, view };
      current.onView(view);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      zoom(Math.exp(-delta * 0.001), event.clientX, event.clientY);
    };
    let gestureScale = 1;
    const gesture = (event: Event) => {
      event.preventDefault();
      const pinch = event as Event & { scale: number; clientX: number; clientY: number };
      if (event.type === 'gesturestart') gestureScale = 1;
      if (event.type === 'gesturechange' && pinch.scale > 0) {
        zoom(pinch.scale / gestureScale, pinch.clientX, pinch.clientY);
        gestureScale = pinch.scale;
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
      element.addEventListener(type, gesture, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
        element.removeEventListener(type, gesture);
    };
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
        (node.type === 'terminal' && !node.expanded
          ? Math.hypot(pos.x - node.x - node.width / 2, pos.y - node.y - node.height / 2) <= node.width / 2
          : pos.x >= node.x &&
            pos.x <= node.x + node.width &&
            pos.y >= node.y &&
            pos.y <= node.y + node.height)
      ) {
        return { node, side: nearest.side };
      }
    }
    return null;
  }
  function portRadius(node: SceneNode, side: Side) {
    if (side === 'top' || side === 'bottom') return 6;
    const degree = degrees.get(node.id)?.[side === 'left' ? 'incoming' : 'outgoing'] ?? 0;
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
          points: routeEdge(current.node!, target.node, current.side!, target.side, nodes),
          targetId: target.node.id,
          radius: portRadius(target.node, target.side),
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
      p.onNode(current.id, { x: snap(current.node!.base.x + dx), y: snap(current.node!.base.y + dy) });
    } else if (current.type === 'resize') {
      const minimum = (value: number) =>
        settings.snapToGrid ? Math.ceil(value / settings.gridSize) * settings.gridSize : value;
      if (current.node!.type === 'terminal' && !current.node!.expanded) {
        const diameter = Math.max(minimum(80), snap(current.node!.width + Math.max(dx, dy)));
        p.onNode(current.id, { width: diameter, height: diameter });
      } else
        p.onNode(current.id, {
          width: Math.max(minimum(160), snap(current.node!.width + dx)),
          height: Math.max(minimum(64), snap(current.node!.height + dy)),
        });
    } else {
      const edge = current.edge!,
        index = current.index!;
      const horizontal = edge.points[index].y === edge.points[index + 1].y;
      const coordinate = horizontal ? edge.points[index].y + dy : edge.points[index].x + dx;
      p.onEdge(current.id, {
        points: moveSegment(edge.points, index, snap(coordinate)).map((position) => ({
          x: position.x - edge.offset.x,
          y: position.y - edge.offset.y,
        })),
      });
    }
  }
  return (
    <div
      ref={wrapper}
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
              p.onConnect(current.node!.base, target.node.base, current.side!, target.side);
            }
          }
          cancelDrag();
          const capture = e.target as Element;
          if (capture.hasPointerCapture?.(e.pointerId)) capture.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey) || !['+', '=', '-', '0'].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = svg.current!.getBoundingClientRect();
          const sx = rect.width / 2,
            sy = rect.height / 2;
          const scale =
            e.key === '0'
              ? 1
              : Math.max(0.2, Math.min(2.5, p.view.scale * (e.key === '-' ? 1 / 1.15 : 1.15)));
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
            width={settings.gridSize * p.view.scale}
            height={settings.gridSize * p.view.scale}
            patternUnits="userSpaceOnUse"
            x={p.view.x - (settings.gridStyle === 'dots' ? (settings.gridSize * p.view.scale) / 2 : 0)}
            y={p.view.y - (settings.gridStyle === 'dots' ? (settings.gridSize * p.view.scale) / 2 : 0)}
          >
            {settings.gridStyle === 'dots' ? (
              <circle
                data-testid="grid-dots"
                cx={(settings.gridSize * p.view.scale) / 2}
                cy={(settings.gridSize * p.view.scale) / 2}
                r={1}
                fill="var(--grid-color)"
              />
            ) : (
              <path
                data-testid="grid-lines"
                d={`M ${settings.gridSize * p.view.scale} 0 H 0 V ${settings.gridSize * p.view.scale}`}
                fill="none"
                stroke="var(--grid-color)"
                strokeWidth={0.8}
              />
            )}
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
          {nodes
            .filter((node) => node.expanded)
            .map((node) => (
              <rect
                key={`container-${node.id}`}
                data-testid={`container-${node.key}`}
                className="container-background"
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={14}
                pointerEvents="none"
              />
            ))}
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
                className={`flow-edge ${selected ? 'selected' : ''} ${edge.projected ? 'projected' : ''}`}
                data-projected={edge.projected || undefined}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return;
                  p.onSelect({ type: 'edge', id: edge.id });
                }}
              >
                <title>
                  {`${edge.original.source} → ${edge.original.target}${edge.projected ? ' · An endpoint is inside a collapsed service. Expand its container to reveal the complete flow and edit its path.' : ''}`}
                </title>
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
                  markerEnd={`url(#arrow${selected ? '-selected' : ''}-${portRadius(edge.targetNode, edge.targetSide)})`}
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
            const circular = node.type === 'terminal' && !node.expanded;
            const fontSize = node.fontSize ?? settings.nodeFontSize;
            const labelWidth = node.expanded
              ? node.width - 86
              : circular
                ? node.width * 0.68
                : node.width - 36;
            const labelHeight = node.expanded
              ? CONTAINER_HEADER - 20
              : circular
                ? node.height * 0.68
                : node.height - 24;
            const label = wrapLabel(
              node.key,
              labelWidth,
              fontSize,
              Math.max(1, Math.floor(labelHeight / (fontSize * 1.25))),
            );
            const selected = p.selection?.type === 'node' && p.selection.id === node.id;
            const { incoming, outgoing } = degrees.get(node.id)!;
            const empty = node.expanded && !nodes.some((child) => child.graphId === node.childGraphId);
            return (
              <g
                key={node.id}
                data-testid={`node-${node.key}`}
                data-node-id={node.id}
                data-node-type={node.type ?? 'service'}
                data-expanded={node.expanded || undefined}
                data-depth={node.depth}
                className={`service-node ${node.expanded ? 'expanded' : ''} ${selected ? 'selected' : ''} ${preview?.targetId === node.id ? 'connecting' : ''}`}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  p.onSelect({ type: 'node', id: node.id });
                  begin(e, { type: 'node', id: node.id, start: point(e), node: { ...node } });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  p.onEnter(node.base);
                }}
              >
                {circular ? (
                  <circle
                    className="node-body"
                    cx={node.width / 2}
                    cy={node.height / 2}
                    r={node.width / 2}
                    filter="url(#node-shadow)"
                  />
                ) : (
                  <rect
                    className="node-body"
                    width={node.width}
                    height={node.height}
                    rx={12}
                    filter="url(#node-shadow)"
                  />
                )}
                {node.expanded && (
                  <rect
                    className="container-header"
                    data-testid={`container-header-${node.key}`}
                    width={node.width}
                    height={CONTAINER_HEADER}
                    rx={12}
                  />
                )}
                <text
                  className="node-key"
                  x={node.expanded ? 20 : node.width / 2}
                  y={
                    (node.expanded ? CONTAINER_HEADER : node.height) / 2 -
                    ((label.length - 1) * fontSize * 1.25) / 2
                  }
                  dominantBaseline="central"
                  style={{ fontSize }}
                  textAnchor={node.expanded ? 'start' : 'middle'}
                >
                  <title>{node.key}</title>
                  {label.map((line, index) => (
                    <tspan
                      key={index}
                      x={node.expanded ? 20 : node.width / 2}
                      dy={index ? fontSize * 1.25 : 0}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                {node.expanded && (
                  <g
                    className="container-collapse"
                    role="button"
                    tabIndex={0}
                    aria-label={`Collapse ${node.key}`}
                    transform={`translate(${node.width - 38} ${CONTAINER_HEADER / 2})`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      p.onEnter(node.base);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      p.onEnter(node.base);
                    }}
                  >
                    <rect x={-13} y={-13} width={26} height={26} rx={7} />
                    <path d="M -5 0 H 5" />
                    <title>Collapse subgraph</title>
                  </g>
                )}
                {empty && (
                  <g
                    className="container-empty"
                    transform={`translate(${node.width / 2} ${(node.height + CONTAINER_HEADER) / 2})`}
                  >
                    <text textAnchor="middle" y={p.onAddInside ? -18 : 0}>
                      No internal services yet
                    </text>
                    {p.onAddInside && (
                      <g
                        className="container-add"
                        role="button"
                        tabIndex={0}
                        aria-label={`Add service inside ${node.key}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          p.onAddInside?.(node.base);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          p.onAddInside?.(node.base);
                        }}
                      >
                        <rect x={-84} y={-3} width={168} height={30} rx={8} />
                        <text textAnchor="middle" y={16}>
                          Add internal service
                        </text>
                      </g>
                    )}
                  </g>
                )}
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
                        p.onSelect({ type: 'node', id: node.id });
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
                          ? `${incoming} direct incoming flows`
                          : side === 'right'
                            ? `${outgoing} direct outgoing flows`
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
            .filter((edge) => edge.editable && p.selection?.type === 'edge' && p.selection.id === edge.id)
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
          : 'Hover for anchors · Double-click to expand · Right-click for actions'}
      </div>
      <div className="canvas-coordinates">
        {nodes.length} services <span> / </span>
        {edges.length} flows
      </div>
    </div>
  );
}
