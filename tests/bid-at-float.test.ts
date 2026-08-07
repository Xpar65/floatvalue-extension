import { describe, expect, it } from "vitest";
import { bidAtFloat } from "../src/domain/bid-at-float";
import type { CurveVertex } from "../src/domain/types";

// The worked example from the frozen contract: coverage over [0.15, 0.24] and [0.31, 0.37].
const SEGMENTS: CurveVertex[][] = [
  [
    [0.15, 10],
    [0.24, 8]
  ],
  [
    [0.31, 6],
    [0.37, 4]
  ]
];

describe("bidAtFloat", () => {
  it("returns null before the first segment", () => {
    expect(bidAtFloat(SEGMENTS, 0.14)).toBeNull();
  });

  it("interpolates linearly inside a segment", () => {
    expect(bidAtFloat(SEGMENTS, 0.195)).toBeCloseTo(9, 10);
    expect(bidAtFloat(SEGMENTS, 0.34)).toBeCloseTo(5, 10);
  });

  it("returns the endpoint price at a segment boundary", () => {
    expect(bidAtFloat(SEGMENTS, 0.15)).toBe(10);
    expect(bidAtFloat(SEGMENTS, 0.24)).toBe(8);
    expect(bidAtFloat(SEGMENTS, 0.31)).toBe(6);
    expect(bidAtFloat(SEGMENTS, 0.37)).toBe(4);
  });

  // The defining case: nearest-segment clamping would answer 8 or 6 here, both wrong.
  it("returns null in the gap between segments and never bridges it", () => {
    expect(bidAtFloat(SEGMENTS, 0.27)).toBeNull();
    expect(bidAtFloat(SEGMENTS, 0.2401)).toBeNull();
    expect(bidAtFloat(SEGMENTS, 0.3099)).toBeNull();
  });

  it("returns null after the last segment instead of clamping flat", () => {
    expect(bidAtFloat(SEGMENTS, 0.4)).toBeNull();
    expect(bidAtFloat(SEGMENTS, 1)).toBeNull();
  });

  it("treats an absent or empty bid curve as no data", () => {
    expect(bidAtFloat(null, 0.2)).toBeNull();
    expect(bidAtFloat(undefined, 0.2)).toBeNull();
    expect(bidAtFloat([], 0.2)).toBeNull();
    expect(bidAtFloat(SEGMENTS, Number.NaN)).toBeNull();
  });

  it("evaluates a single-vertex segment only at that exact float", () => {
    const point: CurveVertex[][] = [[[0.2, 5]]];
    expect(bidAtFloat(point, 0.2)).toBe(5);
    expect(bidAtFloat(point, 0.19)).toBeNull();
    expect(bidAtFloat(point, 0.21)).toBeNull();
  });
});
