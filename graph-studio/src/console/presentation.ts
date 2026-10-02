import type { NodeKey } from "../graph/types";
import { CONSOLE_COMMAND_REFERENCE } from "./reference";
import type { ConsoleSuggestion } from "./types";

export function buildConsoleSuccessMessage(
  instructionCount: number,
  mutationCount: number,
  appearanceMutationCount: number,
  contextNodeKey: NodeKey | null,
  uiEffectType: "show" | "json" | undefined,
): string {
  const parts = [`${instructionCount} instruction${instructionCount === 1 ? "" : "s"} executed`];
  if (mutationCount > 0) {
    parts.push(`${mutationCount} mutation${mutationCount === 1 ? "" : "s"} committed`);
  }
  if (appearanceMutationCount > 0) {
    parts.push(`${appearanceMutationCount} appearance update${appearanceMutationCount === 1 ? "" : "s"} committed`);
  }
  if (uiEffectType === "show") {
    parts.push("node viewer opened");
  } else if (uiEffectType === "json") {
    parts.push("raw JSON editor opened");
  }
  parts.push(`context=${contextNodeKey || "unset"}`);
  return `${parts.join(", ")}.`;
}

export function requiresGraphForConsoleInstruction(type: string): boolean {
  return !["help", "clear", "appearance", "appearanceCssShow"].includes(type);
}

export function buildConsolePrompt(contextNodeKey: NodeKey | null): string {
  return contextNodeKey ? `${contextNodeKey}>` : "graph>";
}

const COMMAND_TEMPLATES: ConsoleSuggestion[] = [
  ...CONSOLE_COMMAND_REFERENCE.map((command) => ({ label: command.label, insertText: command.insertText })),
];

export function getConsoleSuggestions(input: string): ConsoleSuggestion[] {
  const trimmedStart = input.trimStart();
  if (!trimmedStart || !trimmedStart.startsWith("/")) {
    return [];
  }

  const hasWhitespace = /\s/.test(trimmedStart);
  if (!hasWhitespace) {
    const lower = trimmedStart.toLowerCase();
    return COMMAND_TEMPLATES.filter((item) => item.label.toLowerCase().startsWith(lower)).slice(0, 8);
  }

  const mnemonic = trimmedStart.split(/\s+/, 1)[0]?.toLowerCase() || "";
  return COMMAND_TEMPLATES.filter(
    (item) => item.label.toLowerCase().startsWith(`${mnemonic} `) || item.label.toLowerCase() === mnemonic,
  ).slice(0, 6);
}
