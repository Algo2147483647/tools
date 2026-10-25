import assert from "node:assert/strict";
import { createLayoutResult } from "../schema/layoutResult";
import { applyLayoutResult } from "../layout/shared/applyLayoutResult";
import { movedTimeline } from "./layoutPersistence.test";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { timelineLayoutContext } from "../layout/timeline/ai/context";
import { requestTimelineLayout } from "../layout/timeline/ai/request";
import { buildTimelineStage } from "../layout/timeline/layout";
import type { TimelineLayoutInput } from "../layout/timeline/input-types";
import { validateTimelineArrangement } from "../layout/timeline/layout-quality";
import { defineSuite, defineTest } from "./harness";
function graph(relative = false) {
  const date = (year: number) => (relative ? year - 2000 : String(year));
  return normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: relative ? { clock: { mode: "relative", unit: "minute" } } : { asOf: "2026-01-01" } },
    nodes: {
      a: { title: "Discovery", track: "Research", type: "Research", time: { at: date(2000) } },
      b: {
        title: "Prototype",
        track: "Engineering",
        type: "Engineering",
        time: { start: date(2001), end: date(2010) },
      },
      c: { title: "Delivery", track: "Operations", type: "Operations", time: { at: date(2015) } },
      d: { title: "Follow-up", track: "Research", type: "Research", time: { at: date(2020) } },
      unknown: { title: "Unscheduled", track: "Operations" },
      ...(!relative
        ? {
            ongoing: { title: "Monitoring", track: "Operations", time: { start: "2021", end: null } },
            ancient: { title: "Earlier history", track: "Research", time: { at: "-000220" } },
          }
        : {}),
    },
    edges: [
      { id: "ab", source: "a", target: "b", metadata: { timeline: { kind: "sequence" } } },
      { id: "bc", source: "b", target: "c", metadata: { timeline: { kind: "dependency", sourceTime: date(2005) } } },
      { id: "ad", source: "a", target: "d", metadata: { timeline: { kind: "reference" } } },
    ],
  });
}
export const timelineLayoutSuite = defineSuite("Timeline AI arrangement", [
  defineTest("exact AI geometry preserves calendar and relative dates, duration ports and both orientations", () => {
    for(const relative of [false,true])for(const orientation of ["vertical","horizontal"] as const){
      const input:TimelineLayoutInput={dag:graph(relative),selection:{type:"full"},timelineSettings:{orientation}};
      const stage=buildTimelineStage(input)!;const layout=movedTimeline(stage,"b",300);
      const result=applyLayoutResult(layout,stage);
      assert.deepEqual(createLayoutResult(result,"timeline"),layout);
      assert.deepEqual(validateTimelineArrangement(stage,result),[]);
      assert.deepEqual(result.nodeMap.b.timeline!.ports,stage.nodeMap.b.timeline!.ports);
    }
  }),
  defineTest("model context preserves all visible layout data without sampling or shortening titles", () => {
    const dag = serializeDag(graph());
    for (let i = 0; i < 200; i++)
      dag.nodes[`extra-${i}`] = {
        title: "x".repeat(500),
        track: "Research",
        time: { at: "2000" },
        secret: "not-for-layout",
      };
    const input: TimelineLayoutInput = { dag: normalizeDagInput(dag), selection: { type: "full" } };
    const context = timelineLayoutContext(input, buildTimelineStage(input)!, "extra-199");
    assert.equal(context.sampledEvents, context.totalEvents);
    assert.ok(context.sampledEvents > 160);
    assert.equal(context.truncated, false);
    assert.equal(context.events[0].id, "extra-199");
    assert.equal(context.events[0].title.length, 500);
    assert.ok(!JSON.stringify(context).includes("not-for-layout"));
    assert.equal(
      context.tracks.reduce((sum, track) => sum + track.events, 0),
      context.totalEvents,
    );
  }),
  defineTest(
    "provider requests use the configured model, repair invalid JSON once and never execute graph commands",
    async () => {
      const layout = createLayoutResult(
        buildTimelineStage({ dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } })!,
        "timeline",
      );
      const original = globalThis.fetch;
      const requests: Record<string, unknown>[] = [];
      globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
        if (!init.body) return new Response(JSON.stringify({ data: [] }));
        requests.push(JSON.parse(init.body));
        const content =
          requests.length === 1
            ? '{"commands":["/rm a"]}'
            : JSON.stringify({ action: "evaluate", hypothesis: "Order tracks", layout });
        return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
      }) as unknown as typeof fetch;
      try {
        const response = await requestTimelineLayout(
          {
            provider: "openai-compatible",
            baseUrl: "http://localhost/mock",
            model: "configured-model",
            apiKey: "",
          },
          timelineLayoutContext(
            { dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } },
            buildTimelineStage({ dag: graph(), selection: { type: "full" }, timelineSettings: { layout: "tracks" } })!,
          ),
          "Group related tracks",
          new AbortController().signal,
        );
        assert.equal(requests.length, 2);
        assert.equal(requests[0].model, "configured-model");
        assert.equal(response.action, "evaluate");
        if (response.action === "evaluate") assert.deepEqual(response.layout, layout);
      } finally {
        globalThis.fetch = original;
      }
    },
  ),
]);
