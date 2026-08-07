import { describe, expect, it, vi } from "vitest";

import { FxRateClient } from "../src/background/fx-rate-client";
import type { StorageAdapter } from "../src/background/curve-cache";
import { STEAM_CURRENCY_CODES } from "../src/domain/steam-currency-codes";

const NOW = Date.parse("2026-08-06T06:00:00Z");
const AS_OF = "2026-08-06T02:00:00Z";
const HOUR = 60 * 60 * 1000;

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

function allRates(): Record<string, number> {
  return Object.fromEntries(
    Object.values(STEAM_CURRENCY_CODES).map((currency, index) => [
      currency,
      currency === "USD" ? 1 : 1 + index / 10
    ])
  );
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    base: "USD",
    as_of: AS_OF,
    stale: false,
    rates: allRates(),
    ...overrides
  };
}

describe("FxRateClient", () => {
  it("returns USD without storage or a network request", async () => {
    const fetchImpl = vi.fn();
    const outcome = await new FxRateClient(
      new MemoryStorage(),
      fetchImpl as unknown as typeof fetch,
      () => NOW
    ).fetchRate("USD");

    expect(outcome).toMatchObject({
      status: "success",
      quote: { base: "USD", quote: "USD", rate: 1, stale: false }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches the one Cslytics snapshot and shares it across currencies", async () => {
    const rates = allRates();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      response(document({ rates }))
    );
    const storage = new MemoryStorage();
    const client = new FxRateClient(
      storage,
      fetchImpl as unknown as typeof fetch,
      () => NOW
    );

    const [aud, eur] = await Promise.all([
      client.fetchRate("AUD"),
      client.fetchRate("EUR")
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.cslytics.com/free/v1/fx-rates.json"
    );
    expect(aud).toMatchObject({
      status: "success",
      quote: { quote: "AUD", rate: rates.AUD, asOf: AS_OF, stale: false }
    });
    expect(eur).toMatchObject({
      status: "success",
      quote: { quote: "EUR", rate: rates.EUR, asOf: AS_OF, stale: false }
    });
    expect(storage.values.has("usd-fx:snapshot:v1")).toBe(true);
  });

  it("uses a locally cached snapshot for 12 hours", async () => {
    const storage = new MemoryStorage();
    storage.values.set("usd-fx:snapshot:v1", {
      fetchedAt: NOW - 11 * HOUR,
      asOf: AS_OF,
      sourceStale: false,
      rates: allRates()
    });
    const fetchImpl = vi.fn();
    const outcome = await new FxRateClient(
      storage,
      fetchImpl as unknown as typeof fetch,
      () => NOW
    ).fetchRate("GBP");

    expect(outcome).toMatchObject({ status: "success", quote: { stale: false } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("propagates the source stale flag", async () => {
    const fetchImpl = vi.fn(async () => response(document({ stale: true })));
    const outcome = await new FxRateClient(
      new MemoryStorage(),
      fetchImpl as unknown as typeof fetch,
      () => NOW
    ).fetchRate("AUD");

    expect(outcome).toMatchObject({ status: "success", quote: { stale: true } });
  });

  it("uses a labelled seven-day stale fallback when refresh fails", async () => {
    const storage = new MemoryStorage();
    storage.values.set("usd-fx:snapshot:v1", {
      fetchedAt: NOW - 2 * 24 * HOUR,
      asOf: AS_OF,
      sourceStale: false,
      rates: allRates()
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const outcome = await new FxRateClient(
      storage,
      fetchImpl as unknown as typeof fetch,
      () => NOW
    ).fetchRate("AUD");

    expect(outcome).toMatchObject({ status: "success", quote: { stale: true } });
  });

  it("rejects incomplete documents and expired fallbacks", async () => {
    const storage = new MemoryStorage();
    const rates = allRates();
    delete rates.AUD;
    storage.values.set("usd-fx:snapshot:v1", {
      fetchedAt: NOW - 8 * 24 * HOUR,
      asOf: AS_OF,
      sourceStale: false,
      rates: allRates()
    });
    const fetchImpl = vi.fn(async () => response(document({ rates })));
    const outcome = await new FxRateClient(
      storage,
      fetchImpl as unknown as typeof fetch,
      () => NOW
    ).fetchRate("AUD");

    expect(outcome).toEqual({
      status: "error",
      quoteCurrency: "AUD",
      message: "Invalid FX response"
    });
  });

  it("rejects unsupported wallet currencies", async () => {
    const outcome = await new FxRateClient(new MemoryStorage()).fetchRate("XYZ");
    expect(outcome).toEqual({
      status: "error",
      quoteCurrency: "XYZ",
      message: "Unsupported Steam wallet currency"
    });
  });
});
