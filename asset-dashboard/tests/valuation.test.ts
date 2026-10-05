import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../app/api/valuation/route";
import { createPricingContext } from "../lib/valuation/request";
import { validatePortfolioConfig } from "../lib/valuation/schema";
import { positiveQuote, quoteTimestamp } from "../lib/valuation/sources";
import { valuePortfolio } from "../lib/valuation/valuation";
import type { AssetConfig } from "../lib/valuation/types";

const keys = ["TWELVE_DATA_API_KEY", "GOLDAPI_KEY", "ALPHA_VANTAGE_API_KEY", "EXCHANGERATE_HOST_API_KEY"];
let savedKeys: Array<string | undefined>;
beforeEach(() => {
  savedKeys = keys.map((key) => process.env[key]);
  keys.forEach((key) => delete process.env[key]);
});
afterEach(() => keys.forEach((key, index) => {
  if (savedKeys[index] === undefined) delete process.env[key];
  else process.env[key] = savedKeys[index];
}));

const portfolio = (...assets: AssetConfig[]) => ({ baseCurrency: "USD" as const, assets });
const json = (value: unknown) => Response.json(value);
const stockQuote = (date = new Date().toISOString()) => ({
  data: { exchange: "NASDAQ", primaryData: { lastSalePrice: "$123.50", lastTradeTimestamp: date, percentageChange: "1.5%" } }
});
const fundQuote = (changes: Record<string, unknown> = {}) => ({
  errorno: "20000",
  data: [{ FUNDCODE: "000055", MONEYTYPE: "USD", NAVUNIT: "1.2375", NAVDATE: "20260929", DAYINCREMENTRATE: "0.19", ...changes }]
});

test("validates six-digit fund codes and an optional expected share-class currency", () => {
  for (const code of ["55", 55, "0000557", "A00055", "../055", ""]) {
    assert.throws(() => validatePortfolioConfig({ assets: [{ id: "fund", type: "fund", quantity: 1, code }] }));
  }
  const result = validatePortfolioConfig({ assets: [{ id: "fund", type: "fund", code: "000055", quantity: 2172.16, currency: " usd " }] });
  assert.deepEqual(result.assets[0], { id: "fund", type: "fund", name: undefined, code: "000055", quantity: 2172.16, currency: "USD" });
});

test("values 000055 units using its official USD NAV and preserves the NAV date", async () => {
  const urls: string[] = [];
  const result = await valuePortfolio(portfolio({ id: "fund", type: "fund", code: "000055", currency: "USD", quantity: 2172.16 }), "USD", {
    fetch: async (url) => { urls.push(String(url)); return json(fundQuote()); }
  });
  assert.equal(urls.length, 1, "USD share class should not request a CNY exchange rate.");
  assert.match(urls[0], /gffunds\.com\.cn.*fundcode=000055/);
  assert.ok(Math.abs(result.totalUsd - 2688.048) < 1e-9);
  const asset = result.assets[0];
  assert.equal(asset.pricingCurrency, "USD");
  assert.equal(asset.price, 1.2375);
  assert.equal(asset.unit, "units");
  assert.equal(asset.navDate, "2026-09-29");
  assert.equal(asset.updatedAt, "2026-09-29T00:00:00.000Z");
  assert.equal(asset.referenceNAV, true);
  assert.equal(asset.fundCode, "000055");
  assert.equal(asset.name, "GF Nasdaq-100 ETF Feeder (QDII) - USD A");
  assert.match(asset.message, /Reference valuation/);
});

test("deduplicates published NAV requests for the same fund", async () => {
  let calls = 0;
  const result = await valuePortfolio(portfolio(
    { id: "fund-a", type: "fund", code: "000055", quantity: 100 },
    { id: "fund-b", type: "fund", code: "000055", quantity: 200 }
  ), "USD", { fetch: async () => { calls += 1; return json(fundQuote()); } });
  assert.equal(calls, 1);
  assert.equal(result.totalUsd, 371.25);
});

