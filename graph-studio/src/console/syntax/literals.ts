import type { ConsoleToken } from "./types";

export function parseLiteralToken(token: ConsoleToken | undefined): string | null {
  if (!token || token.type === "symbol") {
    return null;
  }
  return token.value;
}

export function parseScalarLiteralToken(token: ConsoleToken | undefined): string | number | boolean | null | undefined {
  const value = parseLiteralToken(token);
  if (value === null) {
    return undefined;
  }
  if (/^true$/i.test(value)) {
    return true;
  }
  if (/^false$/i.test(value)) {
    return false;
  }
  if (/^null$/i.test(value)) {
    return null;
  }
  if (/^-?(?:\d+|\d*\.\d+)$/.test(value)) {
    const nextNumber = Number(value);
    if (Number.isFinite(nextNumber)) {
      return nextNumber;
    }
  }
  return value;
}

export function parseSetValueTokens(tokens: ConsoleToken[]): { ok: true; value: unknown } | { ok: false } {
  if (!tokens.length) {
    return { ok: false };
  }

  if (tokens.length === 1) {
    if (tokens[0].type === "string") {
      return { ok: true, value: tokens[0].value };
    }
    const scalar = parseScalarLiteralToken(tokens[0]);
    return scalar === undefined ? { ok: false } : { ok: true, value: scalar };
  }

  const rawValue = stringifyValueTokens(tokens);
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return { ok: false };
  }

  if (trimmedValue.startsWith("{") || trimmedValue.startsWith("[") || trimmedValue.startsWith('"')) {
    try {
      return { ok: true, value: JSON.parse(trimmedValue) };
    } catch {
      return { ok: false };
    }
  }

  if (tokens.every((token) => token.type !== "symbol")) {
    return { ok: true, value: tokens.map((token) => token.value).join(" ") };
  }

  return { ok: false };
}

export function stringifyValueTokens(tokens: ConsoleToken[]): string {
  let output = "";

  tokens.forEach((token, index) => {
    if (token.type === "symbol") {
      output += token.value;
      return;
    }

    const value = token.type === "string" ? JSON.stringify(token.value) : token.value;
    const previousToken = tokens[index - 1];
    const needsLeadingSpace = index > 0 && previousToken?.type !== "symbol";
    output += `${needsLeadingSpace ? " " : ""}${value}`;
  });

  return output;
}

export function expectWordToken(token: ConsoleToken | undefined): Extract<ConsoleToken, { type: "word" }> | null {
  return token?.type === "word" ? token : null;
}
