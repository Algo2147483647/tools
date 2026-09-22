export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function numberOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
