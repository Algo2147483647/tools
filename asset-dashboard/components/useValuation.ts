"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestGate } from "@/lib/client/requestGate";
import { createAutoRefresh } from "@/lib/client/autoRefresh";
import type { PortfolioConfig, ValuationResponse } from "@/lib/valuation/types";

export function useValuation(config: PortfolioConfig | null, displayBase: string) {
  const [snapshot, setSnapshot] = useState<{ config: PortfolioConfig; data: ValuationResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const gate = useRef(createRequestGate());
  const previousConfig = useRef(config);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!config) return;
    const requestConfig = config;
    previousConfig.current = config;
    let active = true;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    async function run(): Promise<boolean> {
      const request = gate.current.begin();
      setLoading(true);
      setError(null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Bound the entire transport and JSON-body operation, even if a fetch ignores abort.
        const result = await Promise.race([
          (async () => {
            const response = await fetch("/api/valuation", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...requestConfig, displayBase }), signal: request.signal,
            });
            const data = await response.json();
            const hasValuation = Array.isArray(data.assets) && Number.isFinite(data.totalUsd) && Number.isFinite(data.totalValue);
            if (!response.ok) {
              if (response.status === 502 && hasValuation && request.isCurrent() && active)
                setSnapshot({ config: requestConfig, data: data as ValuationResponse });
              throw new Error(data.error || "Valuation failed (HTTP " + response.status + ").");
            }
            if (!hasValuation) throw new Error("The valuation service returned invalid data. Please try again.");
            return data as ValuationResponse;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error("The valuation request timed out. Previous results have been kept."));
            }, 35_000);
            requestTimer = timer;
          }),
        ]);
        if (request.isCurrent() && active) setSnapshot({ config: requestConfig, data: result });
        return result.failedAssetCount === 0;
      } catch (reason) {
        if (request.isCurrent() && active)
          setError(reason instanceof Error ? reason.message : "Valuation is temporarily unavailable. Previous results have been kept.");
        return false;
      } finally {
        clearTimeout(timer);
        if (request.isCurrent() && active) setLoading(false);
        request.cancel();
      }
    }
    const scheduler = createAutoRefresh({ run, isVisible: () => document.visibilityState !== "hidden" });
    document.addEventListener("visibilitychange", scheduler.visibilityChanged);
    scheduler.start();
    const currentGate = gate.current;
    return () => {
      active = false;
      scheduler.stop();
      clearTimeout(requestTimer);
      currentGate.cancel();
      document.removeEventListener("visibilitychange", scheduler.visibilityChanged);
    };
  }, [config, displayBase, revision]);

  const configChanged = previousConfig.current !== config;
  return {
    data: snapshot?.config === config ? snapshot.data : null,
    error: configChanged ? null : error,
    loading: loading || Boolean(config && configChanged),
    refresh,
  };
}
