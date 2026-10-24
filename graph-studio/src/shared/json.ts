/** Narrow JSON objects at input boundaries without assuming a provider-specific shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
