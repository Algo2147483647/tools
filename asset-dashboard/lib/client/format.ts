const numberFormats = new Map<number, Intl.NumberFormat>();
export function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (!numberFormats.has(digits))
    numberFormats.set(
      digits,
      new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }),
    );
  return numberFormats.get(digits)!.format(value);
}

export function formatMoney(
  value: number | null | undefined,
  unit = "USD",
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "g gold") return `${formatNumber(value, 3)} g`;
  const symbols: Record<string, string> = {
    USD: "$",
    CNY: "¥",
    HKD: "HK$",
    EUR: "€",
    JPY: "¥",
    CHF: "CHF ",
    GBP: "£",
  };
  return `${symbols[unit] ?? `${unit} `}${new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`;
}

export function formatDate(
  value: string | null | undefined,
  dateOnly = false,
): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown timestamp";
  if (dateOnly)
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
