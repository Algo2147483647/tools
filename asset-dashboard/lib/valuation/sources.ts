import type { FxRatePoint, PricePoint } from "./types";
import { ValuationError } from "./types";

const TROY_OUNCE_GRAMS = 31.1034768;

interface NasdaqQuoteResponse {
  data?: {
    symbol?: string;
    exchange?: string;
    primaryData?: {
      lastSalePrice?: string;
      lastTradeTimestamp?: string;
      percentageChange?: string;
    };
  } | null;
  status?: {
    rCode?: number;
  };
}

interface FreeGoldApiResponse {
  currency?: string;
  name?: string;
  price?: number;
  symbol?: string;
  updatedAt?: string;
}

interface TwelveDataQuoteResponse {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number;
  close?: string;
  previous_close?: string;
  percent_change?: string;
  code?: number;
  message?: string;
  status?: string;
}

interface ExchangeRateHostLiveResponse {
  success?: boolean;
  timestamp?: number;
  source?: string;
  quotes?: Record<string, number>;
  error?: {
    info?: string;
  };
}

export function goldQuantityToTroyOunces(quantity: number, unit = "gram"): number {
  const normalized = unit.trim().toLowerCase();
  if (["g", "gram", "grams"].includes(normalized)) {
    return quantity / TROY_OUNCE_GRAMS;
  }
  if (["kg", "kilogram", "kilograms"].includes(normalized)) {
    return (quantity * 1000) / TROY_OUNCE_GRAMS;
  }
  if (["oz", "ounce", "ounces", "troy_ounce", "troy-ounce", "troy ounce", "ozt"].includes(normalized)) {
    return quantity;
  }
  if (["lb", "pound", "pounds"].includes(normalized)) {
    return (quantity * 453.59237) / TROY_OUNCE_GRAMS;
  }
  throw new ValuationError(`Unsupported gold unit "${unit}". Use gram, kilogram, ounce, or pound.`);
}

