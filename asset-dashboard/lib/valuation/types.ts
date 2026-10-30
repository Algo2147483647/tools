export type AssetType = "gold" | "cash" | "stock" | "fund" | "custom";
export type AssetStatus = "ok" | "warning" | "failed";

export type AssetConfig = GoldAsset | CashAsset | StockAsset | FundAsset | CustomAsset;

export interface PortfolioConfig {
  baseCurrency: "USD";
  assets: AssetConfig[];
}

export interface AssetBase {
  id: string;
  type: AssetType;
  name?: string;
  quantity: number;
}

export interface GoldAsset extends AssetBase {
  type: "gold";
  unit?: string;
}

export interface CashAsset extends AssetBase {
  type: "cash";
  currency: string;
}

export interface StockAsset extends AssetBase {
  type: "stock";
  symbol: string;
  securityType?: "equity" | "etf";
  /** U.S. listing MIC. Unsupported markets fail explicitly. */
  exchange?: string;
  currency?: string;
}

export interface CustomAsset extends AssetBase {
  type: "custom";
  price: number;
  currency: string;
}

export interface FundAsset extends AssetBase {
  type: "fund";
  code: string;
  /** Optional assertion; the official provider determines the share class currency. */
  currency?: string;
}

export interface FundPricePoint extends PricePoint {
  navDate: string;
  referenceNAV: true;
}

export type QuoteQuality = "realtime" | "delayed" | "close" | "stale" | "unknown";
export interface QuoteMetadata {
  quality?: QuoteQuality;
  fetchedAt?: string;
  timestampPrecision?: "date" | "minute" | "second" | "unknown";
  marketState?: string;
  priceSession?: "regular" | "pre" | "post" | "close" | "unknown";
  delaySeconds?: number | null;
}

export interface PricePoint extends QuoteMetadata {
  price: number;
  currency: string;
  unit?: string;
  source: string;
  updatedAt: string | null;
  dailyChangePercent?: number | null;
}

export interface FxRatePoint {
  rate: number;
  source: string;
  updatedAt: string | null;
  dailyChangePercent?: number | null;
}

export interface AssetValuation extends QuoteMetadata {
  id: string;
  type: AssetType;
  name: string;
  quantity: number;
  unit?: string;
  symbol?: string;
  securityType?: "equity" | "etf";
  exchange?: string;
  fundCode?: string;
  navDate?: string;
  referenceNAV?: boolean;
  price: number | null;
  pricingCurrency: string | null;
  priceUnit?: string;
  fxRateToUsd: number | null;
  usdValue: number | null;
  dailyChangePercent?: number | null;
  source: string;
  updatedAt: string | null;
  status: AssetStatus;
  message: string;
  warning?: string;
}

export interface ValuationResponse {
  baseCurrency: string;
  totalUsd: number;
  totalValue: number;
  displayRateFromUsd: number;
  displayUnit: string;
  displayWarning?: string;
  pricedAssetCount: number;
  failedAssetCount: number;
  generatedAt: string;
  assets: AssetValuation[];
}

export class ValuationError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 502 | 500 = 400) {
    super(message);
    this.name = "ValuationError";
  }
}
