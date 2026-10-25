import ProtocolSchema from "./ProtocolSchema";
import { schemaField } from "../../schema/fields";
import { layoutGeometryFields, layoutFieldSummary } from "../../schema/layoutGeometryFields";
import { TIMELINE_LAYOUT_KEYS } from "../../schema/layoutGeometry";
import { getAppearanceSchema } from "../../schema/appearance/schema";
import { createChartLayoutDocument, type LayoutDocument } from "../../schema/layoutProtocol";
import type { GraphChartType } from "../../graph/types";

export default function LayoutSchema({ value, chartType }: { value: LayoutDocument; chartType: GraphChartType }) {
  const document = createChartLayoutDocument(value, chartType);
  const field = (path: string, type: string, description: string, required = false) =>
    schemaField(path, type, required ? "Required" : "Optional", description);
  const fields = [
    field("format", '\"graph-studio-layout\"', "Independent JSON linked by metadata.layout.", true),
    field("version", "3", "Layout file version.", true),
    field("chartType", `\"${chartType}\"`, "The chart type this file configures and renders.", true),
    field("layout.settings", "object", "Settings for this chart type only.", true),
    ...(chartType === "compound"
      ? [
          field("layout.settings.version", "1", "Nested layout settings version."),
          field("layout.settings.method", "automatic | ai", "Arrangement method."),
          field("layout.settings.direction", "AUTO | RIGHT | DOWN", "Default flow direction."),
          field("layout.settings.objective", "readability | compact", "Optimization objective."),
          field("layout.settings.portMode", "distributed | midpoints", "Connection attachment policy."),
          field(
            "layout.settings.constraints[]",
            "object[]",
            "Group directions, sibling order and routing preferences.",
          ),
          field(
            "layout.settings.constraints[].type",
            "direction | flow-order | prefer-outer-route | port-side",
            "Constraint variant.",
            true,
          ),
          field(
            "layout.settings.constraints[].scopeId",
            "string | null",
            "Parent group for direction/flow-order; null means top level.",
          ),
          field("layout.settings.constraints[].value", "AUTO | RIGHT | DOWN", "Direction for type=direction."),
          field(
            "layout.settings.constraints[].nodeIds",
            "string[]",
            "At least two distinct sibling IDs for type=flow-order.",
          ),
          field("layout.settings.constraints[].edgeId", "string", "Edge ID for prefer-outer-route/port-side."),
          field("layout.settings.constraints[].end", "source | target", "Attachment endpoint for type=port-side."),
          field(
            "layout.settings.constraints[].side",
            "east | south | west | north",
            "Attachment side for type=port-side.",
          ),
          field("layout.settings.constraints[].strength", "soft", "Preference strength.", true),
        ]
      : chartType === "timeline"
        ? [
            field("layout.settings.version", "1", "Timeline layout settings version."),
            field("layout.settings.mode", "algorithm | ai", "Arrangement method."),
            field(
              "layout.settings.view",
              "object",
              "Timeline direction, time-axis mapping, routing and pins. Appearance is stored separately.",
            ),
            ...getAppearanceSchema("timeline")
              .fields.filter((entry) =>
                TIMELINE_LAYOUT_KEYS.some(
                  (key) => entry.path === `style.timeline.${key}` || entry.path.startsWith(`style.timeline.${key}[`),
                ),
              )
              .map((entry) => ({ ...entry, path: entry.path.replace(/^style\.timeline/, "layout.settings.view") })),
            field(
              "layout.settings.basis",
              "string",
              "Input identity for exact AI positions; changed time mapping invalidates them.",
            ),
            field("layout.settings.plan.trackOrder", "string[]", "Preferred track ordering."),
            field("layout.settings.plan.eventOrder", "string[]", "Preferred event ordering."),
            field("layout.settings.plan.edgeRouting", "avoid | direct", "Routing preference."),
            field(
              "layout.settings.plan.placements[]",
              "object[]",
              "Exact cross-axis coordinate and physical label x/y in pixels.",
            ),
            field("layout.settings.plan.placements[].id", "string", "Graph event ID.", true),
            field(
              "layout.settings.plan.placements[].cross",
              "number",
              "Absolute cross-axis position in pixels: x for vertical time, y for horizontal time.",
              true,
            ),
            field(
              "layout.settings.plan.placements[].label",
              "[number, number]",
              "Optional absolute [x, y] label position in canvas pixels.",
            ),
            field("layout.settings.plan.routes[]", "object[]", "Complete connection polylines and label positions."),
            field("layout.settings.plan.routes[].id", "string", "Graph edge ID.", true),
            field(
              "layout.settings.plan.routes[].points[]",
              "[number, number]",
              "Ordered [x, y] waypoints; first/last attach to event time anchors.",
              true,
            ),
            field(
              "layout.settings.plan.routes[].label",
              "[number, number]",
              "Optional absolute [x, y] connection label position in pixels.",
            ),
          ]
        : chartType === "node-link"
          ? [field("layout.settings.method", "level | sugiyama | dagre", "Layered layout algorithm.")]
          : []),
    field(
      "layout.scope",
      "object",
      chartType === "compound"
        ? "Graph selection, type filter, focused group and collapsed groups."
        : chartType === "timeline"
          ? "Graph selection and type, track and time filters."
          : chartType === "spatial"
            ? "Graph selection, type filter and projection camera."
            : "Graph selection and type filter.",
    ),
    field("layout.scope.selection", "object | null", "Graph selection; null uses the graph default."),
    field("layout.scope.selection.type", "full | node | forest", "Selection variant.", true),
    field("layout.scope.selection.key", "string", "Selected node for type=node."),
    field("layout.scope.selection.keys", "string[]", "Selected root IDs for type=forest."),
    field("layout.scope.selection.label", "string", "Selection label for type=forest."),
    field("layout.scope.activeType", "string", "Type filter; empty means all types."),
    ...(chartType === "compound"
      ? [
          field("layout.scope.focusGroupId", "string | null", "Focused group; null means the full graph."),
          field("layout.scope.collapsedGroupIds", "string[]", "Groups rendered as summary cards."),
        ]
      : chartType === "timeline"
        ? [
            field("layout.scope.activeTrack", "string", "Track filter; empty means all tracks."),
            field("layout.scope.timeRange", "object | null", "Visible time range; null means unrestricted."),
            field(
              "layout.scope.timeRange.start",
              "number",
              "Inclusive start in UTC milliseconds or relative time units.",
            ),
            field("layout.scope.timeRange.end", "number", "Inclusive end in the same units."),
          ]
        : chartType === "spatial"
          ? [
              field("layout.scope.camera", "object", "Projection camera."),
              field(
                "layout.scope.camera.axes",
                "[number, number, number]",
                "Three source coordinate indexes used for projection.",
                true,
              ),
              field("layout.scope.camera.projection", "orthographic | perspective | map", "Projection mode.", true),
              field("layout.scope.camera.yaw", "number", "Horizontal camera rotation in degrees.", true),
              field("layout.scope.camera.pitch", "number", "Vertical camera rotation in degrees.", true),
              field("layout.scope.camera.labels", "boolean", "Show point labels.", true),
              field("layout.scope.camera.grid", "boolean", "Show coordinate guides.", true),
              field("layout.scope.camera.hideBackPoints", "boolean", "Hide points behind the surface.", true),
              field("layout.scope.camera.unitScale", "number", "Coordinate spacing relative to automatic scale."),
            ]
          : []),
    field("layout.graphFingerprint", "string", "Graph content identity, excluding style/layout links."),
    field("layout.settingsFingerprint", "string", "Identity of this chart's settings and scope."),
    ...layoutGeometryFields(chartType),
  ];
  return (
    <ProtocolSchema
      label="Layout"
      fields={fields}
      value={document}
      valueHeading="Current"
      fileName={`current.${chartType}.layout.json`}
      allowDownload={false}
      renderValue={(entry) => <code>{layoutFieldSummary(document, entry.path)}</code>}
    />
  );
}
