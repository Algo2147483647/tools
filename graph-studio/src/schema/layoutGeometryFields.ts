import type { GraphChartType } from "../graph/types";
import { schemaField, type SchemaField } from "./fields";

type Entry = [name: string, type: string, description: string, required?: boolean];
const fields = (prefix: string, entries: Entry[]): SchemaField[] =>
  entries.map(([name, type, description, required]) =>
    schemaField(`${prefix}.${name}`, type, required ? "Required" : "Optional", description),
  );
const xy = (prefix: string, description = "Absolute canvas coordinate in pixels.") =>
  fields(prefix, [
    ["x", "number", `Horizontal coordinate. ${description}`, true],
    ["y", "number", `Vertical coordinate. ${description}`, true],
  ]);
const size = (prefix: string) =>
  fields(prefix, [
    ["width", "number", "Width in pixels.", true],
    ["height", "number", "Height in pixels.", true],
  ]);

/** Explicit protocol fields: optional properties remain discoverable even when absent in the current graph. */
export function layoutGeometryFields(chart: GraphChartType): SchemaField[] {
  const g = "layout.geometry",
    n = `${g}.nodes[]`,
    e = `${g}.edges[]`;
  return [
    ...fields("layout", [
      ["geometry", "object", "Complete rendering; coordinates use canvas pixels, before viewport pan/zoom."],
    ]),
    ...fields(g, [["nodes[]", "object[]", "Visible nodes; key references a graph node or a collapsed group.", true]]),
    ...fields(n, [
      ["key", "string", "Unique graph node ID (collapsed group ID for a summary card).", true],
      [
        "x",
        "number",
        chart === "timeline"
          ? "Canvas x: cross-axis center for vertical time; time anchor for horizontal time."
          : "Horizontal center in canvas pixels.",
        true,
      ],
      [
        "y",
        "number",
        chart === "timeline"
          ? "Canvas y: time anchor for vertical time; cross-axis center for horizontal time."
          : "Vertical center in canvas pixels.",
        true,
      ],
    ]),
    ...size(n),
    ...fields(n, [
      ["layer", "number", "Layout layer index.", true],
      ["order", "number", "Order within the layer.", true],
      ["title", "string", "Resolved full title.", true],
      ["displayTitle", "string", "Title displayed after layout measurement.", true],
      ["detail", "string", "Resolved description.", true],
      ["detailLines", "string[]", "Measured description lines.", true],
      ["typeLabel", "string", "Displayed type badge text."],
      ["isRoot", "boolean", "Whether this node is a root of the visible selection.", true],
      ["titleLayout", "object", "Measured title layout within the card."],
      ["titleLayout.lines", "string[]", "Wrapped title lines.", true],
      ["titleLayout.x", "number", "Horizontal offset from the card's left edge, in pixels.", true],
      ["titleLayout.anchor", "start | middle", "SVG text anchor.", true],
      ["titleLayout.lineHeight", "number", "Distance between title baselines in pixels.", true],
      ["contentLayout", "object", "Text offsets measured in the card's local coordinate system."],
      ["contentLayout.titleY", "number", "Title position from the top edge, in pixels.", true],
      ["contentLayout.detailY", "number", "First detail line position from the top edge, in pixels.", true],
      ["contentLayout.detailLineHeight", "number", "Distance between detail lines, in pixels.", true],
      ["contentLayout.badgeY", "number", "Badge position from the top edge, in pixels.", true],
      ["colorTokens", "object", "Resolved renderer colors for this node."],
    ]),
    ...fields(`${n}.colorTokens`, [
      ["glow", "string", "Glow color.", true],
      ["border", "string", "Border color.", true],
      ["borderStrong", "string", "Emphasized border color.", true],
      ["activeBorder", "string", "Active border color.", true],
      ["pinFill", "string", "Pin fill color.", true],
      ["pinStroke", "string", "Pin stroke color.", true],
      ["pinCore", "string", "Pin center color.", true],
      ["affordanceBg", "string", "Action background color.", true],
      ["affordanceText", "string", "Action text color.", true],
    ]),
    ...(chart === "compound"
      ? fields(n, [
          ["kind", "node | group", "Ordinary node or collapsed group summary."],
          ["groupStatsOnly", "boolean", "Render only group statistics in the summary."],
          ["external", "boolean", "Node shown outside the focused group."],
        ])
      : chart === "timeline"
        ? timelineNodeFields(n)
        : chart === "sankey"
          ? fields(n, [
              ["flow", "object", "Flow totals and label placement."],
              ["flow.value", "number", "Flow value represented by the node.", true],
              ["flow.incoming", "number", "Total incoming flow.", true],
              ["flow.outgoing", "number", "Total outgoing flow.", true],
              ["flow.color", "string", "Resolved flow color.", true],
              ["flow.labelSide", "left | right", "Label side relative to the node.", true],
              ["flow.labelY", "number", "Absolute label y coordinate in pixels.", true],
            ])
          : chart === "spatial"
            ? fields(n, [
                ["spatial", "object", "Projected spatial point and label properties."],
                ["spatial.coordinates", "number[]", "Source coordinates in the declared spatial system.", true],
                ["spatial.depth", "number", "Camera-space depth used for visibility and draw order.", true],
                ["spatial.radius", "number", "Marker radius in pixels.", true],
                ["spatial.color", "string", "Resolved marker color.", true],
                ["spatial.opacity", "number", "Marker opacity from 0 to 1."],
                ["spatial.hollow", "boolean", "Render an unfilled marker."],
                ["spatial.labelPriority", "number", "Label priority for collision handling."],
                ["spatial.showLabel", "boolean", "Whether the label is visible.", true],
                ["spatial.labelSide", "left | right", "Label side relative to the projected point.", true],
              ])
            : []),
    ...fields(g, [["edges[]", "object[]", "Visible relationships and their complete rendered paths.", true]]),
    ...fields(e, [
      ["id", "string", "Unique rendered connection ID.", true],
      ["source", "string", "Source node key.", true],
      ["target", "string", "Target node key.", true],
      ["originalEdgeIds", "string[]", "Original graph edge IDs for an aggregated connection."],
      ["weight", "string | number | boolean | null", "Original relationship value, when supplied."],
      ["description", "string", "Relationship description."],
      ["label", "string", "Rendered connection label.", true],
      [
        "path",
        "string",
        chart === "sankey"
          ? "Complete SVG flow-band path in canvas pixels."
          : "Complete SVG path in canvas pixels, including any curves.",
        true,
      ],
      ["points[]", "object[]", "Ordered route waypoints, including the start and end attachments."],
    ]),
    ...xy(`${e}.points[]`),
    ...fields(`${e}.points[]`, [
      ["layer", "number", "Waypoint layout layer.", true],
      ["order", "number", "Waypoint order within its layer.", true],
    ]),
    ...fields(e, [["labelPosition", "object", "Connection label anchor in canvas pixels.", true]]),
    ...xy(`${e}.labelPosition`),
    ...(chart === "timeline"
      ? fields(e, [
          ["timeline", "object", "Temporal connection anchors and rendering."],
          ["timeline.sourceTime", "number", "Source attachment time in the timeline's declared time units."],
          ["timeline.targetTime", "number", "Target attachment time in the timeline's declared time units."],
          [
            "timeline.kind",
            "sequence | dependency | reference | rendezvous | part-of",
            "Temporal relationship kind.",
            true,
          ],
          ["timeline.backward", "boolean", "Whether the connection points backward in time.", true],
          ["timeline.sourceAnchor", "start | end", "Source event endpoint.", true],
          ["timeline.targetAnchor", "start | end", "Target event endpoint.", true],
          ["timeline.color", "string", "Resolved connection color.", true],
        ])
      : chart === "sankey"
        ? fields(e, [
            ["flow", "object", "Flow-band rendering."],
            ["flow.width", "number", "Band width in pixels.", true],
            ["flow.color", "string", "Band color.", true],
            ["flow.feedback", "boolean", "Whether this is a feedback connection."],
            ["flow.directionPath", "string", "SVG path for its direction indicator."],
          ])
        : chart === "spatial"
          ? fields(e, [
              ["spatial", "object", "Projected edge rendering."],
              ["spatial.color", "string", "Resolved stroke color.", true],
              ["spatial.width", "number", "Stroke width in pixels.", true],
              ["spatial.dashed", "boolean", "Use a dashed stroke.", true],
              ["spatial.directed", "boolean", "Show the direction marker.", true],
            ])
          : []),
    ...(chart === "compound"
      ? compoundGeometryFields(g)
      : chart === "timeline"
        ? timelineGeometryFields(g)
        : chart === "spatial"
          ? spatialGeometryFields(g)
          : []),
    ...fields(g, [["lanes[]", "object[]", "Layout lanes.", true]]),
    ...fields(`${g}.lanes[]`, [
      ["layer", "number", "Lane layer index.", true],
      ["label", "string", "Lane label.", true],
      ["x", "number", "Lane start along the cross axis in pixels.", true],
      ["width", "number", "Lane extent along the cross axis in pixels.", true],
    ]),
    ...fields(g, [
      ["stageWidth", "number", "Canvas width in pixels.", true],
      ["stageHeight", "number", "Canvas height in pixels.", true],
      ["layoutMode", "string", "Renderer mode for the selected chart.", true],
      ["root", "string", "Visible root key; may be a synthetic selection root.", true],
      ["topLevelKeys", "string[]", "Top-level visible node keys.", true],
      ["isForest", "boolean", "Selection has multiple roots.", true],
      ["warnings", "string[]", "Layout diagnostics.", true],
      ["selection", "object", "Resolved graph selection.", true],
      ["selection.rootKey", "string", "Resolved root ID.", true],
      ["selection.topLevelKeys", "string[]", "Resolved top-level IDs.", true],
      ["selection.isForest", "boolean", "Whether the selection contains multiple roots.", true],
      ["selection.label", "string", "Selection display label.", true],
      ["selection.appSelection", "object", "Original selection request.", true],
      ["selection.appSelection.type", "full | node | forest", "Selection variant.", true],
      ["selection.appSelection.key", "string", "Selected node for type=node."],
      ["selection.appSelection.keys", "string[]", "Selected roots for type=forest."],
      ["selection.appSelection.label", "string", "Display label for type=forest."],
    ]),
  ];
}

