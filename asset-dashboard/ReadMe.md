# Asset Dashboard

A personal asset dashboard built with Next.js, React, TypeScript, and Tailwind CSS. Open an encrypted portfolio to value gold, U.S. stocks, supported mutual funds, cash, and custom assets in USD. View the total in another currency or grams of gold, explore the asset allocation, and inspect each valuation's status, source, and timestamp. The interface, validation messages, and documentation are in English.

The interface follows Warehouse Studio's white paper layout, serif typography, compact toolbar, and ruled tables. Import, configuration, encrypted-file/PDF export, password change, lock, and refresh are borderless icon buttons in the top toolbar, with tooltips and accessible names. Static section titles, instructional text, the help dialog, and decorative footer copy have been removed. Field labels, table headers, filters, asset identifiers, quote states, and actionable error messages remain visible. The Overview dropdown above the holdings table contains valuation counts, pricing currencies, and attention status. Category filters, search, and sorting sit alongside it. Narrow screens stack the summary sections and keep horizontal scrolling inside the table.

**Export PDF** downloads an A4 landscape report of the currently filtered and sorted assets, using the displayed valuation snapshot without fetching new prices. It includes the portfolio total, shown-assets subtotal, status, quote sources and timestamps, and any retained-value or conversion warnings. Export is available once a valuation has completed, including partial or failed valuations. Unavailable values remain dashes. Reports paginate automatically and embed the bundled Noto Serif fonts; Chinese text uses Windows' installed SimSun font. PDF generation happens on the local server and does not store reports there.

## Run locally

Requires **Node.js 22.13 or later**. Node.js 24 LTS is recommended. This project uses **npm** and maintains `package-lock.json` as its dependency lockfile.

The launcher uses the first Node.js on `PATH` that meets the minimum version, skipping older installations such as Anaconda's bundled Node.js. If none qualifies, it checks the standard system and per-user Node.js installation locations, then the current user's Codex runtime cache. It runs npm and the server with that selected runtime; the PATH adjustment applies only while the launcher is running.

