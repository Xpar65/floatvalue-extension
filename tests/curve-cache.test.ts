import { describe, expect, it } from "vitest";
import {
  cacheEntryIsFresh,
  CurveCache,
  CURVE_CACHE_SCHEMA,
  type StorageAdapter
} from "../src/background/curve-cache";
import { makeCurve } from "./fixtures";

class MemoryStorage implements StorageAdapter {
  values = new Map<string, unknown>();
  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

const schema = CURVE_CACHE_SCHEMA;

describe("CurveCache", () => {
  it("round-trips entries through its storage adapter", async () => {
    const storage = new MemoryStorage();
    const cache = new CurveCache(storage);
    const entry = { kind: "missing" as const, schema, fetchedAt: 123 };
    await cache.set("hash", entry);
    await expect(cache.get("hash")).resolves.toEqual(entry);
  });

  it("uses a shorter negative-cache lifetime", () => {
    const now = Date.parse("2026-08-05T12:00:00Z");
    expect(cacheEntryIsFresh({ kind: "missing", schema, fetchedAt: now - 5 * 60 * 60 * 1000 }, now)).toBe(true);
    expect(cacheEntryIsFresh({ kind: "missing", schema, fetchedAt: now - 7 * 60 * 60 * 1000 }, now)).toBe(false);
  });

  it("rechecks already-old successful source data sooner", () => {
    const fetchedAt = Date.parse("2026-08-06T02:00:00Z");
    const curve = makeCurve("name");
    expect(cacheEntryIsFresh({ kind: "success", schema, fetchedAt, curve }, fetchedAt + 30 * 60 * 1000)).toBe(true);
    expect(cacheEntryIsFresh({ kind: "success", schema, fetchedAt, curve }, fetchedAt + 2 * 60 * 60 * 1000)).toBe(false);
  });

  it("rejects an entry written before the curve shape changed, so it is refetched", async () => {
    const storage = new MemoryStorage();
    const cache = new CurveCache(storage);
    // A schema-1 entry: no lowestAsk/highestBid/listings on the curve it carries.
    storage.values.set("steam-curve:hash", { kind: "success", fetchedAt: 123, curve: makeCurve("name") });
    await expect(cache.get("hash")).resolves.toBeNull();

    // The refetched entry overwrites the same key rather than orphaning the old one.
    await cache.set("hash", { kind: "missing", schema, fetchedAt: 456 });
    expect([...storage.values.keys()]).toEqual(["steam-curve:hash"]);
  });
});
