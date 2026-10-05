import type { FxRatePoint, PricePoint } from "./types";
import { ValuationError } from "./types";
import { createPricingContext, type PricingContext } from "./request";
export { goldQuantityToTroyOunces } from "./units";

function sourceError(message: string): never {
  throw new ValuationError(message, 502);
}

export function positiveQuote(value: unknown, label: string): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0 || parsed > 1e12) {
    return sourceError(`${label} returned no usable positive price or rate.`);
  }
  return parsed;
}

function percent(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(typeof value === "string" ? value.replace("%", "") : value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e12 ? parsed : null;
}

/** Unknown source timestamps stay unknown; the request time is not a quote time. */
export function quoteTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  let input: string | number = value;
  if (typeof value === "number") input = value * 1000;
  // Nasdaq often sends a date only. Do not append a fictitious market close time.
  if (typeof input === "string") {
    input = input.trim();
    if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(input)) input = `${input} UTC`;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(input) && !/(?:Z|[+-]\d{2}:?\d{2}|UTC|GMT|EST|EDT)$/i.test(input)) {
      // A local wall-clock time without a known zone cannot be interpreted as this server's local time.
      return null;
    }
  }
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function twelveDataQuote(symbol: string, unit: string, label: string, context: PricingContext): Promise<PricePoint | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const data = await context.json<{
    status?: string; code?: number; message?: string; close?: string; currency?: string;
    timestamp?: number; datetime?: string; exchange?: string; percent_change?: string;
  }>(url, { cache: "no-store" });
  if (data.status === "error" || data.code || data.message) sourceError(`Twelve Data returned no quote for ${symbol}.`);
  const targetCurrency = symbol.split("/")[1] ?? "USD";
  if (data.currency && data.currency.toUpperCase() !== targetCurrency) sourceError("Twelve Data returned an unexpected quote currency.");
  return {
    price: positiveQuote(data.close, "Twelve Data"), currency: targetCurrency, unit,
    source: data.exchange ? `${label}, ${data.exchange}` : label,
    updatedAt: quoteTimestamp(data.timestamp ?? data.datetime),
    dailyChangePercent: percent(data.percent_change)
  };
}

async function exchangeRateHost(from: string, to: string, context: PricingContext): Promise<FxRatePoint | null> {
  const apiKey = process.env.EXCHANGERATE_HOST_API_KEY;
  if (!apiKey) return null;
  const url = new URL("https://api.exchangerate.host/live");
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("source", from);
  url.searchParams.set("currencies", to);
  const data = await context.json<{
    success?: boolean; timestamp?: number; source?: string; quotes?: Record<string, number>;
  }>(url, { next: { revalidate: 300 } });
  if (!data.success || (data.source && data.source !== from)) sourceError("exchangerate.host returned no usable FX quote.");
  return {
    rate: positiveQuote(data.quotes?.[`${from}${to}`], "exchangerate.host"),
    source: "exchangerate.host live market FX quote", updatedAt: quoteTimestamp(data.timestamp), dailyChangePercent: null
  };
}

export async function fetchFrankfurterRate(fromCurrency: string, toCurrency = "USD", context = createPricingContext()): Promise<FxRatePoint> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return { rate: 1, source: `${from} base currency`, updatedAt: new Date().toISOString() };
  const preferred = await twelveDataQuote(`${from}/${to}`, "currency unit", "Twelve Data Forex quote", context).catch(() => null);
  if (preferred) return {
    rate: preferred.price, source: preferred.source, updatedAt: preferred.updatedAt, dailyChangePercent: preferred.dailyChangePercent
  };
  const secondary = await exchangeRateHost(from, to, context).catch(() => null);
  if (secondary) return secondary;
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const data = await context.json<{ date?: string; rates?: Record<string, number> }>(url, { next: { revalidate: 300 } });
  const rate = positiveQuote(data.rates?.[to], "Frankfurter");
  const previous = await previousFrankfurterRate(from, to, data.date, context).catch(() => null);
  return {
    rate, source: "Frankfurter API, official central-bank reference rates", updatedAt: quoteTimestamp(data.date),
    dailyChangePercent: previous ? percent(((rate - previous) / previous) * 100) : null
  };
}

