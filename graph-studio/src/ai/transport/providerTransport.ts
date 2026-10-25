import { isRecord } from "../../shared/json";
import type { AiSettings } from "../types";
export interface ProviderReply {
  content: string;
  structuredValue?: unknown;
  finishReason?: string;
  refusal?: string;
  requestId?: string;
  usage?: Record<string, unknown>;
  reasoningCharacters?: number;
}
export interface ProviderOutput {
  schema?: Record<string, unknown>;
  purpose?: "layout";
}
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
export async function requestProviderText(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const reply = await requestProviderReply(settings, systemPrompt, userPrompt, signal);
  if (!reply.content) throw new Error(reply.refusal || "AI response did not include message content.");
  return reply.content;
}
export async function requestProviderReply(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  output: ProviderOutput = {},
): Promise<ProviderReply> {
  switch (settings.provider) {
    case "anthropic":
      return requestAnthropic(settings, systemPrompt, userPrompt, signal, output);
    case "gemini":
      return requestGemini(settings, systemPrompt, userPrompt, signal, output);
    case "ollama":
      return requestOllama(settings, systemPrompt, userPrompt, signal, output);
    default:
      return requestOpenAiCompatible(settings, systemPrompt, userPrompt, signal, output);
  }
}

async function requestOpenAiCompatible(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  output: ProviderOutput = {},
): Promise<ProviderReply> {
  const disableThinking =
    output.purpose === "layout" && (settings.provider === "deepseek" || isDeepSeekEndpoint(settings.baseUrl));
  const response = await fetch(`${trimTrailingSlash(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    signal,
    headers: buildJsonHeaders(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const json = await parseResponseJson(response);
  const choice: unknown = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : {};
  return {
    content: readMessageText(message),
    structuredValue: message.parsed,
    reasoningCharacters: typeof message.reasoning_content === "string" ? message.reasoning_content.length : undefined,
    finishReason: stringValue(isRecord(choice) ? choice.finish_reason : undefined),
    refusal: stringValue(message.refusal),
    requestId: stringValue(json.id) ?? response.headers?.get("x-request-id") ?? undefined,
    usage: isRecord(json.usage) ? json.usage : undefined,
  };
}

async function requestAnthropic(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  output: ProviderOutput = {},
): Promise<ProviderReply> {
  const response = await fetch(`${trimTrailingSlash(settings.baseUrl)}/v1/messages`, {
    method: "POST",
    signal,
    headers: buildJsonHeaders({
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
    body: JSON.stringify({
      model: settings.model,
      system: systemPrompt,
      ...(output.schema ? { output_config: { format: { type: "json_schema", schema: output.schema } } } : {}),
      max_tokens: settings.maxTokens,
      temperature: settings.temperature,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const json = await parseResponseJson(response);
  return {
    content: readTextParts(json.content),
    finishReason: stringValue(json.stop_reason),
    refusal: json.stop_reason === "refusal" ? "The model declined this request." : undefined,
    requestId: stringValue(json.id),
    usage: isRecord(json.usage) ? json.usage : undefined,
  };
}

async function requestGemini(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  output: ProviderOutput = {},
): Promise<ProviderReply> {
  const endpoint = `${trimTrailingSlash(settings.baseUrl)}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
  const url = settings.apiKey ? `${endpoint}?key=${encodeURIComponent(settings.apiKey)}` : endpoint;
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTokens,
        ...(output.schema
          ? { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: output.schema } } }
          : { responseMimeType: "application/json" }),
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    }),
  });
  const json = await parseResponseJson(response);
  const candidate: unknown = Array.isArray(json.candidates) ? json.candidates[0] : undefined;
  const content = isRecord(candidate) ? candidate.content : undefined;
  return {
    content: readTextParts(isRecord(content) ? content.parts : undefined),
    finishReason: stringValue(isRecord(candidate) ? candidate.finishReason : undefined),
    refusal: isRecord(json.promptFeedback) ? stringValue(json.promptFeedback.blockReason) : undefined,
    requestId: stringValue(json.responseId),
    usage: isRecord(json.usageMetadata) ? json.usageMetadata : undefined,
  };
}

async function requestOllama(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  output: ProviderOutput = {},
): Promise<ProviderReply> {
  const response = await fetch(`${trimTrailingSlash(settings.baseUrl)}/api/chat`, {
    method: "POST",
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      ...(output.schema ? { format: output.schema } : { format: "json" }),
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxTokens,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const json = await parseResponseJson(response);
  return {
    content: readMessageText(json.message),
    finishReason: stringValue(json.done_reason),
    usage: { promptTokens: json.prompt_eval_count, outputTokens: json.eval_count },
  };
}

function readMessageText(message: unknown): string {
  if (!isRecord(message)) return "";
  return typeof message.content === "string" ? message.content : readTextParts(message.content);
}

function readTextParts(parts: unknown): string {
  const text = Array.isArray(parts)
    ? parts
        .filter(isRecord)
        .filter((part) => part.thought !== true && (!part.type || part.type === "text" || part.type === "output_text"))
        .map((part) => part.text)
        .filter((part): part is string => typeof part === "string")
        .join("\n")
    : "";
  return text;
}

async function parseResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const record = isRecord(json) ? json : {};
  if (!response.ok) {
    const message =
      (isRecord(record.error) ? record.error.message : undefined) ||
      record.error ||
      text ||
      `AI request failed with HTTP ${response.status}.`;
    throw new ProviderError(
      typeof message === "string" ? message : `AI request failed with HTTP ${response.status}.`,
      response.status,
    );
  }
  if (!isRecord(json)) throw new ProviderError("Provider returned an invalid response envelope.");
  return record;
}

function buildJsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  Object.keys(headers).forEach((key) => {
    if (!headers[key]) {
      delete headers[key];
    }
  });
  return headers;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isDeepSeekEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}
