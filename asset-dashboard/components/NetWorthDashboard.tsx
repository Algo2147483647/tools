"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Coins,
  FileJson,
  FileText,
  Globe2,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ChartNoAxesColumn,
  TriangleAlert,
  TrendingUp,
  Wallet,
  X,
  Boxes,
} from "lucide-react";
import { validatePortfolioConfig } from "@/lib/valuation/schema";
import type {
  AssetType,
  AssetValuation,
  PortfolioConfig,
} from "@/lib/valuation/types";
import { formatDate, formatMoney, formatNumber, quoteLabel } from "@/lib/client/format";
import { Dialog } from "./Dialog";
import { useValuation } from "./useValuation";
import type { PortfolioPdfReport } from "@/lib/report/types";

const baseOptions = ["USD", "CNY", "HKD", "EUR", "JPY", "CHF", "GBP", "GOLD"];
const categories = {
  cash: {
    label: "Cash & deposits",
    short: "Cash",
    icon: Landmark,
    color: "#4c78a8",
    light: "#edf3f9",
  },
  gold: {
    label: "Gold",
    short: "Gold",
    icon: Coins,
    color: "#e2b35a",
    light: "#fcf6e9",
  },
  stock: {
    label: "Stocks & ETFs",
    short: "Stocks",
    icon: TrendingUp,
    color: "#59a89c",
    light: "#edf7f4",
  },
  custom: {
    label: "Other",
    short: "Other",
    icon: Boxes,
    color: "#d18383",
    light: "#fbefef",
  },
  fund: {
    label: "Funds",
    short: "Funds",
    icon: Globe2,
    color: "#9982bc",
    light: "#f3eff9",
  },
};
const statuses = { ok: "Valued", warning: "Review", failed: "Unavailable" };
type LoadedConfig = {
  config: PortfolioConfig;
  text: string;
  name: string;
};

function categoryStyle(type: AssetType): CSSProperties {
  return {
    "--category-color": categories[type].color,
    "--category-light": categories[type].light,
  } as CSSProperties;
}
function quantityUnit(asset: AssetValuation) {
  if (asset.type === "stock") return asset.quantity === 1 ? "share" : "shares";
  if (asset.type === "custom" || asset.type === "fund")
    return asset.quantity === 1 ? "unit" : "units";
  const unit = asset.unit ?? "";
  return (
    (
      {
        gram: "g",
        kilogram: "kg",
        ounce: "oz t",
        troy_ounce: "oz t",
        pound: "lb",
      } as Record<string, string>
    )[unit] ?? unit
  );
}

