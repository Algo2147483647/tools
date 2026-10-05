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
  ChevronRight,
  CircleHelp,
  Coins,
  FileJson,
  Globe2,
  Landmark,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
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
import { formatDate, formatMoney, formatNumber } from "@/lib/client/format";
import { Dialog } from "./Dialog";
import { useValuation } from "./useValuation";

const baseOptions = ["USD", "CNY", "HKD", "EUR", "JPY", "CHF", "GBP", "GOLD"];
const categories = {
  cash: {
    label: "Cash & deposits",
    short: "Cash",
    icon: Landmark,
    color: "#3f7e68",
    light: "#eaf3ee",
  },
  gold: {
    label: "Gold",
    short: "Gold",
    icon: Coins,
    color: "#c99b4b",
    light: "#faf1de",
  },
  stock: {
    label: "Stocks",
    short: "Stocks",
    icon: TrendingUp,
    color: "#7c87b8",
    light: "#edf0fa",
  },
  custom: {
    label: "Other",
    short: "Other",
    icon: Boxes,
    color: "#bc8270",
    light: "#f8eee9",
  },
};
const statuses = { ok: "Valued", warning: "Review", failed: "Unavailable" };
type LoadedConfig = {
  config: PortfolioConfig;
  text: string;
  name: string;
  isSample: boolean;
};

