import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { validatePortfolioConfig } from "../lib/valuation/schema";
import { quoteTimestamp } from "../lib/valuation/sources";
import { assessQuote } from "../lib/valuation/quote";
import { valuePortfolio } from "../lib/valuation/valuation";
import type { StockAsset } from "../lib/valuation/types";

let key: string | undefined;
beforeEach(() => { key = process.env.ALPHA_VANTAGE_API_KEY; delete process.env.ALPHA_VANTAGE_API_KEY; });
afterEach(() => { if (key === undefined) delete process.env.ALPHA_VANTAGE_API_KEY; else process.env.ALPHA_VANTAGE_API_KEY = key; });
const holding: StockAsset = { id: "nvda", type: "stock", symbol: "NVDA", quantity: 1, securityType: "equity", exchange: "XNAS", currency: "USD" };
const fixture = (symbol = "NVDA", kind = "STOCKS", exchange = "NASDAQ-GS", price = 100) => ({
  data: { symbol, assetClass: kind, exchange, marketStatus: "Open", primaryData: {
    lastSalePrice: `$${price}`, lastTradeTimestamp: new Date().toISOString(), isRealTime: true, percentageChange: "0%", currency: null,
  } }, status: { rCode: 200 },
});
const portfolio = (...assets: StockAsset[]) => ({ baseCurrency: "USD" as const, assets });

test("the listed example positions route both ETFs and SpaceX correctly and multiply share counts", async () => {
  // Public routing fixture only; never embed a password or decrypt the private example in CI.
  const config = validatePortfolioConfig(portfolio(
    { ...holding, id: "qqqm", symbol: "QQQM", quantity: 4, securityType: "etf" },
    { ...holding, id: "spym", symbol: "SPYM", quantity: 3, securityType: "etf", exchange: "ARCX" },
    { ...holding, id: "spcx", symbol: "SPCX" },
    holding,
  ));
  const assets = config.assets.filter((asset): asset is StockAsset => asset.type === "stock");
  assert.deepEqual(assets.map((a) => [a.symbol, a.quantity]), [["QQQM", 4], ["SPYM", 3], ["SPCX", 1], ["NVDA", 1]]);
  const calls: string[] = [];
  const result = await valuePortfolio(portfolio(...assets), "USD", { fetch: async (input) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const symbol = url.pathname.split("/")[3];
    const prices: Record<string, number> = { QQQM: 200, SPYM: 80, SPCX: 150, NVDA: 100 };
    const etf = ["QQQM", "SPYM"].includes(symbol);
    assert.equal(url.searchParams.get("assetclass"), etf ? "etf" : "stocks");
    return Response.json(fixture(symbol, etf ? "ETF" : "STOCKS", symbol === "SPYM" ? "PSE" : "NASDAQ-GS", prices[symbol]));
  } });
  assert.equal(calls.length, 4);
  assert.equal(result.totalUsd, 1290);
  assert.equal(result.failedAssetCount, 0);
  for (const asset of result.assets) {
    assert.equal(asset.quality, "realtime");
    assert.equal(asset.dailyChangePercent, 0);
    assert.ok(asset.updatedAt);
    assert.ok(asset.fetchedAt);
  }
});

test("ET parsing handles winter, summer, close prefixes, invalid and ambiguous dates", () => {
  assert.equal(quoteTimestamp("Jan 15, 2026 4:00 PM ET"), "2026-01-15T21:00:00.000Z");
  assert.equal(quoteTimestamp("Closed at Jul 15, 2026 4:00 PM ET"), "2026-07-15T20:00:00.000Z");
  assert.equal(quoteTimestamp("Oct 30, 2026 4:48 AM ET"), "2026-10-30T08:48:00.000Z");
  assert.equal(quoteTimestamp("Mar 8, 2026 2:30 AM ET"), null);
  assert.equal(quoteTimestamp("Nov 1, 2026 1:30 AM ET"), null);
  assert.equal(quoteTimestamp("Feb 30, 2026 4:00 PM ET"), null);
  assert.equal(quoteTimestamp("Oct 30, 2026 0:99 PM ET"), null);
});

test("explicit ETF type is preserved and legacy unspecified holdings discover an ETF", async () => {
  const config = validatePortfolioConfig(portfolio({ ...holding, symbol: "qqqm", securityType: "etf", exchange: "xnas" }));
  assert.equal((config.assets[0] as StockAsset).securityType, "etf");
  assert.equal((config.assets[0] as StockAsset).exchange, "XNAS");
  assert.throws(() => validatePortfolioConfig(portfolio({ ...holding, securityType: "fund" } as unknown as StockAsset)), /securityType/);
  const requests: string[] = [];
  const result = await valuePortfolio(portfolio({ ...holding, symbol: "QQQM", securityType: undefined }), "USD", { fetch: async (url) => {
    requests.push(String(url));
    return Response.json(String(url).includes("assetclass=etf") ? fixture("QQQM", "ETF") : { data: null, status: { rCode: 400 } });
  } });
  assert.equal(requests.length, 2);
  assert.equal(result.assets[0].usdValue, 100);
});

