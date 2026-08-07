import { bidAtFloat } from "./bid-at-float";
import { priceAtFloat } from "./price-at-float";
import type { ValidatedCurve } from "./types";

/**
 * What a listing at a given float is worth to transact against, right now.
 *
 * `low` is `highest_bid` — what you would receive selling into the top standing buy order.
 * `high` is `lowest_ask` — what you would pay buying the cheapest comparable listing.
 *
 * Either side is independently absent: standing buy orders leave float regions uncovered, and a
 * document may carry neither series. Absent is `null` and must render as "no data", never as 0.
 */
export interface EstimateRange {
  low: number | null;
  high: number | null;
}

export function estimateRangeAtFloat(curve: ValidatedCurve, float: number): EstimateRange {
  if (!Number.isFinite(float)) return { low: null, high: null };
  // Outside the paint's own achievable range the curve says nothing, and clamping to an endpoint
  // would invent a price for a float this paint cannot produce.
  if (float < curve.floatRange.min || float > curve.floatRange.max) return { low: null, high: null };
  return {
    low: curve.highestBid ? bidAtFloat(curve.highestBid.segments, float) : null,
    high: curve.lowestAsk ? priceAtFloat(curve.lowestAsk.vertices, float) : null
  };
}

export function hasEstimate(range: EstimateRange): boolean {
  return range.low !== null || range.high !== null;
}
