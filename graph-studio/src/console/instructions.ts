import type { AppearanceCommand } from "../schema/appearance/commands";
export type ConsoleNodeOperand = string;

export type ConsoleInstruction =
  | import("./domainRegistry").DomainInstruction
  | {
      type: "query";
      action: "graph" | "node" | "search" | "neighbors" | "path";
      args: Record<string, unknown>;
      line: number;
    }
  | { type: "show"; key: ConsoleNodeOperand; line: number }
  | { type: "rename"; oldKey: ConsoleNodeOperand; newKey: string; line: number }
  | { type: "delete"; key: ConsoleNodeOperand; recursive: boolean; line: number }
  | { type: "add"; key: string; parentKey?: ConsoleNodeOperand; line: number }
  | { type: "copy"; sourceKey: ConsoleNodeOperand; key: string; parentKey?: ConsoleNodeOperand; line: number }
  | {
      type: "setEdge";
      parentKey: ConsoleNodeOperand;
      childKey: ConsoleNodeOperand;
      weight?: string | number | boolean | null;
      createMissing?: boolean;
      line: number;
    }
  | { type: "removeEdge"; parentKey: ConsoleNodeOperand; childKey: ConsoleNodeOperand; line: number }
  | { type: "setParents"; key: ConsoleNodeOperand; keys: ConsoleNodeOperand[]; line: number }
  | { type: "setChildren"; key: ConsoleNodeOperand; keys: ConsoleNodeOperand[]; line: number }
  | { type: "setField"; key: ConsoleNodeOperand; field: string; value: unknown; line: number }
  | { type: "unsetField"; key: ConsoleNodeOperand; field: string; line: number }
  | { type: "appearance"; command: AppearanceCommand; line: number }
  | { type: "appearanceCssShow"; line: number }
  | { type: "json"; key: ConsoleNodeOperand; line: number };
