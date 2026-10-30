# Asset Dashboard

A personal asset dashboard built with Next.js, React, TypeScript, and Tailwind CSS. Import a JSON portfolio to value gold, U.S. stocks, supported mutual funds, cash, and custom assets in USD. View the total in another currency or grams of gold, explore the asset allocation, and inspect each valuation's status, source, and timestamp. The interface, validation messages, and documentation are in English.

The interface follows Warehouse Studio's white paper layout, serif typography, compact toolbar, and ruled tables. Import, configuration, JSON/PDF export, and refresh are in the top toolbar. The Overview dropdown above the holdings table contains valuation counts, pricing currencies, and attention status. Category filters, search, and sorting sit alongside it. Narrow screens stack the summary sections and keep horizontal scrolling inside the table.

**Export PDF** downloads an A4 landscape report of the currently filtered and sorted assets, using the displayed valuation snapshot without fetching new prices. It includes the portfolio total, shown-assets subtotal, status, quote sources and timestamps, and any retained-value or conversion warnings. Export is available once a valuation has completed, including partial or failed valuations. Unavailable values remain dashes. Reports paginate automatically and embed the bundled Noto Serif fonts; Chinese text uses Windows' installed SimSun font. PDF generation happens on the local server and does not store reports there.

## Run locally

Requires **Node.js 22.13 or later**. Node.js 24 LTS is recommended. This project uses **npm** and maintains `package-lock.json` as its dependency lockfile.

The launcher uses the first Node.js on `PATH` that meets the minimum version, skipping older installations such as Anaconda's bundled Node.js. If none qualifies, it checks the standard system and per-user Node.js installation locations, then the current user's Codex runtime cache. It runs npm and the server with that selected runtime; the PATH adjustment applies only while the launcher is running.

```powershell
cd D:\xiongzihao\tools\asset-dashboard
.\launch.ps1
```

You can also double-click `launch.cmd`. The launcher checks Node.js, npm, and installed dependencies. It runs `npm ci` only when dependencies are missing, their versions do not match, or the lockfile has changed. Otherwise, it skips installation. The development server runs at `http://127.0.0.1:3000` by default and opens the browser when ready. Press `Ctrl+C` to stop it.

| Option | Behavior |
| --- | --- |
| No option or `-Dev` | Start the development server with hot reload |
| `-Preview` | Create a production build, then start a production preview |
| `-BuildOnly` | Install dependencies if needed and build, without starting a server |
| `-InstallOnly` | Check and install dependencies if needed, then exit |
| `-NoBrowser` | Skip opening the browser |
| `-Port 3001` | Use a different local port; the default is 3000 |

Choose only one of the four run modes. Combine it with `-NoBrowser` or `-Port` as needed:

```powershell
.\launch.ps1 -Preview -NoBrowser -Port 3001
```

To run directly with npm:

```powershell
npm ci
npm run dev -- --hostname 127.0.0.1
```

For production mode, run `npm run build`, then `npm start -- --hostname 127.0.0.1`. Starting through npm does not automatically open the browser.

Development uses `.next-dev`, while production builds use `.next`, so hot reloads do not overwrite a running production preview. Use different ports when running both modes.

## Market data and optional API keys

Copy the environment template and add keys for the providers you want to use:

```powershell
Copy-Item .env.example .env.local
```

| Environment variable | Purpose |
| --- | --- |
| `TWELVE_DATA_API_KEY` | Preferred provider for foreign exchange and XAU/USD gold quotes |
| `GOLDAPI_KEY` | GoldAPI.io gold quotes |
| `ALPHA_VANTAGE_API_KEY` | Daily reference fallback for U.S. stocks and ETFs when Nasdaq is unavailable or unverified |
| `EXCHANGERATE_HOST_API_KEY` | ExchangeRate.host foreign exchange fallback |

Without API keys, the server uses available public sources, including Frankfurter exchange rates, public gold quotes, and Nasdaq stock quotes. The page automatically refreshes every 60 seconds while visible, pauses in the background, and refreshes on return. Partial or failed requests back off to 120, 240, then 300 seconds; a successful refresh resets the interval. Manual refresh retries immediately. Quote frequency, dates, and availability depend on the provider. The dashboard shows the source and timestamp; reference exchange rates are not executable live trading prices. API keys are read only on the server. Restart the server after changing `.env.local`.

External requests have time limits. Each valuation reuses quotes for the same gold price, stock symbol, and currency pair. Failed assets display `—`, and the total includes only assets that could be valued. If conversion to the selected display currency fails, the dashboard preserves the USD valuation and shows a warning. A failed refresh retains the previous result and labels it clearly. Quotes older than seven days or without a usable timestamp receive a warning.

