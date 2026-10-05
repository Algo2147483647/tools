import { ValuationError } from "./types";

export const TROY_OUNCE_GRAMS = 31.1034768;

export function goldQuantityToTroyOunces(quantity: number, unit = "gram"): number {
  const normalized = unit.trim().toLowerCase();
  if (["g", "gram", "grams"].includes(normalized)) return quantity / TROY_OUNCE_GRAMS;
  if (["kg", "kilogram", "kilograms"].includes(normalized)) return (quantity * 1000) / TROY_OUNCE_GRAMS;
  if (["oz", "ounce", "ounces", "troy_ounce", "troy-ounce", "troy ounce", "ozt"].includes(normalized)) return quantity;
  if (["lb", "pound", "pounds"].includes(normalized)) return (quantity * 453.59237) / TROY_OUNCE_GRAMS;
  throw new ValuationError(`Unsupported gold unit "${unit}". Use gram, kilogram, ounce, or pound.`);
}
