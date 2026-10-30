import type { QuoteMetadata, QuoteQuality } from "./types";

const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Resolve ET against the IANA zone, never against the server's zone or a fixed offset. */
export function nasdaqTimestamp(input: string): string | null {
  const match = /^(?:Closed at\s+)?([A-Za-z]{3}) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM) ET$/i.exec(input.trim());
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[1].toLowerCase()) + 1;
  const day = Number(match[2]), year = Number(match[3]), hour12 = Number(match[4]), minute = Number(match[5]);
  if (!month || hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const hour = hour12 % 12 + (match[6].toUpperCase() === "PM" ? 12 : 0);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = [4, 5].map((offset) => wallTime + offset * 3600_000).filter((time) => {
    const parts = Object.fromEntries(eastern.formatToParts(time).map((part) => [part.type, part.value]));
    return Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day
      && Number(parts.hour) === hour && Number(parts.minute) === minute;
  });
  // Nonexistent spring times and ambiguous fall times must not become invented timestamps.
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}

export function assessQuote(quote: QuoteMetadata & { updatedAt: string | null }, now = Date.now()): { quality: QuoteQuality; warning?: string } {
  const timestamp = quote.updatedAt ? Date.parse(quote.updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return { quality: "unknown", warning: "The provider did not supply a usable quote timestamp." };
  const age = now - timestamp;
  if (age < -5 * 60_000) return { quality: "unknown", warning: "The quote timestamp is in the future; check the provider's data." };
  const quality = quote.quality ?? "unknown";
  if (age > 7 * 86400_000) return { quality: "stale", warning: "The latest available quote is more than 7 days old." };
  // Use the provider's market state, which includes holidays and early closes.
  // A recent close remains a reference during a weekend; never call it realtime.
  const active = /^(open|pre-market|after-hours)$/i.test(quote.marketState ?? "");
  const tolerance = ((quote.delaySeconds ?? (quality === "delayed" ? 900 : 0)) + 300) * 1000;
  if (quality === "stale" || (active && quality !== "close" && age > tolerance)) {
    return { quality: "stale", warning: "The last trade is older than the expected quote interval. This is a stale reference value." };
  }
  if (quality === "unknown") return { quality, warning: "Quote delay or market session is unknown; realtime pricing is not verified." };
  if (quality === "delayed") return { quality, warning: "The provider reports delayed data. This is an indicative valuation." };
  if (quality === "close") return { quality, warning: "Using a closing or daily reference price, not a current-session trade." };
  return { quality };
}
