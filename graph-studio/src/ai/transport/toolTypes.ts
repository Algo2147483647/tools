export interface ModelTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: string;
}
export type ToolMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; reasoning?: string; calls: ModelToolCall[]; native?: unknown }
  | { role: "tool"; callId: string; name: string; content: string };