function timelineNodeFields(n: string): SchemaField[] {
  return [
    ...fields(n, [
      [
        "timeline",
        "object",
        "Event geometry. Time-axis coordinates remain canonical; label coordinates are physical canvas pixels.",
      ],
    ]),
    ...fields(`${n}.timeline`, [
      ["orientation", "vertical | horizontal", "Time-axis direction."],
      ["status", "dated | missing | invalid", "Date parsing status.", true],
      ["kind", "instant | range | undated", "Event geometry kind.", true],
      ["start", "number | null", "Original start time: UTC milliseconds or declared relative units.", true],
      ["end", "number | null", "Original end time in the same units.", true],
      ["clippedStart", "boolean", "Start clipped by the visible time range."],
      ["clippedEnd", "boolean", "End clipped by the visible time range."],
      ["ongoing", "boolean", "Event has an open end.", true],
      ["precision", "year | month | date | datetime | relative | null", "Original date precision.", true],
      ["track", "string", "Track ID.", true],
      ["lane", "number", "Lane index within the track.", true],
      ["space", "number", "One-based explicit row/column index perpendicular to time."],
      ["minimumCross", "number", "Measured minimum cross-axis extent in pixels."],
      ["startY", "number", "Rendered start on the time axis: canvas y vertically, canvas x horizontally.", true],
      ["endY", "number", "Rendered end on the time axis, in pixels.", true],
      ["anchorY", "number", "Event anchor on the time axis, in pixels.", true],
      ["labelX", "number", "Absolute physical label x coordinate in pixels.", true],
      ["labelY", "number", "Absolute physical label y coordinate in pixels.", true],
      ["label", "string", "Resolved event label.", true],
      ["color", "string", "Resolved event color.", true],
      ["displayDate", "string", "Formatted date label."],
      ["warning", "string", "Event-specific diagnostic."],
      ["labelMetrics", "object", "Measured event label offsets in pixels."],
      ["labelMetrics.top", "number", "Label extent above its anchor.", true],
      ["labelMetrics.bottom", "number", "Label extent below its anchor.", true],
      ["labelMetrics.dateOffset", "number", "Date offset from the label anchor.", true],
      ["labelMetrics.detailOffset", "number", "Detail offset from the label anchor.", true],
      ["ports[]", "object[]", "Additional attachment points at explicit event times."],
      ["ports[].time", "number", "Attachment time in the timeline's declared units.", true],
      ["ports[].y", "number", "Canonical time-axis coordinate in pixels.", true],
      ["intervalTitle", "outside | inside | hidden", "Placement of interval titles."],
      ["intervalAlign", "start | center | end", "Alignment of interval titles."],
      ["intervalStyle", "soft | solid | outline", "Resolved interval fill style."],
      ["intervalBorder", "auto | none | solid | dashed", "Resolved interval border style."],
      ["intervalTextColorMode", "theme | event | custom", "Source of interval text color."],
      ["leaderStyle", "none | solid | dashed", "Leader line style."],
      ...(["pointMarker", "anchorMarker"] as const).flatMap((name): Entry[] => [
        [name, "object", "Resolved timeline marker settings."],
        [`${name}.visible`, "boolean", "Whether the marker is visible.", true],
        [`${name}.shape`, "auto | circle | square | diamond", "Marker shape.", true],
        [`${name}.size`, "number", "Marker size in pixels.", true],
        [`${name}.fill`, "string", "Marker fill color.", true],
        [`${name}.borderColor`, "string", "Marker border color.", true],
        [`${name}.borderWidth`, "number", "Marker border width in pixels.", true],
      ]),
      ...(["intervalBorderColor", "intervalTextColor", "pointTextColor", "pointDateColor", "leaderColor"] as const).map(
        (name): Entry => [name, "string", "Resolved renderer color."],
      ),
      ...(["intervalBorderWidth", "intervalRadius", "leaderWidth", "barWidth"] as const).map((name): Entry => [
        name,
        "number",
        "Resolved renderer dimension in pixels.",
      ]),
      ["pointDateVisible", "boolean", "Whether the point's date label is visible."],
    ]),
  ];
}

