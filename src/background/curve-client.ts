import { validateCurveResponse } from "../domain/curve-validation";
import { nameHash } from "../domain/name-hash";
import type { CurveFetchOutcome } from "../domain/types";
import {
  cacheEntryIsFresh,
  CurveCache,
  type CurveCacheEntry
} from "./curve-cache";

const FREE_STEAM_BASE = "https://api.cslytics.com/free/v1/steam/curves";

class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

export class SteamCurveClient {
  private readonly inFlight = new Map<string, Promise<CurveFetchOutcome>>();

  constructor(
    private readonly cache = new CurveCache(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly limiter = new ConcurrencyLimiter(8),
    private readonly now: () => number = Date.now
  ) {}

  async fetchMany(marketHashNames: readonly string[]): Promise<CurveFetchOutcome[]> {
    const names = [...new Set(marketHashNames)];
    return Promise.all(names.map((name) => this.fetchOne(name)));
  }

  async fetchOne(marketHashName: string): Promise<CurveFetchOutcome> {
    const existing = this.inFlight.get(marketHashName);
    if (existing) return existing;
    const request = this.fetchOneUnshared(marketHashName).finally(() => {
      this.inFlight.delete(marketHashName);
    });
    this.inFlight.set(marketHashName, request);
    return request;
  }

  private async fetchOneUnshared(marketHashName: string): Promise<CurveFetchOutcome> {
    const hash = await nameHash(marketHashName);
    let cached: CurveCacheEntry | null = null;
    try {
      cached = await this.cache.get(hash);
    } catch {
      // A storage outage/quota problem must not prevent a public curve fetch.
    }
    const now = this.now();
    if (cached && cacheEntryIsFresh(cached, now)) {
      return this.outcomeFromCache(marketHashName, cached, false);
    }

    return this.limiter.run(async () => {
      try {
        const headers = new Headers({ Accept: "application/json" });
        if (cached?.kind === "success" && cached.etag) {
          headers.set("If-None-Match", cached.etag);
        }
        const response = await this.fetchImpl(`${FREE_STEAM_BASE}/${hash}.json`, {
          method: "GET",
          headers,
          credentials: "omit",
          cache: "no-cache"
        });

        if (response.status === 304 && cached?.kind === "success") {
          const refreshed: CurveCacheEntry = { ...cached, fetchedAt: now };
          await this.persistBestEffort(hash, refreshed);
          return this.outcomeFromCache(marketHashName, refreshed, false);
        }
        if (response.status === 404) {
          const missing: CurveCacheEntry = { kind: "missing", fetchedAt: now };
          await this.persistBestEffort(hash, missing);
          return { status: "missing", marketHashName };
        }
        if (!response.ok) throw new Error(`Curve request failed with HTTP ${response.status}`);

        const curve = validateCurveResponse(await response.json(), marketHashName);
        const etag = response.headers.get("ETag");
        const success: CurveCacheEntry = etag
          ? { kind: "success", fetchedAt: now, curve, etag }
          : { kind: "success", fetchedAt: now, curve };
        await this.persistBestEffort(hash, success);
        return { status: "success", marketHashName, curve, stale: false };
      } catch (error) {
        if (cached?.kind === "success") {
          return this.outcomeFromCache(marketHashName, cached, true);
        }
        return {
          status: "error",
          marketHashName,
          message: error instanceof Error ? error.message : "Unknown curve request failure"
        };
      }
    });
  }

  private outcomeFromCache(
    marketHashName: string,
    entry: CurveCacheEntry,
    stale: boolean
  ): CurveFetchOutcome {
    return entry.kind === "success"
      ? { status: "success", marketHashName, curve: entry.curve, stale }
      : { status: "missing", marketHashName };
  }

  private async persistBestEffort(hash: string, entry: CurveCacheEntry): Promise<void> {
    try {
      await this.cache.set(hash, entry);
    } catch {
      // Keep serving the validated network result. The next page may have to fetch again.
    }
  }
}
