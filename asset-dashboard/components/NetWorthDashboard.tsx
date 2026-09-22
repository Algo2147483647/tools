"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Loader2, RefreshCcw, Settings2, Upload } from "lucide-react";
import type { AssetStatus, ValuationResponse } from "@/lib/valuation/types";

const sampleConfigPath = "/sample-config.json";
const baseOptions = ["USD", "CNY", "HKD", "EUR", "JPY", "CHF", "GBP", "GOLD"];

function formatUsd(value: number | null | undefined): string {
  if (value == null) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100000 ? 0 : 2
  }).format(value);
}

function formatBaseValue(value: number | null | undefined, unit = "USD"): string {
  if (value == null) {
    return unit === "g gold" ? "0 g gold" : `0 ${unit}`;
  }
  if (unit === "USD") {
    return formatUsd(value);
  }
  if (unit === "g gold") {
    return `${formatNumber(value, 4)} g gold`;
  }
  return `${formatNumber(value, value >= 100000 ? 0 : 2)} ${unit}`;
}

function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value == null) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function statusDotTone(status: AssetStatus): string {
  if (status === "ok") {
    return "status-strip-ok";
  }
  if (status === "warning") {
    return "status-strip-warning";
  }
  return "status-strip-failed";
}

function conversionFactor(asset: ValuationResponse["assets"][number]): number | null {
  if (asset.usdValue == null || !Number.isFinite(asset.quantity) || asset.quantity === 0) {
    return null;
  }
  return asset.usdValue / asset.quantity;
}

function displayConversionFactor(asset: ValuationResponse["assets"][number], valuation: ValuationResponse | null): number | null {
  const usdFactor = conversionFactor(asset);
  if (usdFactor == null || !valuation) {
    return null;
  }
  return usdFactor * valuation.displayRateFromUsd;
}

function changeTone(change: number | null | undefined): string {
  if (change == null || !Number.isFinite(change) || Math.abs(change) < 0.000001) {
    return "change-neutral";
  }
  return change > 0 ? "change-up" : "change-down";
}

function summarizeConfig(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      assetCount: 0,
      baseCurrency: "USD"
    };
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.assets)) {
    return {
      assetCount: 0,
      baseCurrency: "USD"
    };
  }

  return {
    assetCount: record.assets.length,
    baseCurrency: typeof record.baseCurrency === "string" ? record.baseCurrency.toUpperCase() : "USD"
  };
}

