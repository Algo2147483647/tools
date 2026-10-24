import { expectWordToken,parseLiteralToken,parseSetValueTokens } from "../syntax/literals";
import { parseNodeOperand } from "../syntax/operands";
import type { ConsoleInstruction,ConsoleToken } from "../syntax/types";

export function parseRenameInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 3) {
    return { ok: false, error: { line, message: "mv expects <old-key> <new-key>." } } as const;
  }
  const oldKey = parseNodeOperand(tokens[1], true);
  const newKey = parseLiteralToken(tokens[2]);
  if (!oldKey || !newKey) {
    return { ok: false, error: { line, message: "mv expects <old-key> <new-key>." } } as const;
  }
  return { ok: true, instruction: { type: "rename", oldKey, newKey, line } satisfies ConsoleInstruction } as const;
}

export function parseDeleteInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length === 2) {
    const key = parseNodeOperand(tokens[1], true);
    if (!key) {
      return { ok: false, error: { line, message: "rm expects a node operand." } } as const;
    }
    return { ok: true, instruction: { type: "delete", key, recursive: false, line } } as const;
  }
  if (tokens.length === 3 && expectWordToken(tokens[1])?.value === "-r") {
    const key = parseNodeOperand(tokens[2], true);
    if (!key) {
      return { ok: false, error: { line, message: "rm -r expects a node operand." } } as const;
    }
    return { ok: true, instruction: { type: "delete", key, recursive: true, line } } as const;
  }
  return { ok: false, error: { line, message: "rm expects either <node> or -r <node>." } } as const;
}

export function parseAddInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 2 && tokens.length !== 4) {
    return { ok: false, error: { line, message: "add expects <new-key> or <new-key> -p <parent>." } } as const;
  }
  const key = parseLiteralToken(tokens[1]);
  if (!key) {
    return { ok: false, error: { line, message: "add expects a new node key." } } as const;
  }
  if (tokens.length === 2) {
    return { ok: true, instruction: { type: "add", key, line } } as const;
  }
  if (expectWordToken(tokens[2])?.value !== "-p") {
    return { ok: false, error: { line, message: "add only supports the -p modifier." } } as const;
  }
  const parentKey = parseNodeOperand(tokens[3], true);
  if (!parentKey) {
    return { ok: false, error: { line, message: "add -p expects a parent node operand." } } as const;
  }
  return { ok: true, instruction: { type: "add", key, parentKey, line } } as const;
}

export function parseCopyInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 3 && tokens.length !== 5) {
    return {
      ok: false,
      error: { line, message: "cp expects <source> <new-key> or <source> <new-key> -p <parent>." },
    } as const;
  }
  const sourceKey = parseNodeOperand(tokens[1], true);
  const key = parseLiteralToken(tokens[2]);
  if (!sourceKey || !key) {
    return { ok: false, error: { line, message: "cp expects <source> <new-key>." } } as const;
  }
  if (tokens.length === 3) {
    return { ok: true, instruction: { type: "copy", sourceKey, key, line } } as const;
  }
  if (expectWordToken(tokens[3])?.value !== "-p") {
    return { ok: false, error: { line, message: "cp only supports the -p modifier." } } as const;
  }
  const parentKey = parseNodeOperand(tokens[4], true);
  if (!parentKey) {
    return { ok: false, error: { line, message: "cp -p expects a parent node operand." } } as const;
  }
  return { ok: true, instruction: { type: "copy", sourceKey, key, parentKey, line } } as const;
}

export function parseSetInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length < 4) {
    return { ok: false, error: { line, message: "set expects <node> <field> <value>." } } as const;
  }
  const key = parseNodeOperand(tokens[1], true);
  const field = parseLiteralToken(tokens[2]);
  const parsedValue = parseSetValueTokens(tokens.slice(3));
  if (!key || !field || !parsedValue.ok) {
    return { ok: false, error: { line, message: "set expects <node> <field> <value>." } } as const;
  }
  return { ok: true, instruction: { type: "setField", key, field, value: parsedValue.value, line } } as const;
}

export function parseUnsetInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 3) {
    return { ok: false, error: { line, message: "unset expects <node> <field>." } } as const;
  }
  const key = parseNodeOperand(tokens[1], true);
  const field = parseLiteralToken(tokens[2]);
  if (!key || !field) {
    return { ok: false, error: { line, message: "unset expects <node> <field>." } } as const;
  }
  return { ok: true, instruction: { type: "unsetField", key, field, line } } as const;
}
