import { DOMAIN_COMMANDS, domainAvailability, type CommandEffect } from "../../console/domainRegistry";
import type { ConsoleInstruction } from "../../console/instructions";
import type { CapabilityContext } from "../../console/capabilities";
import type { ModelTool } from "../transport/toolTypes";
import {
  object,
  text,
  number,
  boolean,
  json,
  nullable,
  list,
  ids,
  page,
  type Schema,
  validateArguments,
} from "./schema";

export const TOOL_PROTOCOL_VERSION = 1;
export interface ToolOperation {
  tool: string;
  arguments: Record<string, unknown>;
}
export interface ToolDefinition extends ModelTool {
  parameters: Schema & Record<string, unknown>;
  effect: CommandEffect;
  example: Record<string, unknown>;
  unavailable(context: CapabilityContext): string | null;
  instruction(args: any, line: number): ConsoleInstruction;
}
const key = (value: string) => value;
const core = (
  name: string,
  description: string,
  effect: CommandEffect,
  parameters: Schema,
  example: Record<string, unknown>,
  instruction: ToolDefinition["instruction"],
  graph = true,
): ToolDefinition => ({
  name,
  description,
  effect,
  parameters,
  example,
  instruction,
  unavailable: (context) => (graph && !context.dag ? "No graph loaded." : null),
});
const mutation = (type: string, args: any, line: number): ConsoleInstruction => ({ type, ...args, line });
const appearance = (command: any, line: number): ConsoleInstruction => ({ type: "appearance", command, line });
const timeValue: Schema = { oneOf: [text, number] };
export const layoutIntentSchema = object({
  scope: object({ groupId: nullable(text), includeDescendants: boolean }),
  operation: { enum: ["layout-and-route"] },
  boundaryPolicy: { enum: ["strict", "allow-ancestor-resize"] },
  constraints: list({
    oneOf: [
      object({
        type: { enum: ["direction"] },
        scopeId: nullable(text),
        value: { enum: ["AUTO", "RIGHT", "DOWN"] },
        strength: { enum: ["soft"] },
      }),
      object({
        type: { enum: ["flow-order"] },
        scopeId: nullable(text),
        nodeIds: list(text, 2),
        strength: { enum: ["soft"] },
      }),
      object({ type: { enum: ["prefer-outer-route"] }, edgeId: text, strength: { enum: ["soft"] } }),
      object({
        type: { enum: ["port-side"] },
        edgeId: text,
        end: { enum: ["source", "target"] },
        side: { enum: ["east", "south", "west", "north"] },
        strength: { enum: ["soft"] },
      }),
    ],
  }),
});
const domainSchemas: Record<string, Schema> = {
  group_inspect: object({ id: text, ...page }, []),
  group_create: object({ id: text, title: text, members: ids }, ["id", "members"]),
  group_move: object({ members: ids, parent: nullable(text) }),
  group_rename: object({ id: text, title: text }),
  group_dissolve: object({ id: text }),
  group_delete: object({ id: text }),
  timeline_inspect: object(
    { id: text, track: text, start: { oneOf: [text, number] }, end: { oneOf: [text, number] }, ...page },
    [],
  ),
  timeline_set: object({
    id: text,
    time: {
      oneOf: [
        object({ basis: { enum: ["calendar", "relative"] }, at: timeValue }, ["at"]),
        object({ basis: { enum: ["calendar", "relative"] }, start: timeValue, end: nullable(timeValue) }, ["start"]),
      ],
    },
  }),
  timeline_shift: object({ ids, amount: number, unit: text }),
  timeline_track: object({ ids, track: { type: "string" } }),
  flow_inspect: object({ id: text, ...page }, []),
  flow_set: object({ edge: text, value: { type: "number", minimum: 0 } }),
  flow_scale: object({ edges: ids, factor: { type: "number", minimum: 0 } }),
  space_inspect: object({ id: text, ...page }, []),
  space_set: object({ id: text, coordinates: list(number, 1) }),
  space_translate: object({ ids, delta: list(number, 1) }),
  edge_data_inspect: object({ id: text, ...page }, []),
  edge_data_set: object({ id: text, value: json, metadata: nullable({ type: "object", additionalProperties: true }) }, [
    "id",
  ]),
  style_inspect: object({ path: text, ...page }, []),
  style_set: object({ path: text, value: json }),
  view_inspect: object({}),
  view_types: object({
    enabled: boolean,
    selection: { enum: ["single", "multiple"] },
    operation: { enum: ["include", "exclude"] },
    values: list(text),
  }),
  view_navigate: object({ destination: { enum: ["back", "up", "all"] } }),
  view_zoom: object({ percent: { type: "number", minimum: 0.01 }, fit: { enum: [true] } }, []),
  view_chart: object({ chart: { enum: ["node-link", "compound", "sankey", "timeline", "spatial"] } }),
  view_select: object({ ids: list(text) }),
  history_undo: object({}),
  history_redo: object({}),
  view_set: object({
    patch: object(
      {
        axes: list({ type: "integer", minimum: 0 }, 3, 3),
        projection: { enum: ["orthographic", "perspective", "map"] },
        orientation: {
          type: "array",
          items: number,
          minItems: 4,
          maxItems: 4,
          description: "Camera unit quaternion [x,y,z,w]. No Euler angle limits.",
        },
        unitScale: { type: "number", minimum: 0.1, maximum: 100 },
        labels: boolean,
        grid: boolean,
        hideBackPoints: boolean,
      },
      [],
    ),
  }),
  view_group: object({ id: nullable(text), collapsed: boolean, focus: boolean }, ["id"]),
  view_timeline: object(
    { track: nullable({ type: "string" }), range: nullable(object({ start: number, end: number })) },
    [],
  ),
  layout_inspect: object({ scope: text }, []),
  layout_diagnose: object({ scope: text }, []),
  layout_run: object(
    { method: { enum: ["level", "sugiyama", "dagre", "algorithm"] }, prompt: text, intent: layoutIntentSchema },
    [],
  ),
  layout_cancel: object({}),
  layout_resume: object({}),
};
export const TOOL_CATALOG: ToolDefinition[] = [
  core(
    "graph_inspect",
    "Read graph counts, document metadata and paginated nodes. Ordinary edges and containment are independent.",
    "query",
    object({ ...page }, []),
    {},
    (args, line) => ({ type: "query", action: "graph", args, line }),
  ),
  core(
    "node_inspect",
    "Read exact node fields and paginated incoming/outgoing edge IDs. Use field to read one large field.",
    "query",
    object({ id: text, field: text, ...page }, ["id"]),
    { id: "api" },
    (args, line) => ({ type: "query", action: "node", args, line }),
  ),
  core(
    "node_search",
    "Search IDs, titles, types, definitions and custom fields; paginated relevance order.",
    "query",
    object({ query: text, ...page }, ["query"]),
    { query: "service" },
    (args, line) => ({ type: "query", action: "search", args, line }),
  ),
  core(
    "graph_neighbors",
    "Explore ordinary incoming/outgoing connections, not containment. Returns paginated reachable nodes with distance.",
    "query",
    object({ id: text, depth: { type: "integer", minimum: 1, maximum: 4 }, ...page }, ["id"]),
    { id: "api", depth: 1 },
    (args, line) => ({ type: "query", action: "neighbors", args, line }),
  ),
  core(
    "graph_path",
    "Find the shortest directed path along ordinary edges. Does not traverse containment.",
    "query",
    object({ source: text, target: text }),
    { source: "api", target: "db" },
    (args, line) => ({ type: "query", action: "path", args, line }),
  ),
  core(
    "node_create",
    "Create a node. Optional parent adds an ordinary edge, NOT containment; use group_move for containment. Set fields using node_set in the same edit_batch.",
    "document",
    object({ id: text, parent: text }, ["id"]),
    { id: "api" },
    (a, l) => mutation("add", { key: a.id, parentKey: a.parent === undefined ? undefined : key(a.parent) }, l),
  ),
  core(
    "node_copy",
    "Copy node fields to a new ID; optional parent adds an ordinary incoming edge.",
    "document",
    object({ source: text, id: text, parent: text }, ["source", "id"]),
    { source: "api", id: "api2" },
    (a, l) =>
      mutation(
        "copy",
        { sourceKey: key(a.source), key: a.id, parentKey: a.parent === undefined ? undefined : key(a.parent) },
        l,
      ),
  ),
  core(
    "node_rename",
    "Rename a node ID and repair its references.",
    "document",
    object({ id: text, newId: text }),
    { id: "api", newId: "service" },
    (a, l) => mutation("rename", { oldKey: key(a.id), newKey: a.newId }, l),
  ),
  core(
    "node_delete",
    "Delete a node. recursive:true follows ordinary outgoing edges; use group_delete for a containment subtree.",
    "document",
    object({ id: text, recursive: boolean }, ["id"]),
    { id: "api" },
    (a, l) => mutation("delete", { key: key(a.id), recursive: a.recursive ?? false }, l),
  ),
  core(
    "node_set",
    "Set a node field to a JSON value. Cannot set key, parents or children. Time and coordinates are validated by the document schema.",
    "document",
    object({ id: text, field: text, value: json }),
    { id: "api", field: "title", value: "API" },
    (a, l) => mutation("setField", { key: key(a.id), field: a.field, value: a.value }, l),
  ),
  core(
    "node_unset",
    "Remove one non-relationship field.",
    "document",
    object({ id: text, field: text }),
    { id: "api", field: "description" },
    (a, l) => mutation("unsetField", { key: key(a.id), field: a.field }, l),
  ),
  core(
    "node_open",
    "Open the node detail viewer; raw:true opens its JSON editor. Does not edit graph data.",
    "view",
    object({ id: text, raw: boolean }, ["id"]),
    { id: "api" },
    (a, l) => ({ type: a.raw ? "json" : "show", key: key(a.id), line: l }),
  ),
  core(
    "edge_set",
    "Create/update an ordinary source→target edge. Sankey values must be finite non-negative numbers. To edit a specific parallel edge, use edge_data_set by ID.",
    "document",
    object(
      {
        source: text,
        target: text,
        value: { oneOf: [{ type: "string" }, number, boolean, { type: "null" }] },
        createMissing: boolean,
      },
      ["source", "target"],
    ),
    { source: "api", target: "db", value: 10 },
    (a, l) =>
      mutation(
        "setEdge",
        { parentKey: key(a.source), childKey: key(a.target), weight: a.value, createMissing: a.createMissing ?? false },
        l,
      ),
  ),
  core(
    "edge_remove",
    "Remove ordinary edges between source and target.",
    "document",
    object({ source: text, target: text }),
    { source: "api", target: "db" },
    (a, l) => mutation("removeEdge", { parentKey: key(a.source), childKey: key(a.target) }, l),
  ),
  ...(["parents", "children"] as const).map((direction) =>
    core(
      `node_${direction}_replace`,
      `Replace the entire ordinary ${direction} set. Empty IDs clears it. Does not change containment.`,
      "document",
      object({ id: text, ids: list(text) }),
      { id: "api", ids: [] },
      (a, l) =>
        mutation(direction === "parents" ? "setParents" : "setChildren", { key: key(a.id), keys: a.ids.map(key) }, l),
    ),
  ),
  core(
    "style_css_inspect",
    "Read the current custom CSS.",
    "query",
    object({}),
    {},
    (_a, l) => ({ type: "appearanceCssShow", line: l }),
    false,
  ),
  core(
    "style_css_set",
    "Replace or append custom graph CSS. Use stable .dag-* SVG selectors.",
    "style",
    object({ css: { type: "string" }, append: boolean }, ["css"]),
    { css: ".dag-edge__path { opacity: .7; }" },
    (a, l) => appearance({ type: a.append ? "appendCss" : "replaceCss", css: a.css }, l),
    false,
  ),
  core(
    "style_variable_set",
    "Set a --dag-* CSS variable; null removes the override.",
    "style",
    object({ name: { type: "string", pattern: "^--dag-[a-zA-Z0-9-]+$" }, value: nullable({ type: "string" }) }),
    { name: "--dag-edge-color", value: "#456789" },
    (a, l) =>
      appearance(
        a.value === null ? { type: "unsetCssVar", key: a.name } : { type: "setCssVar", key: a.name, value: a.value },
        l,
      ),
    false,
  ),
  core(
    "style_reset",
    "Restore the current chart's default style, including Timeline settings.",
    "style",
    object({}),
    {},
    (_a, l) => appearance({ type: "resetAppearance" }, l),
    false,
  ),
  core(
    "style_preset",
    "Apply a preset ID from the context's stylePresets list for the current chart.",
    "style",
    object({ id: text }),
    { id: "default" },
    (a, l) => appearance({ type: "applyPreset", presetId: a.id }, l),
    false,
  ),
  ...DOMAIN_COMMANDS.map((d) => {
    const name = `${d.family.replace(/-/g, "_")}_${d.action}`;
    if (!domainSchemas[name]) throw new Error(`Missing tool schema: ${name}`);
    return {
      name,
      description: d.help,
      effect: d.effect,
      parameters: domainSchemas[name],
      example: d.example,
      unavailable: (context: CapabilityContext) => domainAvailability(d, context),
      instruction: (args: Record<string, unknown>, line: number): ConsoleInstruction => ({
        type: "domain",
        family: d.family,
        action: d.action,
        args,
        line,
      }),
    };
  }),
];
export function toolDefinition(name: string): ToolDefinition {
  const tool = TOOL_CATALOG.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}. Use the supplied tool catalog.`);
  return tool;
}
export const isEdit = (tool: ToolDefinition) => tool.effect === "document" || tool.effect === "style";
export function modelTools(context: CapabilityContext, readOnly = false): ModelTool[] {
  const tools = TOOL_CATALOG.filter((t) => !t.unavailable(context) && (!readOnly || t.effect === "query"));
  const definitions: ModelTool[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toolParameters(tool, context),
  }));
  const edits = tools.filter(isEdit);
  if (edits.length)
    definitions.push({
      name: "edit_batch",
      description:
        "Apply ordered document/style edits atomically as ONE undoable transaction. All operations must pass before any commit. No queries, view or layout tasks. Use subsequent tool calls for dependent layout.",
      parameters: object({
        operations: list(
          { oneOf: edits.map((t) => object({ tool: { enum: [t.name] }, arguments: t.parameters })) },
          1,
          100,
        ),
      }),
    });
  return definitions;
}
export function parseToolOperations(
  name: string,
  args: unknown,
  context: CapabilityContext,
  readOnly = false,
): ConsoleInstruction[] {
  const supplied = modelTools(context, readOnly).find((t) => t.name === name);
  if (!supplied)
    throw new Error(
      name === "edit_batch"
        ? "Editing is unavailable."
        : (toolDefinition(name).unavailable(context) ?? "This tool is unavailable in analysis-only mode."),
    );
  validateArguments(args, supplied.parameters);
  const operations =
    name === "edit_batch"
      ? (args as { operations: ToolOperation[] }).operations
      : [{ tool: name, arguments: args as Record<string, unknown> }];
  return operations.map((operation, index) => {
    const definition = toolDefinition(operation.tool);
    if (name === "edit_batch" && !isEdit(definition)) throw new Error("edit_batch only accepts document/style edits.");
    const unavailable = definition.unavailable(context);
    if (unavailable) throw new Error(unavailable);
    validateArguments(operation.arguments, toolParameters(definition, context));
    return definition.instruction(operation.arguments, index + 1);
  });
}

export function toolParameters(tool: ToolDefinition, context: CapabilityContext): Schema & Record<string, unknown> {
  if (tool.name !== "layout_run") return tool.parameters;
  if (context.chartType === "node-link") return object({ method: { enum: ["level", "sugiyama", "dagre"] } });
  if (context.chartType === "timeline") return object({ method: { enum: ["algorithm"] }, prompt: text }, []);
  if (context.chartType === "compound") return object({ prompt: text, intent: layoutIntentSchema }, []);
  return tool.parameters;
}