test("converts a RMB fund NAV with the shared CNY exchange rate", async () => {
  const urls: string[] = [];
  const result = await valuePortfolio(portfolio(
    { id: "fund", type: "fund", code: "270042", currency: "CNY", quantity: 10 },
    { id: "cash", type: "cash", currency: "CNY", quantity: 20 }
  ), "CNY", { fetch: async (url) => {
    urls.push(String(url));
    return json(String(url).includes("gffunds") ? fundQuote({ FUNDCODE: "270042", MONEYTYPE: "RMB", NAVUNIT: "8" }) : { rates: { USD: 0.14 } });
  } });
  assert.equal(urls.length, 2, "Fund, cash and display should share the same FX snapshot.");
  assert.equal(result.assets[0].pricingCurrency, "CNY");
  assert.ok(Math.abs(result.totalUsd - 14) < 1e-12);
  assert.ok(Math.abs(result.totalValue - 100) < 1e-12);
});

test("rejects invalid published NAVs, dates and mismatched provider fund codes", async () => {
  for (const changes of [{ NAVUNIT: "0" }, { NAVUNIT: "-1" }, { NAVUNIT: "invalid" }, { NAVDATE: "20260230" }, { NAVDATE: "unknown" }, { NAVDATE: undefined }, { FUNDCODE: "270042" }, { MONEYTYPE: "" }]) {
    const result = await valuePortfolio(portfolio({ id: "fund", type: "fund", code: "000055", quantity: 1 }), "USD", {
      fetch: async () => json(fundQuote(changes))
    });
    assert.equal(result.assets[0].status, "failed", JSON.stringify(changes));
    assert.equal(result.assets[0].usdValue, null);
    assert.equal(result.assets[0].fundCode, "000055");
  }
});

test("does not silently price a USD fund as CNY or expose provider language in errors", async () => {
  const wrongCurrency = await valuePortfolio(portfolio({ id: "fund", type: "fund", code: "000055", currency: "CNY", quantity: 1 }), "USD", {
    fetch: async () => json(fundQuote())
  });
  assert.equal(wrongCurrency.assets[0].status, "failed");
  assert.match(wrongCurrency.assets[0].message, /priced in USD/);
  const providerError = await valuePortfolio(portfolio({ id: "fund", type: "fund", code: "000055", quantity: 1 }), "USD", {
    fetch: async () => json({ errorno: "500", errormsg: "基金资料暂不可用" })
  });
  assert.equal(providerError.assets[0].status, "failed");
  assert.match(providerError.assets[0].message, /GF Fund Management returned no published NAV/);
  assert.doesNotMatch(providerError.assets[0].message, /[\u4e00-\u9fff]/);
});

test("validates units, whitespace, bounded strings, quantities and asset count before fetching", () => {
  const cash = { id: "cash", type: "cash", currency: "USD", quantity: 1 };
  for (const change of [{ id: " " }, { id: "x".repeat(81) }, { name: "bad\nname" }, { quantity: 1e13 }, { quantity: Infinity }, { currency: " " }]) {
    assert.throws(() => validatePortfolioConfig({ assets: [{ ...cash, ...change }] }));
  }
  assert.throws(() => validatePortfolioConfig({ assets: [{ id: "gold", type: "gold", quantity: 1, unit: "ton" }] }), /Unsupported gold unit/);
  assert.throws(() => validatePortfolioConfig({ assets: Array.from({ length: 101 }, (_, index) => ({ ...cash, id: String(index) })) }), /at most 100/);
  assert.throws(() => validatePortfolioConfig({ baseCurrency: 42, assets: [] }), /string/);
  assert.equal(validatePortfolioConfig({ assets: [{ ...cash, currency: " eur " }] }).assets[0].type, "cash");
});

test("shares a single gold quote across holdings and gold display conversion", async () => {
  let calls = 0;
  const result = await valuePortfolio(portfolio(
    { id: "g1", type: "gold", quantity: 1, unit: "gram" },
    { id: "g2", type: "gold", quantity: 2, unit: "gram" }
  ), "GOLD", { fetch: async () => { calls += 1; return json({ price: 2500, updatedAt: new Date().toISOString() }); } });
  assert.equal(calls, 1);
  assert.ok(Math.abs(result.totalValue - 3) < 1e-12);
  assert.equal(result.displayUnit, "g gold");
  assert.equal(result.assets[0].price, result.assets[1].price);
});

