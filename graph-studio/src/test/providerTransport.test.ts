import assert from "node:assert/strict";
import { requestProviderText } from "../ai/providerTransport";
import type { AiProvider, AiSettings } from "../ai/types";
import { defineSuite, defineTest } from "./harness";

const providers: AiProvider[] = ["openai-compatible", "deepseek", "anthropic", "gemini", "ollama"];
const settings = (provider: AiProvider): AiSettings => ({
  provider,
  baseUrl: "https://provider.invalid/",
  apiKey: "test",
  model: "test-model",
  temperature: 0.1,
  maxTokens: 100,
  executionMode: "ask",
});

async function withFetch(fetcher: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

export const providerTransportSuite = defineSuite("AI provider transport", [
  defineTest("all providers preserve request signals and extract their supported text responses", async () => {
    const responses: Record<AiProvider, unknown> = {
      "openai-compatible": { choices: [{ message: { content: "answer" } }] },
      deepseek: { choices: [{ message: { content: "answer" } }] },
      anthropic: { content: [{ type: "text", text: "answer" }, { type: "other" }] },
      gemini: { candidates: [{ content: { parts: [{ text: "answer" }] } }] },
      ollama: { message: { content: "answer" } },
    };
    for (const provider of providers) {
      const controller = new AbortController();
      await withFetch(
        async (_url, init) => {
          assert.equal(init?.method, "POST");
          assert.equal(init?.signal, controller.signal);
          assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
          assert.ok(String(init?.body).includes("test-model") || provider === "gemini");
          return new Response(JSON.stringify(responses[provider]));
        },
        async () => {
          assert.equal(await requestProviderText(settings(provider), "system", "user", controller.signal), "answer");
        },
      );
    }
  }),
  defineTest("malformed provider payloads report a consistent content error", async () => {
    for (const payload of [null, [], "text", { content: {} }, { content: [null] }, { candidates: [null] }]) {
      await withFetch(
        async () => new Response(JSON.stringify(payload)),
        async () => {
          for (const provider of providers)
            await assert.rejects(
              requestProviderText(settings(provider), "", ""),
              /AI response did not include message content/,
            );
        },
      );
    }
  }),
  defineTest("text-part responses ignore non-text blocks and retain newlines", async () => {
    await withFetch(
      async () => new Response(JSON.stringify({ content: [null, { text: "one" }, { text: 3 }, { text: "two" }] })),
      async () => {
        assert.equal(await requestProviderText(settings("anthropic"), "", ""), "one\ntwo");
      },
    );
  }),
  defineTest("HTTP errors preserve provider messages, raw text and status fallback", async () => {
    for (const [body, message] of [
      ['{"error":{"message":"rate limited"}}', "rate limited"],
      ['{"error":"unavailable"}', "unavailable"],
      ["Bad gateway", "Bad gateway"],
      ["", "AI request failed with HTTP 503."],
      ['{"error":{"unexpected":true}}', "AI request failed with HTTP 503."],
    ]) {
      await withFetch(
        async () => new Response(body, { status: 503 }),
        async () => {
          await assert.rejects(requestProviderText(settings("ollama"), "", ""), { message });
        },
      );
    }
  }),
  defineTest("aborted requests propagate cancellation without a parsing error", async () => {
    const error = new DOMException("Cancelled", "AbortError");
    await withFetch(
      async () => {
        throw error;
      },
      async () => {
        await assert.rejects(requestProviderText(settings("ollama"), "", ""), (caught) => caught === error);
      },
    );
  }),
]);
