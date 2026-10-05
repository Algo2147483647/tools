import type { AssetConfig, AssetType, PortfolioConfig } from "./types";
import { ValuationError } from "./types";
import { goldQuantityToTroyOunces } from "./units";

export const MAX_ASSETS = 100;
export const MAX_INPUT_VALUE = 1_000_000_000_000;

const assetTypes = new Set<AssetType>(["gold", "cash", "stock", "fund", "custom"]);
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
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ValuationError(`Field "${field}" must not be blank.`);
    return undefined;
  }
  const maxLength = field === "name" ? 120 : field === "id" ? 80 : 32;
  if (trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new ValuationError(`Field "${field}" must be at most ${maxLength} characters and contain no control characters.`);
  }
  return trimmed;
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValuationError(`Field "${field}" must be a finite number.`);
  }
  if (value < 0) {
    throw new ValuationError(`Field "${field}" must be zero or greater.`);
  }
  if (value > MAX_INPUT_VALUE) {
    throw new ValuationError(`Field "${field}" must not exceed ${MAX_INPUT_VALUE}.`);
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

  const baseCurrency = value.baseCurrency === undefined ? "USD" : readString(value, "baseCurrency")?.toUpperCase();
  if (baseCurrency !== "USD") {
    throw new ValuationError('Only "USD" is supported as baseCurrency in this dashboard.');
  }

  if (!Array.isArray(value.assets)) {
    throw new ValuationError('Portfolio JSON must include an "assets" array.');
  }
  if (value.assets.length > MAX_ASSETS) {
    throw new ValuationError(`A portfolio may contain at most ${MAX_ASSETS} assets.`);
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
      const unit = readString(entry, "unit", false) ?? "gram";
      goldQuantityToTroyOunces(base.quantity, unit);
      return {
        ...base,
        type,
        unit
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

    if (type === "fund") {
      const code = readString(entry, "code");
      if (!code || !/^\d{6}$/.test(code)) {
        throw new ValuationError(`Asset "${id}" needs a 6-digit mutual fund code, such as 000055.`);
      }
      return {
        ...base,
        type,
        code,
        currency: entry.currency === undefined ? undefined : readCurrency(entry, "currency")
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