test("deduplicates stocks and keeps a valid Nasdaq price when its timestamp is unparseable", async () => {
  let calls = 0;
  const result = await valuePortfolio(portfolio(
    { id: "s1", type: "stock", symbol: "aapl", quantity: 1 },
    { id: "s2", type: "stock", symbol: "AAPL", quantity: 2 }
  ), "USD", { fetch: async () => { calls += 1; return json(stockQuote("not a date")); } });
  assert.equal(calls, 1);
  assert.equal(result.totalUsd, 370.5);
  assert.equal(result.assets[0].updatedAt, null);
  assert.equal(result.assets[0].status, "warning");
  assert.match(result.assets[0].warning!, /timestamp/);
});

test("shares FX quotes and uses the same reverse rate for display", async () => {
  let calls = 0;
  const result = await valuePortfolio(portfolio(
    { id: "e1", type: "cash", quantity: 10, currency: "EUR" },
    { id: "e2", type: "cash", quantity: 20, currency: "EUR" }
  ), "EUR", { fetch: async () => { calls += 1; return json({ rates: { USD: 1.25 } }); } });
  assert.equal(calls, 1);
  assert.equal(result.totalUsd, 37.5);
  assert.equal(result.totalValue, 30);
});

test("retains USD values if display conversion fails", async () => {
  const result = await valuePortfolio(portfolio({ id: "usd", type: "cash", quantity: 100, currency: "USD" }), "CNY", {
    fetch: async () => new Response("unavailable", { status: 503 })
  });
  assert.equal(result.totalUsd, 100);
  assert.equal(result.totalValue, 100);
  assert.equal(result.baseCurrency, "USD");
  assert.equal(result.displayRateFromUsd, 1);
  assert.match(result.displayWarning!, /shown in USD/);
});

test("times out a preferred provider and reaches its fallback", async () => {
  process.env.TWELVE_DATA_API_KEY = "test-key";
  let aborted = false;
  const urls: string[] = [];
  const result = await valuePortfolio(portfolio({ id: "g", type: "gold", quantity: 1, unit: "ounce" }), "USD", {
    requestTimeoutMs: 20, budgetMs: 500,
    fetch: async (url, init) => {
      urls.push(String(url));
      if (String(url).includes("twelvedata")) return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
      });
      return json({ price: 2500, updatedAt: new Date().toISOString() });
    }
  });
  assert.equal(aborted, true);
  assert.equal(urls.length, 2);
  assert.equal(result.totalUsd, 2500);
});

test("timeouts include a provider's stalled response body", async () => {
  const context = createPricingContext({ requestTimeoutMs: 20, budgetMs: 100, fetch: async () => ({
    ok: true, json: () => new Promise(() => {})
  }) as unknown as Response });
  await assert.rejects(context.json("https://example.test"), /timed out/);
});

test("client cancellation aborts active providers and skips fallback network calls", async () => {
  process.env.TWELVE_DATA_API_KEY = "test-key";
  const controller = new AbortController();
  let calls = 0;
  const pending = valuePortfolio(portfolio({ id: "g", type: "gold", quantity: 1, unit: "ounce" }), "USD", {
    signal: controller.signal,
    fetch: async (_, init) => new Promise<Response>((_, reject) => {
      calls += 1;
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      setTimeout(() => controller.abort(), 5);
    })
  });
  const result = await pending;
  assert.equal(calls, 1);
  assert.equal(result.failedAssetCount, 1);
});

test("bounds provider concurrency and the entire queued batch", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const start = Date.now();
  const assets: AssetConfig[] = Array.from({ length: 10 }, (_, index) => ({ id: `s${index}`, type: "stock", symbol: `S${index}`, quantity: 1 }));
  const result = await valuePortfolio(portfolio(...assets), "USD", {
    concurrency: 2, requestTimeoutMs: 500, budgetMs: 50,
    fetch: async (_, init) => new Promise<Response>((_, reject) => {
      calls += 1;
      peak = Math.max(peak, ++active);
      init?.signal?.addEventListener("abort", () => { active -= 1; reject(new Error("aborted")); }, { once: true });
    })
  });
  assert.equal(peak, 2);
  assert.ok(calls <= 2);
  assert.equal(result.failedAssetCount, 10);
  assert.ok(Date.now() - start < 500, "The whole batch should finish near its 50 ms budget.");
});