function compoundGeometryFields(g: string): SchemaField[] {
  return [
    ...fields(g, [["groups[]", "object[]", "Expanded group rectangles; x/y is the top-left corner."]]),
    ...fields(`${g}.groups[]`, [
      ["id", "string", "Graph group ID.", true],
      ["title", "string", "Group header text.", true],
      ["depth", "number", "Nesting depth.", true],
      ["leafCount", "number", "Number of contained leaf nodes.", true],
      ["colorFamilyIndex", "number", "Resolved group color-family index.", true],
    ]),
    ...xy(`${g}.groups[]`),
    ...size(`${g}.groups[]`),
    ...fields(g, [["compoundGeometry", "object", "Exact boxes and routes used by subsequent layout evaluations."]]),
    ...fields(`${g}.compoundGeometry`, [
      ["boxes[id]", "object", "Node/group box indexed by ID; x/y is its top-left corner.", true],
    ]),
    ...xy(`${g}.compoundGeometry.boxes[id]`),
    ...size(`${g}.compoundGeometry.boxes[id]`),
    ...fields(`${g}.compoundGeometry`, [
      ["routes[id]", "object", "Connection geometry indexed by rendered edge ID.", true],
      ["routes[id].points[]", "object[]", "Ordered route attachment/bend points.", true],
    ]),
    ...xy(`${g}.compoundGeometry.routes[id].points[]`),
    ...fields(`${g}.compoundGeometry.routes[id]`, [
      ["labelPosition", "object", "Label anchor in canvas pixels.", true],
    ]),
    ...xy(`${g}.compoundGeometry.routes[id].labelPosition`),
    ...size(`${g}.compoundGeometry`),
    ...fields(g, [["layoutQuality", "object", "Measured quality of this arrangement."]]),
    ...fields(`${g}.layoutQuality`, [
      ["elapsedMs", "number", "Layout evaluation duration in milliseconds.", true],
      ["aiAssessment", "string", "AI explanation of the result."],
      ["validation", "object", "Geometry validation result.", true],
      ["validation.valid", "boolean", "Whether geometry passes validation.", true],
      ["validation.errors", "string[]", "Validation errors.", true],
      ["metrics", "object", "Measured quality metrics.", true],
      ...(["crossings", "labelCollisions", "bends", "movedNodes", "changedEdges"] as const).map((name): Entry => [
        `metrics.${name}`,
        "number",
        "Measured count.",
        true,
      ]),
      ...(["sharedLength", "length", "movement"] as const).map((name): Entry => [
        `metrics.${name}`,
        "number",
        "Measured distance in pixels.",
        true,
      ]),
      ["metrics.area", "number", "Occupied content area in square pixels.", true],
    ]),
  ];
}

