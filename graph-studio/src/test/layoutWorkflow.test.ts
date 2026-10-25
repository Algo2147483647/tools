import assert from "node:assert/strict";
import { requestProviderText } from "../ai/transport/providerTransport";
import type { AiSettings } from "../ai/types";
import { normalizeDagInput } from "../graph/normalize";
import { layoutDecisionSchema, parseLayoutDecision } from "../layout/shared/ai/decision";
import { LayoutRequestError, parseLayoutJson, requestLayoutPlan } from "../layout/shared/ai/request";
import { routingHotspots } from "../layout/compound/diagnostics";
import { layoutFixture } from "./compoundLayout.test";
import { defineSuite, defineTest } from "./harness";

const valid = { action: "finish", candidateId: "current", summary: "Retain the current result." };
const settings: AiSettings = {
  provider: "openai-compatible",
  baseUrl: "https://test.invalid",
  apiKey: "",
  model: "layout-test",
};
const parse = (value: Record<string, unknown>) => parseLayoutDecision(value, "compound", new Set(["current"]), false);
async function mock(
  replies: { content?: string; finish_reason?: string; refusal?: string; status?: number; error?: string }[],
  run: (requests: Record<string, any>[]) => Promise<void>,
) {
  const original = globalThis.fetch,
    requests: Record<string, any>[] = [];
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    if (!init.body)
      return new Response(JSON.stringify(String(_url).includes("/v1/models/") ? { max_tokens: 131072 } : { data: [] }));
    requests.push(JSON.parse(init.body));
    const r = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (r.error === "network") throw new Error("offline");
    return {
      ok: !r.status,
      status: r.status ?? 200,
      text: async () =>
        JSON.stringify(
          r.status
            ? { error: { message: r.error } }
            : {
                id: "test-request",
                choices: [
                  { finish_reason: r.finish_reason ?? "stop", message: { content: r.content, refusal: r.refusal } },
                ],
              },
        ),
    };
  }) as unknown as typeof fetch;
  try {
    await run(requests);
  } finally {
    globalThis.fetch = original;
  }
}
const request = (signal = new AbortController().signal, provider = settings.provider) =>
  requestLayoutPlan({
    settings: { ...settings, provider },
    signal,
    context: { edges: ["ab"] },
    message: "Arrange",
    schema: layoutDecisionSchema("compound"),
    instructions: "Keep DOWN.",
    parse,
  });

