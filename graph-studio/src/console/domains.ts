import { applyGraphCommand, type CommandResult } from "../graph/commands";
import { indexHierarchy } from "../graph/compound/hierarchy";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { findFeedbackEdges, getSankeyError } from "../graph/sankey";
import { getSpaceMetadata, validateSpaceCoordinates } from "../graph/space";
import { getTimelineClock } from "../graph/timeline/clock";
import { getTimelineReferenceTime } from "../graph/timeline/editing";
import { parseNodeTimeline, parseTimelineDate } from "../graph/timeline/time";
import type { GraphChartType, NormalizedDag } from "../graph/types";
import { isRecord } from "../shared/json";
import type { DomainInstruction } from "./domainRegistry";

export interface QueryResult {
  command: string;
  data: unknown;
  total?: number;
  nextOffset?: number;
}
export function textArg(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value;
}
export function numberArg(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be finite.`);
  return value;
}
function idsArg(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${field} must be a non-empty array.`);
  return [...new Set(value.map((id) => textArg(id, field)))];
}
function vectorArg(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions) throw new Error(`Expected ${dimensions} coordinates.`);
  return value.map((v) => numberArg(v, "coordinate"));
}
export function queryPage(command: string, items: unknown[], args: Record<string, unknown>): QueryResult {
  const offset = args.offset === undefined ? 0 : numberArg(args.offset, "offset");
  const limit = args.limit === undefined ? 40 : numberArg(args.limit, "limit");
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("offset must be a non-negative integer; limit must be 1..100.");
  return {
    command,
    data: items.slice(offset, offset + limit),
    total: items.length,
    ...(offset + limit < items.length ? { nextOffset: offset + limit } : {}),
  };
}

export function inspectDomain(dag: NormalizedDag, instruction: DomainInstruction, referenceTime: number): QueryResult {
  const { family, args } = instruction;
  const command = `/${family} ${instruction.action}`;
  const node =
    args.id === undefined
      ? undefined
      : Object.prototype.hasOwnProperty.call(dag.nodes, textArg(args.id, "id"))
        ? dag.nodes[String(args.id)]
        : undefined;
  if (args.id !== undefined && family !== "edge-data" && !node) throw new Error(`Unknown node ${args.id}.`);
  const keys = args.id === undefined ? Object.keys(dag.nodes).sort() : [String(args.id)];
  if (family === "group") {
    const index = indexHierarchy(dag);
    const rows = keys.map((id) => ({
      id,
      parent: index.parent.get(id) ?? null,
      children: index.children.get(id) ?? [],
      depth: index.depth.get(id),
    }));
    return queryPage(command, rows, args);
  }
  if (family === "timeline") {
    const clock = getTimelineClock(dag.metadata);
    const bound = (value: unknown) =>
      clock.mode === "relative" ? numberArg(value, "time bound") : parseTimelineDate(value)?.timestamp;
    const start = args.start === undefined ? -Infinity : bound(args.start);
    const end = args.end === undefined ? Infinity : bound(args.end);
    if (start === undefined || end === undefined || end < start)
      throw new Error("Invalid time range for the document clock.");
    if (args.track !== undefined && typeof args.track !== "string") throw new Error("track must be a string.");
    const rows = keys
      .map((id) => ({
        id,
        time: dag.nodes[id].time,
        track: dag.nodes[id].track,
        parsed: parseNodeTimeline(dag.nodes[id], getTimelineReferenceTime(dag) ?? referenceTime, clock),
      }))
      .filter(
        (row) =>
          (args.track === undefined || row.track === args.track) &&
          ((args.start === undefined && args.end === undefined) ||
            (row.parsed.status === "dated" && row.parsed.end >= start && row.parsed.start <= end)),
      );
    const page = queryPage(command, rows, args);
    const visible = page.data as typeof rows;
    return {
      ...page,
      data: {
        clock,
        referenceTime: getTimelineReferenceTime(dag) ?? referenceTime,
        events: visible,
        overlapsInPage: visible.flatMap((a, i) =>
          visible
            .slice(i + 1)
            .filter(
              (b) =>
                a.parsed.status === "dated" &&
                b.parsed.status === "dated" &&
                a.parsed.start < b.parsed.end &&
                b.parsed.start < a.parsed.end,
            )
            .map((b) => [a.id, b.id]),
        ),
      },
    };
  }
  if (family === "flow") {
    const error = getSankeyError(dag.nodes, dag.edges);
    if (error) throw new Error(error);
    const feedback = findFeedbackEdges(Object.keys(dag.nodes), dag.edges);
    const page = queryPage(
      command,
      keys.map((id) => {
        const incoming = dag.edges.filter((e) => e.target === id),
          outgoing = dag.edges.filter((e) => e.source === id);
        const input = incoming.reduce((sum, e) => sum + (e.value as number), 0),
          output = outgoing.reduce((sum, e) => sum + (e.value as number), 0);
        return { id, input, output, balance: input - output };
      }),
      args,
    );
    const edgePage = queryPage(
      command,
      dag.edges
        .filter((e) => args.id === undefined || e.source === args.id || e.target === args.id)
        .map((e) => ({ ...e, feedback: feedback.has(e.id) })),
      args,
    );
    return { ...page, data: { nodes: page.data, edges: edgePage } };
  }
  if (family === "space") {
    const metadata = getSpaceMetadata(dag)!;
    const rows = keys.map((id) => ({ id, coordinates: dag.nodes[id].space }));
    const page = queryPage(command, rows, args);
    const bounds = Array.from({ length: metadata.dimensions }, (_, axis) => {
      const values = rows.map((r) => (r.coordinates as number[])?.[axis]).filter(Number.isFinite);
      return values.length
        ? values.reduce(([min, max], value) => [Math.min(min, value), Math.max(max, value)], [Infinity, -Infinity])
        : null;
    });
    return { ...page, data: { metadata, bounds, nodes: page.data } };
  }
  if (family === "edge-data") {
    const edges = args.id === undefined ? dag.edges : dag.edges.filter((e) => e.id === textArg(args.id, "id"));
    if (args.id !== undefined && !edges.length) throw new Error(`Unknown edge ${args.id}.`);
    return queryPage(command, edges, args);
  }
  throw new Error(`No query handler for ${command}.`);
}

