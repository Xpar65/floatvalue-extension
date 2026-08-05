import { describe, expect, it } from "vitest";
import { priceAtFloat } from "../src/domain/price-at-float";
import type { CurveVertex } from "../src/domain/types";

const VERTICES: CurveVertex[] = [
  [0.15, 11.2],
  [0.1832, 10.65],
  [0.25, 9.28],
  [0.37, 9.17]
];

describe("priceAtFloat frozen contract", () => {
  it("returns exact vertex prices", () => {
    for (const [float, price] of VERTICES) expect(priceAtFloat(VERTICES, float)).toBeCloseTo(price);
  });

  it("interpolates linearly between vertices", () => {
    expect(priceAtFloat(VERTICES, 0.31)).toBeCloseTo((9.28 + 9.17) / 2);
  });

  it("clamps flat below the first vertex", () => {
    expect(priceAtFloat(VERTICES, 0)).toBeCloseTo(11.2);
    expect(priceAtFloat(VERTICES, 0.1499)).toBeCloseTo(11.2);
  });

  it("clamps flat above the last vertex", () => {
    expect(priceAtFloat(VERTICES, 0.3701)).toBeCloseTo(9.17);
    expect(priceAtFloat(VERTICES, 1)).toBeCloseTo(9.17);
  });

  it("never uses nearest-neighbour", () => {
    const result = priceAtFloat(VERTICES, 0.19);
    expect(result).not.toBeCloseTo(10.65);
    expect(result).toBeGreaterThan(9.28);
    expect(result).toBeLessThan(10.65);
  });

  it("keeps a single vertex flat everywhere", () => {
    expect(priceAtFloat([[0.2, 5]], 0)).toBe(5);
    expect(priceAtFloat([[0.2, 5]], 0.99)).toBe(5);
  });

  it("returns null for empty or absent vertices", () => {
    expect(priceAtFloat([], 0.2)).toBeNull();
    expect(priceAtFloat(undefined, 0.2)).toBeNull();
  });

  it("stays monotonic over a monotonic curve", () => {
    const prices = Array.from({ length: 221 }, (_, index) =>
      priceAtFloat(VERTICES, (150 + index) / 1000)
    );
    expect(prices).toEqual([...prices].sort((a, b) => (b ?? 0) - (a ?? 0)));
  });
});
