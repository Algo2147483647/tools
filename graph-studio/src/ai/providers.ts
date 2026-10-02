import { requestProviderText } from "./providerTransport";
import { parseAiResponse } from "./responseParser";
import type { AiContextPacket, AiRequest, AiResponse, AiSettings } from "./types";

const SYSTEM_PROMPT = [
  "You are DAG Studio's AI control assistant.",
  "You are running inside a structured graph editing agent harness.",
  "Use the Context Packet as the source of truth. Do not rely on hidden memory.",
  "The harness remembers active plans, pending command batches, recent events, graph revisions, and validation results.",
  "Every console command must start with / and must be one of the available commands in the command reference.",
  "Never mutate graph data directly. Use commands only.",
  "Resolve references in this priority order: activePlan, pendingCommandBatch, recentEvents, focused graph context, inspection commands, clarification.",
  "If the user says just now, above, as you said, based on your analysis, complete the changes, continue, or do it: first use activePlan or pendingCommandBatch when present.",
  "Do not ask the user to specify nodes when activePlan or recent artifacts already identify them.",
  "If graph facts are missing but inspectable, return inspect or read-only run_console commands such as /find, /ls, /neighbors, /path, or /graph.",
  "The response must be strict parseable JSON. Escape every double quote that appears inside command strings.",
  'When a /set command needs text, prefer unquoted plain text when possible; otherwise JSON-escape command quotes like: /set Water define \\"2H2 + O2 -> 2H2O\\".',
  "Do not wrap JSON in markdown fences.",
  "Return only JSON using response protocol v2:",
  '{"kind":"answer","answer":"..."}',
  '{"kind":"propose_changes","answer":"...","plan":{"title":"...","goal":"...","assumptions":[],"affectedNodes":[],"changes":[{"kind":"add_node","target":{"nodeId":"..."},"rationale":"...","draftCommands":["/add ..."],"risk":"low"}]},"draftCommands":[{"command":"/add ...","rationale":"...","risk":"low"}],"nextAction":{"type":"await_user_confirmation","message":"..."}}',
  '{"kind":"run_console","answer":"...","commandBatch":{"title":"...","commands":["/keys"],"expectedGraphEffects":[],"riskLevel":"low"},"preflightRequired":true}',
  '{"kind":"inspect","answer":"...","commands":["/find Group"]}',
  '{"kind":"clarify","answer":"...","missingInformation":[{"field":"...","reason":"..."}]}',
  "For analysis that implies edits, prefer propose_changes with draftCommands instead of plain answer.",
].join("\n");

export async function requestAiPlan({ settings, context, message, signal }: AiRequest): Promise<AiResponse> {
  const prompt = buildUserPrompt(context, message);
  const raw = await requestProviderText(settings, SYSTEM_PROMPT, prompt, signal);
  try {
    return parseAiResponse(raw);
  } catch (error) {
    const repairPrompt = buildRepairPrompt(prompt, raw, error);
    const repairedRaw = await requestProviderText(settings, SYSTEM_PROMPT, repairPrompt, signal);
    try {
      return parseAiResponse(repairedRaw);
    } catch (repairError) {
      const originalMessage = error instanceof Error ? error.message : "AI response could not be parsed.";
      const repairMessage =
        repairError instanceof Error ? repairError.message : "The repaired AI response could not be parsed.";
      throw new Error(`${originalMessage} Retried once, but the repaired response was still invalid: ${repairMessage}`);
    }
  }
}

export async function testAiConnection(settings: AiSettings, signal?: AbortSignal): Promise<string> {
  const raw = await requestProviderText(
    settings,
    'Return only a short JSON object: {"kind":"answer","answer":"ok"}.',
    "Reply with ok.",
    signal,
  );
  const plan = parseAiResponse(raw);
  return plan.kind === "answer" ? plan.answer : "ok";
}

function buildUserPrompt(context: AiContextPacket, message: string): string {
  return ["Context Packet:", JSON.stringify(context, null, 2), "", "Latest user request:", message].join("\n");
}

function buildRepairPrompt(originalPrompt: string, rawResponse: string, parseError: unknown): string {
  const message = parseError instanceof Error ? parseError.message : String(parseError);
  return [
    "Your previous response could not be parsed as JSON.",
    `Parse error: ${message}`,
    "",
    "Return the same intent as strict JSON only, following response protocol v2.",
    "Do not add markdown fences or commentary.",
    "Escape quotes inside command strings, especially /set text values.",
    "",
    "Original request:",
    originalPrompt,
    "",
    "Invalid response as a JSON string:",
    JSON.stringify(rawResponse),
  ].join("\n");
}
