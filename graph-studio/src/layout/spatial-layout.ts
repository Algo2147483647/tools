import { getNodeTitle, getNodeType } from "../graph/accessors";
import { buildCategoryColorMap } from "../graph/categoryColors";
import {
  defaultSpaceView,
  getSpaceMetadata,
  rotateSpacePoint,
  spaceMapPoint,
  spaceToCartesian,
  spatialUnitScale,
  type SpaceView,
} from "../graph/space";
import type { NormalizedDag } from "../graph/types";
import type { StageData, StageNode } from "./types";
import { isRecord } from "../utils/json";

// Spatial datasets can retain source line colors without changing other chart palettes.
function spatialStyle(value: unknown) {
  const style = isRecord(value) ? value : {};
  return {
    color: typeof style.color === "string" && /^#[0-9a-f]{6}$/i.test(style.color) ? style.color : undefined,
    radius:
      typeof style.radius === "number" && Number.isFinite(style.radius)
        ? Math.min(12, Math.max(1, style.radius))
        : undefined,
    width:
      typeof style.width === "number" && Number.isFinite(style.width) ? Math.min(8, Math.max(0.5, style.width)) : 1,
    label: style.label === true,
    dashed: style.dashed === true,
    directed: style.directed === true,
  };
}

/** Orthogonal axis selection is explicit: higher coordinates are never silently summed or discarded from data. */
export function buildSpatialStage(input: {
  dag: NormalizedDag;
  colorSourceDag?: NormalizedDag;
  spaceView?: SpaceView;
}): StageData {
  const { dag } = input;
  const source = input.colorSourceDag ?? dag;
  const metadata = getSpaceMetadata(dag);
  const view = input.spaceView ?? defaultSpaceView(metadata);
  const sphere = metadata && ["spherical", "geographic"].includes(metadata.coordinateSystem);
  const map = sphere && view.projection === "map";
  const unitScale = spatialUnitScale(view.unitScale);
  const width = 1440 * unitScale,
    height = (map ? 840 : 1040) * unitScale;
  const padding = 100 * unitScale;
  const warnings: string[] = [];
  if (!metadata)
    warnings.push(
      "Add metadata.space with dimensions and coordinateSystem, and a space array to each node. Double-click a node to edit its coordinates.",
    );
  const valid = Object.values(source.nodes).filter(
    (n) => metadata && Array.isArray(n.space) && n.space.length === metadata.dimensions,
  );
  const missing = Object.values(dag.nodes).filter((n) => !metadata || !Array.isArray(n.space));
  if (metadata && missing.length)
    warnings.push(`${missing.length} nodes have no coordinates; shown in the unpositioned tray.`);
  const converted = new Map(valid.map((n) => [n.key, spaceToCartesian(n.space as number[], metadata!)]));
  let coordinateScale = 0;
  converted.forEach((v) =>
    view.axes.forEach((axis) => {
      coordinateScale = Math.max(coordinateScale, Math.abs(v[axis] ?? 0));
    }),
  );
  coordinateScale ||= 1;
  const selected = (v: number[]): [number, number, number] =>
    view.axes.map((axis) => (v[axis] ?? 0) / coordinateScale) as [number, number, number];
  const center = [0, 0, 0];
  let extent = 1;
  if (sphere) {
    extent = 0;
    converted.forEach((v) => {
      extent = Math.max(extent, Math.hypot(...selected(v)));
    });
    extent ||= 1;
  } else if (valid.length) {
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    converted.forEach((v) =>
      selected(v).forEach((x, i) => {
        min[i] = Math.min(min[i], x);
        max[i] = Math.max(max[i], x);
      }),
    );
    center.forEach((_, i) => {
      center[i] = min[i] / 2 + max[i] / 2;
    });
    extent = 0;
    converted.forEach((v) => {
      extent = Math.max(extent, Math.hypot(...selected(v).map((x, i) => x - center[i])));
    });
    extent ||= 1;
  }
  // A fixed sphere bound prevents the canvas breathing while orbiting or filtering.
  const scale = (Math.min(width, height) / 2 - padding) / extent;
  function screen(normalized: number[]): [number, number, number] {
    const [x, y, z] = rotateSpacePoint(normalized, view.yaw, view.pitch);
    const perspective = view.projection === "perspective" ? 3 / (3 - z) : 1;
    return [width / 2 + x * extent * scale * perspective, height / 2 - y * extent * scale * perspective, z];
  }
  function project(v: number[]): [number, number, number] {
    return screen(selected(v).map((x, i) => (x - center[i]) / extent));
  }
  const mapScale = (width - padding * 2) / 360;
  const mapProject = ([lon, lat]: readonly number[]): [number, number, number] => [
    width / 2 + lon * mapScale,
    height / 2 - lat * mapScale,
    0,
  ];
  const colors = buildCategoryColorMap(Object.values(source.nodes).map(getNodeType));
  let tray = 0;
  const visibleCount = Object.keys(dag.nodes).length;
  const nodes = Object.values(dag.nodes).flatMap((node, order): StageNode[] => {
    const coordinates = Array.isArray(node.space) ? (node.space as number[]) : [];
    const v = converted.get(node.key);
    let point = v
      ? map
        ? mapProject(spaceMapPoint(coordinates, metadata!))
        : project(v)
      : [80 + (tray % 12) * 110, height + 40 + Math.floor(tray++ / 12) * 60, 0];
    // A 0D space has one location. A clearly labelled tray keeps coincident points individually operable.
    if (metadata?.dimensions === 0) point = [160 + (order % 10) * 120, 220 + Math.floor(order / 10) * 64, 0];
    if (view.hideBackPoints && sphere && !map && v) {
      // The orthographic camera is on +Z. Perspective uses an eye at (0, 0, 3):
      // a radial surface normal faces it when dot(point, eye - point) >= 0.
      const radiusSquared = selected(v).reduce((sum, x, i) => sum + ((x - center[i]) / extent) ** 2, 0);
      const horizon = view.projection === "perspective" ? radiusSquared / 3 : 0;
      if (point[2] < horizon - 1e-10) return [];
    }
    const typeLabel = getNodeType(node).trim();
    const style = spatialStyle(node.spatialStyle);
    const color = style.color ?? colors.get(typeLabel)?.pinCore ?? "#557fa6";
    const magnitude = typeof node.magnitude === "number" ? node.magnitude : undefined;
    const radius =
      style.radius ??
      (magnitude === undefined ? (valid.length > 1000 ? 2.2 : 4.5) : Math.max(1, 4.8 - magnitude * 0.65));
    return [
      {
        key: node.key,
        title: getNodeTitle(node) || node.key,
        displayTitle: getNodeTitle(node) || node.key,
        detail: typeof node.define === "string" ? node.define : "",
        detailLines: [],
        typeLabel,
        colorTokens: colors.get(typeLabel),
        layer: 0,
        order,
        width: 18,
        height: 18,
        isRoot: false,
        x: point[0],
        y: point[1],
        spatial: {
          coordinates,
          depth: point[2],
          radius,
          color,
          labelSide: point[0] > width / 2 + 160 * unitScale ? "left" : "right",
          showLabel: view.labels && (style.label || visibleCount < 350 || (magnitude !== undefined && magnitude < 2)),
        },
      },
    ];
  });
  // Declutter labels only; points always retain their exact projected coordinates.
  const labelBoxes: { x: number; y: number; width: number }[] = [];
  const candidates = nodes
    .filter((node) => node.spatial!.showLabel)
    .sort((a, b) => {
      const mag = (key: string) =>
        typeof dag.nodes[key].magnitude === "number" ? (dag.nodes[key].magnitude as number) : 6;
      return mag(a.key) - mag(b.key) || b.spatial!.depth - a.spatial!.depth || a.key.localeCompare(b.key);
    });
  for (const node of candidates) {
    const labelWidth = Array.from(node.title).reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? 12 : 8), 12);
    const box = {
      x:
        node.x +
        (node.spatial!.labelSide === "left" ? -node.spatial!.radius - 6 - labelWidth : node.spatial!.radius + 6),
      y: node.y,
      width: labelWidth,
    };
    if (labelBoxes.some((b) => Math.abs(b.y - box.y) < 18 && box.x < b.x + b.width && b.x < box.x + box.width))
      node.spatial!.showLabel = false;
    else labelBoxes.push(box);
  }
  nodes.sort((a, b) => a.spatial!.depth - b.spatial!.depth);
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.key, n]));
  const connected = new Map<string, Set<string>>(nodes.map((n) => [n.key, new Set<string>()]));
  const coloredPairs = new Set<string>();
  const edges = dag.edges.flatMap((edge) => {
    const a = nodeMap[edge.source],
      b = nodeMap[edge.target];
    if (!a || !b) return [];
    const style = spatialStyle(edge.metadata?.spatialStyle);
    const pair = JSON.stringify([edge.source, edge.target].sort());
    const overlapsColoredEdge = Boolean(style.color && coloredPairs.has(pair));
    if (style.color) coloredPairs.add(pair);
    connected.get(a.key)!.add(b.key);
    connected.get(b.key)!.add(a.key);
    let path = `M${a.x},${a.y}L${b.x},${b.y}`;
    let labelPosition = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (map && Math.abs(a.x - b.x) > 180 * mapScale) {
      const left = a.x < b.x ? a : b,
        right = a.x < b.x ? b : a;
      const span = 360 * mapScale;
      const t = (padding - (right.x - span)) / (left.x - (right.x - span));
      const seamY = right.y + t * (left.y - right.y);
      path = `M${left.x},${left.y}L${padding},${seamY}M${width - padding},${seamY}L${right.x},${right.y}`;
      labelPosition = { x: (left.x + padding) / 2, y: (left.y + seamY) / 2 };
    }
    return [
      {
        id: edge.id,
        source: a.key,
        target: b.key,
        weight: edge.value,
        label: edge.value === undefined ? "" : String(edge.value),
        path,
        labelPosition,
        ...(style.color
          ? {
              spatial: {
                color: style.color,
                width: style.width,
                dashed: style.dashed || overlapsColoredEdge,
                directed: style.directed,
              },
            }
          : {}),
      },
    ];
  });
  const guides: NonNullable<StageData["spatial"]>["guides"] = [];
  const pathFor = (points: number[][]) => points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  if (view.grid && sphere) {
    for (let lon = -180; lon <= 180; lon += 30) {
      const points = Array.from({ length: 73 }, (_, i) => -90 + i * 2.5).map((lat) =>
        map
          ? mapProject([lon, lat])
          : project([
              coordinateScale * extent * Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180),
              coordinateScale * extent * Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180),
              coordinateScale * extent * Math.sin((lat * Math.PI) / 180),
            ]),
      );
      guides.push({
        path: pathFor(points),
        ...(map ? { label: `${lon}°`, x: points[0][0], y: points[0][1] + 25 } : {}),
      });
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const points = Array.from({ length: 145 }, (_, i) => -180 + i * 2.5).map((lon) =>
        map
          ? mapProject([lon, lat])
          : project([
              coordinateScale * extent * Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180),
              coordinateScale * extent * Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180),
              coordinateScale * extent * Math.sin((lat * Math.PI) / 180),
            ]),
      );
      guides.push({ path: pathFor(points), ...(map ? { label: `${lat}°`, x: padding - 35, y: points[0][1] } : {}) });
    }
  } else if (view.grid && metadata?.coordinateSystem === "polar" && metadata.dimensions === 2) {
    const maxRadius = Math.max(...valid.map((node) => (node.space as number[])[0]), 1);
    for (let ring = 1; ring <= 4; ring++) {
      const r = (maxRadius * ring) / 4;
      const points = Array.from({ length: 73 }, (_, i) => {
        const a = (i * Math.PI) / 36;
        return project([r * Math.cos(a), r * Math.sin(a)]);
      });
      guides.push({
        path: pathFor(points),
        label: Number(r.toPrecision(3)).toString(),
        x: points[0][0],
        y: points[0][1] + 16,
      });
    }
    for (let angle = 0; angle < 360; angle += 30) {
      const a = (angle * Math.PI) / 180,
        end = project([maxRadius * Math.cos(a), maxRadius * Math.sin(a)]);
      guides.push({ path: pathFor([project([0, 0]), end]), label: `${angle}°`, x: end[0] + 12, y: end[1] - 10 });
    }
  } else if (view.grid && metadata && metadata.dimensions > 0) {
    const dimension = metadata.dimensions;
    const count = Math.min(3, dimension);
    const ticks = 5;
    for (let axis = 0; axis < count; axis++) {
      const line = [-1, 1].map((t) => {
        const v = [0, 0, 0];
        v[axis] = t;
        return screen(v);
      });
      guides.push({
        path: pathFor(line),
        label:
          metadata.coordinateSystem === "cartesian"
            ? (metadata.axes?.[view.axes[axis]] ?? `x${view.axes[axis] + 1}`)
            : ["X", "Y", "Z"][axis],
        x: line[1][0] + 12,
        y: line[1][1],
      });
      if (axis < 2)
        for (let i = -ticks; i <= ticks; i++) {
          const v = [0, 0, 0];
          v[axis] = i / ticks;
          const [px, py] = screen(v);
          guides.push({
            path: `M${px - 3},${py - 3}L${px + 3},${py + 3}`,
            label: Number(((center[axis] + (i / ticks) * extent) * coordinateScale).toPrecision(3)).toString(),
            x: px + 6,
            y: py + 17,
          });
        }
    }
  }
  if (metadata?.dimensions === 0)
    warnings.push(
      "0D: every coordinate is []. Nodes are separated in an index tray for selection; tray spacing has no spatial meaning.",
    );
  const label = dag.title ?? "Spatial graph";
  // Flat maps fit their actual points and labels. The fixed orbit sphere is only
  // needed for 3D views; fitting its empty margins makes regional maps too small.
  let fitBounds: NonNullable<StageData["spatial"]>["fitBounds"];
  if (!sphere && metadata && metadata.dimensions > 0 && metadata.dimensions <= 2 && nodes.length) {
    let left = Infinity,
      right = -Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const node of nodes) {
      const radius = node.spatial!.radius + 8;
      left = Math.min(left, node.x - radius);
      right = Math.max(right, node.x + radius);
      top = Math.min(top, node.y - radius);
      bottom = Math.max(bottom, node.y + radius);
    }
    for (const box of labelBoxes) {
      left = Math.min(left, box.x);
      right = Math.max(right, box.x + box.width);
      top = Math.min(top, box.y - 12);
      bottom = Math.max(bottom, box.y + 12);
    }
    fitBounds = { x: left - 24, y: top - 24, width: right - left + 48, height: bottom - top + 48 };
  }
  return {
    dag: dag.nodes,
    layoutMode: "spatial",
    root: "",
    selection: {
      rootKey: "",
      topLevelKeys: Object.keys(dag.nodes),
      isForest: true,
      label,
      appSelection: { type: "full" },
    },
    topLevelKeys: Object.keys(dag.nodes),
    isForest: true,
    nodeMap,
    nodes,
    edges,
    connectedKeysByNode: connected,
    lanes: [],
    stageWidth: width,
    stageHeight: Math.max(
      height + (tray ? 100 + Math.ceil(tray / 12) * 60 : 0),
      metadata?.dimensions === 0 ? 300 + Math.ceil(nodes.length / 10) * 64 : 0,
    ),
    warnings,
    spatial: {
      metadata,
      view,
      guides,
      unitScale,
      pixelsPerUnit: map ? mapScale : scale / coordinateScale,
      displayUnit: map
        ? "degree"
        : metadata?.coordinateSystem === "geographic"
          ? "radius unit"
          : metadata?.unit || "unit",
      ...(fitBounds ? { fitBounds } : {}),
    },
  };
}
