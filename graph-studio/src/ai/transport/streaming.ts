import { isRecord } from "../../shared/json";
import type { ProviderReply } from "./providerTransport";

export type AiProgressEvent = { type: "start" } | { type: "end" } | { type: "reasoning" | "content"; text: string };
export type AiProgressListener = (event: AiProgressEvent) => void;
export type StreamProtocol = "chat" | "anthropic" | "gemini" | "ollama";

/** Decode SSE/NDJSON across arbitrary UTF-8 and network chunk boundaries. */
export async function readProviderStream(
  response: Response,
  protocol: StreamProtocol,
  onProgress: AiProgressListener,
  signal?: AbortSignal,
): Promise<ProviderReply | undefined> {
  const mime = response.headers?.get("content-type") ?? "";
  const ndjson = /ndjson|jsonl/.test(mime);
  if (!response.ok || (!mime.includes("text/event-stream") && !ndjson)) return;
  if (!response.body) throw new Error("The model returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const reply: ProviderReply = { content: "", reasoningCharacters: 0 };
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const blocks = new Map<number, Record<string, any>>();
  const blockArguments = new Map<number, string>();
  const nativeParts: unknown[] = [];
  let buffer = "",
    data: string[] = [],
    complete = false,
    doneMarker = false;
  const emit = (type: "reasoning" | "content", value: unknown) => {
    if (typeof value !== "string" || !value || signal?.aborted) return;
    if (type === "content") reply.content += value;
    else {
      reply.reasoningCharacters = (reply.reasoningCharacters ?? 0) + value.length;
      reply.reasoningContent = (reply.reasoningContent ?? "") + value;
    }
    onProgress({ type, text: value });
  };
  const record = (value: string) => {
    if (value === "[DONE]") {
      doneMarker = true;
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("The model stream contained an invalid event.");
    }
    if (!isRecord(parsed)) throw new Error("The model stream contained an invalid event.");
    const j = parsed;
    if (j.error || j.type === "error")
      throw new Error(
        isRecord(j.error) && typeof j.error.message === "string"
          ? j.error.message
          : "The model reported a streaming error.",
      );
    if (typeof j.id === "string") reply.requestId = j.id;
    if (isRecord(j.usage)) reply.usage = { ...reply.usage, ...j.usage };
    if (protocol === "chat") {
      const choice = Array.isArray(j.choices)
        ? j.choices.find((c) => isRecord(c) && (c.index === 0 || c.index === undefined))
        : undefined;
      if (!isRecord(choice)) return;
      const delta = isRecord(choice.delta) ? choice.delta : {};
      emit("reasoning", delta.reasoning_content ?? delta.reasoning);
      emit("content", delta.content);
      if (Array.isArray(delta.tool_calls))
        for (const part of delta.tool_calls.filter(isRecord)) {
          const index = typeof part.index === "number" ? part.index : 0;
          const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
          if (typeof part.id === "string") call.id = part.id;
          if (isRecord(part.function)) {
            if (typeof part.function.name === "string") call.name += part.function.name;
            if (typeof part.function.arguments === "string") call.arguments += part.function.arguments;
            onProgress({ type: "content", text: JSON.stringify(part.function) });
          }
          calls.set(index, call);
        }
      if (typeof delta.refusal === "string") reply.refusal = (reply.refusal ?? "") + delta.refusal;
      if (typeof choice.finish_reason === "string") {
        reply.finishReason = choice.finish_reason;
        complete = true;
      }
    } else if (protocol === "anthropic") {
      const index = typeof j.index === "number" ? j.index : 0;
      if (j.type === "content_block_start" && isRecord(j.content_block)) {
        blocks.set(index, { ...j.content_block });
        if (j.content_block.type === "tool_use") onProgress({ type: "content", text: String(j.content_block.name) });
      }
      if (j.type === "content_block_delta" && isRecord(j.delta)) {
        const b = blocks.get(index);
        if (b) {
          if (typeof j.delta.text === "string") b.text = (b.text ?? "") + j.delta.text;
          if (typeof j.delta.thinking === "string") b.thinking = (b.thinking ?? "") + j.delta.thinking;
          if (typeof j.delta.signature === "string") b.signature = (b.signature ?? "") + j.delta.signature;
          if (typeof j.delta.partial_json === "string") {
            blockArguments.set(index, (blockArguments.get(index) ?? "") + j.delta.partial_json);
            onProgress({ type: "content", text: j.delta.partial_json });
          }
        }
      }
      if (j.type === "message_start" && isRecord(j.message)) {
        if (typeof j.message.id === "string") reply.requestId = j.message.id;
        if (isRecord(j.message.usage)) reply.usage = j.message.usage;
      }
      const delta = isRecord(j.delta) ? j.delta : isRecord(j.content_block) ? j.content_block : {};
      emit("content", delta.text);
      emit("reasoning", delta.thinking);
      if (typeof delta.stop_reason === "string") {
        reply.finishReason = delta.stop_reason;
        if (delta.stop_reason === "refusal") reply.refusal = "The model declined this request.";
      }
      if (j.type === "message_stop") complete = true;
    } else if (protocol === "gemini") {
      const candidate = Array.isArray(j.candidates) ? j.candidates[0] : undefined;
      if (isRecord(candidate)) {
        const content = isRecord(candidate.content) ? candidate.content : {};
        if (Array.isArray(content.parts))
          for (const part of content.parts.filter(isRecord)) {
            nativeParts.push(part);
            emit(part.thought === true ? "reasoning" : "content", part.text);
            if (isRecord(part.functionCall)) {
              const index = calls.size;
              calls.set(index, {
                id: typeof part.functionCall.id === "string" ? part.functionCall.id : `gemini-${index}`,
                name: String(part.functionCall.name),
                arguments: JSON.stringify(part.functionCall.args ?? {}),
              });
              onProgress({ type: "content", text: JSON.stringify(part.functionCall) });
            }
          }
        if (typeof candidate.finishReason === "string") {
          reply.finishReason = candidate.finishReason;
          complete = true;
        }
      }
      if (typeof j.responseId === "string") reply.requestId = j.responseId;
      if (isRecord(j.usageMetadata)) reply.usage = j.usageMetadata;
      if (isRecord(j.promptFeedback) && typeof j.promptFeedback.blockReason === "string") {
        reply.refusal = j.promptFeedback.blockReason;
        complete = true;
      }
    } else {
      if (isRecord(j.message)) {
        emit("reasoning", j.message.thinking);
        emit("content", j.message.content);
        if (Array.isArray(j.message.tool_calls))
          for (const part of j.message.tool_calls.filter(isRecord)) {
            if (isRecord(part.function)) {
              const index = calls.size;
              calls.set(index, {
                id: typeof part.id === "string" ? part.id : `ollama-${index}`,
                name: String(part.function.name),
                arguments: JSON.stringify(part.function.arguments),
              });
              onProgress({ type: "content", text: JSON.stringify(part.function) });
            }
          }
      }
      if (j.done === true) {
        complete = true;
        reply.finishReason = typeof j.done_reason === "string" ? j.done_reason : "stop";
        reply.usage = { promptTokens: j.prompt_eval_count, outputTokens: j.eval_count };
      }
    }
  };
  const line = (value: string) => {
    if (ndjson) {
      if (value.trim()) record(value);
      return;
    }
    if (!value) {
      if (data.length) record(data.join("\n"));
      data = [];
    } else if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /, ""));
  };
  const cancelled = () => {
    if (signal?.aborted) throw new DOMException("AI request cancelled.", "AbortError");
  };
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (!doneMarker) {
      cancelled();
      const { value, done } = await reader.read();
      cancelled();
      buffer += decoder.decode(value, { stream: !done });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, index).replace(/\r$/, ""));
        buffer = buffer.slice(index + 1);
      }
      if (done) {
        if (buffer) line(buffer.replace(/\r$/, ""));
        if (data.length) record(data.join("\n"));
        break;
      }
    }
    if (!complete) throw new Error("The model stream ended before completion. Current work was not applied.");
    if (blocks.size) {
      reply.nativeContent = [...blocks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, b]) => {
          if (b.type === "tool_use") {
            if (blockArguments.has(index)) b.input = JSON.parse(blockArguments.get(index)!);
            calls.set(index, { id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
          }
          return b;
        });
    }
    if (nativeParts.length) reply.nativeContent = nativeParts;
    if (calls.size) reply.toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    return reply;
  } finally {
    signal?.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
