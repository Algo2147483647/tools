import { useMemo } from "react";
import { getNodeTitle } from "../graph/accessors";
import { formatRelationValue } from "../graph/relations";
import type { GraphEdge, NodeKey, NormalizedDag } from "../graph/types";

export default function NodeRelationsPanel({ graph, nodeKey }: { graph: NormalizedDag | null; nodeKey: NodeKey }) {
  const { incoming, outgoing } = useMemo(() => {
    const incoming: GraphEdge[] = [];
    const outgoing: GraphEdge[] = [];
    for (const edge of graph?.edges ?? []) {
      if (edge.target === nodeKey) incoming.push(edge);
      if (edge.source === nodeKey) outgoing.push(edge);
    }
    return { incoming, outgoing };
  }, [graph, nodeKey]);

  return (
    <div className="node-relations">
      {(
        [
          { direction: "incoming", title: "Incoming", nodeLabel: "Source node", edges: incoming },
          { direction: "outgoing", title: "Outgoing", nodeLabel: "Target node", edges: outgoing },
        ] as const
      ).map(({ direction, title, nodeLabel, edges }) => (
        <section key={direction} className="node-relations-section" aria-labelledby={`node-edges-${direction}`}>
          <h2 id={`node-edges-${direction}`} className="node-relations-heading">
            {title} <span>({edges.length})</span>
          </h2>
          {edges.length ? (
            <div className="node-relations-table-wrap" tabIndex={0} role="region" aria-label={`${title} edges`}>
              <table className="node-relations-table" aria-labelledby={`node-edges-${direction}`}>
                <thead>
                  <tr>
                    <th scope="col">{nodeLabel}</th>
                    <th scope="col">Value</th>
                    <th scope="col">Edge ID</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map((edge) => {
                    const relatedKey = direction === "incoming" ? edge.source : edge.target;
                    const relatedTitle = getNodeTitle(graph?.nodes[relatedKey] ?? {});
                    return (
                      <tr key={edge.id}>
                        <td>
                          {relatedTitle && relatedTitle !== relatedKey && (
                            <span className="node-relations-node-title">{relatedTitle}</span>
                          )}
                          <code className="node-relations-node-key">{relatedKey}</code>
                        </td>
                        <td>
                          {edge.value === undefined ? (
                            <span className="node-detail-empty">Not set</span>
                          ) : (
                            <code>{formatRelationValue(edge.value)}</code>
                          )}
                        </td>
                        <td>
                          <code>{edge.id}</code>
                          {edge.metadata && Object.keys(edge.metadata).length > 0 && (
                            <details className="node-relations-metadata">
                              <summary>Metadata</summary>
                              <pre className="node-detail-pre">{JSON.stringify(edge.metadata, null, 2)}</pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="node-detail-empty">No {direction} edges.</p>
          )}
        </section>
      ))}
    </div>
  );
}
