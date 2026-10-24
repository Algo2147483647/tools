export function timelineMarkerId(color: string): string {
  return `timeline-arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

// Embedded in the SVG so standalone exports keep all timeline styling.
export const TIMELINE_CSS = `
.timeline-export-static { display: none; }
.dag-graph[data-export="true"] .timeline-export-static { display: inline; }
.dag-graph[data-export="true"] .timeline-floating { display: none; }
.timeline-grid { stroke: var(--dag-edge); stroke-width: .7; opacity: .3; pointer-events: none; }
.timeline-track-guide { stroke: var(--dag-edge); stroke-width: 1; opacity: .25; pointer-events: none; }
.timeline-ruler-bg { fill: var(--dag-node-fill); opacity: .97; }
.timeline-axis { stroke: var(--dag-edge); stroke-width: 1; }
.timeline-axis-label { fill: var(--dag-text-soft); font: var(--dag-axis-font-style) var(--dag-axis-font-weight) var(--dag-axis-font-size) var(--dag-axis-font-family); }
.timeline-track-label { fill: var(--dag-text-strong); font: var(--dag-track-font-style) var(--dag-track-font-weight) var(--dag-track-font-size) var(--dag-track-font-family); }
.timeline-caption { fill: var(--dag-text-soft); font: var(--dag-axis-font-style) var(--dag-axis-font-weight) var(--dag-axis-font-size) var(--dag-axis-font-family); }
.timeline-node { transition: opacity .15s; }
.timeline-node__hit { fill: transparent; stroke: none; pointer-events: all; }
.timeline-node__duration { fill: var(--timeline-soft-fill, var(--dag-timeline-color)); fill-opacity: var(--timeline-soft-opacity, var(--dag-timeline-soft-opacity)); stroke: none; }
.timeline-node[data-interval-style="solid"] .timeline-node__duration { fill: var(--dag-timeline-color); fill-opacity: 1; }
.timeline-node[data-interval-style="solid"] .timeline-node__inside-title { fill: var(--timeline-text-color, white); }
.timeline-node[data-interval-style="solid"][data-interval-text-color="event"] .timeline-node__inside-title { paint-order: stroke; stroke: var(--dag-node-fill); stroke-width: 2px; stroke-linejoin: round; }
.timeline-node[data-interval-style="outline"] .timeline-node__duration { fill: var(--dag-node-fill); fill-opacity: .9; stroke: var(--timeline-border-color); stroke-width: var(--timeline-border-width); }
.timeline-node[data-interval-border="solid"] .timeline-node__duration,
.timeline-node[data-interval-border="dashed"] .timeline-node__duration { stroke: var(--timeline-border-color); stroke-width: var(--timeline-border-width); }
.timeline-node[data-interval-border="dashed"] .timeline-node__duration { stroke-dasharray: var(--dag-timeline-dash); }
.timeline-node[data-interval-border="none"] .timeline-node__duration { stroke: none; }
.timeline-node[data-selected="true"] .timeline-node__duration,
.timeline-node[data-focused="true"] .timeline-node__duration { stroke: var(--dag-timeline-color); stroke-width: var(--dag-timeline-selection-width); }
.timeline-node__point { fill: var(--timeline-marker-fill, var(--dag-timeline-color)); stroke: var(--timeline-marker-border, var(--dag-node-fill)); stroke-width: var(--timeline-marker-stroke, 1.5); }
.timeline-node__cap, .timeline-node__open { fill: none; stroke: var(--timeline-marker-fill, var(--dag-timeline-color)); stroke-width: var(--timeline-marker-stroke, 2); }
.timeline-node__unknown { fill: var(--dag-node-fill); stroke: var(--dag-text-soft); stroke-width: 1.5; }
.timeline-node__leader { fill: none; stroke: var(--timeline-leader-color, #a6abb3); stroke-width: var(--timeline-leader-width, .7); stroke-dasharray: var(--timeline-leader-dash, none); opacity: var(--timeline-leader-opacity, .32); pointer-events: none; }
.timeline-node[data-focused="true"] .timeline-node__leader,
.timeline-node[data-hovered="true"] .timeline-node__leader { stroke: var(--timeline-leader-color, #000); stroke-width: var(--timeline-leader-width, 1); stroke-dasharray: var(--timeline-leader-dash, none); stroke-linecap: round; opacity: 1; }
.timeline-node__label-bg { fill: var(--dag-node-fill); fill-opacity: var(--dag-timeline-label-opacity); stroke: transparent; stroke-width: 1; }
.timeline-node__title { fill: var(--timeline-text-color, var(--dag-text-strong)); font-family: var(--dag-title-font-family); font-size: var(--dag-title-font-size); font-style: var(--dag-title-font-style, normal); font-weight: var(--dag-title-font-weight, 400); pointer-events: none; }
.timeline-node__date { fill: var(--timeline-date-color, var(--dag-text-soft)); font: var(--dag-date-font-style) var(--dag-date-font-weight) var(--dag-date-font-size) var(--dag-date-font-family); pointer-events: none; }
.timeline-node__detail { fill: var(--timeline-text-color, var(--dag-text-soft)); font: var(--dag-detail-font-style) var(--dag-detail-font-weight) var(--dag-detail-font-size) var(--dag-detail-font-family); pointer-events: none; }
.timeline-node[data-selected="true"] .timeline-node__label-bg,
.timeline-node[data-focused="true"] .timeline-node__label-bg,
.timeline-node[data-hovered="true"] .timeline-node__label-bg,
.timeline-node:focus-visible .timeline-node__label-bg { stroke: var(--dag-timeline-color); fill: var(--dag-node-fill); fill-opacity: var(--dag-timeline-label-opacity); }
.timeline-node[data-interval-style="soft"][data-hovered="true"] .timeline-node__duration,
.timeline-node[data-interval-style="soft"][data-focused="true"] .timeline-node__duration { fill: var(--dag-timeline-color); fill-opacity: var(--dag-timeline-hover-opacity); }
.dag-graph[data-has-interactive-node="true"] .timeline-node { opacity: var(--dag-timeline-muted-opacity); }
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-connected="true"],
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-focused="true"],
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-hovered="true"] { opacity: 1; }
.dag-edge__timeline { fill: none; stroke-width: var(--dag-timeline-edge-width); stroke-linecap: round; stroke-linejoin: round; opacity: var(--dag-timeline-edge-opacity); }
.dag-edge[data-timeline-kind="reference"] .dag-edge__timeline,
.dag-edge[data-timeline-kind="part-of"] .dag-edge__timeline { stroke-dasharray: var(--dag-timeline-reference-dash); opacity: var(--dag-timeline-reference-opacity); }
.dag-edge[data-backward="true"] .dag-edge__timeline { stroke-dasharray: var(--dag-timeline-backward-dash); }
.dag-graph[data-has-interactive-node="true"] .dag-edge__timeline { opacity: var(--dag-timeline-edge-muted-opacity); }
.dag-graph .dag-edge[data-active="true"] .dag-edge__timeline { opacity: var(--dag-timeline-edge-active-opacity); stroke-width: var(--dag-timeline-edge-active-width); }
.dag-graph[data-layout="timeline"] .dag-edge__label-bg,
.dag-graph[data-layout="timeline"] .dag-edge__label-text { opacity: 0; }
.dag-graph[data-layout="timeline"] .dag-edge[data-active="true"] .dag-edge__label-bg,
.dag-graph[data-layout="timeline"] .dag-edge[data-active="true"] .dag-edge__label-text { opacity: 1; }
`.trim();
