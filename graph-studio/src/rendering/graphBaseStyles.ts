// Embedded in every graph so interactive exports retain the same rendering rules.
export const GRAPH_BASE_CSS = `
.dag-graph,
.dag-backdrop {
  fill: none;
}

.dag-edge {
  pointer-events: none;
}

.dag-node {
  cursor: pointer;
  outline: none;
}

.dag-group-background {
  fill: var(--dag-group-fill, #fffdf5);
  fill-opacity: 1;
  stroke: var(--dag-node-border, #b0bdce);
  stroke-width: 1.3;
}
.dag-graph[data-layout="compound"] .dag-edge {
  pointer-events: auto;
}
.dag-group-title {
  fill: var(--dag-text-strong, #27364c);
  font:
    600 14px "Segoe UI",
    sans-serif;
}
.dag-group-count {
  fill: var(--dag-text-muted, #677b92);
  font:
    11px "Segoe UI",
    sans-serif;
}
.dag-group-controls {
  cursor: pointer;
}
.dag-group-controls rect {
  fill: var(--dag-node-fill, #fff);
  stroke: var(--dag-node-border, #b0bdce);
}
.dag-group-controls text {
  fill: var(--dag-text-strong, #27364c);
  font:
    16px "Segoe UI",
    sans-serif;
  pointer-events: none;
}
.dag-group-controls [role="button"]:focus rect,
.dag-group-controls [role="button"]:hover rect {
  stroke: var(--studio-accent);
  stroke-width: 2;
}
.dag-graph[data-layout="compound"] .dag-node[data-type="Subgraph"] .dag-node__shape {
  stroke-width: 2;
}
.dag-graph[data-layout="compound"] .dag-node[data-type="External"] .dag-node__shape {
  stroke-dasharray: 5 3;
}
`;
