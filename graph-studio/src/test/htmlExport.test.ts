import assert from "node:assert/strict";
import {
  buildFlatPreviewStage,
  INITIAL_PREVIEW_VIEW,
  PREVIEW_GRAPHS,
  previewGeometry,
} from "../components/settings/previewModel";
import { buildHtmlDocument, buildHtmlPayload, serializeHtmlData } from "../export/html";
import { startHtmlViewer } from "../export/html-viewer";
import { DEFAULT_GRAPH_APPEARANCE } from "../schema/appearance/defaults";
import { defineSuite, defineTest } from "./harness";

const stage = () =>
  buildFlatPreviewStage(
    previewGeometry({
      chartType: "node-link",
      layoutMode: "sugiyama",
      appearance: DEFAULT_GRAPH_APPEARANCE,
      showNodeDetail: true,
      alignNodeWidthsToMax: false,
      view: INITIAL_PREVIEW_VIEW,
    }),
  )!;

export const htmlExportSuite = defineSuite("Standalone HTML export", [
  defineTest("exports visible nodes and relationships without leaking filtered-out node fields", () => {
    const view = stage();
    const graph = structuredClone(PREVIEW_GRAPHS["node-link"]);
    graph.nodes.hidden = { key: "hidden", title: "Filtered", secret: "not-in-export" };
    view.nodes = view.nodes.slice(0, 2);
    const payload = buildHtmlPayload(view, graph);
    assert.equal(payload.nodes.length, 2);
    assert.ok(!JSON.stringify(payload).includes("not-in-export"));
    assert.ok(
      payload.edges.every(
        (edge) =>
          payload.nodes.some((node) => node.key === edge.source) &&
          payload.nodes.some((node) => node.key === edge.target),
      ),
    );
    assert.deepEqual(JSON.parse(payload.nodes[0].raw).data.title, graph.nodes[payload.nodes[0].key].title);
  }),
  defineTest(
    "node fields preserve Markdown, math and structured values without active markup or external assets",
    () => {
      const view = stage(),
        graph = structuredClone(PREVIEW_GRAPHS["node-link"]);
      const key = view.nodes[0].key;
      graph.nodes[key].notes =
        "**Readable** $x^2$ <script>alert(1)</script> [bad](javascript:alert(1)) ![remote](https://example.com/a.png) [local](notes/a.md)";
      graph.nodes[key].custom = { safe: '<img onerror="alert(1)">' };
      const node = buildHtmlPayload(view, graph).nodes.find((item) => item.key === key)!;
      const html = node.fields.find((field) => field.name === "notes")!.html!;
      assert.match(html, /<strong>Readable<\/strong>/);
      assert.match(html, /<math/);
      assert.ok(!/<script|<img|javascript:|href="notes\//.test(html));
      assert.match(node.fields.find((field) => field.name === "custom")!.text, /onerror/);
      assert.equal(node.fields.find((field) => field.name === "custom")!.html, undefined);
    },
  ),
  defineTest("hostile data cannot close JSON scripts and exported runtime has valid standalone syntax", () => {
    const hostile = { title: "</script><script>alert(1)</script>&\u2028", nodes: [], edges: [] };
    assert.deepEqual(JSON.parse(serializeHtmlData(hostile)), hostile);
    const html = buildHtmlDocument('<svg id="export-canvas" viewBox="0 0 100 100"></svg>', hostile);
    assert.equal((html.match(/<script\b/g) || []).length, 2);
    assert.ok(!html.includes("<title></script>"));
    assert.match(html, /default-src 'none'/);
    assert.doesNotThrow(() => new Function(`(${startHtmlViewer.toString()})();`));
    assert.ok(!html.includes("<script src="));
  }),
]);
