import type { ModelTool, ModelToolCall, ToolMessage } from "../transport/toolTypes";
import type { ToolReply } from "../transport/toolConversation";

export interface ToolResult {
  ok: boolean;
  tool: string;
  revision: string;
  data?: unknown;
  effects?: { graphEdits: number; styleEdits: number; runtime: number; viewers: number };
  diff?: string[];
  error?: { code: string; message: string; operation?: number };
}
export const TOOL_LIMITS = {
  turns: 20,
  calls: 100,
  callsPerTurn: 20,
  argumentCharacters: 64000,
  resultCharacters: 24000,
};
export function boundedResult(value: unknown): unknown {
  let truncated = false;
  const compact = (item: unknown, depth = 0): unknown => {
    if (typeof item === "string" && item.length > 4000) {
      truncated = true;
      return item.slice(0, 4000);
    }
    if (item && typeof item === "object") {
      if (depth > 12) {
        truncated = true;
        return "[depth limit]";
      }
      if (Array.isArray(item)) {
        if (item.length > 100) truncated = true;
        return item.slice(0, 100).map((v) => compact(v, depth + 1));
      }
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, compact(v, depth + 1)]));
    }
    return item;
  };
  const data = compact(value);
  const serialized = JSON.stringify(data);
  if (serialized.length > TOOL_LIMITS.resultCharacters)
    return {
      truncated: true,
      message: "Use a narrower query, field, offset or limit. Omitted records are not absent.",
      preview: serialized.slice(0, 16000),
    };
  return truncated
    ? { truncated: true, message: "Strings or collections were truncated; narrow the query.", data }
    : data;
}
export function isAnalysisOnlyRequest(message: string): boolean {
  return /(?:不要|不需要|禁止)(?:修改|执行|改动)|只(?:做)?(?:分析|解释|设计|评审|查询)|(?:analysis|explanation|design) only|do not (?:edit|modify|execute)|don't (?:edit|modify|execute)/i.test(
    message,
  );
}

/** Provider-native tool results are paired by call ID; prose is never parsed as an executable operation. */
export async function runToolLoop(input: {
  messages: ToolMessage[];
  tools: () => ModelTool[];
  request: (messages: ToolMessage[], tools: ModelTool[]) => Promise<ToolReply>;
  execute: (name: string, args: unknown) => Promise<ToolResult>;
  snapshot: () => string;
  signal: AbortSignal;
  onText: (text: string) => void;
  onCall?: (call: ModelToolCall) => void;
}): Promise<void> {
  const messages = [...input.messages];
  const ids = new Set<string>();
  let expected = input.snapshot(),
    count = 0;
  const check = () => {
    if (input.signal.aborted)
      throw new DOMException("AI request cancelled. Completed edits remain undoable.", "AbortError");
    if (expected !== input.snapshot())
      throw new Error("Document, view or settings changed. Pending AI operations were discarded.");
  };
  for (let turn = 0; turn < TOOL_LIMITS.turns; turn++) {
    check();
    const tools = input.tools();
    const reply = await input.request(messages, tools);
    check();
    const assistant = reply.assistant;
    if (assistant.calls.length > TOOL_LIMITS.callsPerTurn || count + assistant.calls.length > TOOL_LIMITS.calls)
      throw new Error("AI tool-call budget exceeded. Completed edits remain undoable.");
    // Validate all IDs before executing any call in this response.
    const newIds = new Set<string>();
    for (const call of assistant.calls) {
      if (!call.id || ids.has(call.id) || newIds.has(call.id))
        throw new Error("Duplicate tool call ID; response was not executed.");
      newIds.add(call.id);
    }
    if (assistant.content.trim()) input.onText(assistant.content);
    if (!assistant.calls.length) {
      if (!assistant.content.trim()) throw new Error("AI returned no answer or tool calls.");
      return;
    }
    messages.push(assistant);
    let failed = false;
    for (const call of assistant.calls) {
      check();
      ids.add(call.id);
      count++;
      input.onCall?.(call);
      let result: ToolResult;
      try {
        if (failed)
          throw new Error(
            "A preceding call in this response failed. Inspect its result and submit a corrected sequence.",
          );
        if (!tools.some((t) => t.name === call.name))
          throw new Error(`Tool ${call.name} was not offered for this context.`);
        if (call.arguments.length > TOOL_LIMITS.argumentCharacters)
          throw new Error("Tool arguments exceed the size limit.");
        result = await input.execute(call.name, JSON.parse(call.arguments));
      } catch (error) {
        result = {
          ok: false,
          tool: call.name,
          revision: input.snapshot(),
          error: {
            code: failed ? "DEPENDENCY_FAILED" : "TOOL_ERROR",
            message: error instanceof Error ? error.message : "Tool failed.",
          },
        };
      }
      if (result.error?.code === "STALE_CONTEXT" || result.error?.code === "CANCELLED")
        throw new Error(result.error.message);
      expected = result.revision;
      check();
      failed ||= !result.ok;
      messages.push({ role: "tool", callId: call.id, name: call.name, content: JSON.stringify(boundedResult(result)) });
    }
  }
  throw new Error(
    `AI reached its ${TOOL_LIMITS.turns}-turn limit. Completed edits remain undoable; no pending calls were executed.`,
  );
}