function categoryStyle(type: AssetType): CSSProperties {
  return {
    "--category-color": categories[type].color,
    "--category-light": categories[type].light,
  } as CSSProperties;
}
function quantityUnit(asset: AssetValuation) {
  if (asset.type === "stock") return asset.quantity === 1 ? "share" : "shares";
  if (asset.type === "custom") return asset.quantity === 1 ? "unit" : "units";
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
  const importSequence = useRef(0);
  const {
    data: valuation,
    error,
    loading,
    refresh,
  } = useValuation(loaded?.config ?? null, displayBase);

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
            isSample: true,
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
      isSample: false,
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
    if (sum <= 0) return { background: "#eef0ec" };
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
            `${asset.name} ${asset.id} ${asset.symbol ?? ""} ${asset.pricingCurrency ?? ""}`
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
    loaded?.config.assets.map((asset) =>
      "currency" in asset ? asset.currency : "USD",
    ),
  ).size;

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to portfolio overview
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#main-content" aria-label="Worth home">
          <span className="brand-symbol">
            <span />
            <span />
            <span />
          </span>
          <span>
            worth<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-badge">
          <span className="workspace-avatar">W</span>
          <div>
            <strong>My portfolio</strong>
            <span>Personal workspace</span>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="sidebar-nav">
          <a
            href="#main-content"
            className="nav-item active"
            aria-current="page"
            aria-label="Overview"
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
            <span className="nav-active-dot" />
          </a>
          <button
            type="button"
            className="nav-item"
            onClick={openConfig}
            aria-label="Configuration"
          >
            <Settings2 size={18} />
            <span>Configuration</span>
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => setModal("help")}
            aria-label="Guide"
          >
            <CircleHelp size={18} />
            <span>Guide</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-decoration">↗</span>
          <p>
            Every asset.
            <br />
            One clear view.
          </p>
          <span>A clearer view of your worth.</span>
        </div>
        <div className="sidebar-footer">
          <ShieldCheck size={17} />
          <div>
            <strong>In your hands</strong>
            <span>Import and export anytime</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <span className="environment-dot" />
            Personal portfolio<span className="profile-avatar">W</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR WEALTH, AT A GLANCE</p>
              <h1>
                Portfolio overview<span className="heading-dot">.</span>
              </h1>
              <p className="page-description">
                All your assets. One clear view.
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                <Plus size={17} />
                Import assets
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={!loaded || loading}
                onClick={refresh}
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                {loading ? "Updating" : "Refresh values"}
              </button>
            </div>
          </div>
          <input
            type="file"
            ref={fileRef}
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import assets from a JSON file"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
          {loaded?.isSample && (
            <div className="sample-banner">
              <span>
                <FileJson size={15} />
                <strong>Sample portfolio</strong>
                <span>
                  Explore the sample, or import your JSON to get started.
                </span>
              </span>
              <button type="button" onClick={openConfig}>
                View configuration
                <ArrowRight size={14} />
              </button>
            </div>
          )}
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

          <section
            className="overview-grid"
            aria-label="Portfolio summary"
            aria-busy={loading}
          >
            <div className="balance-card">
              <div className="balance-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="balance-top">
                <span className="balance-label">
                  <Wallet size={17} />
                  {failedCount
                    ? "Total available value"
                    : "Total portfolio value"}
                </span>
                <span
                  className={`balance-status ${failedCount || warningCount ? "is-partial" : ""}`}
                >
                  <span />
                  {loading
                    ? "Updating"
                    : !valuation
                      ? "Awaiting values"
                      : failedCount
                        ? "Partial valuation"
                        : warningCount
                          ? "Review quotes"
                          : "Up to date"}
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
                    {loading && valuation ? " · Refreshing" : ""}
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
                  <p className="eyebrow">PORTFOLIO MIX</p>
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
          <section className="stats-grid" aria-label="Valuation status">
            <div className="stat-card">
              <span className="stat-icon stat-green">
                <ShieldCheck size={20} />
              </span>
              <div>
                <span className="stat-label">Assets valued</span>
                <strong>
                  {valuation ? pricedCount : "—"}
                  <small> / {assetCount}</small>
                </strong>
              </div>
              <div className="mini-progress" aria-hidden="true">
                <span
                  style={{
                    width: `${assetCount ? (pricedCount / assetCount) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon stat-blue">
                <Globe2 size={20} />
              </span>
              <div>
                <span className="stat-label">Pricing currencies</span>
                <strong>
                  {loaded ? currencyCount : "—"}
                  <small>
                    {currencyCount === 1 ? " currency" : " currencies"}
                  </small>
                </strong>
              </div>
              <span className="stat-caption">One view</span>
            </div>
            <div className="stat-card">
              <span
                className={`stat-icon ${needsAttention ? "stat-amber" : "stat-neutral"}`}
              >
                <SlidersHorizontal size={20} />
              </span>
              <div>
                <span className="stat-label">Needs attention</span>
                <strong>
                  {valuation ? needsAttention : "—"}
                  <small>{needsAttention === 1 ? " asset" : " assets"}</small>
                </strong>
              </div>
              <span
                className={`stat-caption ${needsAttention ? "text-amber" : ""}`}
              >
                {!valuation
                  ? "Awaiting check"
                  : needsAttention
                    ? "Review details"
                    : "All clear"}
              </span>
            </div>
          </section>

          <section className="holdings-card" aria-labelledby="holdings-title">
            <div className="holdings-heading">
              <div>
                <h2 id="holdings-title">
                  Holdings<span className="count-badge">{assetCount}</span>
                </h2>
                <p>Values and status for every asset.</p>
              </div>
              <button
                className="button button-quiet"
                type="button"
                disabled={!loaded}
                onClick={downloadConfig}
              >
                <ArrowDownToLine size={16} />
                Export configuration
              </button>
            </div>
            <div className="table-toolbar">
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
                    {filteredAssets.map((asset) => {
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
                                <span>{asset.symbol ?? asset.id}</span>
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
                              {statuses[asset.status]}
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
                  : "Cash, gold, stocks, and custom assets"}
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
              WORTH <span className="footer-separator">/</span> A clearer view
              of your worth
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
              Supported types: gold, cash, stock, custom. Each asset needs a
              unique id. Changes stay in this tab; export before closing.
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
              {statuses[selectedAsset.status]}
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
              <dt>Original quote</dt>
              <dd>
                {formatMoney(
                  selectedAsset.price,
                  selectedAsset.pricingCurrency ?? "USD",
                )}
                {selectedAsset.priceUnit ? ` / ${selectedAsset.priceUnit}` : ""}
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
              <dt>Quote updated</dt>
              <dd>{formatDate(selectedAsset.updatedAt)}</dd>
            </div>
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
                  Select Refresh values to fetch the latest available quotes.
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
              sample. Use Export configuration to save your changes.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
