import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ELK from "elkjs/lib/elk.bundled.js";
import GraphStage from "../src/rendering/GraphStage";
import { buildCompoundStage } from "../src/layout/compound-layout";
import { DEFAULT_GRAPH_APPEARANCE } from "../src/graph/appearance";
import { buildHtmlDocument, buildHtmlPayload, prepareHtmlSvg } from "../src/rendering/export-html";
import {
  buildFlatPreviewStage,
  compoundPreviewInput,
  INITIAL_PREVIEW_VIEW,
  PREVIEW_GRAPHS,
  previewGeometry,
} from "../src/components/settings/previewModel";
import type { GraphChartType } from "../src/graph/types";

const root = createRoot(document.getElementById("original")!);
const frame = document.getElementById("viewer") as HTMLIFrameElement;
const result = document.getElementById("results")!;
const lines: string[] = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const properties = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "filter",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "display",
  "visibility",
];
const selectors =
  ".dag-node, .dag-node *, .dag-edge, .dag-edge *, .dag-group-background, .dag-group-title, .dag-group-count";
const styles = (svg: SVGSVGElement) =>
  [...svg.querySelectorAll(selectors)].map((el) => {
    const style = el.ownerDocument.defaultView!.getComputedStyle(el);
    return {
      name: `${el.tagName}.${el.getAttribute("class") || ""}`,
      values: properties.map((p) => style.getPropertyValue(p)),
    };
  });
async function run() {
  for (const chartType of ["node-link", "compound", "sankey", "timeline"] as GraphChartType[]) {
    for (const custom of [false, true]) {
      const appearance = structuredClone(DEFAULT_GRAPH_APPEARANCE);
      if (custom) {
        appearance.cssVars["--dag-edge-active"] = "#a82750";
        appearance.cssVars["--dag-text-strong"] = "#523412";
        appearance.cssVars["--dag-title-font-weight"] = "400";
        appearance.css += '\n.dag-node[data-focused="true"] .dag-node__shape {stroke:#b43a72;stroke-width:2.5px;}';
      }
      const geometry = previewGeometry({
        chartType,
        layoutMode: "sugiyama",
        appearance,
        showNodeDetail: true,
        alignNodeWidthsToMax: false,
        view: INITIAL_PREVIEW_VIEW,
      });
      const stage =
        chartType === "compound"
          ? await buildCompoundStage(compoundPreviewInput(geometry), new ELK())
          : buildFlatPreviewStage(geometry)!;
      const ref = React.createRef<SVGSVGElement>();
      const noop = () => {};
      const render = (focusedKey: string | null) =>
        flushSync(() =>
          root.render(
            <GraphStage
              stage={stage}
              appearance={appearance}
              focusedKey={focusedKey}
              hideNodeBorders={false}
              svgRef={ref}
              onNodeClick={noop}
              onNodeDoubleClick={noop}
              onNodeContextMenu={noop}
              onBackgroundContextMenu={noop}
              onFocusChange={noop}
            />,
          ),
        );
      render(null);
      await pause();
      const source = ref.current!;
      source.style.width = "100%";
      source.style.height = "500px";
      const before = source.outerHTML;
      const svgMarkup = prepareHtmlSvg(source);
      check(source.outerHTML === before, "Export mutated original SVG");
      await new Promise<void>((resolve) => {
        frame.onload = () => resolve();
        frame.srcdoc = buildHtmlDocument(svgMarkup, buildHtmlPayload(stage, PREVIEW_GRAPHS[chartType]));
      });
      const doc = frame.contentDocument!;
      const viewerWindow = frame.contentWindow as Window & typeof globalThis;
      const exported = doc.getElementById("export-canvas") as unknown as SVGSVGElement;
      const compare = async (state: string) => {
        await pause();
        const expected = styles(source),
          actual = styles(exported);
        check(actual.length === expected.length, `${chartType} ${state}: element count`);
        for (let i = 0; i < expected.length; i++) {
          for (let p = 0; p < properties.length; p++) {
            check(
              expected[i].values[p] === actual[i].values[p],
              `${chartType} ${custom ? "custom" : "default"} ${state} ${i} ${expected[i].name} ${properties[p]}: ${expected[i].values[p]} != ${actual[i].values[p]}`,
            );
          }
        }
      };
      await compare("idle");
      // The real source renderer updates focus; the standalone viewer receives clicks.
      for (const node of stage.nodes) {
        render(node.key);
        exported
          .querySelector(`[data-key="${node.key}"]`)!
          .dispatchEvent(new viewerWindow.MouseEvent("click", { bubbles: true }));
        await compare(`selected ${node.key}`);
      }
      const selectedKey = stage.nodes.at(-1)!.key;
      const hoverKey = stage.nodes[0].key;
      source
        .querySelector(`[data-key="${hoverKey}"]`)!
        .dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      exported
        .querySelector(`[data-key="${hoverKey}"]`)!
        .dispatchEvent(new viewerWindow.PointerEvent("pointerover", { bubbles: true }));
      await compare("hover overrides selection");
      source.dispatchEvent(new PointerEvent("pointerleave"));
      exported.dispatchEvent(new viewerWindow.PointerEvent("pointerleave"));
      await compare("hover leaves selection intact");
      doc.getElementById("open-details")!.click();
      check((doc.getElementById("node-details") as HTMLDialogElement).open, "Details did not open");
      check(doc.getElementById("detail-key")!.textContent === selectedKey, "Wrong node details");
      doc.getElementById("close-details")!.click();
      check(!(doc.getElementById("node-details") as HTMLDialogElement).open, "Details did not close");
      const initialBox = [
        exported.viewBox.baseVal.x,
        exported.viewBox.baseVal.y,
        exported.viewBox.baseVal.width,
        exported.viewBox.baseVal.height,
      ].join(" ");
      exported.dispatchEvent(new viewerWindow.KeyboardEvent("keydown", { key: "+", bubbles: true }));
      check(exported.getAttribute("viewBox") !== initialBox, "Zoom did not change view");
      const zoomedBox = exported.getAttribute("viewBox");
      exported.dispatchEvent(new viewerWindow.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      check(exported.getAttribute("viewBox") !== zoomedBox, "Pan did not change view");
      exported.dispatchEvent(new viewerWindow.KeyboardEvent("keydown", { key: "0", bubbles: true }));
      check(exported.getAttribute("viewBox") === initialBox, "Reset did not restore view");
      doc.getElementById("clear-selection")!.click();
      render(null);
      await compare("cleared");
      lines.push(
        `PASS ${chartType} · ${custom ? "custom" : "default"} · idle, every node selected, hover, clear, details, zoom, pan`,
      );
      result.textContent = lines.join("\n");
    }
  }
  result.textContent += "\nALL 8 RENDERING CASES PASSED";
}
run().catch((error) => {
  result.textContent = `${lines.join("\n")}\nFAIL ${error.stack}`;
});