```powershell
cd D:\Algo\Notes\tools\asset-dashboard
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

On macOS, double-click `launch.command` in Finder, or run it from any working directory:

```bash
/path/to/asset-dashboard/launch.command
/path/to/asset-dashboard/launch.command --preview --no-browser --port 3001
```

The macOS launcher supports `--dev`, `--preview`, `--build-only`, `--install-only`, `--no-browser`, `--port NUMBER`, and `--help`. It supports macOS's bundled Bash 3.2, paths with spaces, and both Apple Silicon and Intel Homebrew locations. It selects Node.js 22.13+ and runs npm with the same Node executable. Dependency installation is cached using package/lockfile/npm configuration hashes and the Node version, platform, and architecture. An occupied port fails explicitly. The browser opens only after the server responds, and its readiness helper exits with the launcher. Keep the Terminal window open while using the dashboard.

The script is tracked as executable. If a download loses its executable permission, run `chmod +x launch.command` once, or use `bash launch.command`. The macOS launcher has shell syntax and mocked bootstrap checks; a native macOS launch still needs validation on a Mac.

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

## Encrypted file storage

The platform reads and writes versioned `*.vault.json` files. It never offers a plaintext portfolio download. JSON remains the in-memory editing format. The old public plaintext example has been removed and migrated to an encrypted file; its random initial password is supplied separately, never hardcoded or auto-filled. This protects the current file, but does not erase plaintext already present in Git history, older deployments, browser caches, or backups.

- On startup, the page is locked. It reads the last encrypted browser copy, or the encrypted example on first use. No valuation request is made before successful decryption.
- **Open file** accepts an encrypted portfolio and asks for its password. Legacy plaintext JSON is accepted only for one-way migration: set and confirm a new password before it can be opened or persisted. The app does not overwrite or delete the original imported file.
- **New portfolio** creates an empty portfolio protected by a new password. Passwords must contain at least 12 characters; use a long, unique passphrase. There is no password reset or recovery backdoor.
- **Save encrypted changes** encrypts and saves the active portfolio in this browser's local storage. Storage failures leave the previous saved copy and active portfolio unchanged and keep the editor open for retry. Browser storage contains only one active encrypted portfolio; opening another replaces that active copy.
- The download icon writes the current ciphertext as a portable `*.vault.json` file through the browser's download/save dialog. This is a separate backup, not an automatic overwrite of an imported disk file. Keep a downloaded backup before clearing browser data or switching portfolios.
- The key icon changes the file password by generating a fresh salt and key and encrypting the active portfolio again. Download a new backup afterwards. Older encrypted backups still need their old passwords; password changes do not revoke copies held elsewhere.
- **Lock portfolio**, reload, or leaving the page releases the active key and unmounts the editor and valuation state. Unlocking is required again. Password inputs are cleared after successful use or cancellation; passwords and keys are never put in local/session storage, URLs, files, logs, or server requests. The non-exportable key lives in browser memory for the unlocked session.

### Cryptographic format, version 1

Uses the native Web Crypto API without a third-party cryptography dependency:

| Field | Contract |
| --- | --- |
| `format`, `version` | `asset-dashboard-vault`, `1` |
| `kdf` | PBKDF2-HMAC-SHA-256, exactly 600,000 iterations, random 16-byte salt |
| `cipher` | AES-256-GCM, fresh random 12-byte IV for every encryption, 128-bit authentication tag |
| `ciphertext` | Base64 encoding of encrypted UTF-8 JSON followed by the GCM tag |

A new vault or password change gets a fresh cryptographically random salt. Saves reuse the in-memory derived key and salt with a new random IV. The canonical JSON header (format, version, KDF name/hash/iterations/salt, cipher name/IV/tag length in that order) is authenticated as AES-GCM additional data. Unknown versions, extra fields, other algorithms, malformed Base64, wrong lengths and altered work factors are rejected before key derivation. Valid but modified ciphertext or header data fails authentication with the same error as a wrong password. Authentication succeeds before UTF-8 decoding, JSON parsing, or portfolio schema validation. Configurations are limited to 256 KiB and envelopes to 360 KiB.

AES-GCM provides both confidentiality and integrity, unlike unauthenticated encryption. PBKDF2 raises the cost of offline password guessing; the 600,000-iteration SHA-256 setting follows [OWASP's PBKDF2 guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Argon2id is a strong memory-hard alternative, but is not built into Web Crypto; this local browser app uses PBKDF2 to avoid shipping another cryptography/WASM implementation. See [MDN key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and [AES-GCM IV/authentication guidance](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams).

This is encryption at rest, not server login or protection against a compromised browser/OS, malicious page scripts, or an already unlocked session. JavaScript cannot guarantee erasure of immutable strings or garbage-collected memory. The browser must run on localhost or HTTPS for Web Crypto. The existing local valuation API receives the decrypted portfolio in memory and returns `no-store` responses, including errors; it does not persist portfolios. Use loopback-only launchers locally, or HTTPS and separate access control for any remote deployment.

**PDF export is an explicit readable report, not the portfolio storage format.** It contains asset values in plaintext and is generated in memory by the local server; protect it separately. No PDF is exported automatically.

## Portfolio configuration

The startup example is `public/example.vault.json`. Its paper gold quantity is **5 grams**. Unlock it using the separately supplied initial password; the password is not in the repository or app bundle. Use the key icon to set your own password, then download an encrypted backup. It also includes fund `000055`, QQQM x 4, SPYM x 3, SpaceX (SPCX) x 1, and NVDA x 1. Quantities are shares, not leverage multipliers. The current schema represents exchange-traded holdings as `stock`; its `fund` type is reserved for supported six-digit mutual fund codes. SpaceX uses SPCX, as confirmed by its official investor relations site; SPEX is not an alias for SpaceX.

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

Regression tests cover an independent public fixture of the listed share counts and routing, wrong-listing rejection, both DST offsets and ambiguous times, daily/secondary fallback, freshness warnings, and visible-page refresh including failure backoff and no overlapping requests.

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
