import { describeCapabilities, hasCapability } from "../../console/capabilities";
import { inspectDomain } from "../../console/domains";
import { getConsoleCommandReference } from "../../console/reference";
import {
  getCustomFieldNames,
  getNodeChildren,
  getNodeDefine,
  getNodeParents,
  getNodeTitle,
  getNodeType,
} from "../../graph/accessors";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import { getRelationKeys } from "../../graph/relations";
import type {
  GraphChartType,
  GraphLayoutMode,
  GraphMode,
  GraphSelection,
  NodeKey,
  NormalizedDag,
} from "../../graph/types";
import type { AiGraphContext } from "../types";

export function buildAiGraphContext({
  dag,
  mode,
  layoutMode,
  chartType = "node-link",
  selection,
  contextNodeKey,
  appearance,
}: {
  dag: NormalizedDag | null;
  mode: GraphMode;
  layoutMode: GraphLayoutMode;
  chartType?: GraphChartType;
  selection: GraphSelection | null;
  contextNodeKey: NodeKey | null;

  appearance: GraphAppearance;
}): AiGraphContext {
  const commandReference = getConsoleCommandReference({ dag, chartType })
    .filter((command) => !command.label.startsWith("/compound-layout"))
    .map((command) => `${command.label}: ${command.help}`)
    .join("\n");

  if (!dag) {
    return {
      commandReference,
      summary: [
        "No graph is currently loaded.",
        `Application mode: ${mode}`,
        `Chart type: ${chartType}. Layout: ${chartType === "node-link" ? layoutMode : chartType}.`,
        formatAppearanceSummary(appearance),
        "Console commands are available for help and graph mutation after a graph is loaded.",
      ].join("\n"),
    };
  }

  const keys = Object.keys(dag.nodes).sort((left, right) => left.localeCompare(right));
  const edgeCount = dag.edges.length;
  const focused = selection?.type === "node" ? [selection.key] : selection?.type === "forest" ? selection.keys : [];
  const relevantKeys = [...new Set([...(contextNodeKey ? [contextNodeKey] : []), ...focused, ...keys])]
    .filter((k) => dag.nodes[k])
    .slice(0, 60);
  const domain: Record<string, unknown> = {};
  for (const family of ["group", "timeline", "flow", "space"] as const) {
    if (hasCapability({ dag, chartType }, family)) {
      try {
        domain[family] = inspectDomain(
          dag,
          { type: "domain", family, action: "inspect", args: { limit: 20 }, line: 1 },
          Date.now(),
        );
      } catch (error) {
        domain[family] = { error: error instanceof Error ? error.message : "Invalid domain data" };
      }
    }
  }
  const selectionText = formatSelection(selection);
  const nodeLines = relevantKeys.flatMap((key) => formatNodeSummary(key, dag));
  const nodeIndexLines = relevantKeys.map((key) => formatNodeIndexLine(key, dag));

  return {
    capabilities: describeCapabilities({ dag, chartType }),
    domain,
    commandReference,
    summary: [
      `Graph has ${keys.length} node${keys.length === 1 ? "" : "s"} and ${edgeCount} directed edge${edgeCount === 1 ? "" : "s"}.`,
      dag.diagram === "sankey"
        ? "Sankey document: edge values are finite, non-negative numeric flows; cycles are shown as return flows. Use numeric weights with /edge. Node colors can use a six-digit hex color field."
        : "",
      `Application mode: ${mode}`,
      `Chart type: ${chartType}. Layout: ${chartType === "node-link" ? layoutMode : chartType}.`,
      formatAppearanceSummary(appearance),
      `Current console context node: ${contextNodeKey || "(unset)"}`,
      `Current selection: ${selectionText}`,
      `Context includes ${relevantKeys.length} of ${keys.length} nodes; query for omitted facts.`,
      "Node lookup index:",
      ...nodeIndexLines,
      "Nodes:",
      ...nodeLines,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function formatAppearanceSummary(appearance: GraphAppearance): string {
  const vars = Object.entries(appearance.cssVars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  return [
    "Appearance can be edited with /appearance-set, /style-var, /style-css, /style-preset, and /style-reset.",
    "Stable SVG selectors: .dag-graph, .dag-node, .dag-node__shape, .dag-node__title, .dag-node__detail, .dag-edge, .dag-edge__path, .dag-stage__lane.",
    'Useful data selectors: .dag-node[data-type="service"], .dag-node[data-root="true"], .dag-edge[data-weight="2"], .dag-edge[data-active="true"].',
    `Appearance layout: ${JSON.stringify(appearance)}`,
    `Appearance display: ${JSON.stringify(appearance.display)}`,
    "Appearance cssVars:",
    vars,
  ].join("\n");
}

function formatSelection(selection: GraphSelection | null): string {
  if (!selection) {
    return "(none)";
  }
  if (selection.type === "node") {
    return `node ${selection.key}`;
  }
  if (selection.type === "full") {
    return "full graph";
  }
  return `${selection.type} ${selection.keys.join(", ")}`;
}

function formatNodeSummary(key: NodeKey, dag: NormalizedDag): string[] {
  const node = dag.nodes[key];
  const parents = getRelationKeys(getNodeParents(node));
  const children = getRelationKeys(getNodeChildren(node));
  const title = getNodeTitle(node);
  const type = getNodeType(node);
  const define = getNodeDefine(node);
  const customFields = getCustomFieldNames(node);

  return [
    `- ${key}`,
    `  title: ${formatPreview(title)}`,
    `  type: ${formatPreview(type)}`,
    `  define: ${formatPreview(define)}`,
    `  parents: ${parents.length ? parents.join(", ") : "(none)"}`,
    `  children: ${children.length ? children.join(", ") : "(none)"}`,
    customFields.length
      ? `  custom fields: ${JSON.stringify(Object.fromEntries(customFields.map((name) => [name, node[name]]))).slice(0, 1800)}`
      : "",
  ].filter(Boolean);
}

function formatNodeIndexLine(key: NodeKey, dag: NormalizedDag): string {
  const node = dag.nodes[key];
  const title = getNodeTitle(node);
  const type = getNodeType(node);
  return `- ${key} | title: ${formatPreview(title)} | type: ${formatPreview(type)}`;
}

function formatPreview(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "(empty)";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 1200 ? text.slice(0, 1200) + "…" : text;
}
