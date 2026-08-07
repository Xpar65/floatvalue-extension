/**
 * Axis scales and tick generation for the float-curve graph.
 *
 * Hand-rolled rather than taken from d3: this whole module is smaller than the manifest, against
 * ~50 KB of d3-scale/d3-axis/d3-zoom bundled into *both* content scripts and parsed at
 * `document_idle` on every Steam market and inventory page — including the ones where the user
 * never opens a graph. `d3-axis` also renders its own DOM and inline colours, which the token
 * discipline in `tokens.ts` forbids.
 */

export type AxisScaleKind = "linear" | "log";

/** Values a grid draws. `major` is labelled; `minor` is a line only. */
export interface AxisTicks {
  major: number[];
  minor: number[];
}

export interface AxisScale {
  readonly kind: AxisScaleKind;
  readonly min: number;
  readonly max: number;
  /** Data value → pixel. */
  at(value: number): number;
  /** Pixel → data value. */
  invert(pixel: number): number;
  ticks(target: number): AxisTicks;
}

/** Padding applied to a log price domain, as a multiplicative factor rather than an addition. */
const LOG_PAD = 1.15;

/**
 * Mantissas tried in order, sparsest first. The sparsest set that produces a readable number of
 * lines wins, so a decade-spanning axis reads 1/2/5 rather than 1/1.5/2/3/5/7.
 */
const MANTISSA_SETS: readonly (readonly number[])[] = [[1], [1, 2, 5], [1, 1.5, 2, 3, 5, 7]];

/** Everything a 1/2/5 axis does not label, so the decade structure still reads between labels. */
const MINOR_MANTISSAS = [3, 4, 6, 7, 8, 9];

/** Below this many decades the minor lines help; above it they turn into a smear. */
const MAX_MINOR_DECADES = 4;

/**
 * Steps a sub-decade axis is subdivided by, sparsest first and scaled to the domain's own
 * magnitude. Round money values placed at their true log positions: the labels stay readable and
 * the uneven pixel spacing still says "log".
 */
const NICE_STEPS = [10, 5, 2.5, 2, 1, 0.5, 0.25, 0.2, 0.1];

/** Fewest labelled lines a decade axis is willing to carry before it subdivides instead. */
const MIN_LOG_MAJOR = 3;

/** Past this the round-step grid crowds into the top of the axis; geometric spacing is honest. */
const MAX_NARROW_DECADES = 2;

/** Guards a pathological domain from spinning out thousands of lines. */
const MAX_STEP_LINES = 200;

export function linearScale(
  min: number,
  max: number,
  rangeFrom: number,
  rangeTo: number
): AxisScale {
  // A flat curve is a real document, not an error — give it a domain rather than dividing by zero.
  const span = max - min || 1;
  const pixels = rangeTo - rangeFrom;
  return {
    kind: "linear",
    min,
    max,
    at: (value) => rangeFrom + ((value - min) / span) * pixels,
    invert: (pixel) => min + ((pixel - rangeFrom) / pixels) * span,
    ticks: (target) => ({ major: evenlySpaced(min, max, target), minor: [] })
  };
}

export function logScale(min: number, max: number, rangeFrom: number, rangeTo: number): AxisScale {
  const safeMin = min > 0 ? min : Number.MIN_VALUE;
  const safeMax = max > safeMin ? max : safeMin * 10;
  const logMin = Math.log10(safeMin);
  const span = Math.log10(safeMax) - logMin || 1;
  const pixels = rangeTo - rangeFrom;
  return {
    kind: "log",
    min: safeMin,
    max: safeMax,
    // A non-positive value has no place on a log axis; park it at the floor and let the plot's
    // clip path deal with it, rather than emitting an -Infinity coordinate that poisons the path.
    at: (value) =>
      value > 0 ? rangeFrom + ((Math.log10(value) - logMin) / span) * pixels : rangeFrom,
    invert: (pixel) => 10 ** (logMin + ((pixel - rangeFrom) / pixels) * span),
    ticks: (target) => logTicks(safeMin, safeMax, target)
  };
}

export function createScale(
  kind: AxisScaleKind,
  min: number,
  max: number,
  rangeFrom: number,
  rangeTo: number
): AxisScale {
  return kind === "log"
    ? logScale(min, max, rangeFrom, rangeTo)
    : linearScale(min, max, rangeFrom, rangeTo);
}

function evenlySpaced(min: number, max: number, divisions: number): number[] {
  const steps = Math.max(1, Math.round(divisions));
  return Array.from({ length: steps + 1 }, (_, index) => min + ((max - min) * index) / steps);
}

function collectMantissas(mantissas: readonly number[], min: number, max: number): number[] {
  const values: number[] = [];
  const first = Math.floor(Math.log10(min));
  const last = Math.ceil(Math.log10(max));
  // A pathological domain (a sub-cent floor against a four-figure cap) would otherwise spin
  // through hundreds of decades to produce a handful of usable lines.
  if (last - first > 24) return values;
  for (let exponent = first; exponent <= last; exponent += 1) {
    for (const mantissa of mantissas) {
      const value = mantissa * 10 ** exponent;
      if (value >= min && value <= max) values.push(value);
    }
  }
  return values;
}