## Portfolio configuration

Paste or import JSON in the dashboard's configuration dialog. The startup example and import template are the same file, `public/sample-config.json`. It includes 2,172.16 units of fund `000055`, QQQM x 4, SPYM x 3, SpaceX (SPCX) x 1, and NVDA x 1. Quantities are shares, not leverage multipliers. The current schema represents exchange-traded holdings as `stock`; its `fund` type is reserved for supported six-digit mutual fund codes. SpaceX uses SPCX, as confirmed by its official investor relations site; SPEX is not an alias for SpaceX.

```json
{
  "baseCurrency": "USD",
  "assets": [
    {
      "id": "gold_001",
      "type": "gold",
      "name": "Physical Gold",
      "quantity": 120,
      "unit": "gram"
    },
    {
      "id": "cash_eur_001",
      "type": "cash",
      "name": "EUR Savings",
      "currency": "EUR",
      "quantity": 5000
    },
    {
      "id": "stock_aapl_001",
      "type": "stock",
      "name": "Apple",
      "symbol": "AAPL",
      "quantity": 20
    },
    {
      "id": "custom_001",
      "type": "custom",
      "name": "Custom Asset",
      "quantity": 1,
      "price": 15000,
      "currency": "USD"
    }
  ]
}
```

- `baseCurrency` is always `USD`. Select the display currency separately in the dashboard.
- Every `id` must be unique. `quantity` and custom `price` must be finite, nonnegative numbers no greater than 1 trillion.
- A portfolio can contain up to 100 assets.
- Supported types are `gold`, `cash`, `stock`, `fund`, and `custom`. Legacy types `fx` and `stock_us` are normalized to `cash` and `stock` respectively.
- Gold supports `gram`, `kilogram`, `ounce` (troy ounce), `pound`, and common abbreviations.
- Use three-letter currency codes, such as `USD`, `CNY`, or `EUR`.
- Custom assets use the supplied unit price. Their market price is not fetched automatically.

### Mutual funds and QDII

The `fund` type uses the latest **published unit NAV** from GF Fund Management's public data service. It supports fund codes published by that manager, not every fund provider. NAV dates can lag the current date, especially for QDII funds and holidays; these are not intraday stock quotes. Details show the published NAV to four decimal places, its currency, date, and source.

```json
{
  "id": "fund_qdii_000055",
  "type": "fund",
  "name": "GF Nasdaq-100 ETF Feeder (QDII) - USD A",
  "code": "000055",
  "currency": "USD",
  "quantity": 2172.16
}
```

