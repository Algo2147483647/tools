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
  let buffer = "",
    data: string[] = [],
    complete = false,
    doneMarker = false,
    bytes = 0;
  const emit = (type: "reasoning" | "content", value: unknown) => {
    if (typeof value !== "string" || !value || signal?.aborted) return;
    if (type === "content") reply.content += value;
    else reply.reasoningCharacters = (reply.reasoningCharacters ?? 0) + value.length;
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
      if (typeof delta.refusal === "string") reply.refusal = (reply.refusal ?? "") + delta.refusal;
      if (typeof choice.finish_reason === "string") {
        reply.finishReason = choice.finish_reason;
        complete = true;
      }
    } else if (protocol === "anthropic") {
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
          for (const part of content.parts.filter(isRecord))
            emit(part.thought === true ? "reasoning" : "content", part.text);
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
      bytes += value?.byteLength ?? 0;
      if (bytes > 8_000_000) throw new Error("The model stream exceeded the response limit.");
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
    return reply;
  } finally {
    signal?.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
