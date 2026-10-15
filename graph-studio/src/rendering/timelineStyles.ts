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
.timeline-axis-label { fill: var(--dag-text-soft); font: 11px "IBM Plex Mono", Consolas, monospace; }
.timeline-track-label { fill: var(--dag-text-strong); font: 600 12px "IBM Plex Sans", "Segoe UI", sans-serif; }
.timeline-caption { fill: var(--dag-text-soft); font: 11px "IBM Plex Sans", "Segoe UI", sans-serif; }
.timeline-node { transition: opacity .15s; }
.timeline-node__hit { fill: transparent; stroke: none; pointer-events: all; }
.timeline-node__duration { fill: var(--dag-timeline-color); fill-opacity: .55; stroke: none; }
.timeline-node__point { fill: var(--dag-timeline-color); stroke: var(--dag-node-fill); stroke-width: 1.5; }
.timeline-node__cap, .timeline-node__open { fill: none; stroke: var(--dag-timeline-color); stroke-width: 2; }
.timeline-node__unknown { fill: var(--dag-node-fill); stroke: var(--dag-text-soft); stroke-width: 1.5; }
.timeline-node__leader { fill: none; stroke: #a6abb3; stroke-width: .7; opacity: .32; pointer-events: none; }
.timeline-node[data-focused="true"] .timeline-node__leader,
.timeline-node[data-hovered="true"] .timeline-node__leader { stroke: #000; stroke-width: 1; stroke-dasharray: 0 2.2; stroke-linecap: round; opacity: 1; }
.timeline-node__label-bg { fill: var(--dag-node-fill); fill-opacity: .65; stroke: transparent; stroke-width: 1; }
.timeline-node__title { fill: var(--dag-text-strong); font-family: var(--dag-title-font-family); font-size: 13px; font-weight: var(--dag-title-font-weight, 400); pointer-events: none; }
.timeline-node__date { fill: var(--dag-text-soft); font: 10px "IBM Plex Mono", Consolas, monospace; pointer-events: none; }
.timeline-node__detail { fill: var(--dag-text-soft); font: 10px "IBM Plex Sans", "Segoe UI", sans-serif; pointer-events: none; }
.timeline-node[data-selected="true"] .timeline-node__label-bg,
.timeline-node[data-focused="true"] .timeline-node__label-bg,
.timeline-node[data-hovered="true"] .timeline-node__label-bg,
.timeline-node:focus-visible .timeline-node__label-bg { stroke: var(--dag-timeline-color); fill: var(--dag-node-fill); fill-opacity: .65; }
.timeline-node[data-hovered="true"] .timeline-node__duration, .timeline-node[data-focused="true"] .timeline-node__duration { fill-opacity: .85; }
.dag-graph[data-has-interactive-node="true"] .timeline-node { opacity: .28; }
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-connected="true"],
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-focused="true"],
.dag-graph[data-has-interactive-node="true"] .timeline-node[data-hovered="true"] { opacity: 1; }
.dag-edge__timeline { fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; opacity: .55; }
.dag-edge[data-timeline-kind="reference"] .dag-edge__timeline,
.dag-edge[data-timeline-kind="part-of"] .dag-edge__timeline { stroke-dasharray: 3 5; opacity: .25; }
.dag-edge[data-backward="true"] .dag-edge__timeline { stroke-dasharray: 6 3; }
.dag-graph[data-has-interactive-node="true"] .dag-edge__timeline { opacity: .07; }
.dag-graph .dag-edge[data-active="true"] .dag-edge__timeline { opacity: 1; stroke-width: 2.4; }
.dag-graph[data-layout="timeline"] .dag-edge__label-bg,
.dag-graph[data-layout="timeline"] .dag-edge__label-text { opacity: 0; }
.dag-graph[data-layout="timeline"] .dag-edge[data-active="true"] .dag-edge__label-bg,
.dag-graph[data-layout="timeline"] .dag-edge[data-active="true"] .dag-edge__label-text { opacity: 1; }
`.trim();
