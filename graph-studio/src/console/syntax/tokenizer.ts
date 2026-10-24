import type { ConsoleToken } from "./types";

export function normalizeCommandLine(line: string): { ok: true; line: string } | { ok: false; message: string } {
  const trimmedStart = line.trimStart();
  if (!trimmedStart.startsWith("/")) {
    return {
      ok: false,
      message: "Console commands must start with /. Type /help for available commands, or enter plain text to ask AI.",
    };
  }
  const commandLine = trimmedStart.slice(1);
  if (!commandLine.trim()) {
    return { ok: false, message: "Expected a command after /." };
  }
  return { ok: true, line: commandLine };
}

export function tokenizeLine(line: string): { ok: true; tokens: ConsoleToken[] } | { ok: false; message: string } {
  const tokens: ConsoleToken[] = [];
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "," || char === "=") {
      tokens.push({ type: "symbol", value: char });
      index += 1;
      continue;
    }
    if (char === '"') {
      let cursor = index + 1;
      let escaped = false;
      while (cursor < line.length) {
        const current = line[cursor];
        if (current === '"' && !escaped) {
          break;
        }
        escaped = current === "\\" && !escaped;
        if (current !== "\\") {
          escaped = false;
        }
        cursor += 1;
      }
      if (cursor >= line.length || line[cursor] !== '"') {
        return { ok: false, message: "Unterminated string literal." };
      }
      try {
        tokens.push({ type: "string", value: JSON.parse(line.slice(index, cursor + 1)) as string });
      } catch {
        return { ok: false, message: "Invalid string literal." };
      }
      index = cursor + 1;
      continue;
    }

    let cursor = index;
    while (cursor < line.length && !/\s/.test(line[cursor]) && line[cursor] !== "," && line[cursor] !== "=") {
      cursor += 1;
    }
    tokens.push({ type: "word", value: line.slice(index, cursor) });
    index = cursor;
  }

  return { ok: true, tokens };
}
