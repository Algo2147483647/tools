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

.dag-node__affordance--compact .dag-node__affordance-bg {
  stroke: none;
}

.dag-node__affordance--compact .dag-node__affordance-text {
  font: 500 7px "Segoe UI", sans-serif;
  letter-spacing: 0;
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
  font: 16px "Segoe UI", sans-serif;
  pointer-events: none;
}
.dag-group-controls [role="button"] { cursor: pointer; }
.dag-group-controls [role="button"]:focus { outline: none; }
.dag-group-controls [role="button"]:focus-visible rect { stroke: #456ef0; stroke-width: 2; }
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
.dag-graph .spatial-node {
  cursor: pointer;
}
.dag-graph .spatial-selection {
  opacity: 0;
}
.dag-graph .spatial-label {
  font: var(--dag-title-font-size, 12px) var(--dag-title-font-family, sans-serif);
  font-style: var(--dag-title-font-style);
  font-weight: var(--dag-title-font-weight);
  unicode-bidi: plaintext;
  fill: var(--dag-text-strong, #34475d);
  paint-order: stroke;
  stroke: white;
  stroke-width: 3px;
  stroke-linejoin: round;
}
.dag-graph .spatial-label--on-focus {
  display: none;
}
.dag-graph .spatial-node:is([data-hovered="true"], [data-focused="true"], :focus) .spatial-label {
  display: block;
}
.dag-graph .spatial-node:is([data-hovered="true"], [data-focused="true"], :focus) .spatial-selection {
  opacity: 1;
}
.dag-graph[data-layout="spatial"] .dag-edge__path {
  stroke-width: 1;
  marker-end: none;
}
.spatial-guides path {
  fill: none;
  stroke: #c7d4e1;
  stroke-width: 0.7;
}
.spatial-guides text {
  fill: #8292a3;
  font: 10px sans-serif;
  text-anchor: middle;
}

`;
