import { DEFAULT_GRAPH_APPEARANCE, sanitizeGraphAppearance } from "./appearance";

export const NODE_LINK_DEFAULT_DISPLAY = {
  showNodeDetail: false,
  hideNodeBorders: true,
  alignNodeWidthsToMax: true,
};

export const NODE_LINK_DEFAULT_APPEARANCE = sanitizeGraphAppearance({
  ...DEFAULT_GRAPH_APPEARANCE,
  layout: {
    ...DEFAULT_GRAPH_APPEARANCE.layout,
    columnGap: 64,
    rowGap: 28,
    edgeLaneGap: 12,
    nodeHeight: 48,
    maxNodeWidth: 240,
  },
  display: {
    ...DEFAULT_GRAPH_APPEARANCE.display,
    nodeCornerRadius: 16,
    nodeShadow: true,
    shadowBlur: 8,
    shadowOffset: 3,
    shadowOpacity: 10,
    showNodeDots: true,
    showEdgeLabels: false,
    edgeArrowStyle: "open",
  },
  cssVars: {
    ...DEFAULT_GRAPH_APPEARANCE.cssVars,
    "--dag-title-font-family": '"Times New Roman", serif',
    "--dag-title-font-size": "15px",
    "--dag-title-font-weight": "500",
    "--dag-edge": "#e1e3e6",
    "--dag-edge-active": "#a9afb8",
  },
  css: `${DEFAULT_GRAPH_APPEARANCE.css}\n.dag-backdrop { display: none; }\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }`,
});