test("wrong symbol, exchange, instrument type, currency and missing identity cannot be valued", async () => {
  const invalid = [
    { symbol: "SPEX" }, { symbol: undefined }, { exchange: "PSE" }, { exchange: "LSE" }, { assetClass: "ETF" },
    { primaryData: { ...fixture().data.primaryData, currency: "GBP" } },
    { primaryData: { ...fixture().data.primaryData, lastSalePrice: "100.00" } },
  ];
  for (const change of invalid) {
    const result = await valuePortfolio(portfolio(holding), "USD", { fetch: async () => Response.json({ data: { ...fixture().data, ...change } }) });
    assert.equal(result.failedAssetCount, 1, JSON.stringify(change));
    assert.equal(result.assets[0].usdValue, null);
  }
  for (const change of [{ exchange: "XLON" }, { currency: "GBP" }]) {
    const result = await valuePortfolio(portfolio({ ...holding, ...change }), "USD", { fetch: async () => { throw new Error("Must not fetch an unsupported market"); } });
    assert.match(result.assets[0].message, /Unsupported listing/);
  }
});

test("Nasdaq intraday data is used even when a daily Alpha Vantage key exists", async () => {
  process.env.ALPHA_VANTAGE_API_KEY = "test";
  const result = await valuePortfolio(portfolio(holding), "USD", { fetch: async (url) => {
    assert.match(String(url), /api.nasdaq.com/);
    return Response.json(fixture());
  } });
  assert.equal(result.assets[0].quality, "realtime");
  assert.equal(result.assets[0].price, 100);
});

test("daily fallback keeps date precision and never claims realtime; wrong fallback symbol fails", async () => {
  process.env.ALPHA_VANTAGE_API_KEY = "test";
  for (const symbol of ["NVDA", "WRONG"]) {
    const result = await valuePortfolio(portfolio(holding), "USD", { fetch: async (url) => {
      if (String(url).includes("nasdaq")) return new Response("", { status: 429 });
      return Response.json({ "Global Quote": { "01. symbol": symbol, "05. price": "120", "07. latest trading day": new Date().toISOString().slice(0, 10) } });
    } });
    if (symbol === "WRONG") assert.equal(result.failedAssetCount, 1);
    else {
      assert.equal(result.assets[0].quality, "close");
      assert.equal(result.assets[0].timestampPrecision, "date");
      assert.equal(result.assets[0].status, "warning");
      assert.equal(result.totalUsd, 120);
    }
  }
});

test("an unavailable primary trade falls back to a labeled secondary close", async () => {
  const quote = fixture();
  const result = await valuePortfolio(portfolio(holding), "USD", { fetch: async () => Response.json({
    data: { ...quote.data, primaryData: { lastSalePrice: "N/A" }, secondaryData: quote.data.primaryData },
  }) });
  assert.equal(result.assets[0].quality, "close");
  assert.equal(result.assets[0].priceSession, "close");
  assert.equal(result.totalUsd, 100);
});

test("a frozen Nasdaq trade does not suppress a newer daily fallback", async () => {
  process.env.ALPHA_VANTAGE_API_KEY = "test";
  const quote = fixture();
  quote.data.primaryData.lastTradeTimestamp = new Date(Date.now() - 10 * 86400_000).toISOString();
  const result = await valuePortfolio(portfolio(holding), "USD", { fetch: async (url) => Response.json(
    String(url).includes("nasdaq") ? quote : { "Global Quote": {
      "01. symbol": "NVDA", "05. price": "125", "07. latest trading day": new Date().toISOString().slice(0, 10),
    } },
  ) });
  assert.equal(result.assets[0].quality, "close");
  assert.equal(result.totalUsd, 125);
  assert.match(result.assets[0].source, /Alpha Vantage/);
});

test("freshness distinguishes frozen intraday trades, missing timestamps, delayed data and weekend closes", () => {
  const now = Date.parse("2026-10-25T14:00:00Z");
  const updatedAt = new Date(now - 600_000).toISOString();
  assert.equal(assessQuote({ updatedAt, quality: "realtime", marketState: "Open" }, now).quality, "stale");
  assert.equal(assessQuote({ updatedAt, quality: "delayed", marketState: "Open" }, now).quality, "delayed");
  assert.equal(assessQuote({ updatedAt: null, quality: "realtime" }, now).quality, "unknown");
  assert.equal(assessQuote({ updatedAt: new Date(now + 600_000).toISOString(), quality: "realtime" }, now).quality, "unknown");
  assert.equal(assessQuote({ updatedAt: "2026-10-23T20:00:00Z", quality: "close", marketState: "Closed" }, now).quality, "close");
  assert.equal(assessQuote({ updatedAt: "2026-10-10T20:00:00Z", quality: "close", marketState: "Closed" }, now).quality, "stale");
});
