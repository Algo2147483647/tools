import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type {
  LayerOptions,
  MapHandle,
  MapSelection,
  Point,
  RoadNetwork,
  SimulationState,
  VehicleStatus,
  ViewMode,
} from '../types';
import { zoneDemandWeight } from '../engine/simulation';
import './city-map.css';

export interface CityMapProps {
  network: RoadNetwork;
  state: SimulationState;
  layers: LayerOptions;
  view: ViewMode;
  visualize: boolean;
  selection: MapSelection;
  onSelect: (selection: MapSelection) => void;
  onFps?: (fps: number) => void;
}

type Camera = { x: number; y: number; zoom: number };
type CarPosition = { x: number; y: number; heading: number };
const COLORS: Record<VehicleStatus, string> = {
  Idle: '#76f5ae',
  Pickup: '#ffc874',
  Serving: '#68caff',
  Repositioning: '#b499ff',
  Offline: '#64747e',
};
const polygon = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
};

function makeBasemap(network: RoadNetwork, roads: boolean) {
  const density = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = network.width * density;
  canvas.height = network.height * density;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(density, density);
  ctx.fillStyle = '#101c23';
  ctx.fillRect(0, 0, network.width, network.height);
  const centerLight = ctx.createRadialGradient(940, 670, 30, 940, 670, 1250);
  centerLight.addColorStop(0, '#1a282f');
  centerLight.addColorStop(1, '#0f1b22');
  ctx.fillStyle = centerLight;
  ctx.fillRect(0, 0, network.width, network.height);
  // Subtle riverside quays and dark water, with an engraved shoreline.
  polygon(ctx, network.river);
  ctx.fillStyle = '#0a171d';
  ctx.fill();
  ctx.strokeStyle = '#26353b';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.save();
  polygon(ctx, network.river);
  ctx.clip();
  ctx.strokeStyle = '#163039';
  ctx.lineWidth = 0.6;
  for (let y = 0; y < network.height; y += 27) {
    ctx.beginPath();
    ctx.moveTo(1400, y);
    ctx.bezierCurveTo(1540, y + 8, 1640, y - 5, 1770, y + 4);
    ctx.stroke();
  }
  ctx.restore();
  for (const park of network.parks) {
    polygon(ctx, park.points);
    ctx.fillStyle = '#193129';
    ctx.fill();
    ctx.strokeStyle = '#2c4436';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    polygon(ctx, park.points);
    ctx.clip();
    const x0 = Math.min(...park.points.map((p) => p.x)),
      y0 = Math.min(...park.points.map((p) => p.y));
    const x1 = Math.max(...park.points.map((p) => p.x)),
      y1 = Math.max(...park.points.map((p) => p.y));
    for (let x = x0 + 13; x < x1; x += 19)
      for (let y = y0 + 14; y < y1; y += 22) {
        const jitter = Math.sin(x * 17 + y) * 5;
        ctx.beginPath();
        ctx.arc(x + jitter, y - jitter, 4 + (Math.sin(x + y) + 1) * 2, 0, Math.PI * 2);
        ctx.fillStyle = '#244232';
        ctx.fill();
      }
    ctx.beginPath();
    ctx.moveTo(x0, y1 - 25);
    ctx.bezierCurveTo(x0 + 40, y0 + 15, x1 - 45, y1 - 30, x1, y0 + 10);
    ctx.strokeStyle = '#50624a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2 + 20, (y0 + y1) / 2, 33, 22, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#102b2d';
    ctx.fill();
    ctx.restore();
  }
  for (const building of network.buildings) {
    polygon(ctx, building.points);
    ctx.fillStyle =
      building.kind === 'industrial'
        ? '#26373d'
        : building.height > 65
          ? '#304149'
          : building.height > 35
            ? '#293b42'
            : '#23333a';
    ctx.fill();
    ctx.strokeStyle = building.height > 50 ? '#3c4b4e' : '#2f3f44';
    ctx.lineWidth = 0.55;
    ctx.stroke();
    if (building.height > 60) {
      const p = building.points[0];
      ctx.fillStyle = '#52615f';
      ctx.fillRect(p.x + 3, p.y + 3, 3, 2);
    }
  }
  // Rail terminal and sidings are intentionally distinct from the road graph.
  ctx.save();
  ctx.translate(693, 788);
  ctx.rotate(-0.04);
  ctx.fillStyle = '#1c2b32';
  ctx.fillRect(-15, -35, 32, 140);
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = '#45514d';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(i * 5 - 10, -70);
    ctx.lineTo(i * 5 - 10, 110);
    ctx.stroke();
  }
  ctx.fillStyle = '#394a4b';
  ctx.fillRect(-20, -9, 44, 42);
  ctx.restore();
  if (roads) {
    const levels = ['local', 'secondary', 'arterial'] as const;
    for (const level of levels) {
      const stroke = (color: string, width: number) => {
        ctx.beginPath();
        for (const edge of network.edges)
          if (edge.level === level) {
            const a = network.nodes[edge.from],
              b = network.nodes[edge.to];
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      if (level === 'arterial') {
        stroke('#0e1d24', 11);
        stroke('#657274', 6.3);
        stroke('#36464d', 4.8);
        stroke('#7c8680', 0.5);
      } else if (level === 'secondary') {
        stroke('#132127', 6);
        stroke('#435259', 2.8);
      } else stroke('#35444c', 1.7);
    }
    // A quiet dotted center line identifies bridge decks without inventing a road.
    for (const edge of network.edges)
      if (edge.name?.includes('BRIDGE') || edge.name === 'SOUTH CROSSING') {
        const a = network.nodes[edge.from],
          b = network.nodes[edge.to];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 9;
        ctx.strokeStyle = '#647479';
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#263c46';
        ctx.stroke();
        ctx.setLineDash([7, 7]);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#b6bcb0';
        ctx.stroke();
        ctx.setLineDash([]);
      }
  }
  return canvas;
}

const CityMap = forwardRef<MapHandle, CityMapProps>(function CityMap(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 0.7 });
  const cameraTarget = useRef<Camera | null>(null);
  const size = useRef({ width: 0, height: 0, dpr: 1 });
  const positions = useRef(new Map<number, CarPosition>());
  const drag = useRef<{
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
    moved: boolean;
  } | null>(null);
  const hoverSelection = useRef<MapSelection>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    body: string;
  } | null>(null);
  const resetCamera = (animate = true) => {
    const { width, height } = size.current,
      network = latest.current.network;
    const zoom = Math.max(width / (network.width + 130), height / (network.height + 160));
    const target = {
      zoom,
      x: width * 0.515 - network.width * 0.5 * zoom,
      y: height * 0.545 - network.height * 0.5 * zoom,
    };
    if (animate) cameraTarget.current = target;
    else camera.current = target;
  };
  const zoomAt = (factor: number, x = size.current.width / 2, y = size.current.height / 2) => {
    const c = cameraTarget.current ?? camera.current;
    const zoom = Math.min(3.6, Math.max(0.3, c.zoom * factor)),
      ratio = zoom / c.zoom;
    cameraTarget.current = { zoom, x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio };
  };
  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomAt(1.3),
    zoomOut: () => zoomAt(1 / 1.3),
    reset: () => resetCamera(),
    focusZone: (id: string) => {
      const zone = latest.current.network.zones.find((z) => z.id === id);
      if (zone)
        cameraTarget.current = {
          zoom: 1.25,
          x: size.current.width * 0.52 - zone.x * 1.25,
          y: size.current.height * 0.54 - zone.y * 1.25,
        };
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let basemap = makeBasemap(latest.current.network, latest.current.layers.roads);
    let baseRoads = latest.current.layers.roads,
      baseNetwork = latest.current.network;
    let previousState = latest.current.state;
    let animation = 0,
      previous = performance.now(),
      frames = 0,
      fpsAt = previous;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      resetCamera(false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (now: number) => {
      const delta = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      const { network, state, layers, view, visualize, selection } = latest.current;
      // A reset reuses driver IDs; discard presentation state from the previous run.
      if (state !== previousState) {
        positions.current.clear();
        previousState = state;
      }
      if (baseRoads !== layers.roads || baseNetwork !== network) {
        basemap = makeBasemap(network, layers.roads);
        baseRoads = layers.roads;
        baseNetwork = network;
      }
      const { width, height, dpr } = size.current;
      if (cameraTarget.current) {
        const target = cameraTarget.current,
          c = camera.current,
          t = 1 - Math.exp(-delta * 14);
        c.x += (target.x - c.x) * t;
        c.y += (target.y - c.y) * t;
        c.zoom += (target.zoom - c.zoom) * t;
        if (
          Math.abs(c.x - target.x) + Math.abs(c.y - target.y) + Math.abs(c.zoom - target.zoom) <
          0.03
        ) {
          camera.current = target;
          cameraTarget.current = null;
        }
      }
      const c = camera.current,
        zoom = c.zoom,
        inv = 1 / zoom;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0d1920';
      ctx.fillRect(0, 0, width, height);
      ctx.translate(c.x, c.y);
      ctx.scale(zoom, zoom);
      ctx.drawImage(basemap, 0, 0, network.width, network.height);
      const hour = (state.config.startHour + state.time / 3600) % 24;
      const activeOrders = state.orders.filter(
        (o) => o.status !== 'Completed' && o.status !== 'Cancelled',
      );
      // Demand is driven by the same time-of-day model as generation, plus actual queued requests.
      if (layers.demand || layers.supply) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const zone of network.zones) {
          const zoneOrders = activeOrders.filter(
            (o) => o.pickupZone === zone.id && o.status !== 'Serving',
          ).length;
          const idle = state.vehicles.filter(
            (v) =>
              v.status === 'Idle' && Math.hypot(v.x - zone.x, v.y - zone.y) < zone.radius * 1.4,
          ).length;
          if (layers.demand) {
            const weight = zoneDemandWeight(zone, hour) * state.config.demand + zoneOrders * 0.15;
            const alpha = Math.min(view === 'demand' ? 0.48 : 0.27, 0.055 + weight * 0.04);
            const gradient = ctx.createRadialGradient(
              zone.x,
              zone.y,
              0,
              zone.x,
              zone.y,
              zone.radius * 1.18,
            );
            const rgb = weight > 3.5 ? '245,87,50' : weight > 1.5 ? '241,140,58' : '56,129,173';
            gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
            gradient.addColorStop(0.38, `rgba(${rgb},${alpha * 0.62})`);
            gradient.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius * 1.18, 0, Math.PI * 2);
            ctx.fill();
          }
          if (layers.supply) {
            const gradient = ctx.createRadialGradient(
              zone.x,
              zone.y,
              0,
              zone.x,
              zone.y,
              zone.radius * 1.15,
            );
            gradient.addColorStop(
              0,
              `rgba(61,220,173,${Math.min(view === 'supply' ? 0.5 : 0.3, idle * (view === 'supply' ? 0.03 : 0.02))})`,
            );
            gradient.addColorStop(1, 'rgba(61,220,173,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius * 1.15, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      // Selected zone perimeter uses world coordinates, retaining meaning when zooming.
      if (selection?.type === 'zone' || layers.zones)
        for (const zone of network.zones) {
          const selected = selection?.type === 'zone' && selection.id === zone.id;
          ctx.beginPath();
          ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
          ctx.strokeStyle = selected ? '#74e2bc' : '#6c999638';
          ctx.lineWidth = inv;
          ctx.setLineDash([5 * inv, 6 * inv]);
          ctx.stroke();
          ctx.setLineDash([]);
          if (selected) {
            ctx.fillStyle = '#76f5ae0a';
            ctx.fill();
          }
        }
      // District and geographic labels retain a consistent reading size at every zoom level.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const zone of network.zones) {
        ctx.font = `500 ${10.2 * inv}px Inter, Arial, sans-serif`;
        ctx.fillStyle = zone.kind === 'cbd' ? '#c4ced0' : '#829598';
        const labelY = zone.y + (zone.id === 'cbd' ? 29 : 0);
        ctx.shadowColor = '#0c171d';
        ctx.shadowBlur = 5;
        ctx.fillText(zone.name.split('').join('\u2009'), zone.x, labelY);
        ctx.shadowBlur = 0;
        if (zone.id === 'cbd') {
          ctx.font = `400 ${8 * inv}px Inter, Arial, sans-serif`;
          ctx.fillStyle = '#6f8489';
          ctx.fillText('FINANCIAL DISTRICT', zone.x, labelY + 16 * inv);
        }
      }
      for (const park of network.parks) {
        const x = park.points.reduce((s, p) => s + p.x, 0) / park.points.length,
          y = park.points.reduce((s, p) => s + p.y, 0) / park.points.length;
        ctx.font = `500 ${8.5 * inv}px Inter, Arial, sans-serif`;
        ctx.fillStyle = '#8eac91';
        ctx.fillText(park.name, x, y + 37);
      }
      ctx.save();
      ctx.translate(1610, 850);
      ctx.rotate(-Math.PI / 2);
      ctx.font = `400 ${10 * inv}px Inter, Arial, sans-serif`;
      ctx.fillStyle = '#41626e';
      ctx.fillText('E A S T   H A R B O R', 0, 0);
      ctx.restore();
      if (zoom > 0.65) {
        ctx.font = `400 ${8 * inv}px Inter, Arial, sans-serif`;
        ctx.fillStyle = '#73848b';
        ctx.save();
        ctx.translate(989, 720);
        ctx.rotate(0.025);
        ctx.fillText('HARBOR BOULEVARD', 0, -9 * inv);
        ctx.restore();
        ctx.save();
        ctx.translate(657, 480);
        ctx.rotate(-Math.PI / 2 + 0.04);
        ctx.fillText('CENTRAL AVENUE', 0, -9 * inv);
        ctx.restore();
      }
      if (layers.routes) {
        for (const vehicle of state.vehicles) {
          const highlighted =
            (selection?.type === 'vehicle' && selection.id === vehicle.id) ||
            (selection?.type === 'order' && selection.id === vehicle.orderId);
          if (
            !vehicle.route.length ||
            (vehicle.status !== 'Serving' && vehicle.status !== 'Pickup' && !highlighted)
          )
            continue;
          ctx.beginPath();
          ctx.moveTo(vehicle.x, vehicle.y);
          for (let i = vehicle.routeIndex + 1; i < vehicle.route.length; i++) {
            const node = network.nodes[vehicle.route[i]];
            if (node) ctx.lineTo(node.x, node.y);
          }
          ctx.strokeStyle = highlighted
            ? COLORS[vehicle.status]
            : vehicle.status === 'Serving'
              ? '#53b5ef48'
              : '#ffbc6240';
          ctx.lineWidth = (highlighted ? 2.4 : 1.0) * inv;
          ctx.lineCap = 'round';
          ctx.stroke();
          if (highlighted) {
            ctx.lineWidth = 6 * inv;
            ctx.globalAlpha = 0.12;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      if (layers.dispatch) {
        const vehicles = new Map(state.vehicles.map((v) => [v.id, v]));
        const orders = new Map(activeOrders.map((o) => [o.id, o]));
        for (const match of state.candidates) {
          if (!match.selected && !visualize) continue;
          if (match.expiresAt < state.time) continue;
          const vehicle = vehicles.get(match.vehicleId),
            order = orders.get(match.orderId);
          if (!vehicle || !order) continue;
          const node = network.nodes[order.pickupNode];
          ctx.beginPath();
          ctx.moveTo(vehicle.x, vehicle.y);
          ctx.lineTo(node.x, node.y);
          ctx.strokeStyle = match.selected ? '#8af0b887' : '#a9bbc12b';
          ctx.lineWidth = (match.selected ? 1.2 : 0.65) * inv;
          ctx.setLineDash(match.selected ? [5 * inv, 4 * inv] : [2 * inv, 5 * inv]);
          ctx.lineDashOffset = -now * 0.025 * inv;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (layers.orders)
        for (const order of activeOrders) {
          const selected = selection?.type === 'order' && selection.id === order.id;
          const pickup = network.nodes[order.pickupNode],
            destination = network.nodes[order.destinationNode];
          if (selected || order.status === 'Serving') {
            ctx.beginPath();
            ctx.arc(destination.x, destination.y, (selected ? 4 : 2) * inv, 0, Math.PI * 2);
            ctx.strokeStyle = selected ? '#8adaff' : '#88bed570';
            ctx.lineWidth = inv;
            ctx.stroke();
            if (selected) {
              ctx.fillStyle = '#b5e5ff';
              ctx.font = `500 ${9 * inv}px Inter, Arial, sans-serif`;
              ctx.fillText('DESTINATION', destination.x, destination.y - 13 * inv);
            }
          }
          if (order.status === 'Serving') continue;
          const pulse = (now / 1800 + order.id * 0.17) % 1;
          ctx.beginPath();
          ctx.arc(pickup.x, pickup.y, (4 + pulse * 10) * inv, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,140,94,${(1 - pulse) * 0.28})`;
          ctx.lineWidth = inv;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pickup.x, pickup.y, (selected ? 5 : 3.1) * inv, 0, Math.PI * 2);
          ctx.fillStyle = order.status === 'Waiting' ? '#ff9b75' : '#ffd08b';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ff9163';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(pickup.x, pickup.y, 1.1 * inv, 0, Math.PI * 2);
          ctx.fillStyle = '#ffead8';
          ctx.fill();
          if (selected) {
            ctx.beginPath();
            ctx.arc(pickup.x, pickup.y, 12 * inv, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff0ce';
            ctx.lineWidth = inv;
            ctx.stroke();
          }
        }
      const ids = new Set<number>();
      for (const vehicle of state.vehicles) {
        ids.add(vehicle.id);
        let pos = positions.current.get(vehicle.id);
        if (!pos || Math.hypot(pos.x - vehicle.x, pos.y - vehicle.y) > 110) {
          pos = { x: vehicle.x, y: vehicle.y, heading: vehicle.heading };
          positions.current.set(vehicle.id, pos);
        }
        // The fixed-step engine advances subpixel distances at RAF cadence. Rendering
        // its exact coordinates keeps every marker on its current road, even at turns.
        pos.x = vehicle.x;
        pos.y = vehicle.y;
        const t = 1 - Math.exp(-delta * 19);
        let difference = vehicle.heading - pos.heading;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        pos.heading += difference * t;
        if (!layers.drivers) continue;
        const sx = pos.x * zoom + c.x,
          sy = pos.y * zoom + c.y;
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
        const selected = selection?.type === 'vehicle' && selection.id === vehicle.id;
        const hovered =
          hoverSelection.current?.type === 'vehicle' && hoverSelection.current.id === vehicle.id;
        ctx.save();
        ctx.translate(pos.x, pos.y);
        if (selected || hovered) {
          ctx.beginPath();
          ctx.arc(0, 0, (selected ? 11 : 8) * inv, 0, Math.PI * 2);
          ctx.strokeStyle = selected ? '#d9fff0' : '#76f5ae88';
          ctx.lineWidth = inv;
          ctx.stroke();
        }
        ctx.rotate(pos.heading);
        ctx.fillStyle = COLORS[vehicle.status];
        ctx.shadowColor = COLORS[vehicle.status];
        ctx.shadowBlur = vehicle.status === 'Offline' ? 0 : 6;
        ctx.beginPath();
        ctx.roundRect(-3.8 * inv, -2 * inv, 7.6 * inv, 4 * inv, 1.1 * inv);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f3ffefcf';
        ctx.fillRect(1.3 * inv, -1.3 * inv, 1.2 * inv, 2.6 * inv);
        ctx.restore();
      }
      for (const id of positions.current.keys()) if (!ids.has(id)) positions.current.delete(id);
      // Gentle vignette anchors floating controls without dimming the active city center.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vignette = ctx.createRadialGradient(
        width * 0.51,
        height * 0.53,
        width * 0.19,
        width * 0.51,
        height * 0.53,
        width * 0.75,
      );
      vignette.addColorStop(0, 'rgba(5,13,20,0)');
      vignette.addColorStop(1, 'rgba(5,13,20,0.47)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      frames++;
      if (now - fpsAt >= 1200) {
        latest.current.onFps?.(Math.round((frames * 1000) / (now - fpsAt)));
        frames = 0;
        fpsAt = now;
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.001), event.offsetX, event.offsetY);
      setTooltip(null);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  const hitTest = (screenX: number, screenY: number, zones = false): MapSelection => {
    const { network, state, layers } = latest.current,
      c = camera.current;
    const x = (screenX - c.x) / c.zoom,
      y = (screenY - c.y) / c.zoom,
      limit = 10 / c.zoom;
    if (layers.orders) {
      let result: MapSelection = null,
        nearest = limit;
      for (const order of state.orders)
        if (
          order.status !== 'Completed' &&
          order.status !== 'Cancelled' &&
          order.status !== 'Serving'
        ) {
          const p = network.nodes[order.pickupNode],
            dist = Math.hypot(p.x - x, p.y - y);
          if (dist < nearest) {
            nearest = dist;
            result = { type: 'order', id: order.id };
          }
        }
      if (result) return result;
    }
    if (layers.drivers) {
      let result: MapSelection = null,
        nearest = limit;
      for (const vehicle of state.vehicles) {
        const p = positions.current.get(vehicle.id) ?? vehicle,
          dist = Math.hypot(p.x - x, p.y - y);
        if (dist < nearest) {
          nearest = dist;
          result = { type: 'vehicle', id: vehicle.id };
        }
      }
      if (result) return result;
    }
    if (zones) {
      const zone = network.zones.reduce((a, b) =>
        Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b,
      );
      if (Math.hypot(zone.x - x, zone.y - y) < zone.radius) return { type: 'zone', id: zone.id };
    }
    return null;
  };
  const hover = (x: number, y: number) => {
    const hit = hitTest(x, y);
    hoverSelection.current = hit;
    if (!hit) {
      setTooltip(null);
      return;
    }
    if (hit.type === 'vehicle') {
      const car = latest.current.state.vehicles.find((v) => v.id === hit.id)!;
      setTooltip({
        x,
        y,
        title: `DRIVER ${String(car.id).padStart(3, '0')}`,
        body: `${car.status}  ·  ${Math.round(car.speed)} km/h`,
      });
    } else if (hit.type === 'order') {
      const order = latest.current.state.orders.find((o) => o.id === hit.id)!;
      setTooltip({
        x,
        y,
        title: `ORDER #${order.id}`,
        body: `${order.status}  ·  $${order.fare.toFixed(2)}`,
      });
    }
  };
  return (
    <div className="city-map">
      <canvas
        ref={canvasRef}
        className="city-map-canvas"
        aria-label="Interactive New Harbor city map. Drag to pan, scroll to zoom, click a driver, order, or district to inspect. Use arrow keys to pan and plus or minus to zoom."
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            cameraX: camera.current.x,
            cameraY: camera.current.y,
            moved: false,
          };
          cameraTarget.current = null;
          setTooltip(null);
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            const d = drag.current,
              dx = event.clientX - d.x,
              dy = event.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            camera.current.x = d.cameraX + dx;
            camera.current.y = d.cameraY + dy;
            event.currentTarget.style.cursor = 'grabbing';
          } else {
            const rect = event.currentTarget.getBoundingClientRect();
            hover(event.clientX - rect.left, event.clientY - rect.top);
            event.currentTarget.style.cursor = hoverSelection.current ? 'pointer' : 'grab';
          }
        }}
        onPointerUp={(event) => {
          if (drag.current && !drag.current.moved) {
            const rect = event.currentTarget.getBoundingClientRect();
            latest.current.onSelect(
              hitTest(event.clientX - rect.left, event.clientY - rect.top, true),
            );
          }
          drag.current = null;
          event.currentTarget.style.cursor = 'grab';
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          setTooltip(null);
          hoverSelection.current = null;
        }}
        onDoubleClick={(event) => zoomAt(1.45, event.clientX, event.clientY)}
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') zoomAt(1.2);
          else if (event.key === '-') zoomAt(1 / 1.2);
          else if (event.key === '0' || event.key === 'Home') resetCamera();
          else if (event.key === 'ArrowLeft') camera.current.x += 50;
          else if (event.key === 'ArrowRight') camera.current.x -= 50;
          else if (event.key === 'ArrowUp') camera.current.y += 50;
          else if (event.key === 'ArrowDown') camera.current.y -= 50;
          else return;
          event.preventDefault();
        }}
      />
      {tooltip && (
        <div
          className="city-map-tooltip"
          style={{ left: Math.min(tooltip.x + 16, size.current.width - 180), top: tooltip.y - 54 }}
        >
          <strong>{tooltip.title}</strong>
          <span>{tooltip.body}</span>
          <small>Click to inspect</small>
        </div>
      )}
    </div>
  );
});

export default CityMap;
