import type { AssetConfig, AssetValuation, FundPricePoint, FxRatePoint, PortfolioConfig, PricePoint, ValuationResponse } from "./types";
import { ValuationError } from "./types";
import { fetchAlphaVantageQuote, fetchFrankfurterRate, fetchFundNav, fetchGoldSpotUsd } from "./sources";
import { goldQuantityToTroyOunces, TROY_OUNCE_GRAMS } from "./units";
import { createPricingContext, type PricingOptions } from "./request";
import { validatePortfolioConfig } from "./schema";

const MAX_MONEY = Number.MAX_SAFE_INTEGER;

function checkedMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new ValuationError("Calculated value exceeds the supported safe numeric range.");
  }
  return value;
}

function createQuotes(options: PricingOptions) {
  const context = createPricingContext(options);
  let gold: Promise<PricePoint> | undefined;
  const stocks = new Map<string, Promise<PricePoint>>();
  const funds = new Map<string, Promise<FundPricePoint>>();
  const fx = new Map<string, Promise<FxRatePoint>>();
  return {
    gold: () => gold ??= fetchGoldSpotUsd(context),
    stock(symbol: string) {
      const key = symbol.toUpperCase();
      if (!stocks.has(key)) stocks.set(key, fetchAlphaVantageQuote(key, context));
      return stocks.get(key)!;
    },
    fund(code: string) {
      if (!funds.has(code)) funds.set(code, fetchFundNav(code, context));
      return funds.get(code)!;
    },
    fx(from: string, to = "USD") {
      const key = `${from}-${to}`;
      if (!fx.has(key)) {
        const reverse = fx.get(`${to}-${from}`);
        const request = reverse ? reverse.then((quote) => ({
          ...quote, rate: 1 / quote.rate,
          dailyChangePercent: quote.dailyChangePercent != null && quote.dailyChangePercent > -100
            ? -quote.dailyChangePercent / (1 + quote.dailyChangePercent / 100) : null
        })) : fetchFrankfurterRate(from, to, context);
        fx.set(key, request);
      }
      return fx.get(key)!;
    }
  };
}

type Quotes = ReturnType<typeof createQuotes>;

