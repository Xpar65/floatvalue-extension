export interface DisplayCurrency {
  code: string;
  usdRate: number;
  fxAsOf: string | null;
  fxStale: boolean;
}

export const USD_DISPLAY_CURRENCY: DisplayCurrency = {
  code: "USD",
  usdRate: 1,
  fxAsOf: null,
  fxStale: false
};

export function formatCurrency(amount: number, currencyCode: string, compact = false): string {
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: compact ? "narrowSymbol" : "symbol",
      notation: compact && Math.abs(amount) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: compact ? (Math.abs(amount) >= 10_000 ? 1 : 2) : undefined
    }).format(amount);
    return compact ? formatted : `${formatted} ${currencyCode}`;
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/** Date without the clock time, for summary lines that only need the day. */
export function formatDate(timestamp: number): string {
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp)
    : "unknown";
}

export function formatTimestamp(timestamp: number): string {
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        timestamp
      )
    : "unknown";
}
