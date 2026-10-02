import { type GraphAppearance, appearanceToStageStyle, GRAPH_EFFECTS_CSS } from "../../graph/appearance";
import type { GraphChartType } from "../../graph/types";

export default function AppearancePreview({
  appearance,
  chartType,
  hideNodeBorders,
  showNodeDetail,
}: {
  appearance: GraphAppearance;
  chartType: GraphChartType;
  hideNodeBorders: boolean;
  showNodeDetail: boolean;
}) {
  const sankey = chartType === "sankey";
  const width = appearance.display.sankeyNodeWidth;
  return (
    <section className="settings-preview-card">
      <div>
        <span className="eyebrow">LIVE PREVIEW</span>
        <small>{sankey ? "Sankey" : "Node-link"} appearance</small>
      </div>
      <svg
        viewBox="0 0 600 145"
        className="settings-graph-preview"
        style={appearanceToStageStyle(appearance)}
        role="img"
        aria-label={`${sankey ? "Sankey" : "Node-link"} appearance preview`}
      >
        <style>{`${appearance.css}\n${GRAPH_EFFECTS_CSS}`}</style>
        <g className="dag-graph" data-borderless={hideNodeBorders ? "true" : "false"}>
          {sankey ? (
            <>
              <g className="dag-edge">
                <path
                  className="dag-edge__flow"
                  d={`M${92 + width} 55C260 55 270 37 420 37`}
                  stroke="#5386ce"
                  strokeWidth="36"
                />
                {appearance.display.showEdgeLabels && (
                  <text className="dag-edge__label-text" x="300" y="40">
                    60
                  </text>
                )}
              </g>
              <g className="dag-edge">
                <path
                  className="dag-edge__flow"
                  d={`M${92 + width} 85C260 85 270 107 420 107`}
                  stroke="#54a89c"
                  strokeWidth="24"
                />
                {appearance.display.showEdgeLabels && (
                  <text className="dag-edge__label-text" x="300" y="103">
                    40
                  </text>
                )}
              </g>
              {[
                { x: 92, y: 37, h: 60, color: "#5386ce", title: "Source", value: "100" },
                { x: 420, y: 19, h: 36, color: "#5386ce", title: "Useful", value: "60" },
                { x: 420, y: 95, h: 24, color: "#54a89c", title: "Losses", value: "40" },
              ].map((node) => (
                <g className="dag-node" key={node.title}>
                  <rect
                    className="dag-node__shape"
                    x={node.x}
                    y={node.y}
                    width={width}
                    height={node.h}
                    rx="2"
                    style={{ fill: node.color, stroke: node.color }}
                  />
                  <text
                    className="dag-node__flow-label"
                    x={node.x === 92 ? 80 : node.x + width + 12}
                    y={node.y + node.h / 2 - 3}
                    textAnchor={node.x === 92 ? "end" : "start"}
                  >
                    {node.title}
                    <tspan className="dag-node__flow-value" x={node.x === 92 ? 80 : node.x + width + 12} dy="18">
                      {node.value}
                    </tspan>
                  </text>
                </g>
              ))}
            </>
          ) : (
            <>
              <g className="dag-edge">
                <path className="dag-edge__path" d="M220 74H365" />
                {appearance.display.showEdgeLabels && (
                  <text className="dag-edge__label-text" x="280" y="58">
                    supports
                  </text>
                )}
              </g>
              {[
                { x: 35, label: "Concept", detail: "A connected idea" },
                { x: 365, label: "Theorem", detail: "A derived result" },
              ].map((node) => (
                <g key={node.label} className="dag-node" transform={`translate(${node.x} 39)`}>
                  <rect className="dag-node__shape" width="185" height="70" rx="12" />
                  <circle className="dag-node__pin" cx="20" cy="29" r="5" fill="var(--dag-text-strong)" />
                  <text className="dag-node__title" x="36" y="34">
                    {node.label}
                  </text>
                  {showNodeDetail && (
                    <text x="36" y="52" fill="var(--dag-text-soft)" fontSize="11">
                      {node.detail}
                    </text>
                  )}
                </g>
              ))}
            </>
          )}
        </g>
      </svg>
    </section>
  );
}
