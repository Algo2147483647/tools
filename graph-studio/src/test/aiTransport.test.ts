import assert from "node:assert/strict";
import { requestProviderReply, requestProviderText } from "../ai/transport/providerTransport";
import { readProviderStream, type AiProgressEvent } from "../ai/transport/streaming";
import { listProviderModels } from "../ai/transport/models";
import { parseLayoutJson } from "../layout/shared/ai/request";
import type { AiProvider, AiSettings } from "../ai/types";
import { defineSuite, defineTest } from "./harness";
import { emptyAiActivity, updateAiActivity } from "../ai/transport/activity";

const settings: AiSettings = {
  provider: "deepseek",
  baseUrl: "https://test.invalid",
  apiKey: "test-key",
  model: "test",
  temperature: 0,
  maxTokens: 8192,
  executionMode: "ask",
};
const sse = (events: unknown[]) =>
  events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\r\n\r\n`).join("");
function stream(text: string, mime = "text/event-stream") {
  const bytes = new TextEncoder().encode(text);
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (index === bytes.length) c.close();
        else {
          c.enqueue(bytes.slice(index, index + 3));
          index = Math.min(index + 3, bytes.length);
        }
      },
    }),
    { headers: { "content-type": mime } },
  );
}
async function mock(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
const delta = (value: Record<string, unknown>, finish: string | null = null) => ({
  id: "request-1",
  choices: [{ index: 0, delta: value, finish_reason: finish }],
});

export const aiTransportSuite = defineSuite("AI transport streaming and model discovery", [
  defineTest("run transcripts retain earlier requests and final chunks after completion", () => {
    let activity = updateAiActivity(emptyAiActivity(), { type: "start" });
    activity = updateAiActivity(activity, { type: "reasoning", text: "First analysis" });
    activity = updateAiActivity(activity, { type: "content", text: "First plan" });
    activity = updateAiActivity(activity, { type: "end" });
    activity = updateAiActivity(activity, { type: "start" });
    activity = updateAiActivity(activity, { type: "content", text: "Final selection" });
    activity = updateAiActivity(activity, { type: "end" });
    assert.equal(activity.streaming, false);
    assert.equal(activity.content, "Final selection");
    assert.equal(activity.history[0].content, "First plan");
    assert.equal(activity.history[0].reasoning, "First analysis");
    for (let i = 0; i < 20; i++) activity = updateAiActivity(activity, { type: "start" });
    activity = updateAiActivity(activity, { type: "content", text: "a".repeat(20000) });
    assert.equal(activity.history.length, 15);
    assert.equal(activity.content.length, 16000);
    assert.equal(activity.received, 20000);
  }),
  defineTest("console rejects a truncated stream even when its content happens to be valid JSON", async () => {
    await mock(
      async () => stream(sse([delta({ content: '{"kind":"answer","answer":"ok"}' }, "length"), "[DONE]"])),
      async () =>
        assert.rejects(() => requestProviderText(settings, "system", "user", undefined, () => {}), /truncated/),
    );
  }),
  defineTest("SSE preserves split UTF-8, reasoning, JSON, terminal metadata and usage", async () => {
    const events: AiProgressEvent[] = [];
    const reply = await readProviderStream(
      stream(
        ": keepalive\r\n\r\n" +
          sse([
            delta({ reasoning_content: "比较布局🧭" }),
            delta({ content: '{"answer":' }),
            delta({ content: '"好"}' }),
            delta({}, "stop"),
            { choices: [], usage: { completion_tokens: 55 } },
            "[DONE]",
          ]),
      ),
      "chat",
      (event) => events.push(event),
    );
    assert.equal(events[0].type, "reasoning");
    assert.equal(reply!.content, '{"answer":"好"}');
    assert.equal(reply!.reasoningCharacters, "比较布局🧭".length);
    assert.equal(reply!.requestId, "request-1");
    assert.equal(reply!.usage!.completion_tokens, 55);
    assert.deepEqual(parseLayoutJson(reply!), { answer: "好" });
  }),
  defineTest("a valid-looking partial response cannot bypass missing completion", async () => {
    await assert.rejects(
      () => readProviderStream(stream(sse([delta({ content: '{"ok":true}' })])), "chat", () => {}),
      /before completion/,
    );
    await assert.rejects(() => readProviderStream(stream("data: {bad}\n\n"), "chat", () => {}), /invalid event/);
    await assert.rejects(
      () => readProviderStream(stream(sse([{ error: { message: "Overloaded" } }])), "chat", () => {}),
      /Overloaded/,
    );
    const limited = await readProviderStream(
      stream(sse([delta({ content: '{"ok":true}' }, "length"), "[DONE]"])),
      "chat",
      () => {},
    );
    assert.throws(() => parseLayoutJson(limited!), /cut off/);
  }),
  defineTest("abort stops live delivery and cancels the reader", async () => {
    const abort = new AbortController();
    let cancelled = false,
      count = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(sse([delta({ reasoning_content: "Working" })])));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    await assert.rejects(
      () =>
        readProviderStream(
          response,
          "chat",
          () => {
            count++;
            abort.abort();
          },
          abort.signal,
        ),
      /cancelled/,
    );
    assert.equal(count, 1);
    assert.equal(cancelled, true);
  }),
  defineTest("Anthropic, Gemini and Ollama separate reasoning from structured output", async () => {
    const anthropic = await readProviderStream(
      stream(
        sse([
          { type: "message_start", message: { id: "a", usage: { input_tokens: 5 } } },
          { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Think" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: '{"ok":true}' } },
          { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } },
          { type: "message_stop" },
        ]),
      ),
      "anthropic",
      () => {},
    );
    assert.equal(anthropic!.content, '{"ok":true}');
    assert.equal(anthropic!.reasoningCharacters, 5);
    assert.deepEqual(anthropic!.usage, { input_tokens: 5, output_tokens: 9 });
    const gemini = await readProviderStream(
      stream(
        sse([
          {
            candidates: [
              {
                content: { parts: [{ thought: true, text: "Reason" }, { text: '{"ok":true}' }] },
                finishReason: "STOP",
              },
            ],
            responseId: "g",
          },
        ]),
      ),
      "gemini",
      () => {},
    );
    assert.equal(gemini!.content, '{"ok":true}');
    assert.equal(gemini!.reasoningCharacters, 6);
    const ollama = await readProviderStream(
      stream(
        [
          { message: { thinking: "Thought", content: '{"ok":' }, done: false },
          { message: { content: "true}" }, done: true, done_reason: "stop", eval_count: 3 },
        ]
          .map((e) => JSON.stringify(e))
          .join("\n"),
        "application/x-ndjson",
      ),
      "ollama",
      () => {},
    );
    assert.equal(ollama!.content, '{"ok":true}');
    assert.equal(ollama!.reasoningCharacters, 7);
    assert.equal(ollama!.usage!.outputTokens, 3);
  }),
  defineTest("transport requests streaming while still accepting a service's complete JSON response", async () => {
    const events: AiProgressEvent[] = [];
    await mock(
      async (_url, init) => {
        const body = JSON.parse(String(init!.body));
        assert.equal(body.stream, true);
        assert.equal(body.thinking.type, "enabled");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}', reasoning_content: "Summary" }, finish_reason: "stop" }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
      async () => {
        const reply = await requestProviderReply(settings, "system", "user", undefined, {
          purpose: "layout-planning",
          onProgress: (e) => events.push(e),
        });
        assert.equal(reply.content, '{"ok":true}');
        assert.deepEqual(
          events.map((e) => e.type),
          ["start", "reasoning", "content", "end"],
        );
      },
    );
  }),
  defineTest("all provider transports opt into their streaming endpoint and retain final text", async () => {
    for (const provider of ["openai-compatible", "deepseek", "anthropic", "gemini", "ollama"] as AiProvider[]) {
      await mock(
        async (url, init) => {
          const body = JSON.parse(String(init!.body));
          if (provider === "gemini") {
            assert.match(String(url), /:streamGenerateContent/);
            assert.match(String(url), /alt=sse/);
          } else assert.equal(body.stream, true);
          return provider === "anthropic"
            ? stream(
                sse([
                  { type: "content_block_delta", delta: { text: "ok" } },
                  { type: "message_delta", delta: { stop_reason: "end_turn" } },
                  { type: "message_stop" },
                ]),
              )
            : provider === "gemini"
              ? stream(sse([{ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }]))
              : provider === "ollama"
                ? stream(JSON.stringify({ message: { content: "ok" }, done: true }), "application/x-ndjson")
                : stream(sse([delta({ content: "ok" }, "stop"), "[DONE]"]));
        },
        async () =>
          assert.equal(
            (
              await requestProviderReply({ ...settings, provider }, "system", "user", undefined, {
                onProgress: () => {},
              })
            ).content,
            "ok",
          ),
      );
    }
  }),
  defineTest("model discovery uses each provider's catalogue and authentication", async () => {
    for (const provider of ["openai-compatible", "deepseek", "anthropic", "gemini", "ollama"] as AiProvider[]) {
      await mock(
        async (input, init) => {
          const url = new URL(String(input)),
            headers = new Headers(init?.headers);
          assert.equal(
            url.pathname,
            provider === "ollama"
              ? "/api/tags"
              : provider === "gemini"
                ? "/v1beta/models"
                : provider === "anthropic"
                  ? "/v1/models"
                  : "/models",
          );
          assert.equal(
            headers.get(
              provider === "gemini" ? "x-goog-api-key" : provider === "anthropic" ? "x-api-key" : "Authorization",
            ),
            provider === "gemini" || provider === "anthropic" ? "test-key" : "Bearer test-key",
          );
          return new Response(
            JSON.stringify(
              provider === "gemini"
                ? {
                    models: [
                      { name: "models/chat", supportedGenerationMethods: ["generateContent"] },
                      { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
                    ],
                  }
                : provider === "ollama"
                  ? { models: [{ name: "chat" }] }
                  : { data: [{ id: "chat" }, { id: "chat" }] },
            ),
          );
        },
        async () =>
          assert.deepEqual(
            (await listProviderModels({ ...settings, provider })).map((m) => m.id),
            ["chat"],
          ),
      );
    }
  }),
  defineTest("model discovery follows pages and exposes errors instead of inventing availability", async () => {
    let count = 0;
    await mock(
      async (input) => {
        count++;
        const url = new URL(String(input));
        if (count === 2) assert.equal(url.searchParams.get("after_id"), "first");
        return new Response(
          JSON.stringify(
            count === 1 ? { data: [{ id: "first" }], has_more: true, last_id: "first" } : { data: [{ id: "second" }] },
          ),
        );
      },
      async () => assert.equal((await listProviderModels({ ...settings, provider: "anthropic" })).length, 2),
    );
    await mock(
      async () => new Response("denied", { status: 401 }),
      async () => assert.rejects(() => listProviderModels(settings), /HTTP 401/),
    );
    await mock(
      async () => new Response("{}"),
      async () => assert.rejects(() => listProviderModels(settings), /did not return a model list/),
    );
  }),
]);
