import { resolveAppearance } from "../schema/appearanceContract";
import type { GraphAppearance } from "../schema/appearanceModel";
export type { GraphAppearance, GraphGeometryAppearance } from "../schema/appearanceModel";
import type { CSSProperties } from "react";

// Built-in styles are rendered independently of user-authored custom CSS.
export const GRAPH_EFFECTS_CSS = `
.dag-graph .dag-node__pin, .dag-graph .dag-node__pin-core { display: var(--dag-node-pin-display, inline); }
.dag-graph .dag-node__content { transform: translateX(var(--dag-node-content-shift, 0px)); }
.dag-graph .dag-node__shape { filter: var(--dag-node-shadow); }
.dag-graph .dag-node:hover .dag-node__shape,
.dag-graph .dag-node[data-hovered="true"] .dag-node__shape,
.dag-graph .dag-node[data-focused="true"] .dag-node__shape,
.dag-graph .dag-node[data-selected="true"] .dag-node__shape { filter: var(--dag-node-shadow-active); }
.dag-graph[data-density="dense"][data-dense-shadows="disable"] .dag-node .dag-node__shape { filter: none; }
.dag-edge__flow { fill: none; stroke-linecap: butt; opacity: var(--dag-sankey-opacity); transition: opacity .18s ease; pointer-events: stroke; }
.dag-edge__flow:hover, .dag-edge[data-active="true"] .dag-edge__flow { opacity: var(--dag-flow-active-opacity); }
.dag-graph[data-has-interactive-node="true"] .dag-edge__flow { opacity: var(--dag-flow-muted-opacity); }
.dag-graph[data-has-interactive-node="true"] .dag-edge[data-active="true"] .dag-edge__flow { opacity: var(--dag-flow-active-opacity); }
.dag-node__flow-label { fill: var(--dag-text-strong); font-family: var(--dag-title-font-family); font-size: var(--dag-title-font-size); font-style: var(--dag-title-font-style); font-weight: var(--dag-title-font-weight); paint-order: stroke; stroke: white; stroke-width: 4px; stroke-linejoin: round; }
.dag-node__flow-value { fill: var(--dag-text-soft); font: var(--dag-detail-font-style) var(--dag-detail-font-weight) var(--dag-detail-font-size) var(--dag-detail-font-family); }
.dag-node[data-flow="true"]:focus-visible .dag-node__shape { stroke: var(--dag-edge-active); stroke-width: 3; }
@media (prefers-reduced-motion: reduce) { .dag-graph * { transition: none !important; } }
`.trim();

