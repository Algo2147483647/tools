import type { GraphChartType } from "../graph/types";
import { schemaField, type SchemaField } from "./fields";

type Entry = [name: string, type: string, description: string, required?: boolean];
const fields = (prefix: string, entries: Entry[]): SchemaField[] =>
  entries.map(([name, type, description, required]) =>
    schemaField(`${prefix}.${name}`, type, required ? "Required" : "Optional", description),
  );
const pair = "[number, number]";
const rect = "[number, number, number, number]";

/** Public geometry fields, independent of renderer objects and graph/Appearance content. */
export function layoutGeometryFields(chart: GraphChartType): SchemaField[] {
  const g = "layout.geometry",
    n = `${g}.nodes[]`,
    e = `${g}.edges[]`;
  return [
    ...fields("layout", [
      ["geometry", "object", "Positions and routing only. Canvas pixels before viewport pan/zoom."],
    ]),
    ...fields(g, [
      ["size", pair, "[width, height] of the canvas, in pixels.", true],
      ["nodes[]", "object[]", "Visible node geometry, linked to graph content by ID.", true],
    ]),
    ...fields(n, [
      ["id", "string", "Graph node ID, or collapsed group ID.", true],
      [
        "position",
        pair,
        chart === "timeline"
          ? "[x, y] in canvas pixels; time anchor on the time axis, center on the cross axis."
          : "[x, y] of the node center in canvas pixels.",
        true,
      ],
      ["size", pair, "[width, height] of the rendered node, in pixels.", true],
      ["text", "object", "Measured local text geometry; text content comes from the graph."],
      ["text.title", pair, "[horizontal offset from the card's left edge, title line height], in pixels."],
      [
        "text.content",
        rect,
        "[title Y, detail Y, detail line height, badge Y], relative to the card's top edge, in pixels.",
      ],
    ]),
    ...(chart === "timeline"
      ? fields(n, [
          ["timeline", "object", "Event label and time-anchor geometry.", true],
          [
            "timeline.anchors",
            "[number, number, number]",
            "[start, end, anchor] along the time axis, in pixels: canvas y vertically, canvas x horizontally.",
            true,
          ],
          ["timeline.label", pair, "[x, y] of the label in physical canvas pixels.", true],
          ["timeline.lane", "number", "Lane index within its track.", true],
          [
            "timeline.ports[]",
            pair,
            "[time, time-axis pixel coordinate] for each extra attachment. Time uses the graph's declared units.",
          ],
          [
            "timeline.labelMetrics",
            rect,
            "[top extent, bottom extent, date offset, detail offset] relative to the label anchor, in pixels.",
          ],
        ])
      : chart === "sankey"
        ? fields(n, [
            ["flow", "object", "Flow label placement; flow values and colors come from graph/Appearance."],
            ["flow.labelY", "number", "Label's absolute canvas y coordinate in pixels.", true],
            ["flow.labelSide", "left | right", "Label side relative to the node.", true],
          ])
        : chart === "spatial"
          ? fields(n, [
              ["spatial", "object", "Projected point depth and label placement."],
              ["spatial.depth", "number", "Camera-space depth for draw order.", true],
              ["spatial.showLabel", "boolean", "Label visibility after collision handling.", true],
              ["spatial.labelSide", "left | right", "Label side relative to the point.", true],
            ])
          : []),
    ...fields(g, [
      [
        "edges[]",
        "object[]",
        "Connection geometry, linked by rendered edge ID. Endpoints and text come from the graph projection.",
        true,
      ],
    ]),
    ...fields(e, [
      ["id", "string", "Rendered edge ID.", true],
      ["path", "string", "Exact SVG path, including curves or a Sankey band outline, in canvas pixels.", true],
      [
        "points[]",
        pair,
        "Ordered [x, y] waypoints in canvas pixels, including attachments. Also used to evaluate and edit routes.",
      ],
      ["label", pair, "[x, y] of the connection label anchor, in canvas pixels.", true],
    ]),
    ...(chart === "sankey"
      ? fields(e, [
          ["flow", "object", "Band geometry."],
          ["flow.width", "number", "Band width in pixels.", true],
          ["flow.feedback", "boolean", "Whether the routed connection is a feedback band."],
          ["flow.directionPath", "string", "SVG path of the direction indicator."],
        ])
      : []),
    ...(chart === "compound"
      ? fields(g, [
          ["groups[]", "object[]", "Expanded group geometry. Solver boxes are reconstructed from nodes and groups."],
          ["groups[].id", "string", "Graph group ID.", true],
          ["groups[].position", pair, "[x, y] of the group's top-left corner in canvas pixels.", true],
          ["groups[].size", pair, "[width, height] of the group rectangle in pixels.", true],
        ])
      : chart === "timeline"
        ? fields(g, [
            ["timeline", "object", "Time-to-pixel mapping and track geometry.", true],
            ["timeline.axis", pair, "[cross-axis position, time-axis origin], in canonical pixels.", true],
            [
              "timeline.range",
              "[number | null, number | null]",
              "Visible [start, end] in UTC milliseconds or the graph's relative time units.",
              true,
            ],
            ["timeline.pixelsPerUnit", "number", "Linear pixels per millisecond or declared relative unit.", true],
            ["timeline.undated", "number | null", "Undated region's time-axis position, in pixels.", true],
            ["timeline.map", "object", "Piecewise time-to-pixel mapping."],
            ["timeline.map.mode", "linear | adaptive", "Mapping mode.", true],
            ["timeline.map.range", pair, "[start, end] of the time domain.", true],
            ["timeline.map.extent", pair, "[origin, length] along the canonical time axis, in pixels.", true],
            ["timeline.map.knots[]", pair, "[time, time-axis pixel coordinate] of each mapping control point.", true],
            [
              "timeline.ticks[]",
              pair,
              "[time, time-axis pixel coordinate] for each tick. Labels are formatted on load.",
              true,
            ],
            ["timeline.tracks[]", "object[]", "Track bounds, linked by track ID.", true],
            ["timeline.tracks[].id", "string", "Graph track ID.", true],
            ["timeline.tracks[].extent", pair, "[start, width] along the canonical cross axis, in pixels.", true],
            [
              "timeline.canonical",
              "LayoutGeometry",
              "Same pure geometry structure in canonical vertical coordinates, without another canonical object; used for horizontal filtering.",
            ],
          ])
        : chart === "spatial"
          ? fields(g, [
              ["spatial", "object", "Projected guide geometry and scale."],
              ["spatial.guides[]", "object[]", "Projected guides in the camera's stable guide order.", true],
              ["spatial.guides[].path", "string", "SVG guide path in canvas pixels.", true],
              ["spatial.guides[].labelPosition", pair, "[x, y] of the guide label in canvas pixels."],
              ["spatial.bounds", rect, "[left, top, width, height] of viewport-fit bounds, in pixels."],
              ["spatial.unitScale", "number", "Coordinate spacing relative to the automatic scale.", true],
              ["spatial.pixelsPerUnit", "number", "Projection scale in pixels per coordinate unit.", true],
            ])
          : []),
    ...fields(g, [
      ["lanes[]", "object[]", "Lane geometry; labels are derived from the current graph.", true],
      ["lanes[].layer", "number", "Lane layer index.", true],
      ["lanes[].extent", pair, "[canonical cross-axis center, width] in pixels.", true],
    ]),
  ];
}

