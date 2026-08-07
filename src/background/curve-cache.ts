import type { ValidatedCurve } from "../domain/types";

const HOUR = 60 * 60 * 1000;
const SUCCESS_FRESHNESS_BUDGET = 26 * HOUR;
const SUCCESS_MAX_LOCAL_TTL = 24 * HOUR;
const SUCCESS_MIN_RECHECK = HOUR;
const MISSING_TTL = 6 * HOUR;

/**
 * Bumped whenever `ValidatedCurve` gains or changes a field. Entries written by an older schema
 * fail validation, get refetched, and overwrite the same key — so no stale-shaped curve reaches
 * the UI and no orphaned keys accumulate (there is no eviction pass, and `StorageAdapter` cannot
 * enumerate keys, so a key-prefix bump would leak the old entries forever).
 *
 * 2 — added `lowestAsk`, `highestBid`, and `listings`.
 */
export const CURVE_CACHE_SCHEMA = 2;

export type CurveCacheEntry =
  | {
      kind: "success";
      schema: number;
      fetchedAt: number;
      curve: ValidatedCurve;
      etag?: string;
    }
  | {
      kind: "missing";
      schema: number;
      fetchedAt: number;
    };

export interface StorageAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class ChromeStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<unknown> {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }
}

function isValidCacheEntry(value: unknown): value is CurveCacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schema !== CURVE_CACHE_SCHEMA) return false;
  if (record.kind === "missing") return typeof record.fetchedAt === "number";
  return (
    record.kind === "success" &&
    typeof record.fetchedAt === "number" &&
    typeof record.curve === "object" &&
    record.curve !== null
  );
}

export function cacheEntryIsFresh(entry: CurveCacheEntry, now = Date.now()): boolean {
  const localAge = Math.max(0, now - entry.fetchedAt);
  if (entry.kind === "missing") return localAge < MISSING_TTL;

  const sourceTime = Math.min(
    Date.parse(entry.curve.computedAt),
    Date.parse(entry.curve.fairPrice.asOf)
  );
  const sourceAgeAtFetch = Number.isFinite(sourceTime)
    ? Math.max(0, entry.fetchedAt - sourceTime)
    : SUCCESS_FRESHNESS_BUDGET;
  const remainingBudget = Math.max(
    SUCCESS_MIN_RECHECK,
    SUCCESS_FRESHNESS_BUDGET - sourceAgeAtFetch
  );
  return localAge < Math.min(SUCCESS_MAX_LOCAL_TTL, remainingBudget);
}

export class CurveCache {
  constructor(private readonly storage: StorageAdapter = new ChromeStorageAdapter()) {}

  private key(nameHash: string): string {
    return `steam-curve:${nameHash}`;
  }

  async get(nameHash: string): Promise<CurveCacheEntry | null> {
    const value = await this.storage.get(this.key(nameHash));
    return isValidCacheEntry(value) ? value : null;
  }

  async set(nameHash: string, entry: CurveCacheEntry): Promise<void> {
    await this.storage.set(this.key(nameHash), entry);
  }
}
