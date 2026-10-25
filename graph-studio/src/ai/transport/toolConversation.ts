import type { AiSettings } from "../types";
import { providerOutputLimit } from "./models";
import { ProviderError, type ProviderReply } from "./providerTransport";
import { readProviderStream, type AiProgressListener } from "./streaming";
import type { ModelTool, ModelToolCall, ToolMessage } from "./toolTypes";

export type ToolReply = ProviderReply & { assistant: Extract<ToolMessage, { role: "assistant" }> };
const chatCalls = (calls: ModelToolCall[]) =>
  calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } }));

/** Native tool conversations. Never falls back to a JSON action prompt. */
export async function requestToolTurn(
  settings: AiSettings,
  system: string,
  messages: ToolMessage[],
  tools: ModelTool[],
  signal: AbortSignal,
  onProgress: AiProgressListener,
): Promise<ToolReply> {
  onProgress({ type: "start" });
  try {
    const capacity = await providerOutputLimit(settings, signal);
    const base = settings.baseUrl.trim().replace(/\/+$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let endpoint: string, body: Record<string, unknown>;
    const provider = settings.provider;
    if (provider === "anthropic") {
      if (capacity == null) throw new Error("Anthropic requires a service-advertised output capacity.");
      Object.assign(headers, {
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      });
      endpoint = `${base}/v1/messages`;
      const turns: { role: string; content: unknown[] }[] = [];
      for (const m of messages) {
        const role = m.role === "assistant" ? "assistant" : "user";
        const content =
          m.role === "tool"
            ? [{ type: "tool_result", tool_use_id: m.callId, content: m.content }]
            : m.role === "assistant"
              ? ((m.native as unknown[]) ?? [
                  ...(m.content ? [{ type: "text", text: m.content }] : []),
                  ...m.calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: JSON.parse(c.arguments) })),
                ])
              : [{ type: "text", text: m.content }];
        if (turns.at(-1)?.role === role) turns.at(-1)!.content.push(...content);
        else turns.push({ role, content });
      }
      body = {
        model: settings.model,
        system,
        stream: true,
        max_tokens: capacity,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages: turns,
      };
    } else if (provider === "gemini") {
      headers["x-goog-api-key"] = settings.apiKey;
      endpoint = `${base}/v1beta/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse`;
      const contents: { role: string; parts: unknown[] }[] = [];
      for (const m of messages) {
        const role = m.role === "assistant" ? "model" : "user";
        const parts =
          m.role === "tool"
            ? [
                {
                  functionResponse: {
                    name: m.name,
                    ...(!m.callId.startsWith("gemini-") ? { id: m.callId } : {}),
                    response: JSON.parse(m.content),
                  },
                },
              ]
            : m.role === "assistant"
              ? ((m.native as unknown[]) ?? [
                  ...(m.content ? [{ text: m.content }] : []),
                  ...m.calls.map((c) => ({ functionCall: { name: c.name, id: c.id, args: JSON.parse(c.arguments) } })),
                ])
              : [{ text: m.content }];
        if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push(...parts);
        else contents.push({ role, parts });
      }
      body = {
        systemInstruction: { parts: [{ text: system }] },
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          },
        ],
        contents,
        generationConfig: capacity == null ? {} : { maxOutputTokens: capacity },
      };
    } else {
      if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
      const ollama = provider === "ollama";
      endpoint = `${base}${ollama ? "/api/chat" : "/chat/completions"}`;
      const turns = messages.map((m) =>
        m.role === "assistant"
          ? {
              role: "assistant",
              content: m.content,
              ...(m.reasoning ? { [ollama ? "thinking" : "reasoning_content"]: m.reasoning } : {}),
              ...(m.calls.length
                ? {
                    tool_calls: ollama
                      ? m.calls.map((c) => ({ function: { name: c.name, arguments: JSON.parse(c.arguments) } }))
                      : chatCalls(m.calls),
                  }
                : {}),
            }
          : m.role === "tool"
            ? { role: "tool", content: m.content, ...(ollama ? { tool_name: m.name } : { tool_call_id: m.callId }) }
            : m,
      );
      body = {
        model: settings.model,
        stream: true,
        messages: [{ role: "system", content: system }, ...turns],
        tools: tools.map((t) => ({ type: "function", function: t })),
        ...(ollama
          ? { options: { num_predict: capacity ?? -1 } }
          : { ...(capacity == null ? {} : { max_tokens: capacity }), tool_choice: "auto" }),
        ...(!ollama && (provider === "deepseek" || new URL(base).hostname === "api.deepseek.com")
          ? { thinking: { type: "enabled" } }
          : {}),
      };
    }
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal });
    let reply: ProviderReply | undefined;
    let native: unknown;
    reply = await readProviderStream(
      response,
      provider === "anthropic"
        ? "anthropic"
        : provider === "gemini"
          ? "gemini"
          : provider === "ollama"
            ? "ollama"
            : "chat",
      onProgress,
      signal,
    );
    native = reply?.nativeContent;
    if (!reply) {
      const raw = await response.text();
      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new ProviderError(`Invalid tool response (HTTP ${response.status}).`, response.status);
      }
      if (!response.ok)
        throw new ProviderError(
          j.error?.message ?? j.error ?? `Tool request HTTP ${response.status}.`,
          response.status,
        );
      const calls: ModelToolCall[] = [];
      reply = { content: "", toolCalls: calls };
      if (provider === "anthropic") {
        native = j.content;
        for (const b of j.content ?? []) {
          if (b.type === "text") reply.content += b.text;
          if (b.type === "thinking") reply.reasoningContent = (reply.reasoningContent ?? "") + b.thinking;
          if (b.type === "tool_use") calls.push({ id: b.id, name: b.name, arguments: JSON.stringify(b.input) });
        }
        reply.finishReason = j.stop_reason;
        reply.usage = j.usage;
        reply.requestId = j.id;
      } else if (provider === "gemini") {
        native = j.candidates?.[0]?.content?.parts;
        for (const b of (native as any[]) ?? []) {
          if (b.text) {
            if (b.thought) reply.reasoningContent = (reply.reasoningContent ?? "") + b.text;
            else reply.content += b.text;
          }
          if (b.functionCall)
            calls.push({
              id: b.functionCall.id ?? `gemini-${messages.length}-${calls.length}`,
              name: b.functionCall.name,
              arguments: JSON.stringify(b.functionCall.args),
            });
        }
        reply.finishReason = j.candidates?.[0]?.finishReason;
        reply.usage = j.usageMetadata;
        reply.requestId = j.responseId;
      } else {
        const choice = j.choices?.[0];
        const m = choice?.message ?? j.message ?? {};
        reply.content = m.content ?? "";
        reply.reasoningContent = m.reasoning_content ?? m.thinking;
        for (const c of m.tool_calls ?? [])
          calls.push({
            id: c.id ?? `ollama-${messages.length}-${calls.length}`,
            name: c.function?.name,
            arguments:
              typeof c.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c.function?.arguments),
          });
        reply.finishReason = choice?.finish_reason ?? j.done_reason;
        reply.usage = j.usage;
        reply.requestId = j.id;
        reply.refusal = m.refusal;
      }
      if (reply.reasoningContent) onProgress({ type: "reasoning", text: reply.reasoningContent });
      onProgress({ type: "content", text: reply.content + (calls.length ? JSON.stringify(calls) : "") });
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (
      reply.refusal ||
      (reply.finishReason &&
        !["stop", "end_turn", "tool_use", "tool_calls", "stop_sequence"].includes(reply.finishReason.toLowerCase()))
    )
      throw new Error(`Tool generation did not complete: ${reply.refusal ?? reply.finishReason}.`);
    const calls = reply.toolCalls ?? [];
    if (
      calls.some((c) => !c.name || !c.id || typeof c.arguments !== "string") ||
      new Set(calls.map((c) => c.id)).size !== calls.length
    )
      throw new Error("Invalid or duplicate tool-call identifiers.");
    // Ollama omits call IDs; assign stable IDs unique within this conversation.
    if (provider === "ollama" || provider === "gemini")
      calls.forEach((c, i) => {
        if (provider === "ollama" || /^gemini-\d+$/.test(c.id)) c.id = `${provider}-${messages.length}-${i}`;
      });
    return {
      ...reply,
      reasoningCharacters: reply.reasoningContent?.length ?? reply.reasoningCharacters,
      assistant: {
        role: "assistant",
        content: reply.content,
        reasoning: reply.reasoningContent,
        calls,
        ...(native ? { native } : {}),
      },
    };
  } finally {
    onProgress({ type: "end" });
  }
}