Fund `000055` is the **USD Class A** share class, as identified by the [fund manager](https://gfwx.gffunds.com.cn/funds/?fundcode=000055). The English name above is a descriptive translation. Its units are valued using USD NAV without an extra CNY conversion. The optional `currency` field must match the provider's share-class currency. Unsupported codes or unavailable NAVs are reported as unavailable, never replaced with invented prices.

## Listed holdings and quote quality

The listed-holding adapter supports **USD U.S. equities and ETFs**. The example uses:

| Holding | Symbol | Shares | Security type | Exchange MIC |
| --- | --- | --- | --- | --- |
| Invesco NASDAQ 100 ETF | QQQM | 4 | etf | XNAS |
| State Street SPDR Portfolio S&P 500 ETF | SPYM | 3 | etf | ARCX |
| SpaceX | SPCX | 1 | equity | XNAS |
| NVIDIA | NVDA | 1 | equity | XNAS |

[SpaceX's official FAQ](https://ir.spacex.com/faqs-and-contact/) confirms its ticker is SPCX. The originally supplied SPEX has been corrected in the example. The application does not silently rewrite arbitrary tickers.

Listed assets use `type: "stock"`, a `symbol`, and a share `quantity`. Optional `securityType` is `equity` or `etf`; optional `exchange` is a four-character MIC, and optional `currency` asserts USD. Set these fields explicitly for known holdings. If securityType is omitted, the adapter tries the equity endpoint and then the ETF endpoint. Unsupported exchange/currency combinations fail explicitly; non-U.S. holdings and GBX/GBP normalization are outside this adapter's scope.

Nasdaq is the first provider. ETF holdings use `assetclass=etf`, while equities use `assetclass=stocks`. The adapter validates the returned symbol, instrument type, U.S. exchange, expected MIC, and USD price. Values equal shares multiplied by the USD quote. A secondary closing price can be used when the primary trade is unavailable or unverified. Duplicate listings share a request within each portfolio valuation, keyed by symbol, instrument type, exchange, and currency. Nasdaq requests specify a 60-second revalidation policy; actual caching also depends on the Next.js route runtime.

If Nasdaq is unavailable or returns a stale/unverified quote, an optional Alpha Vantage key enables the daily Global Quote fallback. Its symbol must match, its date stays date-only, and its price is labeled a closing reference. A usable Nasdaq intraday quote is never replaced merely because an API key exists. The [Alpha Vantage documentation](https://www.alphavantage.co/documentation/#latestprice) distinguishes standard data from entitled realtime/delayed feeds; this integration makes no realtime entitlement claim for the daily fallback.

The API preserves quote time separately from retrieval time, plus timestamp precision, market state, price session, and quote quality:

| Quality | Meaning |
| --- | --- |
| realtime | Provider reports realtime data with a usable recent timestamp and known active session |
| delayed | Provider reports delayed data; the exact delay may be unknown |
| close | Closing or daily reference price, including a fallback during an active session |
| stale | Older than seven days, or an active-session trade beyond its freshness tolerance |
| unknown | Missing/invalid/future timestamp, unknown delay, or unknown session |

Nasdaq ET timestamps resolve through `America/New_York`, including daylight saving and the `Closed at` prefix. Nonexistent or ambiguous DST times stay unknown. During an active session, freshness tolerance is five minutes for realtime data and twenty minutes for delayed data with unknown delay (a fifteen-minute allowance plus five minutes). This is a conservative last-trade-age check, not a guarantee of feed health. The provider's market state handles closed sessions; a recent weekend closing reference is not called realtime. Dates more than seven days old always warn.

The table, details, and PDF snapshot show quote quality. The details include the market/price session and retrieval time. Portfolio status says Snapshot loaded, Review quotes, or Partial valuation instead of claiming every asset is up to date. Failed assets remain null and are excluded from the available-value subtotal; closing/delayed/stale prices remain visible with warnings. A failed transport refresh preserves the previous snapshot with a visible error. No per-asset old-price substitution hides a new failure. Automatic refresh is periodic valuation, not a streaming trading feed.

### Verification on October 30, 2026

A real, unkeyed call through the revised valuation engine at 09:17 UTC priced all 11 example assets with zero failures. The four listed holdings returned usable USD prices, parsed timestamps, and provider-reported realtime pre-market quotes. This verifies coverage at that time, not future provider availability. No snapshot prices are stored in the example.

Regression tests cover the actual example's share counts and routing, wrong-listing rejection, both DST offsets and ambiguous times, daily/secondary fallback, freshness warnings, and visible-page refresh including failure backoff and no overlapping requests.

## Valuation API

Send a JSON portfolio to `POST /api/valuation`. An optional top-level `displayBase` field selects a three-letter currency code or `GOLD`; it defaults to `USD`. Request bodies are limited to 256 KiB.

Successful responses include `totalUsd`, the converted `totalValue`, `displayUnit`, `displayRateFromUsd`, asset counts, a generation timestamp, and individual asset results. An asset can have an `ok`, `warning`, or `failed` status. Failed assets have `null` valuation fields and an explanatory message. A `displayWarning` indicates that display conversion failed and USD results were retained.

| HTTP status | Meaning |
| --- | --- |
| `200` | Valuation completed; individual assets may still have warnings or failures |
| `400` | Invalid JSON, configuration, or display currency format |
| `413` | Request body exceeds 256 KiB |
| `502` | No assets in a nonempty portfolio could be valued; the response includes asset failure details |
| `500` | An unexpected server error occurred |

Successful responses use `Cache-Control: no-store`.

## Development checks

```powershell
npm run check
npm run build
npm audit
npm audit --omit=dev
```

`check` runs ESLint, TypeScript, and the Node test suite in sequence without interactive setup. Tests use `node:test` and `tsx` with mocked market data to cover timeouts, provider fallback, quote reuse, input validation, and request races. No real API keys are required.

Run `npm run lint`, `npm run typecheck`, or `npm test` separately when needed. After changing dependencies, commit both `package.json` and `package-lock.json` and rerun the checks above.

The project pins Next.js 15.5.27 and React 19.3.0. The `overrides.postcss` setting replaces Next.js's older internal PostCSS dependency with 8.5.29. On October 5, 2026, the production dependency audit reported no vulnerabilities. The full audit still reported seven affected development dependency entries, all caused by the same `braces` issue in the Tailwind and ESLint toolchains. The [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched version. Recheck this issue when updating the toolchain; the full audit is not currently passing.

## Project layout

| Path | Responsibility |
| --- | --- |
| `components/` | Dashboard and interactive components |
| `lib/client/` | Client state and formatting helpers |
| `lib/valuation/` | Input validation, market data, and valuation logic |
| `app/api/valuation/route.ts` | Valuation API endpoint |
| `tests/` | Regression tests |
