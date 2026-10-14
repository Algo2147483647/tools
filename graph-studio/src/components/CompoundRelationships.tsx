import { useEffect, useId, useMemo, useRef } from "react";
import { getNodeTitle } from "../graph/accessors";
import type { NormalizedDag, RelationValue } from "../graph/types";
import type { StageEdge } from "../layout/types";

export default function CompoundRelationships({
  dag,
  edge,
  onClose,
  onOpenNode,
}: {
  dag: NormalizedDag;
  edge: StageEdge;
  onClose: () => void;
  onOpenNode: (id: string) => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const originals = useMemo(() => {
    const byId = new Map(dag.edges.map((relation) => [relation.id, relation]));
    return (edge.originalEdgeIds ?? [edge.id]).map((id) => ({ id, relation: byId.get(id) }));
  }, [dag, edge]);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if ((previous instanceof HTMLElement || previous instanceof SVGElement) && previous.isConnected) previous.focus();
    };
  }, [edge.id]);
  const nodeTitle = (id: string) =>
    dag.hierarchy?.groups[id]?.title || (dag.nodes[id] && getNodeTitle(dag.nodes[id])) || id;

  return (
    <section
      className="compound-relationships"
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <h2 id={titleId}>Original relationships</h2>
          <p>
            {nodeTitle(edge.source)} → {nodeTitle(edge.target)}
          </p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close relationships">
          ×
        </button>
      </header>
      <p className="compound-relationships-count">
        {originals.length} {originals.length === 1 ? "relationship" : "relationships"} represented by this edge
      </p>
      <ol aria-label="Original graph relationships">
        {originals.map(({ id, relation }) => (
          <li key={id}>
            <code>{id}</code>
            {relation ? (
              <>
                <div className="compound-relationship-endpoints">
                  <button type="button" onClick={() => onOpenNode(relation.source)} title={relation.source}>
                    {nodeTitle(relation.source)}
                    <small>{relation.source}</small>
                  </button>
                  <span aria-label="to">→</span>
                  <button type="button" onClick={() => onOpenNode(relation.target)} title={relation.target}>
                    {nodeTitle(relation.target)}
                    <small>{relation.target}</small>
                  </button>
                </div>
                <dl>
                  <dt>Value</dt>
                  <dd>{formatRelationshipValue(relation.value)}</dd>
                </dl>
              </>
            ) : (
              <p>This relationship no longer exists in the document.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function formatRelationshipValue(value: RelationValue | undefined): string {
  if (value === undefined) return "Not specified";
  if (typeof value === "string") return value === "" ? '"" (empty string)' : value;
  return JSON.stringify(value);
}
