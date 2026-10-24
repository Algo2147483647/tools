export const CHART_DEFAULTS = {
  "node-link": {
    showNodeDetail: false,
    alignNodeWidthsToMax: true,
    appearance: {
      layout: {
        columnGap: 64,
        rowGap: 28,
        edgeLaneGap: 12,
        nodeHeight: 48,
        nodeWidthRange: [188, 240],
      },
      display: {
        edgeArrowStyle: "open",
        nodeCornerRadius: 16,
        shadowOpacity: 10,
      },
      cssVars: {
        "--dag-edge": "#e1e3e6",
        "--dag-edge-active": "#8b1e2d",
        "--dag-title-font-family": '"Times New Roman", serif',
        "--dag-title-font-weight": "500",
      },
      css: ".dag-backdrop { display: none; }\n.dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }",
    },
  },
  compound: {
    showNodeDetail: false,
    alignNodeWidthsToMax: true,
    appearance: {
      layout: {
        columnGap: 24,
        rowGap: 24,
        nodeHeight: 100,
        nodeWidthRange: [200, 200],
      },
      display: {
        titleAlign: "center",
        titleWrap: true,
        edgeArrowStyle: "open",
        showNodeDots: false,
        showGroupBorders: false,
        showGroupStats: false,
        nodeCornerRadius: 20,
      },
      cssVars: {
        "--dag-edge": "#cccccc",
        "--dag-edge-active": "#cc0000",
        "--dag-title-font-family": '"Times New Roman", serif',
        "--dag-title-font-size": "22px",
      },
      css: ".dag-graph .dag-edge .dag-edge__path { stroke-width: 1px; }",
    },
  },
  timeline: {
    showNodeDetail: false,
    appearance: {
      cssVars: {
        "--dag-title-font-size": "13px",
      },
    },
  },
  sankey: {
    appearance: {
      cssVars: {},
    },
  },
  spatial: {
    showNodeDetail: false,
    appearance: {
      cssVars: {
        "--dag-title-font-size": "12px",
      },
    },
  },
};
