import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NodeRelationsPanel from "../components/NodeRelationsPanel";
import { normalizeDagInput } from "../graph/normalize";
import { defineSuite, defineTest } from "./harness";

export const nodeRelationsSuite = defineSuite("Node relations", [
  defineTest("separates incoming and outgoing edges and excludes unrelated edges", () => {
    const graph = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Source & title" }, b: {}, c: {}, d: {} },
      edges: [
        { id: "incoming-edge", source: "a", target: "b", value: "requires" },
        { id: "outgoing-edge", source: "b", target: "c", value: 0 },
        { id: "unrelated-edge", source: "c", target: "d" },
      ],
    });
    const html = renderToStaticMarkup(createElement(NodeRelationsPanel, { graph, nodeKey: "b" }));
    const [incoming, outgoing] = html.split('<h2 id="node-edges-outgoing"');
    assert.match(incoming, /incoming-edge/);
    assert.match(incoming, /Source &amp; title/);
    assert.doesNotMatch(incoming, /outgoing-edge/);
    assert.match(outgoing, /outgoing-edge/);
    assert.match(outgoing, /<code>0<\/code>/);
    assert.doesNotMatch(outgoing, /incoming-edge/);
    assert.doesNotMatch(html, /unrelated-edge/);
  }),
  defineTest("preserves scalar relationship values and metadata", () => {
    const graph = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {}, c: {}, d: {}, e: {} },
      edges: [
        { id: "false-edge", source: "a", target: "b", value: false },
        { id: "null-edge", source: "a", target: "c", value: null },
        { id: "empty-edge", source: "a", target: "d", value: "" },
        { id: "unset-edge", source: "a", target: "e", metadata: { note: "<safe>" } },
      ],
    });
    const html = renderToStaticMarkup(createElement(NodeRelationsPanel, { graph, nodeKey: "a" }));
    assert.match(html, /<code>false<\/code>/);
    assert.match(html, /<code>null<\/code>/);
    assert.match(html, /<code>&quot;&quot;<\/code>/);
    assert.match(html, /Not set/);
    assert.match(html, /&lt;safe&gt;/);
    assert.match(html, /No incoming edges\./);
  }),
  defineTest("shows both empty states for isolated nodes", () => {
    const html = renderToStaticMarkup(createElement(NodeRelationsPanel, { graph: null, nodeKey: "isolated" }));
    assert.match(html, /No incoming edges\./);
    assert.match(html, /No outgoing edges\./);
  }),
]);
