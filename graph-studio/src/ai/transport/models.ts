import type { AiSettings } from "../types";
import { isRecord } from "../../shared/json";

export interface AvailableModel {
  id: string;
  label: string;
}

/** Read the configured service's catalogue; never assume a preset is available. */
export async function listProviderModels(settings: AiSettings, signal?: AbortSignal): Promise<AvailableModel[]> {
  const base = settings.baseUrl.trim().replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  const provider = settings.provider;
  if (settings.apiKey) {
    if (provider === "anthropic") headers["x-api-key"] = settings.apiKey;
    else if (provider === "gemini") headers["x-goog-api-key"] = settings.apiKey;
    else headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  if (provider === "anthropic")
    Object.assign(headers, {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  const endpoint = `${base}${provider === "ollama" ? "/api/tags" : provider === "gemini" ? "/v1beta/models" : provider === "anthropic" ? "/v1/models" : "/models"}`;
  let cursor = "";
  const seen = new Set<string>();
  const models = new Map<string, AvailableModel>();
  do {
    const url = new URL(endpoint);
    if (cursor) url.searchParams.set(provider === "gemini" ? "pageToken" : "after_id", cursor);
    const response = await fetch(url, { headers, signal });
    if (!response.ok)
      throw new Error(`Could not load models (HTTP ${response.status}). You can still enter a model ID.`);
    const json: unknown = await response.json();
    if (!isRecord(json)) throw new Error("The service returned an invalid model list.");
    const entries = provider === "ollama" || provider === "gemini" ? json.models : json.data;
    if (!Array.isArray(entries))
      throw new Error("This service did not return a model list. Enter a model ID manually.");
    for (const entry of entries.filter(isRecord)) {
      if (
        provider === "gemini" &&
        Array.isArray(entry.supportedGenerationMethods) &&
        !entry.supportedGenerationMethods.includes("generateContent")
      )
        continue;
      const rawId = provider === "ollama" || provider === "gemini" ? entry.name : entry.id;
      if (typeof rawId !== "string" || !rawId) continue;
      const id = provider === "gemini" ? rawId.replace(/^models\//, "") : rawId;
      const name = entry.display_name ?? entry.displayName ?? entry.name;
      models.set(id, { id, label: typeof name === "string" ? name : id });
    }
    const next =
      provider === "gemini" ? json.nextPageToken : provider === "anthropic" && json.has_more ? json.last_id : "";
    cursor = typeof next === "string" ? next : "";
    if (cursor && seen.has(cursor)) throw new Error("The service repeated a model-list page. Please retry.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}
