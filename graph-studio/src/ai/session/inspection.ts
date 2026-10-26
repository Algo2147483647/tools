import type { AiContextPacket, AiResponse } from "../types";
import { parseConsoleSource } from "../../console/dsl";
import { isReadOnlyInstruction } from "../../console/presentation";

export function isAnalysisOnlyRequest(message: string): boolean {
  return /(?:不要|不需要|禁止)(?:修改|执行|改动)|只(?:做)?(?:分析|解释|设计|评审|查询)|(?:analysis|explanation|design) only|do not (?:edit|modify|execute)|don't (?:edit|modify|execute)/i.test(
    message,
  );
}

export function inspectionCommands(response: AiResponse): string[] | null {
  if (response.kind === "inspect") return response.commands;
  if (response.kind === "run_console") {
    const parsed = parseConsoleSource(response.commandBatch.commands.join("\n"));
    if (parsed.ok && parsed.instructions.length && parsed.instructions.every(isReadOnlyInstruction))
      return response.commandBatch.commands;
  }
  return null;
}

export function boundedInspectionResult(result: unknown): unknown {
  const compact = (value: unknown, depth = 0): unknown => {
    if (typeof value === "string")
      return value.length > 4000 ? value.slice(0, 4000) + "… [truncated; narrow the query]" : value;
    if (value && typeof value === "object") {
      if (depth > 12) return "[depth limit]";
      if (Array.isArray(value)) return value.slice(0, 100).map((item) => compact(item, depth + 1));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item, depth + 1)]));
    }
    return value;
  };
  const data = compact(result);
  const text = JSON.stringify(data) ?? "null";
  return text.length <= 24000
    ? data
    : {
        truncated: true,
        message: "Result exceeds the budget. Narrow the query or use offset/limit.",
        preview: text.slice(0, 16000),
      };
}

/** Queries are pure; no document, UI or plan mutation occurs in the inspection loop. */
export async function runInspectionLoop(input: {
  context: AiContextPacket;
  request: (context: AiContextPacket) => Promise<AiResponse>;
  inspect: (commands: string[]) => Promise<unknown>;
  isCurrent: () => boolean;
  signal: AbortSignal;
  onInspection?: (round: number, commands: string[]) => void;
}): Promise<AiResponse> {
  const seen = new Set<string>();
  const results: unknown[] = [];
  for (let round = 0; round < 6; round++) {
    if (input.signal.aborted) throw new DOMException("AI request cancelled.", "AbortError");
    if (!input.isCurrent()) throw new Error("Document or view changed during inspection.");
    const response = await input.request({
      ...input.context,
      execution: { ...input.context.execution, inspectionResults: results },
    });
    if (input.signal.aborted) throw new DOMException("AI request cancelled.", "AbortError");
    if (!input.isCurrent()) throw new Error("Document or view changed during inspection.");
    const commands = inspectionCommands(response);
    if (!commands) return response;
    if (!commands.length || commands.length > 20 || commands.join("\n").length > 32000)
      throw new Error("Inspection command budget exceeded.");
    const signature = JSON.stringify(commands.map((command) => command.trim()));
    if (seen.has(signature))
      throw new Error("AI repeated an inspection without making progress. No edits were applied.");
    seen.add(signature);
    input.onInspection?.(round + 1, commands);
    const result = await input.inspect(commands);
    results.push({ commands, result: boundedInspectionResult(result) });
  }
  throw new Error("AI inspection limit reached (6 turns). No edits were applied.");
}
