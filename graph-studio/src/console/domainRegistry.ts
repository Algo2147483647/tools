import { hasCapability, type Capability, type CapabilityContext } from "./capabilities";
import type { GraphChartType } from "../graph/types";

export type CommandEffect = "query" | "document" | "style" | "view" | "layout";
export interface DomainCommandDefinition {
  family: string;
  action: string;
  effect: CommandEffect;
  capability?: Capability;
  charts?: GraphChartType[];
  example: Record<string, unknown>;
  help: string;
}
const command = (
  family: string,
  action: string,
  effect: CommandEffect,
  example: Record<string, unknown>,
  help: string,
  capability?: Capability,
  charts?: GraphChartType[],
): DomainCommandDefinition => ({ family, action, effect, example, help, capability, charts });

/** Domain operations and capability requirements. Public JSON schemas live in tools/catalog. */
export const DOMAIN_COMMANDS: DomainCommandDefinition[] = [
  command(
    "group",
    "inspect",
    "query",
    {},
    "Inspect containment independently of ordinary edges; optional id, offset and limit.",
    "group",
  ),
  command(
    "group",
    "create",
    "document",
    { id: "services", title: "Services", members: ["api", "db"] },
    "Create a group from siblings.",
    "group",
  ),
  command(
    "group",
    "move",
    "document",
    { members: ["api"], parent: "services" },
    "Move members into a node; parent:null moves to root.",
    "group",
  ),
  command("group", "rename", "document", { id: "services", title: "Platform" }, "Rename a group title.", "group"),
  command(
    "group",
    "dissolve",
    "document",
    { id: "services" },
    "Release children to the parent; retain the group node and ordinary edges.",
    "group",
  ),
  command(
    "group",
    "delete",
    "document",
    { id: "services" },
    "Delete the containment subtree, never ordinary-edge descendants.",
    "group",
  ),
  command(
    "timeline",
    "inspect",
    "query",
    {},
    "Inspect event times, tracks and overlapping intervals. Range bounds use calendar strings or relative numbers.",
    "timeline",
  ),
  command(
    "timeline",
    "set",
    "document",
    { id: "launch", time: { at: "2026-10-27" } },
    "Set an event time object, using the document clock basis.",
    "timeline",
  ),
  command(
    "timeline",
    "shift",
    "document",
    { ids: ["launch"], amount: 3, unit: "day" },
    "Shift events; calendar units: second, minute, hour, day, week. Relative unit must match the clock.",
    "timeline",
  ),
  command(
    "timeline",
    "track",
    "document",
    { ids: ["launch"], track: "Delivery" },
    "Assign events to a track.",
    "timeline",
  ),
  command(
    "flow",
    "inspect",
    "query",
    {},
    "Inspect numeric flows, node totals, imbalance and feedback edges. Imbalance is diagnostic, not an error.",
    "flow",
  ),
  command(
    "flow",
    "set",
    "document",
    { edge: "e1", value: 140 },
    "Set an existing edge's finite, non-negative flow by ID.",
    "flow",
  ),
  command(
    "flow",
    "scale",
    "document",
    { edges: ["e1"], factor: 1.2 },
    "Scale explicit flows by a finite, non-negative factor.",
    "flow",
  ),
  command("space", "inspect", "query", {}, "Inspect coordinate system, units, bounds and coordinates.", "space"),
  command(
    "space",
    "set",
    "document",
    { id: "point", coordinates: [1, 2, 3] },
    "Set coordinates in the declared coordinate system and dimensions.",
    "space",
  ),
  command(
    "space",
    "translate",
    "document",
    { ids: ["point"], delta: [1, 0, 0] },
    "Translate Cartesian coordinates only. Other coordinate systems require explicit space set.",
    "space",
  ),
  command("edge-data", "inspect", "query", {}, "Inspect canonical edge IDs, values and metadata.", "graph"),
  command(
    "edge-data",
    "set",
    "document",
    { id: "e1", metadata: { kind: "dependency" } },
    "Update an edge value or merge metadata by ID; metadata:null clears metadata.",
    "graph",
  ),
  command(
    "style",
    "inspect",
    "query",
    {},
    "Inspect supported Style schema fields, types and current values; optional path prefix.",
  ),
  command(
    "style",
    "set",
    "style",
    { path: "style.appearance.display.showEdgeLabels", value: true },
    "Edit a supported path from the current chart's Style schema, including style.timeline fields.",
  ),
  command("view", "inspect", "query", {}, "Inspect current scope, filters, camera and settings.", "graph"),
  command(
    "view",
    "set",
    "view",
    { patch: { orientation: [0, 0.2588190451, 0, 0.9659258263], projection: "orthographic" } },
    "Update Spatial camera settings; never changes coordinates.",
    "space",
    ["spatial"],
  ),
  command(
    "view",
    "group",
    "view",
    { id: "services", collapsed: true },
    "Set a group's collapsed state or focus; id:null with focus:true returns to root.",
    "group",
    ["compound"],
  ),
  command(
    "view",
    "timeline",
    "view",
    { track: "Delivery" },
    "Filter track or numeric time range; null clears either filter.",
    "timeline",
    ["timeline"],
  ),
  command(
    "view",
    "types",
    "view",
    { enabled: true, selection: "multiple", operation: "include", values: ["service"] },
    "Set the complete type filter. Single selection accepts at most one value; include/exclude support exact type IDs. Disabling shows all types.",
    "graph",
  ),
  command(
    "view",
    "navigate",
    "view",
    { destination: "all" },
    "Navigate back, up, or to the whole graph using the Workbench navigation semantics.",
    "graph",
  ),
  command(
    "view",
    "zoom",
    "view",
    { fit: true },
    "Fit the graph or set zoom percentage; current viewport limits apply.",
    "graph",
  ),
  command(
    "view",
    "chart",
    "view",
    { chart: "compound" },
    "Switch chart type. Current document data is preserved; tools are refreshed for the next turn.",
    "graph",
  ),
  command(
    "view",
    "select",
    "view",
    { ids: ["api"] },
    "Select explicit nodes in Node-link or Sankey. Empty IDs selects the full graph. Nested focus uses view_group; other modes use filters.",
    "graph",
    ["node-link", "sankey"],
  ),
  command("history", "undo", "view", {}, "Undo the latest edit transaction, including an AI edit batch.", "graph"),
  command("history", "redo", "view", {}, "Redo the latest undone transaction.", "graph"),
  command("layout", "inspect", "query", {}, "Inspect the current layout service and metrics.", "graph"),
  command("layout", "diagnose", "query", {}, "Read layout diagnostics without changing the graph.", "graph"),
  command(
    "layout",
    "run",
    "layout",
    {},
    "Run separately from edit batches. Node-link: method; Compound: prompt or intent; Timeline: prompt or method:algorithm.",
    "layout",
    ["node-link", "compound", "timeline"],
  ),
  command("layout", "cancel", "layout", {}, "Cancel the active layout task.", "layout", ["compound", "timeline"]),
  command("layout", "resume", "layout", {}, "Resume an existing Compound checkpoint.", "group", ["compound"]),
];

export function domainAvailability(definition: DomainCommandDefinition, context: CapabilityContext): string | null {
  if (definition.charts && !definition.charts.includes(context.chartType))
    return `Requires ${definition.charts.join(" or ")} view; current view is ${context.chartType}.`;
  if (definition.capability && !hasCapability(context, definition.capability))
    return `Document lacks ${definition.capability} capability. Load a compatible document or choose the appropriate view.`;
  return null;
}

export function getDomainCommand(family: string, action: string) {
  const definition = DOMAIN_COMMANDS.find((d) => d.family === family && d.action === action);
  if (!definition) throw new Error(`Unknown tool ${family}_${action}.`);
  return definition;
}

export interface DomainInstruction {
  type: "domain";
  family: string;
  action: string;
  args: Record<string, unknown>;
  line: number;
}
