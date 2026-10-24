import type { AppearanceCommand } from "../../schema/appearanceCommands";
export interface ConsoleLineError {
  line: number;
  message: string;
}

export type ConsoleNodeOperand = { type: "key"; value: string } | { type: "context" };

export type ConsoleInstruction =
  | { type: "help"; line: number }
  | { type: "clear"; line: number }
  | { type: "keys"; line: number }
  | { type: "graphStats"; line: number }
  | { type: "find"; query: string; line: number }
  | { type: "neighbors"; key: ConsoleNodeOperand; depth: number; line: number }
  | { type: "path"; fromKey: ConsoleNodeOperand; toKey: ConsoleNodeOperand; line: number }
  | { type: "show"; key: ConsoleNodeOperand; line: number }
  | { type: "list"; key: ConsoleNodeOperand; line: number }
  | { type: "use"; key: ConsoleNodeOperand; line: number }
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

export type ConsoleToken =
  { type: "word"; value: string } | { type: "string"; value: string } | { type: "symbol"; value: "," | "=" };
