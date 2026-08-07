import { describe, expect, it } from "vitest";
import { estimateRangeAtFloat, hasEstimate } from "../src/domain/estimate-range";
import { makeCurve } from "./fixtures";

const WITH_BOTH = makeCurve("Example (Field-Tested)", undefined, {
  lowestAsk: { asOf: "2026-08-05T22:10:00Z", vertices: [[0.15, 45], [0.37, 38]] },
  highestBid: { asOf: "2026-08-05T22:05:00Z", segments: [[[0.15, 30], [0.24, 28]]] }
});

describe("estimateRangeAtFloat", () => {
  it("reads low from highest_bid and high from lowest_ask", () => {
    const range = estimateRangeAtFloat(WITH_BOTH, 0.15);
    expect(range.low).toBeCloseTo(30, 6);
    expect(range.high).toBeCloseTo(45, 6);
  });

  it("interpolates both sides at the listing's own float", () => {
    const range = estimateRangeAtFloat(WITH_BOTH, 0.195);
    expect(range.low).toBeGreaterThan(28);
    expect(range.low).toBeLessThan(30);
    expect(range.high).toBeGreaterThan(38);
    expect(range.high).toBeLessThan(45);
  });

  it("returns no bid inside a gap between buy-order segments rather than bridging it", () => {
    const range = estimateRangeAtFloat(WITH_BOTH, 0.3);
    // 0.3 is past the single bid segment's end but still covered by the ask curve.
    expect(range.low).toBeNull();
    expect(range.high).not.toBeNull();
  });

  it("reports an absent series as no data, never as zero", () => {
    const range = estimateRangeAtFloat(makeCurve("plain"), 0.2);
    expect(range.low).toBeNull();
    expect(range.high).toBeNull();
    expect(hasEstimate(range)).toBe(false);
  });

  it("refuses to price a float the paint cannot produce", () => {
    // The fixture paint spans 0.10–0.70; clamping to an endpoint would invent a price.
    expect(estimateRangeAtFloat(WITH_BOTH, 0.05)).toEqual({ low: null, high: null });
    expect(estimateRangeAtFloat(WITH_BOTH, 0.95)).toEqual({ low: null, high: null });
    expect(estimateRangeAtFloat(WITH_BOTH, Number.NaN)).toEqual({ low: null, high: null });
  });

  it("counts one usable side as an estimate", () => {
    expect(hasEstimate({ low: 12, high: null })).toBe(true);
    expect(hasEstimate({ low: null, high: 12 })).toBe(true);
    expect(hasEstimate({ low: null, high: null })).toBe(false);
  });
});
