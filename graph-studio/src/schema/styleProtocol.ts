import type { GraphChartType } from "../graph/types";
import type { ChartStyle, ChartStyleDocument } from "./appearanceModel";
import { getAppearanceSchema } from "./appearanceSchema";

/** Every stored style and preset uses this envelope; rendering reads its style member directly. */
export function createStyleDocument(chartType: GraphChartType, style: ChartStyle): ChartStyleDocument {
  return parseStyleDocument({ format: "graph-studio-style", version: 1, chartType, style }, chartType);
}

export function serializeChartStyle(chartType: GraphChartType, style: ChartStyle): string {
  return JSON.stringify(createStyleDocument(chartType, style), null, 2);
}

export function parseChartStyleFile(value: unknown, chartType: GraphChartType): ChartStyle {
  return parseStyleDocument(value, chartType).style;
}

export function parseStyleDocument(value: unknown, chartType: GraphChartType): ChartStyleDocument {
  const schema = getAppearanceSchema(chartType);
  const fields = new Map(schema.fields.map((field) => [field.path, field]));
  function parse(input: unknown, template: unknown, path: string): unknown {
    const field = fields.get(path);
    if (input === undefined) {
      if (field?.requirement === "Required") throw new Error(`Missing required field: ${path}.`);
      return structuredClone(template);
    }
    const fail = (message: string): never => {
      throw new Error(`${path || "style document"}: ${message}`);
    };
    if (Array.isArray(template)) {
      if (
        !Array.isArray(input) ||
        input.length !== template.length ||
        !input.every((item) => typeof item === "number" && Number.isFinite(item))
      )
        return fail("expected [x, y] with two finite numbers.");
      return [...input];
    }
    if (template && typeof template === "object") {
      if (!input || typeof input !== "object" || Array.isArray(input)) return fail("expected an object.");
      const source = input as Record<string, unknown>;
      if (["style.appearance.cssVars", "style.timeline.typeColors", "style.timeline.pins"].includes(path)) {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(source)) {
          if (path.endsWith("pins")) {
            if (typeof entry !== "number" || !Number.isFinite(entry)) return fail("pin values must be finite numbers.");
          } else if (typeof entry !== "string") return fail("map values must be strings.");
          if (path.endsWith("cssVars") && (!key.startsWith("--dag-") || (entry as string).length > 500))
            return fail("CSS variables require --dag- names and values of at most 500 characters.");
          Object.defineProperty(result, key, { value: entry, enumerable: true, writable: true, configurable: true });
        }
        return result;
      }
      const expected = template as Record<string, unknown>;
      for (const key of Object.keys(source))
        if (!Object.prototype.hasOwnProperty.call(expected, key)) return fail(`unknown field ${key}.`);
      return Object.fromEntries(
        Object.entries(expected).map(([key, entry]) => [key, parse(source[key], entry, path ? `${path}.${key}` : key)]),
      );
    }
    if (typeof input !== typeof template || (typeof input === "number" && !Number.isFinite(input)))
      return fail(`expected ${typeof template}.`);
    if (["format", "version", "chartType", "style.appearance.version"].includes(path) && input !== template)
      return fail(`expected ${JSON.stringify(template)}.`);
    if (field?.type.includes(" | ") && !field.type.split(" | ").includes(String(input)))
      return fail(`expected ${field.type}.`);
    if (path === "style.appearance.css" && ((input as string).length > 50000 || /@import\b/i.test(input as string)))
      return fail("CSS must be at most 50,000 characters and cannot contain @import.");
    return input;
  }
  return parse(value, schema.example, "") as ChartStyleDocument;
}

export function updateAppearanceSchemaValue(
  chartType: GraphChartType,
  style: ChartStyle,
  path: string,
  value: unknown,
): ChartStyle {
  const schema = getAppearanceSchema(chartType, style);
  const entry = schema.entries.get(path);
  const field = schema.fields.find((field) => field.path === path);
  if (!entry?.editable || !field) throw new Error("This field is read-only.");
  const next = structuredClone(schema.example);
  let target = next as unknown as Record<string, unknown>;
  for (const key of entry.keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[entry.keys.at(-1)!] = value;
  return parseChartStyleFile(next, chartType);
}
