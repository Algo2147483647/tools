import type { AiSettings } from "./types";
export async function requestProviderText(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  switch (settings.provider) {
    case "deepseek":
      return requestOpenAiCompatible(settings, systemPrompt, userPrompt, signal);
    case "anthropic":
      return requestAnthropic(settings, systemPrompt, userPrompt, signal);
    case "gemini":
      return requestGemini(settings, systemPrompt, userPrompt, signal);
    case "ollama":
      return requestOllama(settings, systemPrompt, userPrompt, signal);
    default:
      return requestOpenAiCompatible(settings, systemPrompt, userPrompt, signal);
  }
}

async function requestOpenAiCompatible(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${trimTrailingSlash(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    signal,
    headers: buildJsonHeaders(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const json = await parseResponseJson(response);
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("AI response did not include message content.");
  }
  return text;
}

async function requestAnthropic(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
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
      max_tokens: settings.maxTokens,
      temperature: settings.temperature,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const json = await parseResponseJson(response);
  const text = json?.content
    ?.map((item: { text?: unknown }) => item.text)
    .filter((item: unknown) => typeof item === "string")
    .join("\n");
  if (typeof text !== "string" || !text) {
    throw new Error("AI response did not include message content.");
  }
  return text;
}

async function requestGemini(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
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
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    }),
  });
  const json = await parseResponseJson(response);
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => part.text)
    .filter((item: unknown) => typeof item === "string")
    .join("\n");
  if (typeof text !== "string" || !text) {
    throw new Error("AI response did not include message content.");
  }
  return text;
}

async function requestOllama(
  settings: AiSettings,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${trimTrailingSlash(settings.baseUrl)}/api/chat`, {
    method: "POST",
    signal,
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      model: settings.model,
      stream: false,
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
  const text = json?.message?.content;
  if (typeof text !== "string") {
    throw new Error("AI response did not include message content.");
  }
  return text;
}

async function parseResponseJson(response: Response): Promise<any> {
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = json?.error?.message || json?.error || text || `AI request failed with HTTP ${response.status}.`;
    throw new Error(typeof message === "string" ? message : `AI request failed with HTTP ${response.status}.`);
  }
  return json;
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