export const layoutWorkflowSuite = defineSuite("AI layout declarations", [
  defineTest("long instructions and large text or structured responses are preserved completely", async () => {
    const message = "完整指令".repeat(4000),
      value = { text: "完整回答".repeat(12000) };
    assert.deepEqual(parseLayoutJson({ content: JSON.stringify(value), finishReason: "stop" }), value);
    assert.deepEqual(parseLayoutJson({ content: "", structuredValue: value, finishReason: "stop" }), value);
    const finish = parseLayoutDecision({ action: "finish", candidateId: "current", summary: value.text }, "compound", new Set(["current"]), false);
    assert.equal(finish.action === "finish" && finish.summary, value.text);
    await mock([{ content: JSON.stringify(value) }], async (requests) => {
      const result = await requestLayoutPlan({
        settings,
        signal: new AbortController().signal,
        context: { description: message },
        message,
        schema: { type: "object" },
        instructions: "Return the full answer",
        parse: (v) => v,
      });
      assert.deepEqual(result, value);
      const input = JSON.parse(requests[0].messages[1].content);
      assert.equal(input.request, message);
      assert.equal(input.context.description, message);
      assert.ok(!("max_tokens" in requests[0]));
    });
  }),
  defineTest("shared decisions reject extra fields, missing candidates and obsolete plans", () => {
    assert.equal(parse(valid).action, "finish");
    for (const bad of [{ ...valid, commands: ["/rm a"] }, { ...valid, candidateId: "missing" }, { action: "evaluate", hypothesis: "Test", plan: {} }]) assert.throws(() => parse(bad), LayoutRequestError);
  }),
  defineTest("whole-object parsing rejects double encoding, fences, multiple documents and cutoff replies", () => {
    for (const content of [
      JSON.stringify(JSON.stringify(valid)),
      "```json\n" + JSON.stringify(valid) + "\n```",
      JSON.stringify(valid) + "{}",
      '{"version":1,',
    ])
      assert.throws(() => parseLayoutJson({ content }), LayoutRequestError);
    assert.throws(
      () => parseLayoutJson({ content: JSON.stringify(valid), finishReason: "length" }),
      (e: unknown) => e instanceof LayoutRequestError && e.code === "truncated",
    );
    assert.throws(
      () => parseLayoutJson({ content: "{}", refusal: "declined" }),
      (e: unknown) => e instanceof LayoutRequestError && e.code === "refusal",
    );
  }),
  defineTest("invalid JSON gets one bounded regeneration without replaying malformed text", async () => {
    await mock([{ content: '{"bad":"broken QUOTE' }, { content: JSON.stringify(valid) }], async (requests) => {
      assert.equal((await request()).action, "finish");
      assert.equal(requests.length, 2);
      assert.equal(requests[0].temperature, undefined);
      assert.equal(requests[0].max_tokens, undefined);
      assert.ok(!JSON.stringify(requests[1]).includes("broken QUOTE"));
      assert.ok(!JSON.stringify(requests).includes("/set Water"));
      assert.ok(JSON.stringify(requests[1]).includes("correction"));
    });
  }),
  defineTest("semantic failures retain paths and request metadata after exactly two calls", async () => {
    await mock(
      [{ content: JSON.stringify({ ...valid, candidateId: "missing" }) }],
      async (requests) => {
        await assert.rejects(
          () => request(),
          (e: unknown) =>
            e instanceof LayoutRequestError &&
            e.attempts === 2 &&
            e.code === "semantic" &&
            e.response?.requestId === "test-request",
        );
        assert.equal(requests.length, 2);
      },
    );
  }),
  defineTest("truncation regenerates once even if the partial content appears parseable", async () => {
    await mock(
      [{ content: JSON.stringify(valid), finish_reason: "length" }, { content: JSON.stringify(valid) }],
      async (requests) => {
        await request();
        assert.equal(requests.length, 2);
        assert.equal(requests[0].max_tokens, undefined);
        assert.equal(requests[1].max_tokens, undefined);
      },
    );
  }),
  defineTest("Layout and Console share uncapped provider output defaults", async () => {
    await mock([{ content: JSON.stringify(valid) }], async (requests) => {
      await requestLayoutPlan({
        settings: { ...settings, provider: "deepseek", model: "deepseek-v4-flash" },
        signal: new AbortController().signal,
        context: {},
        message: "Arrange",
        schema: layoutDecisionSchema("compound"),
        instructions: "Keep DOWN",
        parse,
      });
      assert.deepEqual(requests[0].thinking, { type: "disabled" });
      assert.equal(requests[0].max_tokens, undefined);
      await requestProviderText({ ...settings, provider: "deepseek" }, "system", "user");
      assert.equal(requests[1].thinking, undefined);
      assert.equal(requests[1].max_tokens, undefined);
    });
  }),
  defineTest("refusal and transport failures do not enter JSON repair", async () => {
    for (const reply of [{ refusal: "declined" }, { status: 401, error: "unauthorized" }, { error: "network" }])
      await mock([reply], async (requests) => {
        await assert.rejects(() => request());
        assert.equal(requests.length, 1);
      });
  }),
  defineTest("cancellation stops before any call and schema fallback shares the same two-call budget", async () => {
    await mock([{ content: JSON.stringify(valid) }], async (requests) => {
      const abort = new AbortController();
      abort.abort();
      await assert.rejects(() => request(abort.signal), /cancelled/);
      assert.equal(requests.length, 0);
    });
    await mock([{ status: 400, error: "output_config schema unsupported" }, { content: "{}" }], async (requests) => {
      // Anthropic uses a different envelope; deliberately invalid fallback still cannot request a third time.
      await assert.rejects(() => request(undefined, "anthropic"));
      assert.equal(requests.length, 2);
      assert.ok(requests[0].output_config);
      assert.equal(requests[1].output_config, undefined);
    });
  }),
  defineTest("routing diagnostics identify original edges, crowded ports and unrelated containers", async () => {
    const dag = normalizeDagInput({
      format: "graph-studio",
      version: 3,
      nodes: { a: {}, b: {}, c: {}, d: {}, g: {}, x: {} },
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ac", source: "a", target: "c" },
        { id: "ad", source: "a", target: "d" },
      ],
      hierarchy_edges: [{ id: "gx", source: "g", target: "x" }],
    });
    const problem = (await layoutFixture(dag)).compoundLayout!;
    problem.baseline.boxes.g = { x: 40, y: 40, width: 100, height: 100 };
    const paths = [
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ],
      [
        { x: 0, y: 100 },
        { x: 180, y: 100 },
      ],
    ];
    problem.projection.edges.forEach((edge, i) => {
      problem.baseline.routes[edge.id] = { ...problem.baseline.routes[edge.id], points: paths[i] };
    });
    const issues = routingHotspots(problem);
    assert.ok(issues.crossings.some((issue) => issue.edgeIds.includes("ab") && issue.edgeIds.includes("ac")));
    assert.ok(issues.sharedRuns.some((issue) => issue.edgeIds.includes("ad")));
    assert.ok(issues.crowdedPorts.some((issue) => issue.nodeId === "a"));
    assert.ok(issues.containerPassages.some((issue) => issue.groupId === "g"));
  }),
]);
