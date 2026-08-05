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
});
