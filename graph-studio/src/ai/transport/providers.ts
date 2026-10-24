import { SYSTEM_PROMPT, buildRepairPrompt, buildUserPrompt } from "../protocol/editingPrompt";
import { parseAiResponse } from "../protocol/responseParser";
import type { AiRequest, AiResponse, AiSettings } from "../types";
import { requestProviderText } from "./providerTransport";
import { requestWithRepair } from "./requestWithRepair";

export async function requestAiPlan({ settings, context, message, signal }: AiRequest): Promise<AiResponse> {
  const prompt = buildUserPrompt(context, message);
  return requestWithRepair({
    settings,
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    signal,
    parse: parseAiResponse,
    repairPrompt: buildRepairPrompt,
    repairError(error, repairError) {
      const originalMessage = error instanceof Error ? error.message : "AI response could not be parsed.";
      const repairMessage =
        repairError instanceof Error ? repairError.message : "The repaired AI response could not be parsed.";
      return new Error(
        `${originalMessage} Retried once, but the repaired response was still invalid: ${repairMessage}`,
      );
    },
  });
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
