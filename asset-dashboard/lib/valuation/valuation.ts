import type { AssetConfig, AssetValuation, FxRatePoint, PortfolioConfig, ValuationResponse } from "./types";
import { ValuationError } from "./types";
import { fetchAlphaVantageQuote, fetchFrankfurterRate, fetchGoldSpotUsd, goldQuantityToTroyOunces } from "./sources";

type FxCache = Map<string, Promise<FxRatePoint>>;
const TROY_OUNCE_GRAMS = 31.1034768;

function assetName(asset: AssetConfig): string {
  if (asset.name) {
    return asset.name;
  }
  if (asset.type === "stock") {
    return asset.symbol;
  }
  if (asset.type === "cash") {
    return `${asset.currency} Cash`;
  }
  if (asset.type === "gold") {
    return "Gold";
  }
  return asset.id;
}

function failedAsset(asset: AssetConfig, error: unknown): AssetValuation {
  const message = error instanceof Error ? error.message : "Unknown pricing error.";
  return {
    id: asset.id,
    type: asset.type,
    name: assetName(asset),
    quantity: asset.quantity,
    unit: "unit" in asset ? asset.unit : undefined,
    symbol: "symbol" in asset ? asset.symbol : undefined,
    price: null,
    pricingCurrency: null,
    fxRateToUsd: null,
    usdValue: null,
    source: "Unavailable",
    updatedAt: null,
    status: "failed",
    message
  };
}

async function getFxRate(cache: FxCache, from: string): Promise<FxRatePoint> {
  const key = `${from.toUpperCase()}-USD`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const request = fetchFrankfurterRate(from, "USD");
  cache.set(key, request);
  return request;
}

async function valueAsset(asset: AssetConfig, fxCache: FxCache): Promise<AssetValuation> {
  try {
    if (asset.type === "gold") {
      const quote = await fetchGoldSpotUsd();
      const troyOunces = goldQuantityToTroyOunces(asset.quantity, asset.unit);
      const usdValue = troyOunces * quote.price;
      return {
        id: asset.id,
        type: asset.type,
        name: assetName(asset),
        quantity: asset.quantity,
        unit: asset.unit ?? "gram",
        price: quote.price,
        pricingCurrency: quote.currency,
        priceUnit: quote.unit,
        fxRateToUsd: 1,
        usdValue,
        dailyChangePercent: quote.dailyChangePercent ?? null,
        source: quote.source,
        updatedAt: quote.updatedAt,
        status: "ok",
        message: `Converted ${asset.quantity} ${asset.unit ?? "gram"} to ${troyOunces.toFixed(6)} troy ounces.`
      };
    }

    if (asset.type === "cash") {
      const fx = await getFxRate(fxCache, asset.currency);
      return {
        id: asset.id,
        type: asset.type,
        name: assetName(asset),
        quantity: asset.quantity,
        unit: asset.currency,
        price: 1,
        pricingCurrency: asset.currency,
        priceUnit: "currency unit",
        fxRateToUsd: fx.rate,
        usdValue: asset.quantity * fx.rate,
        dailyChangePercent: fx.dailyChangePercent ?? null,
        source: fx.source,
        updatedAt: fx.updatedAt,
        status: "ok",
        message: `1 ${asset.currency.toUpperCase()} = ${fx.rate.toFixed(6)} USD.`
      };
    }

    if (asset.type === "stock") {
      const quote = await fetchAlphaVantageQuote(asset.symbol);
      return {
        id: asset.id,
        type: asset.type,
        name: assetName(asset),
        quantity: asset.quantity,
        symbol: asset.symbol,
        price: quote.price,
        pricingCurrency: quote.currency,
        priceUnit: quote.unit,
        fxRateToUsd: 1,
        usdValue: asset.quantity * quote.price,
        dailyChangePercent: quote.dailyChangePercent ?? null,
        source: quote.source,
        updatedAt: quote.updatedAt,
        status: "ok",
        message: `${asset.symbol} latest available U.S. market quote.`
      };
    }

    const fx = await getFxRate(fxCache, asset.currency);
    return {
      id: asset.id,
      type: asset.type,
      name: assetName(asset),
      quantity: asset.quantity,
      price: asset.price,
      pricingCurrency: asset.currency,
      priceUnit: "manual unit",
      fxRateToUsd: fx.rate,
      usdValue: asset.quantity * asset.price * fx.rate,
      dailyChangePercent: fx.dailyChangePercent ?? null,
      source: asset.currency === "USD" ? "Manual price" : `Manual price + ${fx.source}`,
      updatedAt: asset.currency === "USD" ? new Date().toISOString() : fx.updatedAt,
      status: "ok",
      message: "Manual custom asset price accepted from JSON."
    };
  } catch (error) {
    return failedAsset(asset, error);
  }
}

function normalizeDisplayBase(base?: string): string {
  const normalized = (base ?? "USD").trim().toUpperCase();
  if (["GOLD", "XAU", "XAU_GRAM", "GOLD_GRAM"].includes(normalized)) {
    return "GOLD_GRAM";
  }
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

async function getDisplayRateFromUsd(base: string): Promise<{ rate: number; unit: string; baseCurrency: string }> {
  if (base === "USD") {
    return {
      rate: 1,
      unit: "USD",
      baseCurrency: "USD"
    };
  }

  if (base === "GOLD_GRAM") {
    const quote = await fetchGoldSpotUsd();
    return {
      rate: TROY_OUNCE_GRAMS / quote.price,
      unit: "g gold",
      baseCurrency: "GOLD"
    };
  }

  const fx = await fetchFrankfurterRate("USD", base);
  return {
    rate: fx.rate,
    unit: base,
    baseCurrency: base
  };
}

export async function valuePortfolio(config: PortfolioConfig, displayBase = "USD"): Promise<ValuationResponse> {
  if (config.baseCurrency !== "USD") {
    throw new ValuationError("Valuation base must be USD.");
  }

  const fxCache: FxCache = new Map();
  const assets = await Promise.all(config.assets.map((asset) => valueAsset(asset, fxCache)));
  const totalUsd = assets.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0);
  const base = normalizeDisplayBase(displayBase);
  const display = await getDisplayRateFromUsd(base);

  return {
    baseCurrency: display.baseCurrency,
    totalUsd,
    totalValue: totalUsd * display.rate,
    displayRateFromUsd: display.rate,
    displayUnit: display.unit,
    pricedAssetCount: assets.filter((asset) => asset.usdValue !== null).length,
    failedAssetCount: assets.filter((asset) => asset.status === "failed").length,
    generatedAt: new Date().toISOString(),
    assets
  };
}
