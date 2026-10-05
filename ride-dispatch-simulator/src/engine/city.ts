import type { Building, DemandZone, Point, RoadNetwork, RoadNode } from '../types';

/** A deterministic, connected synthetic city. One world unit represents eight metres. */
export function createCity(): RoadNetwork {
  let seed = 72891;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const width = 2000,
    height = 1400;
  const zones: DemandZone[] = [
    {
      id: 'cbd',
      name: 'DOWNTOWN',
      kind: 'cbd',
      x: 938,
      y: 600,
      radius: 190,
      weight: 2.3,
      color: '#ff9a51',
    },
    {
      id: 'midtown',
      name: 'MIDTOWN',
      kind: 'commercial',
      x: 840,
      y: 335,
      radius: 155,
      weight: 1.55,
      color: '#ffaf61',
    },
    {
      id: 'northside',
      name: 'NORTHSIDE',
      kind: 'residential',
      x: 452,
      y: 195,
      radius: 165,
      weight: 1.1,
      color: '#81aeb2',
    },
    {
      id: 'westend',
      name: 'WEST END',
      kind: 'residential',
      x: 290,
      y: 760,
      radius: 180,
      weight: 1.05,
      color: '#79aeb0',
    },
    {
      id: 'station',
      name: 'CENTRAL STATION',
      kind: 'station',
      x: 720,
      y: 790,
      radius: 132,
      weight: 1.75,
      color: '#ffc772',
    },
    {
      id: 'harbor',
      name: 'HARBOR POINT',
      kind: 'commercial',
      x: 1290,
      y: 840,
      radius: 150,
      weight: 1.35,
      color: '#df9d77',
    },
    {
      id: 'arts',
      name: 'ARTS DISTRICT',
      kind: 'nightlife',
      x: 1120,
      y: 1130,
      radius: 145,
      weight: 1.2,
      color: '#b797d0',
    },
    {
      id: 'southbank',
      name: 'SOUTHBANK',
      kind: 'residential',
      x: 650,
      y: 1140,
      radius: 180,
      weight: 1.2,
      color: '#78abae',
    },
    {
      id: 'airport',
      name: 'INTERNATIONAL AIRPORT',
      kind: 'airport',
      x: 1840,
      y: 570,
      radius: 220,
      weight: 1.7,
      color: '#e5b77b',
    },
    {
      id: 'heights',
      name: 'PARKSIDE HEIGHTS',
      kind: 'suburb',
      x: 210,
      y: 1180,
      radius: 190,
      weight: 0.6,
      color: '#7d9e95',
    },
  ];
  const closestZone = (p: Point) =>
    zones.reduce((a, b) =>
      Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y) ? a : b,
    ).id;
  const nodes: RoadNode[] = [],
    edges: RoadNetwork['edges'] = [],
    grid: (number | null)[][] = [];
  const parks: RoadNetwork['parks'] = [];
  const buildings: Building[] = [];
  const edgeKeys = new Set<string>();
  const addNode = (x: number, y: number) => {
    const id = nodes.length;
    nodes.push({ id, x, y, zoneId: closestZone({ x, y }) });
    return id;
  };
  const connect = (
    from: number | null | undefined,
    to: number | null | undefined,
    level: 'arterial' | 'secondary' | 'local' = 'local',
    name?: string,
  ) => {
    if (from == null || to == null || from === to) return;
    const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    // Edges store geometric world units; Router converts to kilometres (0.008 km/unit).
    edges.push({
      id: edges.length,
      from,
      to,
      length: Math.hypot(nodes[from].x - nodes[to].x, nodes[from].y - nodes[to].y),
      level,
      name,
    });
  };
  const point = (c: number, r: number): Point => ({
    x: 58 + c * 74 + (r - 7) * 5.2 + Math.sin(r * 0.57) * 17 + Math.sin(c * 0.8) * 4,
    y: 26 + r * 85 + Math.sin(c * 0.43) * 17 + c * 0.8 + Math.sin(r * 0.8) * 7,
  });
  const insidePark = (c: number, r: number) =>
    (c >= 4 && c <= 5 && r >= 5 && r <= 6) || (c >= 13 && c <= 14 && r >= 2 && r <= 3);
  for (let r = 0; r < 16; r++) {
    grid[r] = [];
    for (let c = 0; c < 19; c++) {
      const p = point(c, r);
      grid[r][c] = insidePark(c, r) ? null : addNode(p.x, p.y);
    }
  }
  const arterialRows = new Set([3, 8, 12]),
    arterialCols = new Set([3, 8, 13, 17]);
  for (let r = 0; r < 16; r++)
    for (let c = 0; c < 19; c++) {
      const id = grid[r][c];
      if (c < 18)
        connect(
          id,
          grid[r][c + 1],
          arterialRows.has(r) ? 'arterial' : r % 2 === 0 ? 'secondary' : 'local',
          r === 8
            ? 'HARBOR BOULEVARD'
            : r === 3
              ? 'NORTH AVENUE'
              : r === 12
                ? 'SOUTH PARKWAY'
                : undefined,
        );
      // Larger, irregular residential blocks at the city edges.
      if (
        r < 15 &&
        !(c < 3 && r % 3 === 1 && c % 2 === 0) &&
        !(c > 15 && r % 4 === 0 && c % 2 === 0)
      )
        connect(
          id,
          grid[r + 1][c],
          arterialCols.has(c) ? 'arterial' : c % 3 === 0 ? 'secondary' : 'local',
          c === 8 ? 'CENTRAL AVENUE' : undefined,
        );
    }
  // Diagonal avenues cut across the older street fabric and meet at real nodes.
  for (let i = 0; i < 11; i++)
    connect(grid[i + 2][i + 5], grid[i + 3][i + 6], 'arterial', 'GRAND AVENUE');
  for (let i = 0; i < 8; i++)
    connect(grid[i + 6][15 - i], grid[i + 7][14 - i], 'secondary', 'UNION STREET');
  const parkPolygon = (c1: number, r1: number, c2: number, r2: number) => {
    const a = point(c1, r1),
      b = point(c2, r1),
      c = point(c2, r2),
      d = point(c1, r2);
    return [
      { x: a.x + 14, y: a.y + 14 },
      { x: b.x - 14, y: b.y + 14 },
      { x: c.x - 14, y: c.y - 14 },
      { x: d.x + 14, y: d.y - 14 },
    ];
  };
  parks.push(
    { name: 'CRESCENT PARK', points: parkPolygon(3, 4, 6, 7) },
    { name: 'BOTANICAL GARDENS', points: parkPolygon(12, 1, 15, 4) },
  );
  const riverLeft = (y: number) => 1485 + Math.sin((y + 60) / 280) * 54 + Math.sin(y / 540) * 22;
  const river: Point[] = [];
  for (let y = -100; y <= 1500; y += 40) river.push({ x: riverLeft(y), y });
  for (let y = 1500; y >= -100; y -= 40)
    river.push({ x: riverLeft(y) + 165 + 17 * Math.cos(y / 170), y });
  // Airport / east-bank district, connected by two bridges.
  const airport: number[][] = [];
  for (let r = 0; r < 7; r++) {
    airport[r] = [];
    for (let c = 0; c < 4; c++)
      airport[r].push(addNode(1755 + c * 68 + Math.sin(r * 0.5) * 12, 285 + r * 112));
  }
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 4; c++) {
      if (c < 3)
        connect(airport[r][c], airport[r][c + 1], r === 2 || r === 6 ? 'arterial' : 'secondary');
      if (r < 6) connect(airport[r][c], airport[r + 1][c], c === 0 ? 'arterial' : 'local');
    }
  const bridge = (cityRow: number, airportRow: number, name: string) => {
    const a = nodes[grid[cityRow][18]!],
      b = nodes[airport[airportRow][0]];
    const n1 = addNode(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3);
    const n2 = addNode(a.x + (b.x - a.x) * 0.7, a.y + (b.y - a.y) * 0.7);
    connect(a.id, n1, 'arterial', name);
    connect(n1, n2, 'arterial', name);
    connect(n2, b.id, 'arterial', name);
  };
  bridge(6, 2, 'EAST HARBOR BRIDGE');
  bridge(12, 6, 'SOUTH CROSSING');
  // Footprints are generated within actual road blocks, avoiding every diagonal avenue.
  const distToEdge = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 18; c++) {
      if ((c >= 3 && c < 6 && r >= 4 && r < 7) || (c >= 12 && c < 15 && r >= 1 && r < 4)) continue;
      const a = point(c, r),
        b = point(c + 1, r),
        d = point(c, r + 1);
      const localEdges = edges.filter(
        (e) => Math.abs(nodes[e.from].x - a.x) < 160 && Math.abs(nodes[e.from].y - a.y) < 180,
      );
      const downtown = c > 7 && c < 16 && r > 3 && r < 11;
      const cols = downtown ? 3 : 3,
        rows = downtown ? 3 : 4;
      for (let iy = 0; iy < rows; iy++)
        for (let ix = 0; ix < cols; ix++) {
          if (!downtown && random() < 0.18) continue;
          const u = (ix + 0.5) / cols,
            v = (iy + 0.5) / rows;
          const center = {
            x: a.x + (b.x - a.x) * u + (d.x - a.x) * v,
            y: a.y + (b.y - a.y) * u + (d.y - a.y) * v,
          };
          if (
            localEdges.some(
              (e) =>
                distToEdge(center, nodes[e.from], nodes[e.to]) < (e.level === 'arterial' ? 16 : 11),
            )
          )
            continue;
          const w = (downtown ? 13 : 9) + random() * 6,
            h = 9 + random() * (downtown ? 12 : 5);
          const shear = (d.x - a.x) / (d.y - a.y);
          buildings.push({
            points: [
              { x: center.x - w / 2 - (h / 2) * shear, y: center.y - h / 2 },
              { x: center.x + w / 2 - (h / 2) * shear, y: center.y - h / 2 + 0.5 },
              { x: center.x + w / 2 + (h / 2) * shear, y: center.y + h / 2 },
              { x: center.x - w / 2 + (h / 2) * shear, y: center.y + h / 2 - 0.5 },
            ],
            height: downtown ? 12 + random() * 80 : 4 + random() * 17,
            kind: downtown ? 'commercial' : 'residential',
          });
        }
    }
  // Terminal and warehouses, all clear of airport roads.
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 3; c++) {
      const a = nodes[airport[r][c]],
        b = nodes[airport[r + 1][c + 1]];
      buildings.push({
        points: [
          { x: a.x + 16, y: a.y + 18 },
          { x: b.x - 15, y: a.y + 18 },
          { x: b.x - 15, y: b.y - 18 },
          { x: a.x + 16, y: b.y - 18 },
        ],
        height: 12,
        kind: 'industrial',
      });
    }
  return { width, height, nodes, edges, zones, buildings, parks, river };
}
