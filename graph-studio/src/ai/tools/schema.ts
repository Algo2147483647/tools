/** Small JSON Schema subset shared by the tool catalog and runtime validation. */
export type Schema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: unknown[];
  oneOf?: Schema[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  description?: string;
};
export const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const text: Schema = { type: "string", minLength: 1 };
export const number: Schema = { type: "number" };
export const boolean: Schema = { type: "boolean" };
export const json: Schema = { description: "A JSON value; validated against the target document or Style field." };
export const nullable = (schema: Schema): Schema => ({ oneOf: [schema, { type: "null" }] });
export const list = (items: Schema, minItems = 0, maxItems = 100): Schema => ({
  type: "array",
  items,
  minItems,
  maxItems,
});
export const ids = list(text, 1);
export const page = {
  offset: { type: "integer", minimum: 0 },
  limit: { type: "integer", minimum: 1, maximum: 100 },
} satisfies Record<string, Schema>;

export function validateArguments(value: unknown, schema: Schema, path = "arguments"): void {
  const fail = (message: string): never => {
    throw new Error(`${path}: ${message}`);
  };
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((branch) => {
      try {
        validateArguments(value, branch, path);
        return true;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1) fail("does not match a supported parameter variant");
    return;
  }
  if (schema.enum && !schema.enum.includes(value))
    fail(`expected ${schema.enum.map((v) => JSON.stringify(v)).join(" | ")}`);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected an object");
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!Object.prototype.hasOwnProperty.call(record, key)) fail(`missing ${key}`);
    for (const [key, child] of Object.entries(record)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) fail(`unsafe key ${key}`);
      const property = schema.properties?.[key];
      if (property) validateArguments(child, property, `${path}.${key}`);
      else if (schema.additionalProperties === false) fail(`unknown parameter ${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) return fail("expected an array");
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
      fail("invalid array length");
    value.forEach((item, index) => validateArguments(item, schema.items ?? {}, `${path}[${index}]`));
  } else if (schema.type === "string") {
    if (typeof value !== "string") return fail("expected a string");
    if (value.length < (schema.minLength ?? 0) || (schema.pattern && !new RegExp(schema.pattern).test(value)))
      fail("invalid string");
  } else if (schema.type === "number" || schema.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.type === "integer" && !Number.isSafeInteger(value))
    )
      return fail("expected a finite number");
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail("outside allowed range");
  } else if (schema.type === "boolean" && typeof value !== "boolean") fail("expected a boolean");
  else if (schema.type === "null" && value !== null) fail("expected null");
}
