import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeDagInput } from "../graph/normalize";
import { projectGraphByTimelineTrack } from "../graph/timelineView";
import { buildTimelineStage } from "../layout/timeline-layout";
import { EXAMPLE_WORKSPACES, loadExampleWorkspace } from "../workspace/examples";
import { discoverWorkspace } from "../workspace/discovery";
import { defineSuite, defineTest } from "./harness";

const root = "public/examples/space-history/";
const read = async (path: string) => JSON.parse(await readFile(root + path, "utf8"));
const timestamp = (value: string) => Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);

export const spaceHistorySuite = defineSuite("World space history timeline", [
  defineTest("Luna milestone connectors stay local in both the complete and filtered timeline", async () => {
    const dag = normalizeDagInput(await read("space-history.json"));
    for (const view of [dag, projectGraphByTimelineTrack(dag, "Robotic Moon")]) {
      const stage = buildTimelineStage({
        dag: view,
        selection: { type: "full" },
        timelineSettings: { axis: "linear" },
      })!;
      for (const mission of ["luna-1", "luna-2", "luna-3", "luna-9", "luna-10"]) {
        const connectors = stage.edges.filter(
          (edge) => edge.source.startsWith(mission + ".") && edge.target.startsWith(mission + "."),
        );
        assert.equal(connectors.length, 3);
        for (const edge of connectors) {
          const points = edge.points!;
          const first = points[0],
            last = points[points.length - 1];
          assert.ok(Math.abs(first.y - last.y) < 1, `${edge.id}: reproduce compressed multi-day milestones`);
          assert.ok(
            points.every((point) => point.x >= Math.min(first.x, last.x) && point.x <= Math.max(first.x, last.x)),
            `${edge.id}: no loop outside the endpoint lanes`,
          );
          assert.ok(
            points.every(
              (point) => point.y >= Math.min(first.y, last.y) - 24 && point.y <= Math.max(first.y, last.y) + 24,
            ),
            `${edge.id}: any collision bridge stays near the event`,
          );
        }
      }
    }
  }),
  defineTest("one default graph contains the complete dated and sourced historical corpus", async () => {
    const full = await read("space-history.json");
    const manifest = await read("graph-studio.workspace.json");
    assert.equal(manifest.defaultGraph, "space-history.json");
    assert.deepEqual(manifest.graphs, ["space-history.json", "mathematics-physics/mathematics-physics.json"]);
    assert.equal(manifest.metadata.graphStats["space-history.json"].themeCount, 8);
    assert.equal(manifest.metadata.snapshotAsOf, "2025-12-31");
    assert.equal(Object.keys(full.nodes).length, 298);
    assert.equal(full.edges.length, manifest.metadata.graphStats["space-history.json"].edgeCount);
    assert.ok(full.edges.length >= 300 && full.edges.length <= 450);
    const agencies = new Set<string>();
    let intervals = 0;
    for (const [id, raw] of Object.entries(full.nodes)) {
      const node = raw as {
        time: { at?: string; start?: string; end?: string };
        track: string;
        agency: string;
        sources: string[];
        references: string;
        define: string;
      };
      const { time } = node;
      const dates = time.at ? [time.at] : [time.start!, time.end!];
      assert.ok(node.track && node.define.length > 35, `${id}: substantive context and track`);
      assert.ok(node.sources.length > 0);
      for (const source of node.sources) {
        assert.equal(new URL(source).protocol, "https:");
        assert.ok(node.references.includes(source));
      }
      for (const value of dates) {
        assert.match(value, /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?$/);
        assert.ok(Number.isFinite(timestamp(value)), `${id}: invalid time`);
        assert.ok(timestamp(value) <= timestamp("2025-12-31"), `${id}: future event outside snapshot`);
      }
      if (!time.at) {
        intervals++;
        assert.ok(timestamp(time.start!) < timestamp(time.end!));
      }
      agencies.add(node.agency);
    }
    assert.ok(intervals >= 70);
    for (const agency of ["China", "India", "Japan", "Europe", "USSR", "USA", "International"])
      assert.ok(agencies.has(agency));
    const allEdges = new Map(full.edges.map((edge: { id: string }) => [edge.id, edge]));
    assert.equal(allEdges.size, full.edges.length);
    const endpointPairs = new Set(
      full.edges.map((edge: { source: string; target: string }) => `${edge.source}\u0000${edge.target}`),
    );
    assert.equal(endpointPairs.size, full.edges.length, "no repeated directed pair across relationship kinds");
    for (const path of ["space-history.json"]) {
      const graph = await read(path);
      assert.equal(normalizeDagInput(graph).diagram, "dag");
      assert.deepEqual(graph.metadata.timeline, { timeZone: "UTC" });
      for (const [id, node] of Object.entries(graph.nodes))
        assert.deepEqual(node, full.nodes[id], `${path}/${id}: shared facts`);
      assert.deepEqual(
        graph.edges,
        full.edges.filter(
          (edge: { source: string; target: string }) => graph.nodes[edge.source] && graph.nodes[edge.target],
        ),
      );
      for (const edge of graph.edges) {
        assert.ok(graph.nodes[edge.source] && graph.nodes[edge.target]);
        assert.ok(graph.metadata.edgeSemantics[edge.metadata.timeline.kind]);
      }
    }
    assert.match(EXAMPLE_WORKSPACES.find((example) => example.id === "space-history")!.detail, /^2 timelines/);
  }),
  defineTest("Apollo 11 contains simultaneous vehicle branches that join at the actual docking event", async () => {
    const { nodes, edges } = await read("space-history.json");
    const columbia = nodes["apollo-11.columbia"],
      surface = nodes["apollo-11.surface"];
    assert.notEqual(columbia.track, surface.track);
    assert.ok(timestamp(columbia.time.start) < timestamp(surface.time.start));
    assert.ok(timestamp(columbia.time.end) > timestamp(surface.time.end));
    assert.ok(timestamp(nodes["apollo-11.first-step"].time.at) > timestamp(surface.time.start));
    assert.ok(timestamp(nodes["apollo-11.first-step"].time.at) < timestamp(surface.time.end));
    for (const branch of ["columbia", "descent"]) {
      assert.ok(
        edges.some(
          (edge: { source: string; target: string }) =>
            edge.source === "apollo-11.separate" && edge.target === `apollo-11.${branch}`,
        ),
      );
    }
    for (const branch of ["columbia", "ascent"]) {
      const edge = edges.find(
        (edge: { source: string; target: string }) =>
          edge.source === `apollo-11.${branch}` && edge.target === "apollo-11.dock",
      );
      assert.equal(edge.metadata.timeline.kind, "rendezvous");
      assert.equal(edge.metadata.timeline.sourceAnchor, "end");
      assert.equal(nodes[`apollo-11.${branch}`].time.end, nodes["apollo-11.dock"].time.at);
    }
  }),
  defineTest("UTC-sensitive dates and completed-phase boundaries remain explicit", async () => {
    const { nodes } = await read("space-history.json");
    for (const [id, expected] of [
      ["explorer-1.launch", "1958-02-01"],
      ["luna-2.arrival", "1959-09-13"],
      ["mir.launch", "1986-02-19"],
      ["apollo-16.milestone", "1972-04-21"],
      ["hayabusa2.return", "2020-12-05"],
      ["change-6.arrival", "2024-06-01"],
    ])
      assert.equal(nodes[id].time.at, expected);
    assert.equal(nodes["voyager-2.phase"].time.end, "1989-08-25");
    assert.match(nodes["voyager-2.phase"].define, /continued outward/);
    assert.match(nodes["webb.phase"].title, /commissioning/);
    assert.equal(nodes["webb.phase"].time.end, "2022-07-12");
  }),
  defineTest("the gallery lists the complete workspace including on-demand explanatory notes", async () => {
    const fetcher = (async (url: string) =>
      new Response(await readFile(root + url.split("/examples/space-history/")[1], "utf8"))) as typeof fetch;
    const folder = await loadExampleWorkspace("space-history", "/", fetcher);
    const workspace = await discoverWorkspace(folder);
    assert.equal(workspace.activePath, "space-history.json");
    assert.equal(workspace.graphs.length, 2);
    assert.equal(workspace.graphs[0].nodeCount, 298);
    assert.equal(workspace.graphs[0].edgeCount, 408);
    for (const oldPath of ["all-space-history.json", "apollo-11.json", "mars.json"]) {
      assert.equal((await discoverWorkspace(folder, oldPath)).activePath, "space-history.json");
    }
    assert.ok(workspace.graphs.every((graph) => !graph.error));
    assert.ok(folder.files.has("SOURCES.md"));
    for (const name of [
      "early-spaceflight",
      "crewed-lunar",
      "space-stations",
      "robotic-moon",
      "mars",
      "deep-space",
      "launch-commercial",
      "observatories",
    ]) {
      assert.ok(folder.files.has(`notes/${name}.md`));
    }
  }),
]);
