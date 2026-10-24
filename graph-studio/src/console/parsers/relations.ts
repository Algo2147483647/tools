import { expectWordToken, parseScalarLiteralToken } from "../syntax/literals";
import { parseNodeList, parseNodeOperand } from "../syntax/operands";
import type { ConsoleToken } from "../syntax/types";

export function parseEdgeInstruction(tokens: ConsoleToken[], line: number) {
  const createMissingFlag = "--create-missing";
  const filteredTokens = tokens.filter(
    (token, index) => index === 0 || expectWordToken(token)?.value !== createMissingFlag,
  );
  const createMissing = filteredTokens.length !== tokens.length;

  if (filteredTokens.length !== 3 && filteredTokens.length !== 4) {
    return {
      ok: false,
      error: { line, message: "edge expects <parent> <child> [weight] and optionally --create-missing." },
    } as const;
  }

  const parentKey = parseNodeOperand(filteredTokens[1], true);
  const childKey = parseNodeOperand(filteredTokens[2], true);
  if (!parentKey || !childKey) {
    return {
      ok: false,
      error: { line, message: "edge expects <parent> <child> [weight] and optionally --create-missing." },
    } as const;
  }

  if (filteredTokens.length === 3) {
    return { ok: true, instruction: { type: "setEdge", parentKey, childKey, createMissing, line } } as const;
  }

  const weight = parseScalarLiteralToken(filteredTokens[3]);
  if (weight === undefined) {
    return { ok: false, error: { line, message: "edge weight must be a scalar literal." } } as const;
  }

  return { ok: true, instruction: { type: "setEdge", parentKey, childKey, weight, createMissing, line } } as const;
}

export function parseRemoveEdgeInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 3) {
    return { ok: false, error: { line, message: "rm-edge expects <parent> <child>." } } as const;
  }

  const parentKey = parseNodeOperand(tokens[1], true);
  const childKey = parseNodeOperand(tokens[2], true);
  if (!parentKey || !childKey) {
    return { ok: false, error: { line, message: "rm-edge expects <parent> <child>." } } as const;
  }

  return { ok: true, instruction: { type: "removeEdge", parentKey, childKey, line } } as const;
}

export function parseRelationInstruction(tokens: ConsoleToken[], line: number, type: "setParents" | "setChildren") {
  if (tokens.length < 3) {
    return {
      ok: false,
      error: { line, message: `${type === "setParents" ? "parents" : "children"} expects <node> = <list>.` },
    } as const;
  }
  const key = parseNodeOperand(tokens[1], true);
  if (!key || tokens[2].type !== "symbol" || tokens[2].value !== "=") {
    return {
      ok: false,
      error: { line, message: `${type === "setParents" ? "parents" : "children"} expects <node> = <list>.` },
    } as const;
  }
  const parsedList = parseNodeList(tokens.slice(3));
  if (!parsedList.ok) {
    return { ok: false, error: { line, message: parsedList.message } } as const;
  }
  return { ok: true, instruction: { type, key, keys: parsedList.operands, line } } as const;
}
