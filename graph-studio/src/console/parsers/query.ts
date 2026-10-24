import { parseLiteralToken } from "../syntax/literals";
import { parseNodeOperand } from "../syntax/operands";
import type { ConsoleInstruction, ConsoleLineError, ConsoleToken } from "../syntax/types";

export function parseHelpInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 1) {
    return { ok: false, error: { line, message: "help does not accept any arguments." } };
  }
  return { ok: true, instruction: { type: "help", line } };
}

export function parseClearInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 1) {
    return { ok: false, error: { line, message: "clear does not accept any arguments." } };
  }
  return { ok: true, instruction: { type: "clear", line } };
}

export function parseKeysInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 1) {
    return { ok: false, error: { line, message: "keys does not accept any arguments." } };
  }
  return { ok: true, instruction: { type: "keys", line } };
}

export function parseGraphInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 1) {
    return { ok: false, error: { line, message: "graph does not accept any arguments." } };
  }
  return { ok: true, instruction: { type: "graphStats", line } };
}

export function parseFindInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length < 2) {
    return { ok: false, error: { line, message: "find expects a search query." } };
  }
  const query = tokens
    .slice(1)
    .map((token) => token.value)
    .join(" ")
    .trim();
  if (!query) {
    return { ok: false, error: { line, message: "find expects a search query." } };
  }
  return { ok: true, instruction: { type: "find", query, line } };
}

export function parseNeighborsInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 2 && tokens.length !== 3) {
    return { ok: false, error: { line, message: "neighbors expects <node> and optional depth." } };
  }
  const key = parseNodeOperand(tokens[1], true);
  if (!key) {
    return { ok: false, error: { line, message: "neighbors expects a node operand." } };
  }
  const depth = tokens[2] ? Number(parseLiteralToken(tokens[2])) : 1;
  if (!Number.isInteger(depth) || depth < 1 || depth > 4) {
    return { ok: false, error: { line, message: "neighbors depth must be an integer from 1 to 4." } };
  }
  return { ok: true, instruction: { type: "neighbors", key, depth, line } };
}

export function parsePathInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 3) {
    return { ok: false, error: { line, message: "path expects <from-node> <to-node>." } };
  }
  const fromKey = parseNodeOperand(tokens[1], true);
  const toKey = parseNodeOperand(tokens[2], true);
  if (!fromKey || !toKey) {
    return { ok: false, error: { line, message: "path expects two node operands." } };
  }
  return { ok: true, instruction: { type: "path", fromKey, toKey, line } };
}

export function parseSingleNodeInstruction(
  tokens: ConsoleToken[],
  line: number,
  type: "show" | "list" | "use" | "json",
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (tokens.length !== 2) {
    return { ok: false, error: { line, message: `${type} expects exactly one node operand.` } };
  }
  const operand = parseNodeOperand(tokens[1], true);
  if (!operand) {
    return { ok: false, error: { line, message: "Expected a node operand." } };
  }
  return { ok: true, instruction: { type, key: operand, line } };
}
