import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CompoundRelationships, { formatRelationshipValue } from "../components/CompoundRelationships";
import { normalizeDagInput } from "../graph/normalize";
import type { GraphHierarchy } from "../graph/types";
import type { StageEdge } from "../layout/types";
import GraphEdge from "../rendering/GraphEdge";
import { GroupControls, GroupHeader } from "../rendering/GraphGroup";
import {
  compoundDomainId,
  compoundDomainStyle,
  compoundGroupEmphasis,
  isCompoundMember,
} from "../rendering/compoundStyles";
import { defineSuite, defineTest } from "./harness";

const hierarchy: GraphHierarchy = {
  id: "H",
  groups: { commerce: { title: "Commerce" }, payments: { title: "Payments" }, external: { title: "External" } },
  parentById: { payments: "commerce", a: "payments", b: "commerce", c: "external" },
};
const edge: StageEdge = {
  id: "aggregate-ab",
  source: "payments",
  target: "external",
  originalEdgeIds: ["ab", "ac"],
  weight: undefined,
  label: "2 relationships",
  path: "M0,0 L100,0",
  labelPosition: { x: 50, y: 0 },
};

export const compoundRenderingSuite = defineSuite("Nested graph rendering", [
  defineTest("domain colors remain attached to their top-level business domain", () => {
    assert.equal(compoundDomainId("a", hierarchy), "commerce");
    assert.deepEqual(compoundDomainStyle("payments", hierarchy), compoundDomainStyle("a", hierarchy));
    assert.deepEqual(compoundDomainStyle("commerce", hierarchy), compoundDomainStyle("a", hierarchy));
    assert.notDeepEqual(compoundDomainStyle("external", hierarchy), compoundDomainStyle("a", hierarchy));
  }),
  defineTest("group selection separates descendants, ancestors and external endpoints", () => {
    assert.equal(isCompoundMember("payments", "payments", hierarchy), true);
    assert.equal(isCompoundMember("a", "payments", hierarchy), true);
    assert.equal(isCompoundMember("b", "payments", hierarchy), false);
    assert.equal(isCompoundMember("c", "payments", hierarchy), false);
    assert.equal(compoundGroupEmphasis("commerce", "payments", hierarchy), "ancestor");
    assert.equal(compoundGroupEmphasis("payments", "payments", hierarchy), "selected");
    assert.equal(compoundGroupEmphasis("payments", "commerce", hierarchy), "member");
  }),
  defineTest("expanded headers expose independent selection, collapse and entry controls", () => {
    const html = renderToStaticMarkup(
      createElement(GroupHeader, {
        group: {
          id: "payments",
          title: "Payments",
          depth: 1,
          leafCount: 4,
          internalEdgeCount: 6,
          x: 0,
          y: 0,
          width: 320,
          height: 240,
        },
        selected: true,
        onSelect: () => {},
        onToggle: () => {},
        onEnter: () => {},
      }),
    );
    assert.equal((html.match(/role="button"/g) || []).length, 3);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /aria-label="Collapse Payments"/);
    assert.match(html, /aria-label="Enter Payments"/);
    assert.match(html, /4 nodes · 6 relationships/);
    assert.match(html, /class="dag-group-header-hit"/);
  }),
  defineTest("external group summaries allow entry without changing canvas expansion", () => {
    const html = renderToStaticMarkup(
      createElement(GroupControls, { id: "external", x: 0, y: 0, external: true, collapsed: true }),
    );
    assert.equal((html.match(/role="button"/g) || []).length, 1);
    assert.match(html, /aria-label="Enter external"/);
    assert.doesNotMatch(html, /Expand one level/);
  }),
  defineTest("aggregated edges are keyboard controls with a wider hit area", () => {
    const interactive = renderToStaticMarkup(
      createElement(GraphEdge, { edge, showLabel: false, onEdgeSelect: () => {} }),
    );
    assert.match(interactive, /role="button"/);
    assert.match(interactive, /tabindex="0"/);
    assert.match(interactive, /Inspect 2 original relationships/);
    assert.match(interactive, /dag-edge__hit-area/);
    const passive = renderToStaticMarkup(
      createElement(GraphEdge, {
        edge: { ...edge, originalEdgeIds: undefined },
        showLabel: true,
        onEdgeSelect: () => {},
      }),
    );
    assert.doesNotMatch(passive, /role="button"|dag-edge__hit-area/);
  }),
  defineTest("relationship inspector lists original IDs, node endpoints and uncoerced values", () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: { title: "Pay <customer>" }, b: { title: "Bank" }, c: { title: "Provider" } },
      edges: [
        { id: "ab", source: "a", target: "b", value: false },
        { id: "ac", source: "a", target: "c", value: 0 },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(CompoundRelationships, { dag, edge, onClose: () => {}, onOpenNode: () => {} }),
    );
    assert.match(html, /role="region"/);
    assert.match(html, /<code>ab<\/code>/);
    assert.match(html, /<code>ac<\/code>/);
    assert.match(html, /Pay &lt;customer&gt;/);
    assert.match(html, /<small>a<\/small>/);
    assert.match(html, /<small>b<\/small>/);
    assert.match(html, /<dd>false<\/dd>/);
    assert.match(html, /<dd>0<\/dd>/);
    assert.equal(formatRelationshipValue(null), "null");
    assert.equal(formatRelationshipValue(undefined), "Not specified");
    assert.equal(formatRelationshipValue(""), '\"\" (empty string)');
  }),
]);