function timelineGeometryFields(g: string): SchemaField[] {
  return fields(g, [
    ["timeline", "object", "Timeline axis, tracks and canonical geometry."],
    ["timeline.orientation", "vertical | horizontal", "Time-axis orientation."],
    ["timeline.layout", "tracks | flow", "Timeline arrangement algorithm."],
    ["timeline.edgeRouting", "avoid | direct", "Routing method."],
    ["timeline.clock", "object", "Time interpretation."],
    ["timeline.clock.mode", "calendar | relative", "Calendar or relative time.", true],
    ["timeline.clock.unit", "unit | second | minute | hour | day | week | cycle", "Relative time unit.", true],
    ["timeline.clock.origin", "string", "Relative time origin label.", true],
    ["timeline.clock.format", "offset | elapsed", "Relative time label format.", true],
    ["timeline.clock.precision", "number", "Relative label decimal precision.", true],
    ["timeline.timeZone", "UTC | null", "UTC for calendar timestamps; null for relative time.", true],
    ["timeline.filtered", "boolean", "Whether the geometry represents a filtered projection."],
    ["timeline.axisX", "number", "Axis position along the canonical cross axis, in pixels.", true],
    ["timeline.originY", "number", "Time-domain start in canonical time-axis pixels.", true],
    ["timeline.start", "number | null", "Visible time-domain start.", true],
    ["timeline.end", "number | null", "Visible time-domain end.", true],
    ["timeline.pixelsPerUnit", "number", "Linear scale in pixels per millisecond or relative time unit.", true],
    ["timeline.undatedY", "number | null", "Canonical position of the undated region.", true],
    ["timeline.relativeTickStep", "number", "Relative time tick spacing in declared units."],
    ["timeline.tickInterval", "object", "Calendar tick interval."],
    ["timeline.tickInterval.step", "number", "Number of units between ticks.", true],
    ["timeline.tickInterval.unit", "second | minute | hour | day | week | month | year", "Calendar tick unit.", true],
    ["timeline.axisMap", "object", "Saved piecewise time-to-pixel mapping."],
    ["timeline.axisMap.mode", "linear | adaptive", "Time scale mode.", true],
    ["timeline.axisMap.start", "number", "Mapping domain start.", true],
    ["timeline.axisMap.end", "number", "Mapping domain end.", true],
    ["timeline.axisMap.originY", "number", "Mapping origin along the time axis, in pixels.", true],
    ["timeline.axisMap.height", "number", "Mapping extent along the time axis, in pixels.", true],
    ["timeline.axisMap.knots[]", "object[]", "Ordered control points of the time mapping.", true],
    ["timeline.axisMap.knots[].time", "number", "Control-point time.", true],
    ["timeline.axisMap.knots[].y", "number", "Control-point time-axis pixel coordinate.", true],
    ["timeline.ticks[]", "object[]", "Rendered axis ticks.", true],
    ["timeline.ticks[].time", "number", "Tick time.", true],
    ["timeline.ticks[].y", "number", "Canonical time-axis pixel coordinate.", true],
    ["timeline.ticks[].label", "string", "Formatted tick label.", true],
    ["timeline.tracks[]", "object[]", "Track header and content bounds.", true],
    ["timeline.tracks[].id", "string", "Track ID.", true],
    ["timeline.tracks[].label", "string", "Track header.", true],
    ["timeline.tracks[].x", "number", "Track start along the canonical cross axis, in pixels.", true],
    ["timeline.tracks[].width", "number", "Track cross-axis extent in pixels.", true],
    ["timeline.tracks[].color", "string", "Resolved track color.", true],
    [
      "timeline.canonicalStage",
      "LayoutGeometry",
      "Same timeline geometry structure in canonical vertical coordinates, without another canonicalStage; used to project horizontal views.",
    ],
  ]);
}