function logTicks(min: number, max: number, target: number): AxisTicks {
  const budget = Math.round(target) + 2;
  let major: number[] = [];
  for (const mantissas of MANTISSA_SETS) {
    const values = collectMantissas(mantissas, min, max);
    if (values.length > budget) break;
    major = values;
    // Sparsest readable set wins: stop as soon as one carries the axis on its own.
    if (values.length >= MIN_LOG_MAJOR) break;
  }
  const decades = Math.log10(max) - Math.log10(min);
  // One wear's fair price rarely spans even a third of a decade, so the decade mantissas above
  // leave it with a line or two and nothing between them. Subdivide it by a round step instead:
  // the sell dialog graphs exactly this case, and a bare axis there read as a linear one.
  if (major.length < MIN_LOG_MAJOR) {
    return decades <= MAX_NARROW_DECADES
      ? narrowLogTicks(min, max, target)
      : { major: geometricallySpaced(min, max, target), minor: [] };
  }
  const minor =
    decades <= MAX_MINOR_DECADES
      ? collectMantissas(MINOR_MANTISSAS, min, max).filter((value) => !major.includes(value))
      : [];
  return { major, minor };
}

/** Every multiple of `step` inside the domain, derived from the index so a fractional step
 *  cannot accumulate rounding error across the axis. */
function multiplesWithin(step: number, min: number, max: number): number[] {
  const values: number[] = [];
  if (!(step > 0) || !Number.isFinite(step)) return values;
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first > MAX_STEP_LINES) {
    return values;
  }
  for (let index = first; index <= last; index += 1) values.push(index * step);
  return values;
}

/**
 * A log grid for a domain too narrow to hold enough round decades. Values are round, positions are
 * logarithmic, and the sparsest step that still describes the axis wins — the same rule the decade
 * mantissas follow, applied inside a decade. Halving that step gives the unlabelled subdivisions.
 */
function narrowLogTicks(min: number, max: number, target: number): AxisTicks {
  const span = max - min;
  if (!(span > 0)) return { major: geometricallySpaced(min, max, target), minor: [] };
  const magnitude = 10 ** Math.floor(Math.log10(span));
  let major: number[] = [];
  let step = 0;
  for (const candidate of NICE_STEPS) {
    const scaled = candidate * magnitude;
    const values = multiplesWithin(scaled, min, max);
    if (values.length >= MIN_LOG_MAJOR) {
      major = values;
      step = scaled;
      break;
    }
  }
  if (major.length < 2) return { major: geometricallySpaced(min, max, target), minor: [] };
  const tolerance = step * 1e-6;
  const minor = multiplesWithin(step / 2, min, max).filter(
    (value) => !major.some((labelled) => Math.abs(labelled - value) <= tolerance)
  );
  return { major, minor };
}

function geometricallySpaced(min: number, max: number, divisions: number): number[] {
  const steps = Math.max(1, Math.round(divisions));
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return Array.from(
    { length: steps + 1 },
    (_, index) => 10 ** (logMin + ((logMax - logMin) * index) / steps)
  );
}

export interface PriceDomain {
  min: number;
  max: number;
  /** True when Steam's per-purchase maximum, not the data, decided the top of the axis. */
  capped: boolean;
  /** Positive values a log axis cannot show. Never silently dropped — the caller must say so. */
  droppedNonPositive: number;
}

/**
 * The price domain for a set of plotted values.
 *
 * Nothing real is ever placed outside the returned domain: a log axis floors at the smallest
 * *positive* value present rather than at a fixed constant, so a genuinely cheap curve renders as
 * a cheap curve instead of vanishing under the axis and reading as "no data".
 *
 * `capValue` is Steam's per-purchase maximum in display currency. Anything above it is unbuyable,
 * so an outlier up there must not squash the range that is — but if *everything* is above the cap,
 * capping would leave an empty plot, so the axis is left uncapped instead.
 */
export function priceDomain(
  values: readonly number[],
  kind: AxisScaleKind,
  capValue: number
): PriceDomain {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { min: 0, max: 1, capped: false, droppedNonPositive: 0 };

  const positive = finite.filter((value) => value > 0);
  const useLog = kind === "log" && positive.length > 0;
  const considered = useLog ? positive : finite;
  const lowest = Math.min(...considered);
  const highest = Math.max(...considered);

  let min: number;
  let max: number;
  if (useLog) {
    min = lowest / LOG_PAD;
    max = highest * LOG_PAD;
  } else {
    const padding = Math.max((highest - lowest) * 0.1, highest * 0.025, 0.01);
    min = Math.max(0, lowest - padding);
    max = highest + padding;
  }

  const capped = max > capValue && min < capValue;
  if (capped) max = capValue;

  return {
    min,
    max,
    capped,
    droppedNonPositive: useLog ? finite.length - positive.length : 0
  };
}
