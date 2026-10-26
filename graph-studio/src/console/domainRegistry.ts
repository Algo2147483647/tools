import { hasCapability, type Capability, type CapabilityContext } from "./capabilities";
import type { GraphChartType } from "../graph/types";

export type CommandEffect = "query" | "document" | "style" | "view" | "layout";
export interface DomainCommandDefinition {
  family: string;
  action: string;
  effect: CommandEffect;
  capability?: Capability;
  charts?: GraphChartType[];
  args: string[];
  example: Record<string, unknown>;
  help: string;
}
const command = (
  family: string,
  action: string,
  effect: CommandEffect,
  args: string[],
  example: Record<string, unknown>,
  help: string,
  capability?: Capability,
  charts?: GraphChartType[],
): DomainCommandDefinition => ({ family, action, effect, args, example, help, capability, charts });

/** One catalog drives parsing, capability checks, help, completion and AI tools. Arguments are a JSON object. */
export const DOMAIN_COMMANDS: DomainCommandDefinition[] = [
  command(
    "group",
    "inspect",
    "query",
    ["id", "offset", "limit"],
    {},
    "Inspect containment independently of ordinary edges; optional id, offset and limit.",
    "group",
  ),
  command(
    "group",
    "create",
    "document",
    ["id", "title", "members"],
    { id: "services", title: "Services", members: ["api", "db"] },
    "Create a group from siblings.",
    "group",
  ),
  command(
    "group",
    "move",
    "document",
    ["members", "parent"],
    { members: ["api"], parent: "services" },
    "Move members into a node; parent:null moves to root.",
    "group",
  ),
  command(
    "group",
    "rename",
    "document",
    ["id", "title"],
    { id: "services", title: "Platform" },
    "Rename a group title.",
    "group",
  ),
  command(
    "group",
    "dissolve",
    "document",
    ["id"],
    { id: "services" },
    "Release children to the parent; retain the group node and ordinary edges.",
    "group",
  ),
  command(
    "group",
    "delete",
    "document",
    ["id"],
    { id: "services" },
    "Delete the containment subtree, never ordinary-edge descendants.",
    "group",
  ),
  command(
    "timeline",
    "inspect",
    "query",
    ["id", "track", "start", "end", "offset", "limit"],
    {},
    "Inspect event times, tracks and overlapping intervals. Range bounds use calendar strings or relative numbers.",
    "timeline",
  ),
  command(
    "timeline",
    "set",
    "document",
    ["id", "time"],
    { id: "launch", time: { at: "2026-10-27" } },
    "Set an event time object, using the document clock basis.",
    "timeline",
  ),
  command(
    "timeline",
    "shift",
    "document",
    ["ids", "amount", "unit"],
    { ids: ["launch"], amount: 3, unit: "day" },
    "Shift events; calendar units: second, minute, hour, day, week. Relative unit must match the clock.",
    "timeline",
  ),
  command(
    "timeline",
    "track",
    "document",
    ["ids", "track"],
    { ids: ["launch"], track: "Delivery" },
    "Assign events to a track.",
    "timeline",
  ),
  command(
    "flow",
    "inspect",
    "query",
    ["id", "offset", "limit"],
    {},
    "Inspect numeric flows, node totals, imbalance and feedback edges. Imbalance is diagnostic, not an error.",
    "flow",
  ),
  command(
    "flow",
    "set",
    "document",
    ["edge", "value"],
    { edge: "e1", value: 140 },
    "Set an existing edge's finite, non-negative flow by ID.",
    "flow",
  ),
  command(
    "flow",
    "scale",
    "document",
    ["edges", "factor"],
    { edges: ["e1"], factor: 1.2 },
    "Scale explicit flows by a finite, non-negative factor.",
    "flow",
  ),
  command(
    "space",
    "inspect",
    "query",
    ["id", "offset", "limit"],
    {},
    "Inspect coordinate system, units, bounds and coordinates.",
    "space",
  ),
  command(
    "space",
    "set",
    "document",
    ["id", "coordinates"],
    { id: "point", coordinates: [1, 2, 3] },
    "Set coordinates in the declared coordinate system and dimensions.",
    "space",
  ),
  command(
    "space",
    "translate",
    "document",
    ["ids", "delta"],
    { ids: ["point"], delta: [1, 0, 0] },
    "Translate Cartesian coordinates only. Other coordinate systems require explicit space set.",
    "space",
  ),
  command(
    "edge-data",
    "inspect",
    "query",
    ["id", "offset", "limit"],
    {},
    "Inspect canonical edge IDs, values and metadata.",
    "graph",
  ),
  command(
    "edge-data",
    "set",
    "document",
    ["id", "value", "metadata"],
    { id: "e1", metadata: { kind: "dependency" } },
    "Update an edge value or merge metadata by ID; metadata:null clears metadata.",
    "graph",
  ),
  command(
    "style",
    "inspect",
    "query",
    ["path", "offset", "limit"],
    {},
    "Inspect supported Style schema fields, types and current values; optional path prefix.",
  ),
  command(
    "style",
    "set",
    "style",
    ["path", "value"],
    { path: "style.appearance.display.showEdgeLabels", value: true },
    "Edit a supported path from the current chart's Style schema, including style.timeline fields.",
  ),
  command("view", "inspect", "query", [], {}, "Inspect current scope, filters, camera and settings.", "graph"),
  command(
    "view",
    "set",
    "view",
    ["patch"],
    { patch: { yaw: 30, projection: "orthographic" } },
    "Update Spatial camera settings; never changes coordinates.",
    "space",
    ["spatial"],
  ),
  command(
    "view",
    "group",
    "view",
    ["id", "collapsed", "focus"],
    { id: "services", collapsed: true },
    "Set a group's collapsed state or focus; id:null with focus:true returns to root.",
    "group",
    ["compound"],
  ),
  command(
    "view",
    "timeline",
    "view",
    ["track", "range"],
    { track: "Delivery" },
    "Filter track or numeric time range; null clears either filter.",
    "timeline",
    ["timeline"],
  ),
  command("layout", "inspect", "query", ["scope"], {}, "Inspect the current layout service and metrics.", "graph"),
  command("layout", "diagnose", "query", ["scope"], {}, "Read layout diagnostics without changing the graph.", "graph"),
  command(
    "layout",
    "run",
    "layout",
    ["method", "prompt", "intent"],
    {},
    "Run separately from edit batches. Node-link: method; Compound: prompt or intent; Timeline: prompt or method:algorithm.",
    "layout",
    ["node-link", "compound", "timeline"],
  ),
  command("layout", "cancel", "layout", [], {}, "Cancel the active layout task.", "layout", ["compound", "timeline"]),
  command("layout", "resume", "layout", [], {}, "Resume an existing Compound checkpoint.", "group", ["compound"]),
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
  if (!definition) throw new Error(`Unknown command /${family} ${action}. Use /help.`);
  return definition;
}

export interface DomainInstruction {
  type: "domain";
  family: string;
  action: string;
  args: Record<string, unknown>;
  line: number;
}

export function parseDomainInstruction(source: string, line: number): DomainInstruction | null {
  const match = /^\/(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/.exec(source.trim());
  if (!match || !DOMAIN_COMMANDS.some((d) => d.family === match[1])) return null;
  const definition = getDomainCommand(match[1], match[2]);
  const args = JSON.parse(match[3] || "{}");
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Command arguments must be a JSON object.");
  for (const key of Object.keys(args))
    if (!definition.args.includes(key)) throw new Error(`Unknown argument ${key} for /${match[1]} ${match[2]}.`);
  return { type: "domain", family: match[1], action: match[2], args, line };
}
