import {
  parseAppearanceFieldInstruction,
  parseStyleCssInstruction,
  parseStylePresetInstruction,
  parseStyleResetInstruction,
  parseStyleVarInstruction,
} from "./parsers/appearance";
import {
  parseAddInstruction,
  parseCopyInstruction,
  parseDeleteInstruction,
  parseRenameInstruction,
  parseSetInstruction,
  parseUnsetInstruction,
} from "./parsers/nodes";
import {
  parseClearInstruction,
  parseFindInstruction,
  parseGraphInstruction,
  parseHelpInstruction,
  parseKeysInstruction,
  parseNeighborsInstruction,
  parsePathInstruction,
  parseSingleNodeInstruction,
} from "./parsers/query";
import { parseEdgeInstruction, parseRelationInstruction, parseRemoveEdgeInstruction } from "./parsers/relations";
import { expectWordToken } from "./syntax/literals";
import { normalizeCommandLine, tokenizeLine } from "./syntax/tokenizer";
import type { ConsoleInstruction, ConsoleLineError, ConsoleToken } from "./syntax/types";
export type { ConsoleInstruction, ConsoleNodeOperand } from "./syntax/types";

export function parseConsoleSource(
  source: string,
): { ok: true; instructions: ConsoleInstruction[] } | { ok: false; error: ConsoleLineError } {
  const instructions: ConsoleInstruction[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const commandLine = normalizeCommandLine(rawLine);
    if (!commandLine.ok) {
      return { ok: false, error: { line: lineNumber, message: commandLine.message } };
    }

    const tokenized = tokenizeLine(commandLine.line);
    if (!tokenized.ok) {
      return { ok: false, error: { line: lineNumber, message: tokenized.message } };
    }

    const parsed = parseInstruction(tokenized.tokens, lineNumber);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    instructions.push(parsed.instruction);
  }

  return { ok: true, instructions };
}

function parseInstruction(
  tokens: ConsoleToken[],
  line: number,
): { ok: true; instruction: ConsoleInstruction } | { ok: false; error: ConsoleLineError } {
  if (!tokens.length) {
    return { ok: false, error: { line, message: "Expected an instruction." } };
  }

  const mnemonic = expectWordToken(tokens[0]);
  if (!mnemonic) {
    return { ok: false, error: { line, message: "Expected an instruction mnemonic." } };
  }

  switch (mnemonic.value) {
    case "help":
      return parseHelpInstruction(tokens, line);
    case "clear":
    case "cls":
      return parseClearInstruction(tokens, line);
    case "keys":
      return parseKeysInstruction(tokens, line);
    case "graph":
      return parseGraphInstruction(tokens, line);
    case "find":
      return parseFindInstruction(tokens, line);
    case "neighbors":
      return parseNeighborsInstruction(tokens, line);
    case "path":
      return parsePathInstruction(tokens, line);
    case "show":
      return parseSingleNodeInstruction(tokens, line, "show");
    case "ls":
      return parseSingleNodeInstruction(tokens, line, "list");
    case "use":
      return parseSingleNodeInstruction(tokens, line, "use");
    case "json":
      return parseSingleNodeInstruction(tokens, line, "json");
    case "mv":
      return parseRenameInstruction(tokens, line);
    case "rm":
      return parseDeleteInstruction(tokens, line);
    case "add":
      return parseAddInstruction(tokens, line);
    case "cp":
      return parseCopyInstruction(tokens, line);
    case "edge":
      return parseEdgeInstruction(tokens, line);
    case "rm-edge":
      return parseRemoveEdgeInstruction(tokens, line);
    case "parents":
      return parseRelationInstruction(tokens, line, "setParents");
    case "children":
      return parseRelationInstruction(tokens, line, "setChildren");
    case "set":
      return parseSetInstruction(tokens, line);
    case "unset":
      return parseUnsetInstruction(tokens, line);
    case "appearance-set":
      return parseAppearanceFieldInstruction(tokens, line);
    case "style-var":
      return parseStyleVarInstruction(tokens, line);
    case "style-css":
      return parseStyleCssInstruction(tokens, line);
    case "style-reset":
      return parseStyleResetInstruction(tokens, line);
    case "style-preset":
      return parseStylePresetInstruction(tokens, line);
    default:
      return { ok: false, error: { line, message: `Unknown instruction "${mnemonic.value}".` } };
  }
}
