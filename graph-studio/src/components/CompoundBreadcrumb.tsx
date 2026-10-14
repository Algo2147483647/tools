import { useEffect, useMemo, useRef } from "react";
import { indexHierarchy, isHierarchyDescendant } from "../graph/hierarchy";
import type { CompoundView, NormalizedDag } from "../graph/types";
import "../styles/compound-navigation.css";

export default function CompoundBreadcrumb({
  dag,
  view,
  onEnter,
  className = "",
}: {
  dag: NormalizedDag;
  view: CompoundView;
  onEnter: (id: string | null) => void;
  className?: string;
}) {
  const index = useMemo(() => indexHierarchy(dag), [dag]);
  const pathRef = useRef<HTMLElement>(null);
  const groups = dag.hierarchy?.groups ?? {};
  const focus =
    view.focusGroupId && Object.prototype.hasOwnProperty.call(groups, view.focusGroupId) ? view.focusGroupId : null;
  const path: string[] = [];
  let ancestor = focus;
  while (ancestor) {
    path.unshift(ancestor);
    ancestor = index.parent.get(ancestor) ?? null;
  }
  const nodeCount = focus ? (index.leafCount.get(focus) ?? 0) : Object.keys(dag.nodes).length;
  const groupCount = Object.keys(groups).filter(
    (id) => id !== focus && (!focus || isHierarchyDescendant(index, id, focus)),
  ).length;
  useEffect(() => {
    if (pathRef.current) pathRef.current.scrollLeft = pathRef.current.scrollWidth;
  }, [focus]);
  return (
    <div className={`compound-canvas-breadcrumb ${className}`.trim()}>
      <nav ref={pathRef} aria-label="Canvas subgraph path">
        <ol>
          <li>
            <button onClick={() => onEnter(null)} aria-current={!focus ? "location" : undefined}>
              All
            </button>
          </li>
          {path.map((id) => (
            <li key={id}>
              <span aria-hidden="true">/</span>
              <button
                title={groups[id].title || id}
                onClick={() => onEnter(id)}
                aria-current={id === focus ? "location" : undefined}
              >
                {groups[id].title || id}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <span className="compound-scope-count">
        {nodeCount} {nodeCount === 1 ? "node" : "nodes"} · {groupCount} {groupCount === 1 ? "group" : "groups"}
      </span>
    </div>
  );
}