export const DEFAULT_GRAPH_CSS = `
.dag-graph,
.dag-backdrop {
  fill: none;
}

.dag-graph[data-density="dense"] .dag-edge__path,
.dag-graph[data-density="dense"] .dag-node,
.dag-graph[data-density="dense"] .dag-node__glow,
.dag-graph[data-density="dense"] .dag-node__shape,
.dag-graph[data-density="dense"] .dag-node__affordance {
  transition: none;
}

.dag-stage__halo {
  fill: rgba(255, 255, 255, 0.8);
  pointer-events: none;
}

.dag-stage__lane {
  stroke: rgba(89, 107, 139, 0.12);
  stroke-width: 1;
  stroke-dasharray: 2 12;
  pointer-events: none;
}

.dag-stage__lane-label {
  fill: rgba(102, 117, 144, 0.58);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  pointer-events: none;
}

.dag-edge {
  pointer-events: none;
}

.dag-edge__path {
  fill: none;
  stroke: var(--dag-edge);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
  transition: stroke 0.18s ease, stroke-width 0.18s ease, opacity 0.18s ease;
}

.dag-edge[data-active="true"] .dag-edge__path {
  stroke: var(--dag-edge-active);
  stroke-width: 2.35;
  opacity: 1;
}

.dag-edge__label-text {
  fill: var(--dag-text-soft);
  font-size: 10px;
  font-weight: 700;
}

.dag-edge__label-bg {
  fill: rgba(255, 255, 255, 0.84);
  stroke: rgba(99, 118, 148, 0.12);
  stroke-width: 1;
}

.dag-node {
  cursor: pointer;
  outline: none;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.dag-node__glow {
  fill: var(--dag-node-glow, rgba(44, 83, 166, 0.08));
  opacity: 0;
  transition: opacity 0.18s ease;
}

.dag-node__shape {
  fill: var(--dag-node-fill);
  stroke: var(--dag-node-border);
  stroke-width: 1.25;
  filter: drop-shadow(0 10px 18px rgba(24, 39, 64, 0.06));
  transition: fill 0.18s ease, stroke 0.18s ease, transform 0.18s ease, filter 0.18s ease;
}

.dag-node__pin {
  fill: var(--dag-node-pin-fill, rgba(40, 95, 223, 0.14));
  stroke: var(--dag-node-pin-stroke, rgba(40, 95, 223, 0.24));
  stroke-width: 0.75;
}

.dag-node__pin-core {
  fill: var(--dag-node-pin-core, rgba(40, 95, 223, 0.78));
}

.dag-node__title {
  fill: var(--dag-text-strong);
  font-family: var(--dag-title-font-family);
  font-size: var(--dag-title-font-size);
  font-style: var(--dag-title-font-style);
  font-weight: var(--dag-title-font-weight);
  letter-spacing: 0;
}

.dag-node__detail {
  fill: rgba(67, 79, 100, 0.88);
  font-size: 10px;
}

.dag-node__affordance {
  opacity: 0;
  transform: translateY(4px);
  transform-origin: center;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dag-node__affordance-bg {
  fill: var(--dag-node-affordance-bg, rgba(235, 241, 251, 0.94));
  stroke: rgba(70, 96, 148, 0.16);
  stroke-width: 1;
}

.dag-node__affordance-text {
  fill: var(--dag-node-affordance-text, rgba(46, 82, 152, 0.76));
  font-size: 8px;
  font-weight: 700;
}

.dag-node[data-root="true"] .dag-node__shape {
  stroke: var(--dag-node-border-strong);
  stroke-width: 1.7;
  fill: var(--dag-node-root-fill, var(--dag-node-fill));
}

.dag-node[data-root="true"] .dag-node__glow {
  opacity: 1;
}

.dag-node:hover .dag-node__shape,
.dag-node[data-hovered="true"] .dag-node__shape,
.dag-node[data-focused="true"] .dag-node__shape,
.dag-node[data-selected="true"] .dag-node__shape {
  stroke: var(--dag-node-active-border, rgba(39, 79, 152, 0.48));
  fill: var(--dag-node-active-fill, var(--dag-node-fill));
  filter: drop-shadow(0 14px 26px rgba(29, 52, 97, 0.1));
}

.dag-node:hover .dag-node__glow,
.dag-node[data-hovered="true"] .dag-node__glow,
.dag-node[data-focused="true"] .dag-node__glow {
  opacity: 1;
}

.dag-node:hover .dag-node__affordance,
.dag-node[data-hovered="true"] .dag-node__affordance,
.dag-node[data-focused="true"] .dag-node__affordance {
  opacity: 1;
  transform: translateY(0);
}

.dag-node:hover .dag-node__pin,
.dag-node[data-selected="true"] .dag-node__pin,
.dag-node[data-hovered="true"] .dag-node__pin,
.dag-node[data-focused="true"] .dag-node__pin {
  fill: var(--dag-node-pin-fill, rgba(40, 95, 223, 0.18));
}

.dag-graph[data-has-interactive-node="true"] .dag-edge__path {
  opacity: 0.3;
}

.dag-graph[data-has-interactive-node="true"] .dag-edge[data-active="true"] .dag-edge__path {
  opacity: 1;
}

.dag-graph[data-has-interactive-node="true"] .dag-node {
  opacity: 0.48;
}

.dag-graph[data-has-interactive-node="true"] .dag-node[data-connected="true"],
.dag-graph[data-has-interactive-node="true"] .dag-node[data-hovered="true"],
.dag-graph[data-has-interactive-node="true"] .dag-node[data-focused="true"] {
  opacity: 1;
}

.dag-graph[data-borderless="true"] .dag-node__shape {
  stroke: transparent;
}

`.trim();

export const DEFAULT_GRAPH_APPEARANCE: GraphAppearance = resolveAppearance(undefined);
export function sanitizeGraphAppearance(input: unknown): GraphAppearance {
  return resolveAppearance(input ?? undefined);
}

export function appearanceToStageStyle(appearance: GraphAppearance): CSSProperties {
  const { nodeShadow, shadowBlur, shadowOffset, shadowOpacity, sankeyLinkOpacity } = appearance.display;
  const shadow = (active: boolean) =>
    !nodeShadow
      ? "none"
      : `drop-shadow(0 1px 1px rgba(${appearance.cssVars["--dag-shadow-color"]}, ${shadowOpacity / 200})) drop-shadow(0 ${shadowOffset * (active ? Number(appearance.cssVars["--dag-shadow-active-offset-scale"]) : 1)}px ${shadowBlur * (active ? Number(appearance.cssVars["--dag-shadow-active-blur-scale"]) : 1)}px rgba(${appearance.cssVars["--dag-shadow-color"]}, ${shadowOpacity / 100}))`;
  return {
    ...appearance.cssVars,
    "--dag-node-pin-display": appearance.display.showNodeDots ? "inline" : "none",
    "--dag-node-content-shift": appearance.display.showNodeDots ? "0px" : "-32px",
    "--dag-node-shadow": shadow(false),
    "--dag-node-shadow-active": shadow(true),
    "--dag-sankey-opacity": sankeyLinkOpacity / 100,
  } as CSSProperties;
}
