import { priceAtFloat } from "./price-at-float";
import type { CurveVertex } from "./types";

/**
 * Evaluate `highest_bid` at a raw float, per the frozen Cslytics v1 contract.
 *
 * Standing buy orders leave float regions uncovered, so the bid curve is a list of ordered,
 * non-overlapping segments. Linear interpolation applies *within* a segment; the price is null
 * before the first segment, **between** segments, and after the last. Never bridge a gap.
 *
 * The containment check below is what enforces that: `priceAtFloat` flat-clamps outside its own
 * range, so handing it a segment that doesn't cover `f` returns a confident wrong number in
 * exactly the cases that must be null.
 */
export function bidAtFloat(
  segments: readonly (readonly CurveVertex[])[] | null | undefined,
  f: number
): number | null {
  if (!segments || segments.length === 0) return null;
  if (!Number.isFinite(f)) return null;
  for (const segment of segments) {
    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) continue;
    if (f < first[0]) return null; // Segments are ordered: a miss here is a gap, not a later hit.
    if (f <= last[0]) return priceAtFloat(segment, f);
  }
  return null;
}
