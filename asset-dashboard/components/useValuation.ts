"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestGate } from "@/lib/client/requestGate";
import type { PortfolioConfig, ValuationResponse } from "@/lib/valuation/types";

export function useValuation(
  config: PortfolioConfig | null,
  displayBase: string,
) {
  const [snapshot, setSnapshot] = useState<{
    config: PortfolioConfig;
    data: ValuationResponse;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const gate = useRef(createRequestGate());
  const previousConfig = useRef(config);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!config) return;
    const requestConfig = config;
    const request = gate.current.begin();
    if (previousConfig.current !== config) {
      previousConfig.current = config;
    }
    setLoading(true);
    setError(null);
    // The API has its own shorter deadline. This also bounds transport failures.
    const timer = window.setTimeout(() => {
      if (!request.isCurrent()) return;
      setError(
        "The valuation request timed out. Please try again. Previous results have been kept.",
      );
      setLoading(false);
      request.cancel();
    }, 35_000);

    async function run() {
      try {
        const response = await fetch("/api/valuation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, displayBase }),
          signal: request.signal,
        });
        const result = await response.json();
        const hasValuation =
          Array.isArray(result.assets) &&
          Number.isFinite(result.totalUsd) &&
          Number.isFinite(result.totalValue);
        if (!response.ok) {
          // A fully failed portfolio still carries per-asset diagnostics.
          if (response.status === 502 && hasValuation && request.isCurrent())
            setSnapshot({
              config: requestConfig,
              data: result as ValuationResponse,
            });
          throw new Error(
            result.error || `Valuation failed (HTTP ${response.status}).`,
          );
        }
        if (!hasValuation) {
          throw new Error(
            "The valuation service returned invalid data. Please try again.",
          );
        }
        if (request.isCurrent())
          setSnapshot({
            config: requestConfig,
            data: result as ValuationResponse,
          });
      } catch (reason) {
        if (request.isCurrent())
          setError(
            reason instanceof Error
              ? reason.message
              : "Valuation is temporarily unavailable. Please try again.",
          );
      } finally {
        window.clearTimeout(timer);
        if (request.isCurrent()) setLoading(false);
      }
    }
    void run();
    return () => {
      window.clearTimeout(timer);
      request.cancel();
    };
  }, [config, displayBase, revision]);

  // Do not show the previous portfolio even for the render before the effect runs.
  const configChanged = previousConfig.current !== config;
  return {
    data: snapshot?.config === config ? snapshot.data : null,
    error: configChanged ? null : error,
    loading: loading || Boolean(config && configChanged),
    refresh,
  };
}