export function NetWorthDashboard() {
  const [jsonInput, setJsonInput] = useState("");
  const [fileName, setFileName] = useState("sample-config.json");
  const [valuation, setValuation] = useState<ValuationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [displayBase, setDisplayBase] = useState("USD");
  const [customBase, setCustomBase] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => {
    try {
      if (!jsonInput.trim()) {
        return {
          value: null,
          error: "No JSON configuration loaded."
        };
      }
      return {
        value: JSON.parse(jsonInput) as unknown,
        error: null
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Invalid JSON."
      };
    }
  }, [jsonInput]);

  const configSummary = useMemo(() => summarizeConfig(parsed.value), [parsed.value]);
  const canRefresh = !parsed.error && !loading;

  async function refreshValuation(configValue?: unknown) {
    const valueToPrice = configValue ?? parsed.value;
    if (!valueToPrice || (!configValue && parsed.error)) {
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch("/api/valuation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(valueToPrice as Record<string, unknown>),
          displayBase
        })
      });
      const data = (await response.json()) as ValuationResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Valuation request failed.");
      }
      setValuation(data as ValuationResponse);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Valuation request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLocalJson(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const value = JSON.parse(text) as unknown;
      setJsonInput(text);
      setFileName(file.name);
      setValuation(null);
      setApiError(null);
      void refreshValuation(value);
    } catch (error) {
      setApiError(error instanceof Error ? `Invalid JSON file: ${error.message}` : "Invalid JSON file.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function loadSampleConfig() {
    setSampleLoading(true);
    setApiError(null);
    try {
      const response = await fetch(sampleConfigPath, {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`Failed to load sample JSON: HTTP ${response.status}.`);
      }
      const text = await response.text();
      const value = JSON.parse(text) as unknown;
      setJsonInput(text);
      setFileName("sample-config.json");
      setValuation(null);
      void refreshValuation(value);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to load sample JSON.");
    } finally {
      setSampleLoading(false);
    }
  }

  useEffect(() => {
    void loadSampleConfig();
    // Load the local sample JSON once on startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!parsed.value || parsed.error) {
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshValuation();
    }, 350);
    return () => window.clearTimeout(timer);
    // Reprice when the display base changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBase]);

  const assets = valuation?.assets ?? [];
  const hasFailures = (valuation?.failedAssetCount ?? 0) > 0;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const totalUsd = valuation?.totalUsd ?? 0;
  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
    [assets]
  );

  return (
    <main className="app-shell">
      <header className="topbar-shell">
        <div className="topbar-brand">
          <h1>Worth</h1>
        </div>
        <div className="topbar-actions">
          <label className="base-control">
            <span>Base</span>
            <select
              value={baseOptions.includes(displayBase) ? displayBase : "CUSTOM"}
              onChange={(event) => {
                if (event.target.value === "CUSTOM") {
                  const next = customBase || "AUD";
                  setCustomBase(next);
                  setDisplayBase(next);
                  return;
                }
                setDisplayBase(event.target.value);
              }}
              aria-label="Display base"
            >
              {baseOptions.map((base) => (
                <option key={base} value={base}>
                  {base}
                </option>
              ))}
              <option value="CUSTOM">Custom</option>
            </select>
            {!baseOptions.includes(displayBase) ? (
              <input
                value={customBase}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
                  setCustomBase(next);
                  setDisplayBase(next || "USD");
                }}
                placeholder="AUD"
                aria-label="Custom display base"
              />
            ) : null}
          </label>
          <button type="button" onClick={() => setConfigOpen(true)} className="studio-btn studio-btn-ghost">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Config
          </button>
          <button type="button" onClick={() => void refreshValuation()} disabled={!canRefresh} className="studio-btn studio-btn-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
            Refresh
          </button>
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void loadLocalJson(event.target.files?.[0])} />

      <section className="workspace-shell">
        <section className="stage-panel">
          <div className="total-card">
            <div>
              <p className="eyebrow">Total Current Asset Value in {valuation?.displayUnit ?? displayBase}</p>
              <p className="total-value">{loading && !valuation ? "Pricing..." : formatBaseValue(valuation?.totalValue, valuation?.displayUnit ?? displayBase)}</p>
            </div>
            <div className="summary-chip-grid">
              <span>VALUED {valuation?.pricedAssetCount ?? 0}</span>
              <span className={hasFailures ? "text-[#a33838]" : "text-[#24724f]"}>FAILED {valuation?.failedAssetCount ?? 0}</span>
              <span>{valuation ? formatDate(valuation.generatedAt) : "Waiting for pricing"}</span>
            </div>
          </div>

          <div className="breakdown-panel">
            <div className="breakdown-heading">
              <h2>Asset Breakdown</h2>
              <span>{assets.length} ITEMS</span>
            </div>

            {assets.length === 0 ? (
              <div className="empty-state">{loading ? "Fetching latest valuation..." : "Load a JSON file or use the sample configuration."}</div>
            ) : (
              <div className="asset-ledger" role="table" aria-label="Asset breakdown">
                <div className="asset-ledger-head" role="row">
                  <span>Type</span>
                  <span>Asset</span>
                  <span>Share</span>
                  <span>Quantity</span>
                  <span>Unit Value</span>
                  <span>Price</span>
                </div>
                {sortedAssets.map((asset) => (
                  <button key={asset.id} type="button" className="asset-ledger-row" role="row" onClick={() => setSelectedAssetId(asset.id)}>
                    <span className={`status-strip ${statusDotTone(asset.status)}`} aria-label={`Status ${asset.status}`} />
                    <div className="asset-cell asset-status-cell" role="cell">
                      <span className="type-pill">{asset.type}</span>
                    </div>
                    <div className="asset-cell asset-name-cell" role="cell">
                      <strong>{asset.name}</strong>
                      <span>{asset.id}</span>
                    </div>
                    <div className="asset-cell" role="cell">
                      <strong>{totalUsd > 0 && asset.usdValue != null ? `${formatNumber((asset.usdValue / totalUsd) * 100, 2)}%` : "N/A"}</strong>
                    </div>
                    <div className="asset-cell" role="cell">
                      <strong>
                        {formatNumber(asset.quantity)} {asset.unit ?? asset.symbol ?? ""}
                      </strong>
                    </div>
                    <div className="asset-cell" role="cell">
                      <strong className={changeTone(asset.dailyChangePercent)}>{formatNumber(displayConversionFactor(asset, valuation), 6)}</strong>
                      <span>per {asset.unit ?? asset.symbol ?? asset.pricingCurrency ?? "unit"}</span>
                    </div>
                    <div className="asset-cell asset-usd-cell" role="cell">
                      <strong>{formatBaseValue(asset.usdValue == null || !valuation ? null : asset.usdValue * valuation.displayRateFromUsd, valuation?.displayUnit ?? displayBase)}</strong>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      {selectedAsset ? (
        <div className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title" onClick={() => setSelectedAssetId(null)}>
          <div className="asset-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="asset-dialog-header">
              <div>
                <p className="eyebrow">{selectedAsset.type}</p>
                <h2 id="asset-modal-title">{selectedAsset.name}</h2>
                <p>{selectedAsset.id}</p>
              </div>
              <button type="button" className="studio-btn studio-btn-ghost" onClick={() => setSelectedAssetId(null)}>
                Close
              </button>
            </div>
            <dl className="asset-detail-grid">
              <div>
                <dt>Status</dt>
                <dd>{selectedAsset.status}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedAsset.type}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {formatNumber(selectedAsset.quantity)} {selectedAsset.unit ?? selectedAsset.symbol ?? ""}
                </dd>
              </div>
              <div>
                <dt>Current Price</dt>
                <dd>{selectedAsset.price == null ? "N/A" : `${formatNumber(selectedAsset.price, 6)} ${selectedAsset.pricingCurrency ?? ""}`}</dd>
              </div>
              <div>
                <dt>Pricing Currency</dt>
                <dd>{selectedAsset.pricingCurrency ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Unit Value</dt>
                <dd>{formatNumber(displayConversionFactor(selectedAsset, valuation), 6)}</dd>
              </div>
              <div>
                <dt>Base Value</dt>
                <dd>{formatBaseValue(selectedAsset.usdValue == null || !valuation ? null : selectedAsset.usdValue * valuation.displayRateFromUsd, valuation?.displayUnit ?? displayBase)}</dd>
              </div>
              <div>
                <dt>Last Updated</dt>
                <dd>{formatDate(selectedAsset.updatedAt)}</dd>
              </div>
              <div className="detail-wide">
                <dt>Data Source</dt>
                <dd>{selectedAsset.source}</dd>
              </div>
              <div className="detail-wide">
                <dt>Status Detail</dt>
                <dd>{selectedAsset.message}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {configOpen ? (
        <div className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="config-modal-title" onClick={() => setConfigOpen(false)}>
          <div className="asset-dialog config-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="asset-dialog-header">
              <div>
                <p className="eyebrow">Configuration</p>
                <h2 id="config-modal-title">Asset JSON</h2>
                <p>Load and validate the active portfolio file.</p>
              </div>
              <button type="button" className="studio-btn studio-btn-ghost" onClick={() => setConfigOpen(false)}>
                Close
              </button>
            </div>

            <div className="config-panel-grid">
              <div className="panel-section">
                <p className="control-label">Loaded Configuration</p>
                <div className="file-tile">
                  <FileJson className="h-5 w-5 text-[#285fdf]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="m-0 truncate font-semibold text-[#162033]">{fileName}</p>
                    <p className="m-0 mt-1 text-xs text-[#5f6d82]">
                      {configSummary.assetCount} assets / {configSummary.baseCurrency} valuation
                    </p>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <p className="control-label">Validation</p>
                {parsed.error ? (
                  <p className="status-box status-error">{parsed.error}</p>
                ) : sampleLoading ? (
                  <p className="status-box status-ok">Loading sample JSON...</p>
                ) : (
                  <p className="status-box status-ok">JSON format is valid and ready to price.</p>
                )}
                {apiError ? <p className="status-box status-error">{apiError}</p> : null}
              </div>

              <div className="config-actions">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="studio-btn studio-btn-primary">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Load JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