test("rejects zero, negative, non-finite and unreasonably large market quotes", async () => {
  for (const value of [0, -1, Infinity, NaN, "", null, 1e13]) assert.throws(() => positiveQuote(value, "test"));
  const result = await valuePortfolio(portfolio({ id: "eur", type: "cash", quantity: 1, currency: "EUR" }), "USD", {
    fetch: async () => json({ rates: { USD: 0 } })
  });
  assert.equal(result.assets[0].status, "failed");
  assert.equal(result.assets[0].usdValue, null);
});

test("rejects a bad GoldAPI price and uses a valid fallback", async () => {
  process.env.GOLDAPI_KEY = "test-key";
  const result = await valuePortfolio(portfolio({ id: "g", type: "gold", quantity: 1, unit: "ounce" }), "USD", {
    fetch: async (url) => json({ price: String(url).includes("goldapi.io") ? -50 : 2500, updatedAt: new Date().toISOString() })
  });
  assert.equal(result.totalUsd, 2500);
  assert.match(result.assets[0].source, /Gold-API.com/);
});

test("unsafe calculated amounts fail the asset instead of serializing a successful null value", async () => {
  const result = await valuePortfolio(portfolio(
    { id: "huge", type: "custom", quantity: 1e12, price: 1e12, currency: "USD" },
    { id: "zero", type: "cash", quantity: 0, currency: "USD" },
    { id: "cash", type: "cash", quantity: 100, currency: "USD" }
  ), "USD", { fetch: async () => { throw new Error("Cash must not fetch."); } });
  assert.equal(result.totalUsd, 100);
  assert.equal(result.failedAssetCount, 1);
  assert.equal(result.assets[0].status, "failed");
  assert.equal(result.assets[1].usdValue, 0);
  assert.equal(result.assets[1].status, "ok");
  assert.equal(JSON.parse(JSON.stringify(result)).totalUsd, 100);
});

test("checks the total amount as well as each individual amount", async () => {
  await assert.rejects(valuePortfolio(portfolio(
    { id: "a", type: "custom", quantity: 1e8, price: 5e7, currency: "USD" },
    { id: "b", type: "custom", quantity: 1e8, price: 5e7, currency: "USD" }
  )), /safe numeric range/);
});

test("marks old quotes and never substitutes retrieval time for a missing quote time", async () => {
  assert.equal(quoteTimestamp(undefined), null);
  assert.equal(quoteTimestamp("not a date"), null);
  assert.equal(quoteTimestamp("2026-10-02T09:30:00"), null);
  assert.equal(quoteTimestamp("Oct 2, 2026"), "2026-10-02T00:00:00.000Z");
  const result = await valuePortfolio(portfolio({ id: "s", type: "stock", symbol: "AAPL", quantity: 1 }), "USD", {
    fetch: async () => json(stockQuote("2000-01-01"))
  });
  assert.equal(result.assets[0].status, "warning");
  assert.match(result.assets[0].warning!, /7 days/);
  assert.equal(result.totalUsd, 123.5);
});

test("API returns 400 for malformed JSON and invalid display currency", async () => {
  const malformed = await POST(new Request("http://local/api/valuation", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const invalid = await POST(new Request("http://local/api/valuation", { method: "POST", body: JSON.stringify({ assets: [], displayBase: "nonsense" }) }));
  assert.equal(invalid.status, 400);
});

test("API enforces the byte limit without relying on Content-Length", async () => {
  const response = await POST(new Request("http://local/api/valuation", { method: "POST", body: " ".repeat(256 * 1024 + 1) }));
  assert.equal(response.status, 413);
});

test("API distinguishes complete upstream failure from partial valuation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  const assets: AssetConfig[] = [{ id: "s", type: "stock", symbol: "AAPL", quantity: 1 }];
  const post = (input: AssetConfig[]) => POST(new Request("http://local/api/valuation", { method: "POST", body: JSON.stringify(portfolio(...input)) }));
  const failed = await post(assets);
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).failedAssetCount, 1);
  const partial = await post([...assets, { id: "cash", type: "cash", currency: "USD", quantity: 100 }]);
  assert.equal(partial.status, 200);
  assert.equal((await partial.json()).totalUsd, 100);
});

test("API hides internal exception details and uses 500", async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error("private server detail")); } });
  const request = new Request("http://local/api/valuation", { method: "POST", body, duplex: "half" } as RequestInit);
  const response = await POST(request);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private server detail/);
});
