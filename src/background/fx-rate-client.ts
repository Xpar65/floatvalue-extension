import {
  STEAM_CURRENCY_CODES,
  isSteamCurrencyCode,
  type SteamCurrencyIso
} from "../domain/steam-currency-codes";
import type { FxRateOutcome, FxRateQuote } from "../domain/types";
import { ChromeStorageAdapter, type StorageAdapter } from "./curve-cache";

const HOUR = 60 * 60 * 1000;
const FRESH_TTL = 12 * HOUR;
const STALE_TTL = 7 * 24 * HOUR;
const REQUEST_TIMEOUT = 8_000;
const CSLYTICS_FX_URL = "https://api.cslytics.com/free/v1/fx-rates.json";
const CACHE_KEY = "usd-fx:snapshot:v1";
const SUPPORTED_CURRENCIES = new Set<string>(Object.values(STEAM_CURRENCY_CODES));

interface FxCacheEntry {
  fetchedAt: number;
  asOf: string;
  sourceStale: boolean;
  rates: Record<string, number>;
}

interface SnapshotResult {
  entry: FxCacheEntry;
  localStale: boolean;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validRates(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== SUPPORTED_CURRENCIES.size) return false;
  if (entries.some(([currency]) => !SUPPORTED_CURRENCIES.has(currency))) return false;
  if (
    entries.some(
      ([, rate]) => typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0
    )
  ) {
    return false;
  }
  return (value as Record<string, number>).USD === 1;
}

function validCacheEntry(value: unknown): value is FxCacheEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.fetchedAt === "number" &&
    Number.isFinite(record.fetchedAt) &&
    validTimestamp(record.asOf) &&
    typeof record.sourceStale === "boolean" &&
    validRates(record.rates)
  );
}

export class FxRateClient {
  private inFlight: Promise<SnapshotResult> | null = null;

  constructor(
    private readonly storage: StorageAdapter = new ChromeStorageAdapter(),
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = Date.now
  ) {}

  async fetchRate(quoteCurrency: string): Promise<FxRateOutcome> {
    if (!isSteamCurrencyCode(quoteCurrency)) {
      return { status: "error", quoteCurrency, message: "Unsupported Steam wallet currency" };
    }
    if (quoteCurrency === "USD") {
      return {
        status: "success",
        quote: {
          base: "USD",
          quote: "USD",
          rate: 1,
          asOf: new Date(this.now()).toISOString(),
          stale: false
        }
      };
    }

    try {
      const result = await this.fetchSnapshot();
      return {
        status: "success",
        quote: this.quote(
          quoteCurrency,
          result.entry,
          result.localStale || result.entry.sourceStale
        )
      };
    } catch (error) {
      return {
        status: "error",
        quoteCurrency,
        message: error instanceof Error ? error.message : "Unknown FX request failure"
      };
    }
  }

  private fetchSnapshot(): Promise<SnapshotResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchSnapshotUnshared().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchSnapshotUnshared(): Promise<SnapshotResult> {
    let cached: FxCacheEntry | null = null;
    try {
      const value = await this.storage.get(CACHE_KEY);
      cached = validCacheEntry(value) ? value : null;
    } catch {
      // Storage failures do not prevent an anonymous FX request.
    }

    const now = this.now();
    if (cached && Math.max(0, now - cached.fetchedAt) < FRESH_TTL) {
      return { entry: cached, localStale: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await this.fetchImpl(CSLYTICS_FX_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        cache: "no-cache",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`FX request failed with HTTP ${response.status}`);
      const value: unknown = await response.json();
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Invalid FX response");
      }
      const record = value as Record<string, unknown>;
      if (
        record.base !== "USD" ||
        !validTimestamp(record.as_of) ||
        typeof record.stale !== "boolean" ||
        !validRates(record.rates)
      ) {
        throw new Error("Invalid FX response");
      }
      const entry: FxCacheEntry = {
        fetchedAt: now,
        asOf: record.as_of,
        sourceStale: record.stale,
        rates: record.rates
      };
      try {
        await this.storage.set(CACHE_KEY, entry);
      } catch {
        // The validated network snapshot remains usable for this page.
      }
      return { entry, localStale: false };
    } catch (error) {
      if (cached && Math.max(0, now - cached.fetchedAt) < STALE_TTL) {
        return { entry: cached, localStale: true };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private quote(
    quote: SteamCurrencyIso,
    entry: FxCacheEntry,
    stale: boolean
  ): FxRateQuote {
    return {
      base: "USD",
      quote,
      rate: entry.rates[quote]!,
      asOf: entry.asOf,
      stale
    };
  }
}
