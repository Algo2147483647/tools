import type { PricePoint, StockAsset } from "./types";
import { ValuationError } from "./types";
import { createPricingContext, type PricingContext } from "./request";
import { positiveQuote, quoteTimestamp } from "./sources";
import { assessQuote } from "./quote";

const exchanges: Record<string, string> = {
  NASDAQ: "XNAS", "NASDAQ-GS": "XNAS", "NASDAQ-GM": "XNAS", "NASDAQ-CM": "XNAS",
  NYSE: "XNYS", PSE: "ARCX", "NYSE ARCA": "ARCX", NYSEARCA: "ARCX",
  AMEX: "XASE", "NYSE AMERICAN": "XASE", BATS: "BATS", "CBOE BZX": "BATS",
};

interface NasdaqTrade {
  lastSalePrice?: string;
  lastTradeTimestamp?: string;
  percentageChange?: string;
  isRealTime?: boolean;
  currency?: string | null;
}

function percentage(value?: string): number | null {
  if (!value?.trim()) return null;
  const result = Number(value.replace("%", ""));
  return Number.isFinite(result) && Math.abs(result) <= 1e12 ? result : null;
}

async function nasdaqQuote(asset: StockAsset, kind: "stocks" | "etf", context: PricingContext): Promise<PricePoint> {
  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(asset.symbol)}/info`);
  url.searchParams.set("assetclass", kind);
  const response = await context.json<{
    data?: { symbol?: string; exchange?: string; assetClass?: string; marketStatus?: string;
      primaryData?: NasdaqTrade; secondaryData?: NasdaqTrade } | null;
    status?: { rCode?: number };
  }>(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
    next: { revalidate: 60 },
  });
  const data = response.data;
  if (!data || (response.status?.rCode && response.status.rCode >= 400)) {
    throw new ValuationError(`Nasdaq returned no ${kind === "etf" ? "ETF" : "equity"} quote data for ${asset.symbol}.`, 502);
  }
  const exchange = exchanges[data.exchange?.toUpperCase() ?? ""];
  if (data.symbol?.toUpperCase() !== asset.symbol || data.assetClass?.toLowerCase() !== kind
    || !exchange || (asset.exchange && asset.exchange !== exchange)) {
    throw new ValuationError(`Nasdaq returned a mismatched or unverified listing for ${asset.symbol}.`, 502);
  }
  function parse(trade: NasdaqTrade, secondary: boolean): PricePoint {
    // This adapter covers USD U.S. listings only. Never reinterpret GBX or another currency as dollars.
    if ((trade.currency && trade.currency.toUpperCase() !== "USD") || !/^\$[\d,.]+$/.test(trade.lastSalePrice?.trim() ?? "")) {
      throw new ValuationError(`Nasdaq returned an unverified USD price for ${asset.symbol}.`, 502);
    }
    const closed = secondary || /^Closed at\s/i.test(trade.lastTradeTimestamp ?? "") || data!.marketStatus === "Closed";
    const marketState = data!.marketStatus ?? "Unknown";
    const priceSession = closed ? "close" : marketState === "Pre-Market" ? "pre"
      : marketState === "After-Hours" ? "post" : marketState === "Open" ? "regular" : "unknown";
    const updatedAt = quoteTimestamp(trade.lastTradeTimestamp);
    const dateOnly = /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(trade.lastTradeTimestamp ?? "");
    const quote: PricePoint = {
      price: positiveQuote(trade.lastSalePrice!.replace(/[$,\s]/g, ""), "Nasdaq"),
      currency: "USD", unit: "share", source: `Nasdaq quote API, ${data!.exchange}`,
      updatedAt, fetchedAt: new Date().toISOString(), marketState, priceSession,
      timestampPrecision: !updatedAt ? "unknown" : dateOnly ? "date" : "minute",
      quality: closed || dateOnly ? "close" : priceSession === "unknown" ? "unknown"
        : trade.isRealTime === true ? "realtime" : trade.isRealTime === false ? "delayed" : "unknown",
      delaySeconds: trade.isRealTime === true ? 0 : null,
      dailyChangePercent: percentage(trade.percentageChange),
    };
    quote.quality = assessQuote(quote).quality;
    return quote;
  }
  let primaryError: unknown;
  let primary: PricePoint | undefined;
  try { if (data.primaryData) primary = parse(data.primaryData, false); } catch (error) { primaryError = error; }
  if (primary && primary.quality !== "stale" && primary.quality !== "unknown") return primary;
  let secondary: PricePoint | undefined;
  try { if (data.secondaryData) secondary = parse(data.secondaryData, true); } catch { /* Preserve primary diagnostics. */ }
  if (primary && secondary) return chooseQuote(primary, secondary);
  if (primary || secondary) return (primary ?? secondary)!;
  throw primaryError ?? new ValuationError(`Nasdaq returned no usable price for ${asset.symbol}.`, 502);
}

function chooseQuote(first: PricePoint, second: PricePoint): PricePoint {
  const trusted = (quote: PricePoint) => !["stale", "unknown"].includes(assessQuote(quote).quality);
  if (trusted(first) !== trusted(second)) return trusted(first) ? first : second;
  return Date.parse(second.updatedAt ?? "") > Date.parse(first.updatedAt ?? "") ? second : first;
}

async function alphaVantageQuote(asset: StockAsset, context: PricingContext): Promise<PricePoint | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", asset.symbol);
  url.searchParams.set("apikey", apiKey);
  const data = await context.json<{
    "Global Quote"?: Record<string, string>; Note?: string; Information?: string; Error?: string; "Error Message"?: string;
  }>(url, { next: { revalidate: 300 } });
  const quote = data["Global Quote"];
  if (data.Note || data.Information || data.Error || data["Error Message"] || quote?.["01. symbol"] !== asset.symbol) {
    throw new ValuationError(`Alpha Vantage returned no verified quote for ${asset.symbol}.`, 502);
  }
  const result: PricePoint = {
    price: positiveQuote(quote?.["05. price"], "Alpha Vantage"), currency: "USD", unit: "share",
    source: "Alpha Vantage Global Quote (daily reference)", updatedAt: quoteTimestamp(quote?.["07. latest trading day"]),
    fetchedAt: new Date().toISOString(), timestampPrecision: "date", quality: "close",
    marketState: "Unknown", priceSession: "close", delaySeconds: null,
    dailyChangePercent: percentage(quote?.["10. change percent"]),
  };
  result.quality = assessQuote(result).quality;
  return result;
}

/** USD U.S. listings only; optional type discovery never aliases a ticker to another company. */
export async function fetchListedQuote(asset: StockAsset, context = createPricingContext()): Promise<PricePoint> {
  if ((asset.currency && asset.currency !== "USD") || (asset.exchange && !Object.values(exchanges).includes(asset.exchange))) {
    throw new ValuationError(`Unsupported listing for ${asset.symbol}: this provider supports USD U.S. equities and ETFs only.`, 502);
  }
  let result: PricePoint | undefined;
  let error: unknown;
  const kinds: Array<"stocks" | "etf"> = asset.securityType === "etf" ? ["etf"] : asset.securityType === "equity" ? ["stocks"] : ["stocks", "etf"];
  for (const kind of kinds) {
    try { result = await nasdaqQuote(asset, kind, context); break; } catch (reason) { error = reason; }
  }
  // A key must not replace a usable intraday quote with the default daily Global Quote.
  if (result && !["stale", "unknown"].includes(result.quality ?? "unknown")) return result;
  try {
    const fallback = await alphaVantageQuote(asset, context);
    if (fallback) return result ? chooseQuote(result, fallback) : fallback;
  } catch (reason) { error = reason; }
  if (result) return result;
  throw error ?? new ValuationError(`No quote available for ${asset.symbol}.`, 502);
}
