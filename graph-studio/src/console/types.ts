export interface ConsoleEntry {
  id: number;
  tone: "input" | "success" | "error" | "info" | "ai" | "ai-action";
  text: string;
}
