export interface AppearanceFieldDefinition {
  kind: "object" | "map" | "array" | "number" | "string" | "boolean";
  default?: unknown;
  required?: boolean;
  enum?: readonly (string | number | boolean)[];
  min?: number;
  max?: number;
  length?: number;
  items?: AppearanceFieldDefinition;
  properties?: Record<string, AppearanceFieldDefinition>;
  format?: "color" | "pixels" | "css" | "opacity";
  description?: string;
  group?: "nodes" | "edges" | "canvas" | "layout" | "advanced";
  groups?: Record<string, "nodes" | "edges" | "canvas" | "layout" | "advanced">;
  label?: string;
  keywords?: string;
  resets?: readonly string[];
  clock?: "relative" | "calendar";
  unit?: string;
  step?: number;
  charts?: readonly string[];
  visibleWhen?: { path: string; equals: unknown };
}

/** The same resolver is used at every input boundary. It never clips or coerces valid values. */
export function resolveDefinition(
  definition: AppearanceFieldDefinition,
  input: unknown,
  path = "",
  partial = false,
): unknown {
  const fail = (reason: string): never => {
    throw new Error(`${path || "style document"}: ${reason}`);
  };
  if (input === undefined) {
    if (definition.required && !partial) return fail("Missing required field.");
    if (definition.kind !== "object" && definition.kind !== "map") return structuredClone(definition.default);
    input = structuredClone(definition.default ?? {});
    partial = true;
  }
  if (definition.kind === "object") {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("expected an object.");
    const source = input as Record<string, unknown>;
    const properties = definition.properties ?? {};
    for (const key of Object.keys(source)) if (!(key in properties)) return fail(`unknown field ${key}.`);
    return Object.fromEntries(
      Object.entries(properties).map(([key, field]) => [
        key,
        resolveDefinition(field, source[key], path ? `${path}.${key}` : key, partial),
      ]),
    );
  }
  if (definition.kind === "map") {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("expected a map.");
    const registered = Object.fromEntries(
      Object.entries(definition.properties ?? {}).map(([key, field]) => [
        key,
        resolveDefinition(field, undefined, `${path}[${key}]`, true),
      ]),
    );
    return Object.fromEntries(
      Object.entries({ ...registered, ...(definition.default as object), ...input }).map(([key, value]) => {
        if (path.endsWith("cssVars") && !key.startsWith("--dag-"))
          return fail("CSS variable names must start with --dag-.");
        return [
          key,
          resolveDefinition(definition.properties?.[key] ?? definition.items!, value, `${path}[${key}]`, partial),
        ];
      }),
    );
  }
  if (definition.kind === "array") {
    if (!Array.isArray(input) || (definition.length !== undefined && input.length !== definition.length))
      return fail(`expected an array${definition.length !== undefined ? ` of ${definition.length} items` : ""}.`);
    if (definition.min !== undefined && input.length < definition.min)
      return fail(`requires at least ${definition.min} items.`);
    return input.map((value, index) => resolveDefinition(definition.items!, value, `${path}[${index}]`, partial));
  }
  if (typeof input !== definition.kind || (typeof input === "number" && !Number.isFinite(input)))
    return fail(`expected ${definition.kind}.`);
  if (definition.enum && !definition.enum.includes(input as string | number | boolean))
    return fail(
      `expected ${definition.enum.length === 1 ? JSON.stringify(definition.enum[0]) : definition.enum.join(" | ")}.`,
    );
  if (
    typeof input === "number" &&
    ((definition.min !== undefined && input < definition.min) ||
      (definition.max !== undefined && input > definition.max))
  )
    return fail(`expected a value from ${definition.min ?? "−∞"} to ${definition.max ?? "∞"}.`);
  if (typeof input === "string") {
    if (
      definition.format === "opacity" &&
      (!input.trim() || !Number.isFinite(Number(input)) || Number(input) < 0 || Number(input) > 1)
    )
      return fail("expected an opacity from 0 to 1.");
    if (definition.max !== undefined && input.length > definition.max)
      return fail(`maximum length is ${definition.max}.`);
    if (definition.format === "pixels" && !/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(input))
      return fail("use a non-negative pixel length, e.g. 15px.");
    if (
      definition.format === "color" &&
      input !== "" &&
      !/^(#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|rgba?\([\d.,%\s+-]+\))$/i.test(input)
    )
      return fail("use a hex or numeric rgb/rgba color, or an empty automatic value.");
    if (definition.format === "css" && /@import\b/i.test(input)) return fail("CSS cannot contain @import.");
  }
  return input;
}

export function definitionAt(
  root: AppearanceFieldDefinition,
  keys: readonly string[],
): AppearanceFieldDefinition | undefined {
  let current: AppearanceFieldDefinition | undefined = root;
  for (const key of keys) current = current?.properties?.[key] ?? current?.items;
  return current;
}

export function definitionType(field: AppearanceFieldDefinition): string {
  if (field.enum) return field.enum.map(String).join(" | ");
  if (field.kind === "array")
    return field.length
      ? `[${Array(field.length).fill(definitionType(field.items!)).join(", ")}]`
      : `${definitionType(field.items!)}[]`;
  return field.kind === "map" ? "object" : field.kind;
}
