export type AiProvider = "openai-compatible" | "deepseek" | "anthropic" | "gemini" | "ollama";

export interface AiSettings {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}
