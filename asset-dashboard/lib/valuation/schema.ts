import type { AssetConfig, AssetType, PortfolioConfig } from "./types";
import { ValuationError } from "./types";

const assetTypes = new Set<AssetType>(["gold", "cash", "stock", "custom"]);
const legacyAssetTypeMap: Record<string, AssetType> = {
  fx: "cash",
  stock_us: "stock"
};
const currencyPattern = /^[A-Z]{3}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, field: string, required = true): string | undefined {
  const value = record[field];
  if (value == null || value === "") {
    if (required) {
      throw new ValuationError(`Missing required field "${field}".`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValuationError(`Field "${field}" must be a string.`);
  }
  return value.trim();
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValuationError(`Field "${field}" must be a finite number.`);
  }
  if (value < 0) {
    throw new ValuationError(`Field "${field}" must be zero or greater.`);
  }
  return value;
}

function readCurrency(record: Record<string, unknown>, field: string): string {
  const currency = readString(record, field)?.toUpperCase();
  if (!currency || !currencyPattern.test(currency)) {
    throw new ValuationError(`Field "${field}" must be a 3-letter currency code, such as USD or EUR.`);
  }
  return currency;
}

export function validatePortfolioConfig(value: unknown): PortfolioConfig {
  if (!isRecord(value)) {
    throw new ValuationError("Portfolio JSON must be an object.");
  }

  const baseCurrency = typeof value.baseCurrency === "string" ? value.baseCurrency.toUpperCase() : "USD";
  if (baseCurrency !== "USD") {
    throw new ValuationError('Only "USD" is supported as baseCurrency in this dashboard.');
  }

  if (!Array.isArray(value.assets)) {
    throw new ValuationError('Portfolio JSON must include an "assets" array.');
  }

  const ids = new Set<string>();
  const assets = value.assets.map((entry, index): AssetConfig => {
    if (!isRecord(entry)) {
      throw new ValuationError(`Asset at index ${index} must be an object.`);
    }

    const id = readString(entry, "id");
    if (!id) {
      throw new ValuationError(`Asset at index ${index} needs a non-empty id.`);
    }
    if (ids.has(id)) {
      throw new ValuationError(`Duplicate asset id "${id}". Each asset id must be unique.`);
    }
    ids.add(id);

    const rawType = readString(entry, "type");
    const type = rawType ? legacyAssetTypeMap[rawType] ?? (rawType as AssetType) : undefined;
    if (!type || !assetTypes.has(type)) {
      throw new ValuationError(`Asset "${id}" has unsupported type "${rawType ?? ""}".`);
    }

    const base = {
      id,
      type,
      name: readString(entry, "name", false),
      quantity: readNumber(entry, "quantity")
    };

    if (type === "gold") {
      return {
        ...base,
        type,
        unit: readString(entry, "unit", false) ?? "gram"
      };
    }

    if (type === "cash") {
      return {
        ...base,
        type,
        currency: readCurrency(entry, "currency")
      };
    }

    if (type === "stock") {
      const symbol = readString(entry, "symbol")?.toUpperCase();
      if (!symbol || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
        throw new ValuationError(`Asset "${id}" needs a valid U.S. stock symbol.`);
      }
      return {
        ...base,
        type,
        symbol
      };
    }

    return {
      ...base,
      type: "custom",
      price: readNumber(entry, "price"),
      currency: readCurrency(entry, "currency")
    };
  });

  return {
    baseCurrency: "USD",
    assets
  };
}
