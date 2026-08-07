import { describe, expect, it } from "vitest";
import { validateCurveResponse } from "../src/domain/curve-validation";

const NAME = "AK-47 | Redline (Field-Tested)";
const valid = {
  venue: "steam",
  market_hash_name: NAME,
  currency: "USD",
  float_range: { min: 0.1, max: 0.7 },
  computed_at: "2026-08-05T02:08:31Z",
  fair_price: {
    vertices: [
      [0.15, 42.15],
      [0.2, 38.44]
    ],
    as_of: "2026-08-05T02:00:00Z"
  }
};

describe("validateCurveResponse", () => {
  it("accepts and maps the FREE Steam contract", () => {
    expect(validateCurveResponse(valid, NAME)).toMatchObject({
      venue: "steam",
      marketHashName: NAME,
      currency: "USD",
      floatRange: { min: 0.1, max: 0.7 }
    });
  });

  it.each([
    ["wrong venue", { ...valid, venue: "csfloat" }],
    ["wrong name", { ...valid, market_hash_name: "Other" }],
    ["wrong currency", { ...valid, currency: "AUD" }],
    ["invalid range", { ...valid, float_range: { min: 0.8, max: 0.7 } }],
    ["empty vertices", { ...valid, fair_price: { ...valid.fair_price, vertices: [] } }],
    [
      "unordered vertices",
      { ...valid, fair_price: { ...valid.fair_price, vertices: [[0.2, 1], [0.15, 2]] } }
    ],
    ["missing timestamp", { ...valid, computed_at: null }]
  ])("rejects %s", (_description, response) => {
    expect(() => validateCurveResponse(response, NAME)).toThrow();
  });

  // The live CDN still publishes documents without these keys; they must keep working.
  it("maps a document with no ask, bid, or listings to explicit nulls", () => {
    const curve = validateCurveResponse(valid, NAME);
    expect(curve.lowestAsk).toBeNull();
    expect(curve.highestBid).toBeNull();
    expect(curve.listings).toBeNull();
  });

  it("maps the contract's ask, bid, and listing fields", () => {
    const curve = validateCurveResponse(
      {
        ...valid,
        lowest_ask: { vertices: [[0.15, 43.2], [0.2, 41]], as_of: "2026-08-05T22:10:00Z" },
        highest_bid: {
          segments: [[[0.15, 39.5], [0.24, 38]], [[0.31, 36], [0.37, 35]]],
          as_of: "2026-08-05T22:05:00Z"
        },
        listings: {
          as_of: "2026-08-05T22:15:00Z",
          entries: [
            { id: "a", float: 0.16345678, price: 43.2 },
            { id: "b", float: 0.3, price: 44 }
          ]
        }
      },
      NAME
    );
    expect(curve.lowestAsk).toEqual({
      vertices: [[0.15, 43.2], [0.2, 41]],
      asOf: "2026-08-05T22:10:00Z"
    });
    expect(curve.highestBid?.segments).toEqual([
      [[0.15, 39.5], [0.24, 38]],
      [[0.31, 36], [0.37, 35]]
    ]);
    expect(curve.listings?.entries).toHaveLength(2);
  });

  it("keeps a complete but empty listing book distinct from no book at all", () => {
    const scanned = validateCurveResponse(
      { ...valid, listings: { as_of: "2026-08-05T22:15:00Z", entries: [] } },
      NAME
    );
    expect(scanned.listings).toEqual({ entries: [], asOf: "2026-08-05T22:15:00Z" });
    expect(validateCurveResponse({ ...valid, listings: null }, NAME).listings).toBeNull();
  });

  it("drops unusable listing entries but keeps the rest of the book", () => {
    const curve = validateCurveResponse(
      {
        ...valid,
        listings: {
          as_of: "2026-08-05T22:15:00Z",
          entries: [
            { id: "good", float: 0.2, price: 40 },
            { id: "no-float", float: null, price: 44 },
            { id: "out-of-range", float: 1.4, price: 44 },
            { id: "no-price", float: 0.25, price: null },
            { float: 0.26, price: 41 },
            "not-an-object"
          ]
        }
      },
      NAME
    );
    expect(curve.listings?.entries).toEqual([{ id: "good", float: 0.2, price: 40 }]);
  });

  // A malformed optional series must never take a working fair_price curve down with it.
  it.each([
    ["a malformed ask", { lowest_ask: { vertices: [[0.2, 1], [0.15, 2]], as_of: "2026-08-05T22:10:00Z" } }],
    ["an ask with no timestamp", { lowest_ask: { vertices: [[0.15, 43.2]] } }],
    ["overlapping bid segments", {
      highest_bid: {
        segments: [[[0.15, 39.5], [0.30, 38]], [[0.24, 36], [0.37, 35]]],
        as_of: "2026-08-05T22:05:00Z"
      }
    }],
    ["out-of-order bid segments", {
      highest_bid: {
        segments: [[[0.31, 36], [0.37, 35]], [[0.15, 39.5], [0.24, 38]]],
        as_of: "2026-08-05T22:05:00Z"
      }
    }],
    ["an empty bid segment list", { highest_bid: { segments: [], as_of: "2026-08-05T22:05:00Z" } }],
    ["listings that are not an array", { listings: { as_of: "2026-08-05T22:15:00Z", entries: {} } }]
  ])("degrades %s to no data instead of throwing", (_description, patch) => {
    const curve = validateCurveResponse({ ...valid, ...patch }, NAME);
    expect(curve.fairPrice.vertices).toHaveLength(2);
    expect(curve.lowestAsk ?? curve.highestBid ?? curve.listings).toBeNull();
  });
});
