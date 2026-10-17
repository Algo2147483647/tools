// Render the approved default from the same configuration used by the application.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GraphStage from "../src/rendering/GraphStage";
import { getDefaultChartStyle } from "../src/state/chartStyles";
import { normalizeDagInput } from "../src/graph/normalize";
import { buildStageData } from "../src/layout/stage-layout";

const graph = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: {
    request: { title: "Receive request", define: "Accept the incoming payload" },
    validate: { title: "Validate fields", define: "Check format and required values" },
    auth: { title: "Authorize", define: "Confirm access to this resource" },
    process: { title: "Run business logic", define: "Apply rules to the accepted data" },
    cache: { title: "Read cache", define: "Reuse a previously computed result" },
    reply: { title: "Return response", define: "Send the result to the client" },
  },
  edges: [
    ["request", "validate", "payload"],
    ["request", "auth", "identity"],
    ["validate", "process", "valid"],
    ["auth", "process", "allowed"],
    ["auth", "cache", "lookup"],
    ["process", "reply", "result"],
    ["cache", "reply", "hit"],
  ].map(([source, target, value]) => ({ id: `${source}-${target}`, source, target, value })),
});
const variants = [
  {
    id: "default",
    name: "默认",
    english: "Default",
    purpose: "无边框 · 无详情 · 等宽节点 · 保留 dot",
    detail: false,
    labels: false,
    gap: 64,
    row: 28,
    height: 48,
    width: 240,
    radius: 16,
    font: 15,
    weight: 500,
    shadow: true,
    dots: true,
    edge: "#e1e3e6",
    extra: ".dag-graph .dag-edge .dag-edge__path{stroke-width:1px}",
  },
];
const noop = () => {};
const rendered = variants.map((variant) => {
  const style = getDefaultChartStyle("node-link");
  const { appearance } = style;
  const stage = buildStageData({
    dag: graph,
    selection: { type: "full" },
    layoutMode: "sugiyama",
    appearance,
    showNodeDetail: style.showNodeDetail,
    alignNodeWidthsToMax: style.alignNodeWidthsToMax,
  })!;
  let svg = renderToStaticMarkup(
    createElement(GraphStage, {
      stage,
      appearance,
      focusedKey: null,
      hideNodeBorders: style.hideNodeBorders,
      svgRef: createRef<SVGSVGElement>(),
      onNodeClick: noop,
      onNodeDoubleClick: noop,
      onNodeContextMenu: noop,
      onBackgroundContextMenu: noop,
      onFocusChange: noop,
    }),
  );
  const left = Math.min(...stage.nodes.map((node) => node.x - node.width / 2)) - 32;
  const top = Math.min(...stage.nodes.map((node) => node.y - node.height / 2)) - 40;
  const right = Math.max(...stage.nodes.map((node) => node.x + node.width / 2)) + 32;
  const bottom = Math.max(...stage.nodes.map((node) => node.y + node.height / 2)) + 40;
  svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${left} ${top} ${right - left} ${bottom - top}"`);
  return { ...variant, svg, canvasWidth: stage.stageWidth, canvasHeight: stage.stageHeight };
});
const template = readFileSync(new URL("./node-link-preset-demo.template.html", import.meta.url), "utf8");
mkdirSync(new URL("../docs/design/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../docs/design/node-link-presets.html", import.meta.url),
  template.replace(/\/\*PRESET_DATA\*\/\s*\[\]/, JSON.stringify(rendered).replace(/</g, "\\u003c")),
  "utf8",
);
console.log("Created docs/design/node-link-presets.html (one Node-link default preset).");
