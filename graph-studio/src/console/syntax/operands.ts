import { parseLiteralToken } from "./literals";
import type { ConsoleNodeOperand, ConsoleToken } from "./types";

export function parseNodeList(
  tokens: ConsoleToken[],
): { ok: true; operands: ConsoleNodeOperand[] } | { ok: false; message: string } {
  if (!tokens.length) {
    return { ok: true, operands: [] };
  }

  const operands: ConsoleNodeOperand[] = [];
  let expectsOperand = true;
  for (const token of tokens) {
    if (expectsOperand) {
      const operand = parseNodeOperand(token, true);
      if (!operand) {
        return { ok: false, message: "Expected a node operand in the relation list." };
      }
      operands.push(operand);
      expectsOperand = false;
      continue;
    }
    if (token.type !== "symbol" || token.value !== ",") {
      return { ok: false, message: "Expected a comma-separated relation list." };
    }
    expectsOperand = true;
  }

  if (expectsOperand) {
    return { ok: false, message: "Expected a node operand after the final comma." };
  }

  return { ok: true, operands };
}

export function parseNodeOperand(
  token: ConsoleToken | undefined,
  allowContextAlias: boolean,
): ConsoleNodeOperand | null {
  if (!token) {
    return null;
  }
  if (token.type === "word" && token.value === "." && allowContextAlias) {
    return { type: "context" };
  }
  const value = parseLiteralToken(token);
  return value ? { type: "key", value } : null;
}
