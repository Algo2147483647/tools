import type { NormalizedDag } from "../../graph/types";
import { queryPage, textArg, type QueryResult } from "../domains";

export function inspectGraph(dag: NormalizedDag, action: string, args: Record<string, unknown>): QueryResult {
  const keys = Object.keys(dag.nodes).sort();
  const requireNode = (id: unknown) => {
    const key = textArg(id, "id");
    if (!Object.prototype.hasOwnProperty.call(dag.nodes, key)) throw new Error(`Unknown node ${key}.`);
    return key;
  };
  if (action === "graph") {
    const nodes = queryPage(
      "graph_inspect",
      keys.map((id) => ({ id, title: dag.nodes[id].title, type: dag.nodes[id].type })),
      args,
    );
    return {
      ...nodes,
      data: {
        counts: { nodes: keys.length, edges: dag.edges.length, hierarchyEdges: dag.hierarchy_edges?.length ?? 0 },
        metadata: dag.metadata,
        nodes: nodes.data,
      },
    };
  }
  if (action === "node") {
    const id = requireNode(args.id);
    const edges = queryPage(
      "node_inspect",
      dag.edges.filter((e) => e.source === id || e.target === id),
      args,
    );
    return {
      ...edges,
      data: {
        id,
        fields:
          args.field === undefined
            ? dag.nodes[id]
            : { [String(args.field)]: dag.nodes[id][String(args.field)] ?? null },
        edges: edges.data,
      },
    };
  }
  if (action === "search") {
    const query = textArg(args.query, "query").toLocaleLowerCase();
    const matches = keys
      .map((id) => {
        const title = String(dag.nodes[id].title ?? "").toLocaleLowerCase();
        const key = id.toLocaleLowerCase();
        const score =
          key === query || title === query
            ? 100
            : key.startsWith(query) || title.startsWith(query)
              ? 80
              : key.includes(query) || title.includes(query)
                ? 60
                : JSON.stringify(dag.nodes[id]).toLocaleLowerCase().includes(query)
                  ? 20
                  : 0;
        return { id, title: dag.nodes[id].title, type: dag.nodes[id].type, score };
      })
      .filter((n) => n.score)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return queryPage("node_search", matches, args);
  }
  const start = requireNode(action === "path" ? args.source : args.id);
  const target = action === "path" ? requireNode(args.target) : null;
  const visited = new Map([[start, 0]]),
    previous = new Map<string, string>();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      depth = visited.get(id)!;
    if (action === "neighbors" && depth >= Number(args.depth ?? 1)) continue;
    if (id === target) break;
    const adjacent = dag.edges.flatMap((e) =>
      e.source === id ? [e.target] : action === "neighbors" && e.target === id ? [e.source] : [],
    );
    for (const next of adjacent)
      if (!visited.has(next)) {
        visited.set(next, depth + 1);
        previous.set(next, id);
        queue.push(next);
      }
  }
  if (action === "neighbors")
    return queryPage(
      "graph_neighbors",
      [...visited].filter(([id]) => id !== start).map(([id, distance]) => ({ id, distance })),
      args,
    );
  const path: string[] = [];
  if (target && visited.has(target)) {
    let cursor: string | undefined = target;
    while (cursor) {
      path.push(cursor);
      cursor = previous.get(cursor);
    }
    path.reverse();
  }
  return {
    command: "graph_path",
    data: { found: path.length > 0, nodes: path, edgeCount: path.length ? path.length - 1 : null },
  };
}
