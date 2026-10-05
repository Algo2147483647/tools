# Asset Dashboard

A personal asset dashboard built with Next.js, React, TypeScript, and Tailwind CSS. Import a JSON portfolio to value gold, U.S. stocks, cash, and custom assets in USD. View the total in another currency or grams of gold, explore the asset allocation, and inspect each valuation's status, source, and timestamp.

## Run locally

Requires **Node.js 22.13 or later**. Node.js 24 LTS is recommended. This project uses **npm** and maintains `package-lock.json` as its dependency lockfile.

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

## Market data and optional API keys

Copy the environment template and add keys for the providers you want to use:

```powershell
Copy-Item .env.example .env.local
```

| Environment variable | Purpose |
| --- | --- |
| `TWELVE_DATA_API_KEY` | Preferred provider for foreign exchange and XAU/USD gold quotes |
| `GOLDAPI_KEY` | GoldAPI.io gold quotes |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage U.S. stock quotes |
| `EXCHANGERATE_HOST_API_KEY` | ExchangeRate.host foreign exchange fallback |

Without API keys, the server uses available public sources, including Frankfurter exchange rates, public gold quotes, and Nasdaq stock quotes. Quote frequency, dates, and availability depend on the provider. The dashboard shows the source and timestamp; reference exchange rates are not executable live trading prices. API keys are read only on the server. Restart the server after changing `.env.local`.

External requests have time limits. Each valuation reuses quotes for the same gold price, stock symbol, and currency pair. Failed assets display `—`, and the total includes only assets that could be valued. If conversion to the selected display currency fails, the dashboard preserves the USD valuation and shows a warning. A failed refresh retains the previous result and labels it clearly. Quotes older than seven days or without a usable timestamp receive a warning.

## Portfolio configuration

Paste or import JSON in the dashboard's configuration dialog. See `sample-config.json` for another example.

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
- Supported types are `gold`, `cash`, `stock`, and `custom`. Legacy types `fx` and `stock_us` are normalized to `cash` and `stock` respectively.
- Gold supports `gram`, `kilogram`, `ounce` (troy ounce), `pound`, and common abbreviations.
- Use three-letter currency codes, such as `USD`, `CNY`, or `EUR`.
- Custom assets use the supplied unit price. Their market price is not fetched automatically.

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
