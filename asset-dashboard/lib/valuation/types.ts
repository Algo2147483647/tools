export type AssetType = "gold" | "cash" | "stock" | "custom";
export type AssetStatus = "ok" | "warning" | "failed";

export type AssetConfig = GoldAsset | CashAsset | StockAsset | CustomAsset;

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
}

export interface CustomAsset extends AssetBase {
  type: "custom";
  price: number;
  currency: string;
}

export interface PricePoint {
  price: number;
  currency: string;
  unit?: string;
  source: string;
  updatedAt: string;
  dailyChangePercent?: number | null;
}

export interface FxRatePoint {
  rate: number;
  source: string;
  updatedAt: string;
  dailyChangePercent?: number | null;
}

export interface AssetValuation {
  id: string;
  type: AssetType;
  name: string;
  quantity: number;
  unit?: string;
  symbol?: string;
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
}

export interface ValuationResponse {
  baseCurrency: string;
  totalUsd: number;
  totalValue: number;
  displayRateFromUsd: number;
  displayUnit: string;
  pricedAssetCount: number;
  failedAssetCount: number;
  generatedAt: string;
  assets: AssetValuation[];
}

export class ValuationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValuationError";
  }
}