async function previousFrankfurterRate(from: string, to: string, date: string | undefined, context: PricingContext): Promise<number | null> {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !quoteTimestamp(date)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const url = `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const data = await context.json<{ rates?: Record<string, Record<string, number>> }>(url, { next: { revalidate: 300 } });
  const previousDate = Object.keys(data.rates ?? {}).filter((day) => day < date).sort().pop();
  if (!previousDate) return null;
  return positiveQuote(data.rates?.[previousDate]?.[to], "Frankfurter history");
}

export async function fetchGoldSpotUsd(context = createPricingContext()): Promise<PricePoint> {
  const preferred = await twelveDataQuote("XAU/USD", "troy ounce", "Twelve Data XAU/USD quote", context).catch(() => null);
  if (preferred) return preferred;
  const apiKey = process.env.GOLDAPI_KEY;
  if (apiKey) {
    try {
      const data = await context.json<{ price?: number; timestamp?: number }>("https://www.goldapi.io/api/XAU/USD", {
        headers: { "x-access-token": apiKey, "Content-Type": "application/json" }, cache: "no-store"
      });
      return {
        price: positiveQuote(data.price, "GoldAPI.io"), currency: "USD", unit: "troy ounce",
        source: "GoldAPI.io XAU/USD spot", updatedAt: quoteTimestamp(data.timestamp)
      };
    } catch { /* A failed preferred source should not prevent use of the free fallback. */ }
  }
  const data = await context.json<{ price?: number; currency?: string; updatedAt?: string }>("https://api.gold-api.com/price/XAU", {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, next: { revalidate: 60 }
  });
  if (data.currency && data.currency.toUpperCase() !== "USD") sourceError("Gold-API.com returned an unexpected quote currency.");
  return {
    price: positiveQuote(data.price, "Gold-API.com"), currency: "USD", unit: "troy ounce",
    source: "Gold-API.com free XAU/USD quote", updatedAt: quoteTimestamp(data.updatedAt)
  };
}

export async function fetchAlphaVantageQuote(symbol: string, context = createPricingContext()): Promise<PricePoint> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (apiKey) {
    try {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "GLOBAL_QUOTE");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("apikey", apiKey);
      const data = await context.json<{
        "Global Quote"?: Record<string, string>; Note?: string; Information?: string; Error?: string; "Error Message"?: string;
      }>(url, { cache: "no-store" });
      if (data.Note || data.Information || data.Error || data["Error Message"]) sourceError("Alpha Vantage returned an API error.");
      const quote = data["Global Quote"];
      return {
        price: positiveQuote(quote?.["05. price"], "Alpha Vantage"), currency: "USD", unit: "share",
        source: "Alpha Vantage Global Quote", updatedAt: quoteTimestamp(quote?.["07. latest trading day"]),
        dailyChangePercent: percent(quote?.["10. change percent"])
      };
    } catch { /* Public Nasdaq data remains available if a keyed provider fails. */ }
  }
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info`);
  url.searchParams.set("assetclass", "stocks");
  const data = await context.json<{
    data?: { exchange?: string; primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string; percentageChange?: string } } | null;
    status?: { rCode?: number };
  }>(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
    next: { revalidate: 60 }
  });
  if (!data.data || (data.status?.rCode && data.status.rCode >= 400)) sourceError(`Nasdaq returned no quote data for ${symbol}.`);
  const quote = data.data.primaryData;
  return {
    price: positiveQuote(quote?.lastSalePrice?.replace(/[$,\s]/g, ""), "Nasdaq"), currency: "USD", unit: "share",
    source: data.data.exchange ? `Nasdaq quote API, ${data.data.exchange}` : "Nasdaq quote API",
    updatedAt: quoteTimestamp(quote?.lastTradeTimestamp), dailyChangePercent: percent(quote?.percentageChange)
  };
}