function withQuoteWarning(asset: AssetValuation): AssetValuation {
  if (asset.status === "failed") return asset;
  const warning = !asset.updatedAt ? "The provider did not supply a usable quote timestamp."
    : Date.now() - Date.parse(asset.updatedAt) > 7 * 24 * 60 * 60 * 1000
      ? "The latest available quote is more than 7 days old." : undefined;
  return warning ? { ...asset, status: "warning", warning } : asset;
}

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
  if (asset.type === "fund") {
    return asset.code === "000055" ? "GF Nasdaq-100 ETF Feeder (QDII) - USD A" : `Fund ${asset.code}`;
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
    fundCode: asset.type === "fund" ? asset.code : undefined,
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

async function valueAsset(asset: AssetConfig, quotes: Quotes): Promise<AssetValuation> {
  try {
    if (asset.type === "gold") {
      const troyOunces = goldQuantityToTroyOunces(asset.quantity, asset.unit);
      const quote = await quotes.gold();
      const usdValue = checkedMoney(troyOunces * quote.price);
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
      const fx = await quotes.fx(asset.currency);
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
        usdValue: checkedMoney(asset.quantity * fx.rate),
        dailyChangePercent: fx.dailyChangePercent ?? null,
        source: fx.source,
        updatedAt: fx.updatedAt,
        status: "ok",
        message: `1 ${asset.currency.toUpperCase()} = ${fx.rate.toFixed(6)} USD.`
      };
    }

    if (asset.type === "stock") {
      const quote = await quotes.stock(asset.symbol);
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
        usdValue: checkedMoney(asset.quantity * quote.price),
        dailyChangePercent: quote.dailyChangePercent ?? null,
        source: quote.source,
        updatedAt: quote.updatedAt,
        status: "ok",
        message: `${asset.symbol} latest available U.S. market quote.`
      };
    }

    if (asset.type === "fund") {
      const quote = await quotes.fund(asset.code);
      if (asset.currency && asset.currency !== quote.currency) {
        throw new ValuationError(`Fund ${asset.code} is priced in ${quote.currency}, but the configured currency is ${asset.currency}.`);
      }
      const fx = await quotes.fx(quote.currency);
      return {
        id: asset.id, type: asset.type, name: assetName(asset), quantity: asset.quantity,
        fundCode: asset.code, unit: "units", price: quote.price, pricingCurrency: quote.currency,
        priceUnit: quote.unit, fxRateToUsd: fx.rate, usdValue: checkedMoney(asset.quantity * quote.price * fx.rate),
        dailyChangePercent: quote.dailyChangePercent ?? null,
        source: quote.currency === "USD" ? quote.source : `${quote.source} + ${fx.source}`,
        updatedAt: quote.updatedAt, navDate: quote.navDate, referenceNAV: true, status: "ok",
        message: `Published NAV dated ${quote.navDate}. Reference valuation; QDII NAV publication may lag market dates.`
      };
    }

    const fx = await quotes.fx(asset.currency);
    return {
      id: asset.id,
      type: asset.type,
      name: assetName(asset),
      quantity: asset.quantity,
      price: asset.price,
      pricingCurrency: asset.currency,
      priceUnit: "manual unit",
      fxRateToUsd: fx.rate,
      usdValue: checkedMoney(asset.quantity * asset.price * fx.rate),
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

export function normalizeDisplayBase(base?: string): string {
  const normalized = (base ?? "USD").trim().toUpperCase();
  if (["GOLD", "XAU", "XAU_GRAM", "GOLD_GRAM"].includes(normalized)) {
    return "GOLD_GRAM";
  }
  if (!/^[A-Z]{3}$/.test(normalized)) throw new ValuationError("Display currency must be a 3-letter currency code or GOLD.");
  return normalized;
}

async function getDisplayRateFromUsd(base: string, quotes: Quotes): Promise<{ rate: number; unit: string; baseCurrency: string }> {
  if (base === "USD") {
    return {
      rate: 1,
      unit: "USD",
      baseCurrency: "USD"
    };
  }

  if (base === "GOLD_GRAM") {
    const quote = await quotes.gold();
    return {
      rate: TROY_OUNCE_GRAMS / quote.price,
      unit: "g gold",
      baseCurrency: "GOLD"
    };
  }

  const fx = await quotes.fx("USD", base);
  return {
    rate: fx.rate,
    unit: base,
    baseCurrency: base
  };
}

export async function valuePortfolio(input: PortfolioConfig, displayBase = "USD", options: PricingOptions = {}): Promise<ValuationResponse> {
  const config = validatePortfolioConfig(input);
  const base = normalizeDisplayBase(displayBase);
  const quotes = createQuotes(options);
  const assets = (await Promise.all(config.assets.map((asset) => valueAsset(asset, quotes)))).map(withQuoteWarning);
  const totalUsd = checkedMoney(assets.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0));
  let display = { rate: 1, unit: "USD", baseCurrency: "USD" };
  let displayWarning: string | undefined;
  let totalValue = totalUsd;
  try {
    const converted = await getDisplayRateFromUsd(base, quotes);
    if (!Number.isFinite(converted.rate) || converted.rate <= 0) throw new ValuationError("Display conversion returned an invalid rate.", 502);
    totalValue = checkedMoney(totalUsd * converted.rate);
    display = converted;
  } catch {
    displayWarning = `Unable to convert to ${base === "GOLD_GRAM" ? "gold grams" : base}. Values are shown in USD; the portfolio's USD valuation is preserved.`;
  }

  return {
    baseCurrency: display.baseCurrency,
    totalUsd,
    totalValue,
    displayRateFromUsd: display.rate,
    displayUnit: display.unit,
    displayWarning,
    pricedAssetCount: assets.filter((asset) => asset.usdValue !== null).length,
    failedAssetCount: assets.filter((asset) => asset.status === "failed").length,
    generatedAt: new Date().toISOString(),
    assets
  };
}