function spatialGeometryFields(g: string): SchemaField[] {
  return [
    ...fields(g, [
      ["spatial", "object", "Projected guides and camera geometry."],
      ["spatial.metadata", "SpaceMetadata | null", "Spatial system from graph metadata.space; see the graph Schema."],
      ["spatial.view", "SpaceView", "Projection camera; same structure as layout.scope.camera.", true],
      ["spatial.guides[]", "object[]", "Projected guide lines and optional labels.", true],
      ["spatial.guides[].path", "string", "SVG path in canvas coordinates.", true],
      ["spatial.guides[].label", "string", "Guide label."],
      ["spatial.guides[].x", "number", "Guide label x coordinate in pixels."],
      ["spatial.guides[].y", "number", "Guide label y coordinate in pixels."],
      ["spatial.fitBounds", "object", "Content bounds used to fit the viewport."],
    ]),
    ...xy(`${g}.spatial.fitBounds`),
    ...size(`${g}.spatial.fitBounds`),
    ...fields(g, [
      ["spatial.unitScale", "number", "Coordinate spacing relative to automatic scale.", true],
      ["spatial.pixelsPerUnit", "number", "Projection scale in pixels per coordinate unit.", true],
      ["spatial.displayUnit", "string", "Scale label unit.", true],
      ["spatial.legend", "object", "Marker-size legend."],
      ["spatial.legend.title", "string", "Legend title.", true],
      ["spatial.legend.description", "string", "Legend explanation.", true],
      ["spatial.legend.items[]", "object[]", "Legend marker samples.", true],
      ["spatial.legend.items[].label", "string", "Sample label.", true],
      ["spatial.legend.items[].radius", "number", "Sample marker radius in pixels.", true],
      ["spatial.legend.items[].opacity", "number", "Sample opacity from 0 to 1.", true],
      ["spatial.legend.items[].hollow", "boolean", "Render an unfilled sample.", true],
    ]),
  ];
}

/** Resolve wildcard arrays/maps without incorrectly looking for properties on the array itself. */
export function layoutFieldValues(value: unknown, path: string): unknown[] {
  let values: unknown[] = [value];
  for (const token of path.match(/[^.[\]]+|\[[^\]]*\]/g) ?? []) {
    values = values.flatMap((entry): unknown[] => {
      if (token === "[]") return Array.isArray(entry) ? entry : [];
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
  // Array parent rows show their length; child rows summarize actual values across entries.
  const values = layoutFieldValues(value, path.endsWith("[]") ? path.slice(0, -2) : path);
  if (!values.length) return "—";
  const summaries = [
    ...new Set(
      values.map((entry) =>
        entry === null
          ? "null"
          : Array.isArray(entry)
            ? `${entry.length} items`
            : typeof entry === "object"
              ? "object"
              : entry === ""
                ? '""'
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
