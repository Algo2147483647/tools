import { getDomainCommand } from "./domainRegistry";
import type { NodeKey } from "../graph/types";
import { getConsoleCommandReference } from "./reference";
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

export function getConsoleSuggestions(
  input: string,
  context?: import("./capabilities").CapabilityContext,
): ConsoleSuggestion[] {
  const COMMAND_TEMPLATES = getConsoleCommandReference(context);
  const trimmedStart = input.trimStart();
  if (!trimmedStart || !trimmedStart.startsWith("/")) {
    return [];
  }

  if (context?.dag) {
    const operand = /^(\/(?:use|ls|show|json|mv|rm|neighbors|path|edge|rm-edge|set|unset)\s+)([^\s"]*)$/.exec(
      trimmedStart,
    );
    if (operand)
      return Object.keys(context.dag.nodes)
        .filter((key) => key.toLowerCase().startsWith(operand[2].toLowerCase()))
        .slice(0, 8)
        .map((key) => ({ label: key, insertText: operand[1] + (/\s/.test(key) ? JSON.stringify(key) : key) }));
    const id = /^(.*"(?:id|edge|parent)"\s*:\s*")([^"\\]*)$/.exec(trimmedStart);
    if (id) {
      const candidates =
        trimmedStart.startsWith("/edge-data") || trimmedStart.startsWith("/flow")
          ? context.dag.edges.map((edge) => edge.id)
          : Object.keys(context.dag.nodes);
      return candidates
        .filter((key) => key.startsWith(id[2]))
        .slice(0, 8)
        .map((key) => ({ label: key, insertText: id[1].slice(0, -1) + JSON.stringify(key) }));
    }
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

export function isReadOnlyInstruction(instruction: import("./dsl").ConsoleInstruction): boolean {
  if (instruction.type === "domain") return getDomainCommand(instruction.family, instruction.action).effect === "query";
  return ["help", "keys", "graphStats", "find", "neighbors", "path", "list", "appearanceCssShow"].includes(
    instruction.type,
  );
}