/** Resolve wildcard arrays/maps without incorrectly looking for properties on the array itself. */
export function layoutFieldValues(value: unknown, path: string): unknown[] {
  let values: unknown[] = [value];
  for (const token of path.match(/[^.[\]]+|\[[^\]]*\]/g) ?? []) {
    values = values.flatMap((entry): unknown[] => {
      if (token === "[]") return Array.isArray(entry) ? entry : [];
      if (/^\[\d+\]$/.test(token))
        return Array.isArray(entry) && Number(token.slice(1, -1)) < entry.length
          ? [entry[Number(token.slice(1, -1))]]
          : [];
      if (token.startsWith("["))
        return entry && typeof entry === "object" && !Array.isArray(entry) ? Object.values(entry) : [];
      if (!entry || typeof entry !== "object") return [];
      const child = (entry as Record<string, unknown>)[token];
      return child === undefined ? [] : [child];
    });
  }
  return values;
}

export function layoutFieldSummary(value: unknown, path: string): string {
  const tupleItem = path.endsWith("[]") && /\.(points|ports|knots|ticks)\[\]$/.test(path);
  const values = layoutFieldValues(value, path.endsWith("[]") && !tupleItem ? path.slice(0, -2) : path);
  if (!values.length) return "—";
  const summaries = [
    ...new Set(
      values.map((entry) =>
        entry === null
          ? "null"
          : Array.isArray(entry)
            ? entry.every((v) => typeof v === "number" || v === null)
              ? JSON.stringify(entry)
              : `${entry.length} items`
            : typeof entry === "object"
              ? "object"
              : entry === ""
                ? '\"\"'
                : String(entry),
      ),
    ),
  ];
  return (
    summaries
      .slice(0, 3)
      .map((text) => (text.length > 90 ? `${text.slice(0, 87)}…` : text))
      .join(" · ") + (summaries.length > 3 ? ` · +${summaries.length - 3} values` : "")
  );
}
