import type { GraphAppearancePresetId } from "../../schema/appearance/commands";
import { APPEARANCE_DEFINITION } from "../../schema/appearance/definition";
import { definitionAt, resolveDefinition } from "../../schema/definition";
import { expectWordToken, parseLiteralToken, parseSetValueTokens } from "../syntax/literals";
import type { ConsoleInstruction, ConsoleToken } from "../syntax/types";

export function parseAppearanceFieldInstruction(tokens: ConsoleToken[], line: number) {
  const path = parseLiteralToken(tokens[1]);
  const field = typeof path === "string" ? definitionAt(APPEARANCE_DEFINITION, path.split(".")) : undefined;
  const parsed = parseSetValueTokens(tokens.slice(2));
  if (!path || !field || path === "version" || !parsed.ok)
    return {
      ok: false,
      error: { line, message: "appearance-set expects a declared Appearance field path and JSON value." },
    } as const;
  try {
    const value = resolveDefinition(field, parsed.value, `style.appearance.${path}`);
    return {
      ok: true,
      instruction: {
        type: "appearance",
        command: { type: "setAppearanceField", path, value },
        line,
      } satisfies ConsoleInstruction,
    } as const;
  } catch (error) {
    return {
      ok: false,
      error: { line, message: error instanceof Error ? error.message : "Invalid appearance value." },
    } as const;
  }
}

export function parseStyleVarInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 3) {
    return {
      ok: false,
      error: { line, message: "style-var expects <var-name> <value>, or --unset <var-name>." },
    } as const;
  }
  if (tokens.length === 3 && expectWordToken(tokens[1])?.value === "--unset") {
    const key = parseLiteralToken(tokens[2]);
    if (!isDagCssVarName(key)) {
      return { ok: false, error: { line, message: "style-var --unset expects a --dag-* variable name." } } as const;
    }
    return {
      ok: true,
      instruction: { type: "appearance", command: { type: "unsetCssVar", key }, line } satisfies ConsoleInstruction,
    } as const;
  }
  const key = parseLiteralToken(tokens[1]);
  const value = parseLiteralToken(tokens[2]);
  if (!isDagCssVarName(key) || value === null) {
    return { ok: false, error: { line, message: "style-var expects a --dag-* variable name and value." } } as const;
  }
  return {
    ok: true,
    instruction: { type: "appearance", command: { type: "setCssVar", key, value }, line } satisfies ConsoleInstruction,
  } as const;
}

export function parseStyleCssInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length === 1) {
    return { ok: true, instruction: { type: "appearanceCssShow", line } satisfies ConsoleInstruction } as const;
  }
  if (tokens.length === 2 && expectWordToken(tokens[1])?.value === "show") {
    return { ok: true, instruction: { type: "appearanceCssShow", line } satisfies ConsoleInstruction } as const;
  }
  if (tokens.length !== 3) {
    return { ok: false, error: { line, message: "style-css expects append <css>, replace <css>, or show." } } as const;
  }
  const operation = expectWordToken(tokens[1])?.value;
  const css = parseLiteralToken(tokens[2]);
  if (css === null) {
    return { ok: false, error: { line, message: "style-css expects CSS text." } } as const;
  }
  if (operation === "append") {
    return {
      ok: true,
      instruction: { type: "appearance", command: { type: "appendCss", css }, line } satisfies ConsoleInstruction,
    } as const;
  }
  if (operation === "replace") {
    return {
      ok: true,
      instruction: { type: "appearance", command: { type: "replaceCss", css }, line } satisfies ConsoleInstruction,
    } as const;
  }
  return { ok: false, error: { line, message: "style-css operation must be append, replace, or show." } } as const;
}

export function parseStyleResetInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 1) {
    return { ok: false, error: { line, message: "style-reset does not accept arguments." } } as const;
  }
  return {
    ok: true,
    instruction: { type: "appearance", command: { type: "resetAppearance" }, line } satisfies ConsoleInstruction,
  } as const;
}

export function parseStylePresetInstruction(tokens: ConsoleToken[], line: number) {
  if (tokens.length !== 2) {
    return { ok: false, error: { line, message: "style-preset expects a preset id." } } as const;
  }
  const presetId = parseLiteralToken(tokens[1]);
  if (presetId !== "default" && presetId !== "preset-2") {
    return {
      ok: false,
      error: {
        line,
        message: "style-preset expects default, or preset-2 for compound charts.",
      },
    } as const;
  }
  return {
    ok: true,
    instruction: {
      type: "appearance",
      command: { type: "applyPreset", presetId: presetId as GraphAppearancePresetId },
      line,
    } satisfies ConsoleInstruction,
  } as const;
}

export function isDagCssVarName(value: string | null): value is `--dag-${string}` {
  return typeof value === "string" && value.startsWith("--dag-");
}
