import { isRecord } from "../../utils/json";
import type { ImportDecision } from "./conflicts";
import { equal, has, segment, set, unique } from "./values";
export function createFieldMerger(decide: ImportDecision) {
  const mergeObject = (
    target: Record<string, unknown>,
    incoming: Record<string, unknown>,
    index: number,
    path: string,
  ) => {
    for (const [key, value] of Object.entries(incoming)) {
      if (!has(target, key)) {
        set(target, key, value);
        continue;
      }
      if (equal(target[key], value)) continue;
      const previous = target[key];
      const canMerge = (isRecord(previous) && isRecord(value)) || (Array.isArray(previous) && Array.isArray(value));
      const choice = decide(index, `${path}/${segment(key)}`, "field", previous, value, canMerge, true);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "rename") {
        const name =
          choice.name?.trim() ||
          unique(`${key}__import_${index + 1}`, [...Object.keys(target), ...Object.keys(incoming)]);
        if (
          !name ||
          has(target, name) ||
          has(incoming, name) ||
          (/^\/nodes\/[^/]+$/.test(path) && ["key", "parents", "children"].includes(name))
        )
          throw new Error(`Rename target "${name}" is reserved or already exists at ${path}.`);
        set(target, name, value);
      } else if (isRecord(previous) && isRecord(value)) mergeObject(previous, value, index, `${path}/${segment(key)}`);
      else if (Array.isArray(previous) && Array.isArray(value))
        set(target, key, [...previous, ...value.filter((item) => !previous.some((existing) => equal(existing, item)))]);
    }
  };
  return mergeObject;
}
