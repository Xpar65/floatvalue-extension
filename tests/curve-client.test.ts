import { describe, expect, it, vi } from "vitest";
import { CurveCache, type StorageAdapter } from "../src/background/curve-cache";
import { SteamCurveClient } from "../src/background/curve-client";
import { nameHash } from "../src/domain/name-hash";
import { makeCurve } from "./fixtures";

class MemoryStorage implements StorageAdapter {
  values = new Map<string, unknown>();
  async get(key: string): Promise<unknown> { return this.values.get(key); }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

class FailingStorage implements StorageAdapter {
  async get(): Promise<unknown> { throw new Error("storage unavailable"); }
  async set(): Promise<void> { throw new Error("storage unavailable"); }
}

const NAME = "AK-47 | Redline (Field-Tested)";
const responseBody = {
  venue: "steam",
  market_hash_name: NAME,
  currency: "USD",
  float_range: { min: 0.1, max: 0.7 },
  computed_at: "2026-08-05T02:08:31Z",
  fair_price: {
    vertices: [[0.15, 42.15], [0.2, 38.44]],
    as_of: "2026-08-05T02:00:00Z"
  }
};

describe("SteamCurveClient", () => {
  it("deduplicates concurrent names and then serves the successful cache", async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"curve-1"' }
      })
    );
    const client = new SteamCurveClient(
      new CurveCache(storage),
      fetchMock as unknown as typeof fetch,
      undefined,
      () => Date.parse("2026-08-05T03:00:00Z")
    );
    const outcomes = await client.fetchMany([NAME, NAME]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "success", stale: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(client.fetchOne(NAME)).resolves.toMatchObject({ status: "success", stale: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("negative-caches 404 without fabricating a curve", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new SteamCurveClient(
      new CurveCache(new MemoryStorage()),
      fetchMock as unknown as typeof fetch,
      undefined,
      () => Date.parse("2026-08-05T03:00:00Z")
    );
    await expect(client.fetchOne(NAME)).resolves.toEqual({ status: "missing", marketHashName: NAME });
    await expect(client.fetchOne(NAME)).resolves.toEqual({ status: "missing", marketHashName: NAME });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back explicitly to stale successful data on a refresh error", async () => {
    const storage = new MemoryStorage();
    const cache = new CurveCache(storage);
    const hash = await nameHash(NAME);
    await cache.set(hash, {
      kind: "success",
      fetchedAt: Date.parse("2026-08-04T00:00:00Z"),
      curve: makeCurve(NAME)
    });
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    const client = new SteamCurveClient(
      cache,
      fetchMock as unknown as typeof fetch,
      undefined,
      () => Date.parse("2026-08-06T03:00:00Z")
    );
    await expect(client.fetchOne(NAME)).resolves.toMatchObject({
      status: "success",
      marketHashName: NAME,
      stale: true
    });
  });

  it("still serves a validated network curve when local storage fails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new SteamCurveClient(
      new CurveCache(new FailingStorage()),
      fetchMock as unknown as typeof fetch,
      undefined,
      () => Date.parse("2026-08-05T03:00:00Z")
    );
    await expect(client.fetchOne(NAME)).resolves.toMatchObject({ status: "success", stale: false });
  });
});