export function mutateDomain(
  source: NormalizedDag,
  instruction: DomainInstruction,
  chartType: GraphChartType,
  referenceTime: number,
): CommandResult {
  const { family, action, args } = instruction;
  const nodeId = (value: unknown) => {
    const id = textArg(value, "node ID");
    if (!Object.prototype.hasOwnProperty.call(source.nodes, id)) throw new Error(`Unknown node ${id}.`);
    return id;
  };
  if (family === "group" && action !== "delete") {
    const command =
      action === "create"
        ? {
            type: "groupCreate" as const,
            id: textArg(args.id, "id"),
            title: textArg(args.title, "title"),
            memberIds: idsArg(args.members, "members"),
          }
        : action === "move"
          ? {
              type: "groupMove" as const,
              memberIds: idsArg(args.members, "members"),
              parentId: args.parent === null ? null : textArg(args.parent, "parent"),
            }
          : action === "rename"
            ? { type: "groupRename" as const, id: textArg(args.id, "id"), title: textArg(args.title, "title") }
            : { type: "groupDissolve" as const, id: textArg(args.id, "id") };
    return applyGraphCommand(source, command, referenceTime);
  }
  const document = serializeDag(source);
  const changedKeys: string[] = [];
  let deletedKeys: string[] | undefined;
  if (family === "group") {
    const root = nodeId(args.id),
      index = indexHierarchy(source);
    if (!index.groups.has(root)) throw new Error(`Node ${root} is not a group.`);
    deletedKeys = index.order.slice(index.start.get(root), index.end.get(root));
    const deleted = new Set(deletedKeys);
    for (const id of deleted) delete document.nodes[id];
    document.edges = document.edges.filter((e) => !deleted.has(e.source) && !deleted.has(e.target));
    document.hierarchy_edges = document.hierarchy_edges?.filter(
      (e) => !deleted.has(e.source) && !deleted.has(e.target),
    );
  } else if (family === "timeline" || family === "space") {
    const ids = action === "set" ? [nodeId(args.id)] : idsArg(args.ids, "ids").map(nodeId);
    let working = source;
    for (const id of ids) {
      const fields = { ...working.nodes[id] };
      if (family === "timeline") {
        if (action === "set") {
          if (!isRecord(args.time)) throw new Error("time must be an object.");
          fields.time = args.time;
        } else if (action === "track") {
          if (typeof args.track !== "string") throw new Error("track must be a string.");
          fields.track = args.track;
        } else {
          const clock = getTimelineClock(source.metadata);
          const parsed = parseNodeTimeline(fields, getTimelineReferenceTime(source) ?? referenceTime, clock);
          if (parsed.status !== "dated" || !isRecord(fields.time)) throw new Error(`Event ${id} has no valid time.`);
          const amount = numberArg(args.amount, "amount"),
            unit = textArg(args.unit, "unit");
          const units: Record<string, number> = {
            second: 1000,
            minute: 60000,
            hour: 3600000,
            day: 86400000,
            week: 604800000,
          };
          if (
            (clock.mode === "relative" && unit !== clock.unit) ||
            (clock.mode === "calendar" && !Object.prototype.hasOwnProperty.call(units, unit))
          )
            throw new Error(`Unit ${unit} does not match the document clock.`);
          const delta = clock.mode === "relative" ? amount : amount * units[unit];
          const time = { ...fields.time };
          for (const key of ["at", "start", "end"]) {
            const value = time[key];
            if (value === undefined || value === null) continue;
            if (clock.mode === "relative") time[key] = numberArg(value, key) + delta;
            else {
              const date = parseTimelineDate(value);
              if (!date) throw new Error(`Invalid event time ${id}.${key}.`);
              if (date.precision === "year" || date.precision === "month")
                throw new Error(
                  `Event ${id} has ${date.precision} precision. Use /timeline set with an explicit new date instead of inventing a day.`,
                );
              const shifted = new Date(date.timestamp + delta);
              // Sub-day movement makes precision explicit.
              time[key] =
                date.precision === "date" && delta % 86400000 === 0
                  ? shifted.toISOString().slice(0, 10)
                  : shifted.toISOString();
            }
          }
          fields.time = time;
        }
      } else {
        const metadata = getSpaceMetadata(source)!;
        if (action === "set") fields.space = vectorArg(args.coordinates, metadata.dimensions);
        else {
          if (metadata.coordinateSystem !== "cartesian")
            throw new Error("Translate requires Cartesian coordinates; use /space set for this coordinate system.");
          const delta = vectorArg(args.delta, metadata.dimensions),
            previous = vectorArg(fields.space, metadata.dimensions);
          fields.space = previous.map((value, i) => numberArg(value + delta[i], "translated coordinate"));
        }
        validateSpaceCoordinates(fields.space as number[], metadata, `/nodes/${id}/space`);
      }
      working = applyGraphCommand(working, { type: "updateNodeFields", key: id, fields }, referenceTime).dag;
    }
    return { dag: working, changedKeys: ids, message: `Updated ${ids.length} ${family} node(s).` };
  } else if (family === "flow" || family === "edge-data") {
    const ids =
      family === "flow" && action === "scale"
        ? idsArg(args.edges, "edges")
        : [textArg(family === "flow" ? args.edge : args.id, "edge ID")];
    for (const id of ids) {
      const edge = document.edges.find((e) => e.id === id);
      if (!edge) throw new Error(`Unknown edge ${id}.`);
      if (family === "flow") {
        const value =
          action === "scale"
            ? numberArg(edge.value, "existing flow") * numberArg(args.factor, "factor")
            : numberArg(args.value, "value");
        if (!Number.isFinite(value) || value < 0 || (action === "scale" && (args.factor as number) < 0))
          throw new Error("Flow and scale factor must be finite and non-negative.");
        edge.value = value;
      } else {
        if (!("value" in args) && !("metadata" in args)) throw new Error("Provide value or metadata.");
        if ("value" in args) {
          const value = args.value;
          if (value !== null && !["string", "number", "boolean"].includes(typeof value))
            throw new Error("Edge value must be a scalar.");
          if (typeof value === "number") numberArg(value, "value");
          edge.value = value as typeof edge.value;
        }
        if ("metadata" in args) {
          if (args.metadata === null) delete edge.metadata;
          else {
            if (!isRecord(args.metadata)) throw new Error("metadata must be an object or null.");
            edge.metadata = { ...edge.metadata, ...args.metadata };
          }
        }
      }
      changedKeys.push(edge.source, edge.target);
    }
  } else throw new Error(`No mutation handler for /${family} ${action}.`);
  const dag = normalizeDagInput(document);
  if (chartType === "sankey" || source.diagram === "sankey") {
    const error = getSankeyError(dag.nodes, dag.edges);
    if (error) throw new Error(error);
  }
  return { dag, changedKeys: [...new Set(changedKeys)], deletedKeys, message: `Applied /${family} ${action}.` };
}
