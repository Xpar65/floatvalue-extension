import { describe, expect, it } from "vitest";
import { createScale, linearScale, logScale, priceDomain } from "../src/ui/scales";

describe("linearScale", () => {
  it("maps the domain onto the range and back", () => {
    const scale = linearScale(0, 100, 200, 0);
    expect(scale.at(0)).toBe(200);
    expect(scale.at(100)).toBe(0);
    expect(scale.at(50)).toBe(100);
    expect(scale.invert(100)).toBeCloseTo(50, 10);
  });

  it("survives a flat curve rather than dividing by zero", () => {
    const scale = linearScale(42, 42, 200, 0);
    expect(Number.isFinite(scale.at(42))).toBe(true);
  });

  it("labels both ends so the axis extent is always readable", () => {
    const { major, minor } = linearScale(0, 100, 200, 0).ticks(4);
    expect(major).toEqual([0, 25, 50, 75, 100]);
    expect(minor).toEqual([]);
  });
});

describe("logScale", () => {
  it("places a decade at an equal pixel distance regardless of magnitude", () => {
    const scale = logScale(1, 1000, 300, 0);
    expect(scale.at(1)).toBeCloseTo(300, 10);
    expect(scale.at(10)).toBeCloseTo(200, 10);
    expect(scale.at(100)).toBeCloseTo(100, 10);
    expect(scale.at(1000)).toBeCloseTo(0, 10);
  });

  it("round-trips through invert", () => {
    const scale = logScale(0.5, 5000, 300, 0);
    expect(scale.invert(scale.at(37.5))).toBeCloseTo(37.5, 6);
  });

  it("parks a non-positive value on the floor instead of emitting -Infinity", () => {
    const scale = logScale(1, 100, 300, 0);
    expect(Number.isFinite(scale.at(0))).toBe(true);
    expect(Number.isFinite(scale.at(-5))).toBe(true);
  });

  it("prefers the sparsest readable mantissa set", () => {
    expect(logScale(434, 2000, 300, 0).ticks(4).major).toEqual([500, 1000, 2000]);
    expect(logScale(50, 5000, 300, 0).ticks(5).major).toEqual([
      50, 100, 200, 500, 1000, 2000, 5000
    ]);
  });

  it("falls back to decade lines alone once 1/2/5 would flood the axis", () => {
    const { major } = logScale(0.01, 10000, 300, 0).ticks(5);
    expect(major).toEqual([0.01, 0.1, 1, 10, 100, 1000, 10000]);
  });

  // The sell dialog graphs one wear, whose fair price rarely spans even a third of a decade.
  // The decade mantissas leave that domain with a line or two, so it is subdivided by a round
  // step instead — still log-positioned, but with a grid dense enough to read as one.
  it("subdivides a sub-decade domain by a round step", () => {
    const { major, minor } = logScale(21, 43, 300, 0).ticks(4);
    expect(major).toEqual([25, 30, 35, 40]);
    expect(minor).toEqual([22.5, 27.5, 32.5, 37.5, 42.5]);
    expect(major.every((value) => value >= 21 && value <= 43)).toBe(true);
  });

  it("keeps the sub-decade step sparse rather than filling the axis with lines", () => {
    expect(logScale(3.65, 7.82, 300, 0).ticks(4).major).toEqual([4, 5, 6, 7]);
    expect(logScale(104, 218, 300, 0).ticks(4).major).toEqual([125, 150, 175, 200]);
    expect(logScale(0.78, 1.61, 300, 0).ticks(4).major).toEqual([1, 1.25, 1.5]);
  });

  it("positions a sub-decade grid logarithmically, not evenly", () => {
    const scale = logScale(21, 43, 300, 0);
    const [first, second, third] = scale.ticks(4).major.map((value) => scale.at(value));
    // Equal value steps land on shrinking pixel gaps: the visual signature of a log axis.
    expect(first! - second!).toBeGreaterThan(second! - third!);
  });

  it("still falls back to geometric spacing when no round step could describe the domain", () => {
    // 30 decades: a round step would crowd every line into the top of the axis.
    const { major, minor } = logScale(1e-20, 1e10, 300, 0).ticks(4);
    expect(major[0]).toBeCloseTo(1e-20, 6);
    expect(major[major.length - 1]).toBeCloseTo(1e10, 6);
    expect(minor).toEqual([]);
  });

  it("draws unlabelled decade subdivisions but never on top of a labelled one", () => {
    const { major, minor } = logScale(434, 2000, 300, 0).ticks(4);
    expect(minor).toEqual([600, 700, 800, 900]);
    expect(minor.some((value) => major.includes(value))).toBe(false);
  });

  it("drops the minor lines once they would smear across too many decades", () => {
    expect(logScale(0.001, 100000, 300, 0).ticks(5).minor).toEqual([]);
  });
});

describe("priceDomain", () => {
  const NO_CAP = Number.POSITIVE_INFINITY;

  it("pads a linear domain and floors it at zero", () => {
    const domain = priceDomain([10, 20], "linear", NO_CAP);
    expect(domain.min).toBeGreaterThanOrEqual(0);
    expect(domain.min).toBeLessThan(10);
    expect(domain.max).toBeGreaterThan(20);
    expect(domain.capped).toBe(false);
  });

  it("never floors a log domain above a real value, however cheap the curve", () => {
    const domain = priceDomain([0.03, 0.09], "log", NO_CAP);
    expect(domain.min).toBeLessThan(0.03);
    expect(domain.max).toBeGreaterThan(0.09);
    expect(domain.droppedNonPositive).toBe(0);
  });

  it("caps at Steam's maximum when an outlier would squash the buyable range", () => {
    const domain = priceDomain([500, 5000], "log", 2000);
    expect(domain.max).toBe(2000);
    expect(domain.capped).toBe(true);
  });

  it("leaves the axis uncapped when everything is above the cap", () => {
    const domain = priceDomain([6000, 9000], "log", 2000);
    expect(domain.capped).toBe(false);
    expect(domain.max).toBeGreaterThan(9000);
  });

  it("counts what a log axis cannot show rather than dropping it silently", () => {
    const domain = priceDomain([0, 5, 10], "log", NO_CAP);
    expect(domain.droppedNonPositive).toBe(1);
    expect(domain.min).toBeGreaterThan(0);
    // Linear can show it, so there is nothing to report there.
    expect(priceDomain([0, 5, 10], "linear", NO_CAP).droppedNonPositive).toBe(0);
  });

  it("falls back to a linear domain when a log axis has nothing positive to show", () => {
    const domain = priceDomain([0, 0], "log", NO_CAP);
    expect(Number.isFinite(domain.min)).toBe(true);
    expect(Number.isFinite(domain.max)).toBe(true);
    expect(domain.max).toBeGreaterThan(domain.min);
  });

  it("returns a usable domain for no values at all", () => {
    const domain = priceDomain([], "log", NO_CAP);
    expect(domain.max).toBeGreaterThan(domain.min);
  });
});

describe("createScale", () => {
  it("selects the implementation by kind", () => {
    expect(createScale("log", 1, 100, 0, 100).kind).toBe("log");
    expect(createScale("linear", 1, 100, 0, 100).kind).toBe("linear");
  });
});
