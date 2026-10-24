import { isRecord } from "../../shared/json";
export const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (isRecord(a) && isRecord(b))
    return (
      Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => has(b, k) && equal(a[k], b[k]))
    );
  return false;
};
export const segment = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
export const set = (object: Record<string, unknown>, key: string, value: unknown) =>
  Object.defineProperty(object, key, {
    value: structuredClone(value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
export function unique(base: string, used: Iterable<string>): string {
  const names = new Set(used);
  let key = base,
    n = 2;
  while (names.has(key)) key = `${base}_${n++}`;
  return key;
}