export function NetWorthDashboard() {
  const [loaded, setLoaded] = useState<LoadedConfig | null>(null);
  const [sampleLoading, setSampleLoading] = useState(true);
  const [inputError, setInputError] = useState<string | null>(null);
  const [modal, setModal] = useState<"config" | "help" | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [displayBase, setDisplayBase] = useState("USD");
  const [baseMode, setBaseMode] = useState("USD");
  const [customBase, setCustomBase] = useState("AUD");
  const [baseError, setBaseError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const fileRef = useRef<HTMLInputElement>(null);
  const overviewRef = useRef<HTMLDetailsElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const importSequence = useRef(0);
  const {
    data: valuation,
    error,
    loading,
    refresh,
  } = useValuation(loaded?.config ?? null, displayBase);

  useEffect(() => {
    function closeOverview(event: PointerEvent | KeyboardEvent) {
      const menu = overviewRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        menu.open = false;
        menu.querySelector("summary")?.focus();
      } else if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOverview);
    document.addEventListener("keydown", closeOverview);
    return () => {
      document.removeEventListener("pointerdown", closeOverview);
      document.removeEventListener("keydown", closeOverview);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = importSequence.current;
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    async function loadSample() {
      try {
        const response = await fetch("/sample-config.json", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Could not load the sample. Import a local JSON file to continue.",
          );
        const text = await response.text();
        const config = validatePortfolioConfig(JSON.parse(text));
        if (active && sequence === importSequence.current)
          setLoaded({
            config,
            text,
            name: "sample-config.json",
          });
      } catch (reason) {
        if (active && sequence === importSequence.current)
          setInputError(
            reason instanceof Error && reason.name !== "AbortError"
              ? reason.message
              : "The sample request timed out. Import a local JSON file to continue.",
          );
      } finally {
        window.clearTimeout(timeout);
        if (active) setSampleLoading(false);
      }
    }
    void loadSample();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  function commitConfig(text: string, name: string) {
    const config = validatePortfolioConfig(JSON.parse(text));
    importSequence.current++;
    setLoaded({
      config,
      text: JSON.stringify(config, null, 2),
      name,
    });
    setInputError(null);
    setSelectedId(null);
    setFilter("all");
    setSearch("");
    setModal(null);
    setSampleLoading(false);
  }
  async function loadFile(file?: File) {
    if (!file) return;
    const sequence = ++importSequence.current;
    try {
      if (file.size > 256 * 1024)
        throw new Error("The configuration file must be 256 KB or smaller.");
      const text = await file.text();
      if (sequence !== importSequence.current) return;
      commitConfig(text, file.name);
    } catch (reason) {
      if (sequence === importSequence.current) {
        const message =
          reason instanceof Error
            ? reason.message
            : "Could not read the configuration file.";
        setInputError(message);
        setDraftError(message);
      }
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function openConfig() {
    setDraft(loaded?.text ?? '{\n  "baseCurrency": "USD",\n  "assets": []\n}');
    setDraftError(null);
    setModal("config");
  }
  function applyDraft(event: FormEvent) {
    event.preventDefault();
    try {
      if (new TextEncoder().encode(draft).length > 256 * 1024)
        throw new Error("The configuration must be 256 KB or smaller.");
      commitConfig(draft, loaded?.name ?? "portfolio.json");
    } catch (reason) {
      setDraftError(
        reason instanceof Error
          ? reason.message
          : "The configuration format is invalid.",
      );
    }
  }
  function downloadConfig() {
    if (!loaded) return;
    const url = URL.createObjectURL(
      new Blob([loaded.text], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = loaded.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const assets = useMemo(() => valuation?.assets ?? [], [valuation]);
  const selectedAsset = assets.find((asset) => asset.id === selectedId);
  const displayUnit =
    valuation?.displayUnit ?? (displayBase === "GOLD" ? "g gold" : displayBase);
  const rate = valuation?.displayRateFromUsd ?? 1;
  const failedCount = valuation?.failedAssetCount ?? 0;
  const warningCount = assets.filter(
    (asset) => asset.status === "warning",
  ).length;
  const needsAttention = failedCount + warningCount;
  const total =
    valuation && (valuation.pricedAssetCount > 0 || assets.length === 0)
      ? valuation.totalValue
      : null;
  const unitLabel = displayUnit === "g gold" ? "Gold · g" : displayUnit;
  const pricedCount = valuation?.pricedAssetCount ?? 0;
  const assetCount = loaded?.config.assets.length ?? 0;
  const allocation = useMemo(
    () =>
      (Object.entries(categories) as [AssetType, typeof categories.cash][]).map(
        ([type, meta]) => ({
          type,
          ...meta,
          value: assets
            .filter((asset) => asset.type === type)
            .reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0),
          count: assets.filter((asset) => asset.type === type).length,
        }),
      ),
    [assets],
  );
  const donutStyle = useMemo(() => {
    let start = 0;
    const sum = valuation?.totalUsd ?? 0;
    if (sum <= 0) return { background: "#ededed" };
    const stops = allocation
      .filter((item) => item.value > 0)
      .map((item) => {
        const end = start + (item.value / sum) * 100;
        const stop = `${item.color} ${start}% ${end}%`;
        start = end;
        return stop;
      });
    return { background: `conic-gradient(from -90deg, ${stops.join(", ")})` };
  }, [allocation, valuation?.totalUsd]);
  const filteredAssets = useMemo(
    () =>
      assets
        .filter(
          (asset) =>
            (filter === "all" || asset.type === filter) &&
            `${asset.name} ${asset.id} ${asset.symbol ?? asset.fundCode ?? ""} ${asset.pricingCurrency ?? ""}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "en")
            : sort === "status"
              ? { failed: 0, warning: 1, ok: 2 }[a.status] -
                  { failed: 0, warning: 1, ok: 2 }[b.status] ||
                (b.usdValue ?? -1) - (a.usdValue ?? -1)
              : (b.usdValue ?? -1) - (a.usdValue ?? -1),
        ),
    [assets, filter, search, sort],
  );
  const currencyCount = new Set(
    loaded?.config.assets
      .map((asset) =>
        "currency" in asset
          ? asset.currency
          : asset.type === "fund"
            ? undefined
            : "USD",
      )
      .filter(Boolean),
  ).size;

  async function downloadPdf() {
    if (!valuation || exportingPdf || loading) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      const available = filteredAssets.filter((asset) => asset.usdValue !== null);
      const shownTotal = available.length || !filteredAssets.length
        ? available.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0) * rate
        : null;
      const report: PortfolioPdfReport = {
        name: loaded?.name ?? "Portfolio",
        generatedAt: valuation.generatedAt,
        displayUnit: unitLabel,
        total: formatMoney(total, displayUnit),
        shownTotal: formatMoney(shownTotal, displayUnit),
        scope: `Showing ${filteredAssets.length} of ${assets.length} assets | Category: ${filter === "all" ? "All assets" : categories[filter].label} | Sort: ${sort === "name" ? "By name" : sort === "status" ? "Issues first" : "By value"}${search ? ` | Search: ${search.slice(0, 1000)}` : ""}`,
        valued: `${pricedCount} / ${assetCount}`,
        currencies: String(currencyCount),
        attention: String(needsAttention),
        notice: [error ? `Refresh failed; previously loaded values are shown. ${error}` : "", valuation.displayWarning ?? "", failedCount ? `${failedCount} unavailable assets are excluded from the portfolio total.` : ""].filter(Boolean).join("\n"),
        rows: filteredAssets.map((asset) => ({
          name: asset.name,
          category: categories[asset.type].short,
          quantity: `${formatNumber(asset.quantity, 4)} ${quantityUnit(asset)}`,
          allocation: asset.usdValue !== null && valuation.totalUsd > 0 ? `${formatNumber(asset.usdValue / valuation.totalUsd * 100, 1)}%` : "—",
          value: formatMoney(asset.usdValue === null ? null : asset.usdValue * rate, displayUnit),
          status: asset.type === "stock" && asset.status !== "failed" ? quoteLabel(asset) : statuses[asset.status],
          source: asset.source,
          quoteDate: asset.navDate ?? (asset.timestampPrecision === "date" ? asset.updatedAt?.slice(0, 10) : asset.updatedAt) ?? "Not available",
          notes: [asset.message, asset.fetchedAt ? `Retrieved: ${asset.fetchedAt}` : "", asset.warning].filter(Boolean).join("\n"),
        })),
      };
      const response = await fetch("/api/export-pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report), signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not export the PDF.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(loaded?.name ?? "portfolio").replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 70) || "portfolio"}-${valuation.generatedAt.slice(0, 10)}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Could not export the PDF. Please try again.");
    } finally { setExportingPdf(false); }
  }

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to portfolio overview
      </a>
      <div className="main-shell">
        <header className="topbar">
          <div className="portfolio-controls">
            <span className="workspace-label">Portfolio</span>
            <button className="portfolio-file" type="button" onClick={openConfig} title="Open portfolio configuration">
              <FileJson size={16} />
              <span>{loaded?.name ?? "New portfolio"}</span>
            </button>
            <button className="icon-button" type="button" onClick={() => setModal("help")} aria-label="Guide" title="Portfolio guide">
              <CircleHelp size={17} />
            </button>
          </div>
          <div className="topbar-actions">
            <button className="button button-secondary" type="button" onClick={() => fileRef.current?.click()}>
              <Plus size={16} />Import assets
            </button>
            <button className="button button-secondary" type="button" onClick={openConfig}>
              <Settings2 size={16} />Configuration
            </button>
            <button className="button button-secondary" type="button" disabled={!loaded} onClick={downloadConfig}>
              <ArrowDownToLine size={16} />Export JSON
            </button>
            <button className="button button-secondary" type="button" disabled={!valuation || loading || exportingPdf} onClick={() => void downloadPdf()}>
              {exportingPdf ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
              {exportingPdf ? "Exporting" : "Export PDF"}
            </button>
            <button className="button button-primary" type="button" disabled={!loaded || loading} onClick={refresh}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading ? "Updating" : "Refresh values"}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <input
            type="file"
            ref={fileRef}
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import assets from a JSON file"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
          {(inputError || error) && (
            <div className="notice notice-error" role="alert">
              <TriangleAlert size={18} />
              <div>
                <strong>
                  {inputError ? "Configuration not loaded" : "Update failed"}
                </strong>
                <p>
                  {inputError ?? error}
                  {valuation && !inputError && valuation.pricedAssetCount > 0
                    ? " Previously loaded values are still shown."
                    : ""}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={
                  inputError ? "Dismiss configuration error" : "Retry valuation"
                }
                onClick={inputError ? () => setInputError(null) : refresh}
              >
                {inputError ? <X size={17} /> : <RefreshCw size={17} />}
              </button>
            </div>
          )}
          {valuation?.displayWarning && (
            <div className="notice notice-warning" role="status">
              <TriangleAlert size={18} />
              <div>
                <strong>Conversion unavailable; values shown in USD</strong>
                <p>{valuation.displayWarning}</p>
              </div>
            </div>
          )}
          {exportError && (
            <div className="notice notice-error" role="alert">
              <TriangleAlert size={18} /><p>{exportError}</p>
              <button className="icon-button" type="button" aria-label="Dismiss export error" onClick={() => setExportError(null)}><X size={17} /></button>
            </div>
          )}

          <section
            className="overview-grid"
            aria-label="Portfolio summary"
            aria-busy={loading}
          >
            <div className="balance-card">
              <div className="balance-top">
                <span className="balance-label">
                  <Wallet size={17} />
                  {failedCount
                    ? "Total available value"
                    : "Total portfolio value"}
                </span>
                <span
                  className={`balance-status ${error || failedCount || warningCount ? "is-partial" : ""}`}
                >
                  <span />
                  {loading
                    ? "Updating"
                    : !valuation
                      ? "Awaiting values"
                      : error
                        ? "Refresh failed"
                        : failedCount
                        ? "Partial valuation"
                        : warningCount
                          ? "Review quotes"
                          : "Snapshot loaded"}
                </span>
              </div>
              <div className="balance-amount" aria-live="polite">
                {loading && !valuation ? (
                  <span className="pricing-placeholder">
                    Fetching values<span className="loading-dots">···</span>
                  </span>
                ) : (
                  formatMoney(total, displayUnit)
                )}
              </div>
              <p className="balance-subtitle">
                {failedCount
                  ? `${failedCount} ${failedCount === 1 ? "asset excluded; value unavailable." : "assets excluded; values unavailable."}`
                  : valuation
                    ? `${assetCount} ${assetCount === 1 ? "asset" : "assets"} valued in ${displayUnit === "g gold" ? "grams of gold" : displayUnit}`
                    : "Add your assets for a clear view of your portfolio"}
              </p>
              <div className="balance-footer">
                <div>
                  <span className="balance-foot-label">Last valuation</span>
                  <span className="balance-time">
                    {valuation
                      ? formatDate(valuation.generatedAt)
                      : "Awaiting first update"}
                    {loading && valuation ? " · Refreshing" : " · Auto-refresh every minute"}
                  </span>
                </div>
                <div className="base-picker">
                  <label htmlFor="display-base">Display unit</label>
                  <div className="select-wrap">
                    <select
                      id="display-base"
                      value={baseMode}
                      onChange={(event) => {
                        setBaseMode(event.target.value);
                        setBaseError(null);
                        if (event.target.value !== "CUSTOM")
                          setDisplayBase(event.target.value);
                      }}
                    >
                      {baseOptions.map((base) => (
                        <option value={base} key={base}>
                          {base === "GOLD" ? "Gold / g" : base}
                        </option>
                      ))}
                      <option value="CUSTOM">Custom</option>
                    </select>
                    <ChevronDown size={13} />
                  </div>
                </div>
              </div>
            </div>
            <div className="allocation-card">
              <div className="section-card-heading">
                <div>
                  <h2>Asset allocation</h2>
                </div>
                <span className="tiny-label">By available value</span>
              </div>
              <div className="allocation-content">
                <div
                  className="donut"
                  style={donutStyle}
                  role="img"
                  aria-label={
                    valuation?.totalUsd
                      ? allocation
                          .filter((item) => item.value > 0)
                          .map(
                            (item) =>
                              `${item.label} ${formatNumber((item.value / valuation.totalUsd) * 100, 1)}%`,
                          )
                          .join(", ")
                      : "No asset allocation available"
                  }
                >
                  <div className="donut-center">
                    <strong>
                      {valuation
                        ? allocation.filter((item) => item.count > 0).length
                        : "—"}
                    </strong>
                    <span>Categories</span>
                  </div>
                </div>
                <div className="allocation-legend">
                  {allocation.map((item) => (
                    <button
                      type="button"
                      className={`legend-item ${filter === item.type ? "legend-active" : ""}`}
                      key={item.type}
                      onClick={() =>
                        setFilter(filter === item.type ? "all" : item.type)
                      }
                      aria-pressed={filter === item.type}
                    >
                      <span
                        className="legend-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                      <strong>
                        {valuation?.totalUsd
                          ? `${formatNumber((item.value / valuation.totalUsd) * 100, 1)}%`
                          : "—"}
                      </strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
          {baseMode === "CUSTOM" && (
            <form
              className="custom-base-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!/^[A-Z]{3}$/.test(customBase)) {
                  setBaseError(
                    "Enter a three-letter currency code, such as AUD.",
                  );
                  return;
                }
                setBaseError(null);
                setDisplayBase(customBase);
              }}
            >
              <Globe2 size={17} />
              <label htmlFor="custom-base">Custom currency</label>
              <input
                id="custom-base"
                value={customBase}
                maxLength={3}
                placeholder="AUD"
                autoComplete="off"
                onChange={(event) =>
                  setCustomBase(
                    event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                  )
                }
              />
              <button className="button button-small" type="submit">
                Apply
              </button>
              <span className={baseError ? "text-error" : "muted"}>
                {baseError ??
                  `Current results: ${unitLabel}. Apply when ready.`}
              </span>
            </form>
          )}
          <section className="holdings-card" aria-labelledby="holdings-title">
            <div className="holdings-heading">
              <div>
                <h1 id="holdings-title">
                  Holdings<span className="count-badge">{assetCount}</span>
                </h1>
              </div>
            </div>
            <div className="table-toolbar">
              <details className="overview-menu" ref={overviewRef}>
                <summary><ChartNoAxesColumn size={16} />Overview<ChevronDown size={12} /></summary>
                <section className="overview-panel" aria-label="Valuation overview">
                  <dl>
                    <div><dt>Assets valued</dt><dd>{valuation ? pricedCount : "—"}<small> / {assetCount}</small></dd></div>
                    <div><dt>Pricing currencies</dt><dd>{loaded ? currencyCount : "—"}<small>{currencyCount === 1 ? " currency" : " currencies"}</small></dd></div>
                    <div><dt>Needs attention</dt><dd className={needsAttention ? "text-amber" : ""}>{valuation ? needsAttention : "—"}<small>{needsAttention === 1 ? " asset" : " assets"}</small></dd></div>
                  </dl>
                  <p className={needsAttention ? "text-amber" : "muted"}>{!valuation ? "Awaiting check" : needsAttention ? "Review details" : "All clear"}</p>
                </section>
              </details>
              <div
                className="filter-tabs"
                role="group"
                aria-label="Filter by asset category"
              >
                <button
                  type="button"
                  className={filter === "all" ? "selected" : ""}
                  onClick={() => setFilter("all")}
                  aria-pressed={filter === "all"}
                >
                  All assets
                </button>
                {(
                  Object.entries(categories) as [
                    AssetType,
                    typeof categories.cash,
                  ][]
                ).map(([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    className={filter === type ? "selected" : ""}
                    onClick={() => setFilter(type)}
                    aria-pressed={filter === type}
                  >
                    {meta.short}
                  </button>
                ))}
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  aria-label="Search assets"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, symbol…"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <select
                className="sort-select"
                aria-label="Sort assets"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="value">By value</option>
                <option value="name">By name</option>
                <option value="status">Issues first</option>
              </select>
            </div>
            {assets.length > 0 ? (
              <div className="table-scroll">
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th scope="col" className="number-column">No.</th>
                      <th scope="col">Asset</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="numeric">
                        Quantity
                      </th>
                      <th scope="col" className="share-column">
                        Allocation
                      </th>
                      <th scope="col" className="numeric">
                        Value <span className="table-unit">/ {unitLabel}</span>
                      </th>
                      <th scope="col">
                        <span className="sr-only">View details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset, index) => {
                      const meta = categories[asset.type];
                      const Icon = meta.icon;
                      const share =
                        valuation &&
                        valuation.totalUsd > 0 &&
                        asset.usdValue !== null
                          ? (asset.usdValue / valuation.totalUsd) * 100
                          : null;
                      return (
                        <tr key={asset.id}>
                          <td className="row-number">{index + 1}</td>
                          <td>
                            <button
                              className="asset-name-button"
                              type="button"
                              onClick={() => setSelectedId(asset.id)}
                            >
                              <span
                                className="asset-icon"
                                style={categoryStyle(asset.type)}
                              >
                                <Icon size={20} />
                              </span>
                              <span className="asset-name">
                                <strong>{asset.name}</strong>
                                <span>
                                  {asset.symbol ?? asset.fundCode ?? asset.id}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span
                              className="category-pill"
                              style={categoryStyle(asset.type)}
                            >
                              {meta.short}
                            </span>
                          </td>
                          <td className="numeric quantity-cell">
                            {formatNumber(asset.quantity, 4)}
                            <span>{quantityUnit(asset)}</span>
                          </td>
                          <td className="share-column">
                            <div className="share-content">
                              <span>
                                {share === null
                                  ? "—"
                                  : `${formatNumber(share, 1)}%`}
                              </span>
                              <div className="share-track">
                                <span
                                  style={{
                                    width: `${share ?? 0}%`,
                                    backgroundColor: meta.color,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="numeric">
                            <strong className="asset-value">
                              {formatMoney(
                                asset.usdValue === null
                                  ? null
                                  : asset.usdValue * rate,
                                displayUnit,
                              )}
                            </strong>
                            <span
                              className={`asset-status status-${asset.status}`}
                            >
                              <i />
                              {asset.type === "stock" && asset.status !== "failed" ? quoteLabel(asset) : statuses[asset.status]}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="row-arrow"
                              onClick={() => setSelectedId(asset.id)}
                              aria-label={`View details for ${asset.name}`}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredAssets.length === 0 && (
                  <div className="empty-state">
                    <Search size={26} />
                    <h3>No matching assets</h3>
                    <p>Try another search or asset category.</p>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setFilter("all");
                        setSearch("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                {loading || sampleLoading ? (
                  <Loader2 size={30} className="spin" />
                ) : (
                  <Wallet size={32} />
                )}
                <h3>
                  {loading || sampleLoading
                    ? "Loading your portfolio"
                    : error
                      ? "Values unavailable"
                      : "Start with your first portfolio"}
                </h3>
                <p>
                  {loading || sampleLoading
                    ? "Fetching quotes and converting to your display unit."
                    : error
                      ? "Try again or check your asset configuration."
                      : "Import a JSON file or add assets in Configuration."}
                </p>
                {!loading && !sampleLoading && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={error ? refresh : openConfig}
                  >
                    {error ? "Try again" : "Configure assets"}
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
            <div className="table-footer">
              <span>
                {assets.length
                  ? `Showing ${filteredAssets.length} of ${assets.length} ${assets.length === 1 ? "asset" : "assets"}`
                  : "Cash, gold, stocks, funds, and more"}
              </span>
              <span>
                <span className="footer-dot" />
                {failedCount
                  ? "Allocation uses available values only"
                  : "See asset details for quote times"}
              </span>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              Asset Dashboard
            </span>
            <span>Indicative values · Liabilities excluded</span>
          </footer>
        </main>
      </div>
      {modal === "config" && (
        <Dialog
          title="Portfolio configuration"
          eyebrow="YOUR PORTFOLIO"
          wide
          onClose={() => setModal(null)}
        >
          <div className="config-file">
            <span className="stat-icon stat-green">
              <FileJson size={22} />
            </span>
            <div>
              <strong>{loaded?.name ?? "New portfolio"}</strong>
              <p>
                {assetCount} {assetCount === 1 ? "asset" : "assets"} · USD base
                valuation
              </p>
            </div>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              Import file
            </button>
          </div>
          <form onSubmit={applyDraft}>
            <div className="editor-label">
              <label htmlFor="config-json">JSON configuration</label>
              <span>Apply changes to the dashboard</span>
            </div>
            <textarea
              id="config-json"
              className="json-editor"
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <p className="editor-hint">
              Supported types: gold, cash, stock, fund, custom. Each asset needs
              a unique id. Changes stay in this tab; export before closing.
            </p>
            {draftError && (
              <div className="notice notice-error" role="alert">
                <TriangleAlert size={17} />
                <p>{draftError}</p>
              </div>
            )}
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button button-primary" type="submit">
                <Check size={16} />
                Apply configuration
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {selectedAsset && (
        <Dialog
          title={selectedAsset.name}
          eyebrow="ASSET DETAILS"
          onClose={() => setSelectedId(null)}
        >
          <div className="detail-balance">
            <span>Current value · {unitLabel}</span>
            <strong>
              {formatMoney(
                selectedAsset.usdValue === null
                  ? null
                  : selectedAsset.usdValue * rate,
                displayUnit,
              )}
            </strong>
            <span className={`asset-status status-${selectedAsset.status}`}>
              <i />
              {selectedAsset.type === "stock" && selectedAsset.status !== "failed" ? quoteLabel(selectedAsset) : statuses[selectedAsset.status]}
            </span>
          </div>
          {selectedAsset.warning && (
            <div className="notice notice-warning detail-warning">
              <TriangleAlert size={17} />
              <p>{selectedAsset.warning}</p>
            </div>
          )}
          <dl className="detail-grid">
            <div>
              <dt>Category</dt>
              <dd>{categories[selectedAsset.type].label}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>
                {formatNumber(selectedAsset.quantity, 6)}{" "}
                {quantityUnit(selectedAsset)}
              </dd>
            </div>
            <div>
              <dt>
                {selectedAsset.type === "fund"
                  ? "Published NAV per unit"
                  : "Original quote"}
              </dt>
              <dd>
                {formatMoney(
                  selectedAsset.price,
                  selectedAsset.pricingCurrency ?? "USD",
                  selectedAsset.type === "fund" ? 4 : 2,
                )}
                {selectedAsset.priceUnit && selectedAsset.type !== "fund"
                  ? ` / ${selectedAsset.priceUnit}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Exchange rate to USD</dt>
              <dd>{formatNumber(selectedAsset.fxRateToUsd, 6)}</dd>
            </div>
            <div>
              <dt>Daily change (original currency)</dt>
              <dd>
                {selectedAsset.dailyChangePercent == null
                  ? "No data"
                  : `${selectedAsset.dailyChangePercent > 0 ? "+" : ""}${formatNumber(selectedAsset.dailyChangePercent)}%`}
              </dd>
            </div>
            <div>
              <dt>
                {selectedAsset.type === "fund" ? "NAV date" : "Quote updated"}
              </dt>
              <dd>
                {formatDate(
                  selectedAsset.navDate ?? selectedAsset.updatedAt,
                  selectedAsset.type === "fund" || selectedAsset.timestampPrecision === "date",
                )}
              </dd>
            </div>
            {selectedAsset.type === "stock" && selectedAsset.status !== "failed" && (
              <><div><dt>Quote quality</dt><dd>{quoteLabel(selectedAsset)}</dd></div>
              <div><dt>Market / price session</dt><dd>{selectedAsset.marketState ?? "Unknown"} / {selectedAsset.priceSession ?? "unknown"}</dd></div>
              <div><dt>Retrieved</dt><dd>{formatDate(selectedAsset.fetchedAt)}</dd></div></>
            )}
            <div className="detail-full">
              <dt>Data source</dt>
              <dd>{selectedAsset.source}</dd>
            </div>
            <div className="detail-full">
              <dt>Valuation details</dt>
              <dd>{selectedAsset.message}</dd>
            </div>
          </dl>
          <div className="detail-id">
            ASSET ID <span>{selectedAsset.id}</span>
          </div>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog
          title="Get to know your portfolio"
          eyebrow="GETTING STARTED"
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            <div>
              <span>01</span>
              <div>
                <h3>Import your assets</h3>
                <p>
                  Upload a JSON file or edit it in Configuration. Enter currency
                  and amount for cash, symbol and shares for stocks, and weight
                  and unit for gold.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Get current values</h3>
                <p>
                  Values refresh every minute while this page is visible, with slower retries after failures. Select Refresh values to retry immediately.
                  Choose a display currency or view your portfolio in grams of
                  gold.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Check data status</h3>
                <p>
                  Unavailable values appear as a dash and are excluded from
                  totals. Asset details include quote sources and timestamps.
                  Exchange rates and market quotes may be delayed.
                </p>
              </div>
            </div>
          </div>
          <div className="help-note">
            <ShieldCheck size={19} />
            <p>
              Your configuration stays in this tab. Reloading restores the
              sample. Use Export JSON to save your changes.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
