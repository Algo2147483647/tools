import type { AiSettings } from "../types";
import { requestProviderText } from "./providerTransport";

interface StructuredRequest<Result> {
  settings: AiSettings;
  systemPrompt: string;
  prompt: string;
  signal?: AbortSignal;
  parse(raw: string): Result;
  repairPrompt(prompt: string, raw: string, error: unknown): string;
  repairError?(original: unknown, repaired: unknown): Error;
}

/** Repair protocol failures once; transport failures and cancellations are never retried here. */
export async function requestWithRepair<Result>(options: StructuredRequest<Result>): Promise<Result> {
  const { settings, systemPrompt, prompt, signal, parse } = options;
  const raw = await requestProviderText(settings, systemPrompt, prompt, signal);
  try {
    return parse(raw);
  } catch (original) {
    if (signal?.aborted) throw original;
    const repaired = await requestProviderText(
      settings,
      systemPrompt,
      options.repairPrompt(prompt, raw, original),
      signal,
    );
    try {
      return parse(repaired);
    } catch (error) {
      throw options.repairError ? options.repairError(original, error) : error;
    }
  }
}