export async function fetchFrankfurterRate(fromCurrency: string, toCurrency = "USD"): Promise<FxRatePoint> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return {
      rate: 1,
      source: "USD base currency",
      updatedAt: new Date().toISOString()
    };
  }

  const preferred = await fetchTwelveDataFxRate(from, to).catch(() => null);
  if (preferred) {
    return preferred;
  }

  const exchangerate = await fetchExchangeRateHostRate(from, to).catch(() => null);
  if (exchangerate) {
    return exchangerate;
  }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url, {
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new ValuationError(`Frankfurter FX request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as {
    date?: string;
    rates?: Record<string, number>;
  };
  const rate = data.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new ValuationError(`No ${from}/${to} exchange rate was returned by Frankfurter.`);
  }

  const previousRate = await fetchPreviousFrankfurterRate(from, to, data.date).catch(() => null);

  return {
    rate,
    source: "Frankfurter API, official central-bank reference rates",
    updatedAt: data.date ? `${data.date}T00:00:00.000Z` : new Date().toISOString(),
    dailyChangePercent: previousRate && previousRate > 0 ? ((rate - previousRate) / previousRate) * 100 : null
  };
}

export async function fetchGoldSpotUsd(): Promise<PricePoint> {
  const twelveData = await fetchTwelveDataQuote("XAU/USD", "troy ounce", "Twelve Data XAU/USD quote").catch(() => null);
  if (twelveData) {
    return twelveData;
  }

  const apiKey = process.env.GOLDAPI_KEY;
  if (!apiKey) {
    return fetchFreeGoldQuote();
  }

  try {
    const response = await fetch("https://www.goldapi.io/api/XAU/USD", {
      headers: {
        "x-access-token": apiKey,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new ValuationError(`GoldAPI.io request failed with HTTP ${response.status}.`);
    }

    const data = (await response.json()) as {
      price?: number;
      timestamp?: number;
    };

    if (typeof data.price !== "number" || !Number.isFinite(data.price)) {
      throw new ValuationError("GoldAPI.io returned no usable XAU/USD price.");
    }

    return {
      price: data.price,
      currency: "USD",
      unit: "troy ounce",
      source: "GoldAPI.io XAU/USD spot",
      updatedAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString()
    };
  } catch {
    return fetchFreeGoldQuote();
  }
}

export async function fetchAlphaVantageQuote(symbol: string): Promise<PricePoint> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return fetchNasdaqStockQuote(symbol);
  }

  try {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new ValuationError(`Alpha Vantage request failed with HTTP ${response.status}.`);
    }

    const data = (await response.json()) as {
      "Global Quote"?: Record<string, string>;
      Note?: string;
      Information?: string;
      Error?: string;
    };

    if (data.Note || data.Information || data.Error) {
      throw new ValuationError(data.Note ?? data.Information ?? data.Error ?? "Alpha Vantage returned an API message.");
    }

    const quote = data["Global Quote"];
    const price = Number(quote?.["05. price"]);
    const tradingDay = quote?.["07. latest trading day"];
    if (!Number.isFinite(price) || price <= 0) {
      throw new ValuationError(`Alpha Vantage returned no usable price for ${symbol}.`);
    }

    return {
      price,
      currency: "USD",
      unit: "share",
      source: "Alpha Vantage Global Quote",
      updatedAt: tradingDay ? `${tradingDay}T21:00:00.000Z` : new Date().toISOString(),
      dailyChangePercent: quote?.["10. change percent"] ? Number(quote["10. change percent"].replace("%", "")) : null
    };
  } catch {
    return fetchNasdaqStockQuote(symbol);
  }
}

async function fetchTwelveDataFxRate(from: string, to: string): Promise<FxRatePoint | null> {
  const quote = await fetchTwelveDataQuote(`${from}/${to}`, "currency unit", "Twelve Data Forex quote");
  if (!quote) {
    return null;
  }

  return {
    rate: quote.price,
    source: quote.source,
    updatedAt: quote.updatedAt,
    dailyChangePercent: quote.dailyChangePercent ?? null
  };
}

async function fetchTwelveDataQuote(symbol: string, unit: string, sourceLabel: string): Promise<PricePoint | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new ValuationError(`Twelve Data request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as TwelveDataQuoteResponse;
  if (data.status === "error" || data.code || data.message) {
    throw new ValuationError(data.message ?? `Twelve Data returned no quote for ${symbol}.`);
  }

  const price = Number(data.close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ValuationError(`Twelve Data returned no usable price for ${symbol}.`);
  }

  return {
    price,
    currency: data.currency ?? "USD",
    unit,
    source: data.exchange ? `${sourceLabel}, ${data.exchange}` : sourceLabel,
    updatedAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : data.datetime ? new Date(data.datetime).toISOString() : new Date().toISOString(),
    dailyChangePercent: data.percent_change ? Number(data.percent_change) : null
  };
}

async function fetchExchangeRateHostRate(from: string, to: string): Promise<FxRatePoint | null> {
  const apiKey = process.env.EXCHANGERATE_HOST_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = new URL("https://api.exchangerate.host/live");
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("source", from);
  url.searchParams.set("currencies", to);

  const response = await fetch(url, {
    next: { revalidate: 300 }
  });
  if (!response.ok) {
    throw new ValuationError(`exchangerate.host request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as ExchangeRateHostLiveResponse;
  if (!data.success) {
    throw new ValuationError(data.error?.info ?? "exchangerate.host returned no usable FX quote.");
  }

  const rate = data.quotes?.[`${from}${to}`];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new ValuationError(`exchangerate.host returned no ${from}/${to} quote.`);
  }

  return {
    rate,
    source: "exchangerate.host live market FX quote",
    updatedAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString(),
    dailyChangePercent: null
  };
}

async function fetchFreeGoldQuote(): Promise<PricePoint> {
  const response = await fetch("https://api.gold-api.com/price/XAU", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json"
    },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new ValuationError(`Gold-API.com request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as FreeGoldApiResponse;
  if (typeof data.price !== "number" || !Number.isFinite(data.price) || data.price <= 0) {
    throw new ValuationError("Gold-API.com returned no usable XAU/USD price.");
  }

  return {
    price: data.price,
    currency: data.currency ?? "USD",
    unit: "troy ounce",
    source: "Gold-API.com free XAU/USD quote",
    updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString()
  };
}

async function fetchNasdaqStockQuote(symbol: string): Promise<PricePoint> {
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info`);
  url.searchParams.set("assetclass", "stocks");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/"
    },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    throw new ValuationError(`Nasdaq quote request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as NasdaqQuoteResponse;
  if (!data.data || data.status?.rCode === 400) {
    throw new ValuationError(`Nasdaq returned no quote data for ${symbol}.`);
  }

  const rawPrice = data.data.primaryData?.lastSalePrice?.replace(/[$,\s]/g, "");
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ValuationError(`Nasdaq returned no usable price for ${symbol}.`);
  }

  return {
    price,
    currency: "USD",
    unit: "share",
    source: data.data.exchange ? `Nasdaq quote API, ${data.data.exchange}` : "Nasdaq quote API",
    updatedAt: data.data.primaryData?.lastTradeTimestamp
      ? new Date(`${data.data.primaryData.lastTradeTimestamp} 21:00:00 UTC`).toISOString()
      : new Date().toISOString(),
    dailyChangePercent: data.data.primaryData?.percentageChange ? Number(data.data.primaryData.percentageChange.replace("%", "")) : null
  };
}

async function fetchPreviousFrankfurterRate(from: string, to: string, latestDate?: string): Promise<number | null> {
  if (!latestDate) {
    return null;
  }

  const latest = new Date(`${latestDate}T00:00:00.000Z`);
  if (Number.isNaN(latest.getTime())) {
    return null;
  }

  const start = new Date(latest);
  start.setUTCDate(start.getUTCDate() - 7);
  const startDate = start.toISOString().slice(0, 10);
  const url = `https://api.frankfurter.app/${startDate}..${latestDate}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(url, {
    next: { revalidate: 300 }
  });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    rates?: Record<string, Record<string, number>>;
  };
  const dates = Object.keys(data.rates ?? {}).sort();
  const previousDate = dates.filter((date) => date < latestDate).pop();
  const previous = previousDate ? data.rates?.[previousDate]?.[to] : undefined;
  return typeof previous === "number" && Number.isFinite(previous) ? previous : null;
}
