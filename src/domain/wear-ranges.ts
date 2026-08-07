import type { Wear, WearOrder } from "./types";

export interface WearRange {
  wear: Wear;
  order: WearOrder;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  color: string;
}

export const WEAR_RANGES: readonly WearRange[] = [
  {
    wear: "factory-new",
    order: 0,
    label: "Factory New",
    shortLabel: "FN",
    min: 0,
    max: 0.07,
    color: "#6fb5ff"
  },
  {
    wear: "minimal-wear",
    order: 1,
    label: "Minimal Wear",
    shortLabel: "MW",
    min: 0.07,
    max: 0.15,
    color: "#82b461"
  },
  {
    wear: "field-tested",
    order: 2,
    label: "Field-Tested",
    shortLabel: "FT",
    min: 0.15,
    max: 0.38,
    // Deliberately not amber: #dcb259 was close enough to --cs-accent (#FFB900) that an FT curve
    // read as selected UI rather than data. See the style guide's colour-conflict section.
    color: "#c08a4a"
  },
  {
    wear: "well-worn",
    order: 3,
    label: "Well-Worn",
    shortLabel: "WW",
    min: 0.38,
    max: 0.45,
    color: "#bb6454"
  },
  {
    wear: "battle-scarred",
    order: 4,
    label: "Battle-Scarred",
    shortLabel: "BS",
    min: 0.45,
    max: 1,
    color: "#84453b"
  }
];

/**
 * The internal float boundaries between wear tiers (0.07, 0.15, 0.38, 0.45). Not 0 or 1: those are
 * the ends of the axis, not divisions within it. Each boundary carries the colour of the tier it
 * opens, so a divider reads as the start of that band rather than as another grid line.
 */
export const WEAR_BOUNDARIES: readonly { at: number; color: string }[] = WEAR_RANGES.slice(1).map(
  (range) => ({ at: range.min, color: range.color })
);

const BY_WEAR = new Map(WEAR_RANGES.map((range) => [range.wear, range]));

export function getWearRange(wear: Wear): WearRange {
  const range = BY_WEAR.get(wear);
  if (!range) throw new Error(`Unknown wear: ${wear}`);
  return range;
}

export function wearAtFloat(value: number): Wear | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  if (value < 0.07) return "factory-new";
  if (value < 0.15) return "minimal-wear";
  if (value < 0.38) return "field-tested";
  if (value < 0.45) return "well-worn";
  return "battle-scarred";
}

export function intersectWearWithPaint(
  wear: Wear,
  paintMin: number,
  paintMax: number
): { min: number; max: number } | null {
  const range = getWearRange(wear);
  const min = Math.max(range.min, paintMin);
  const max = Math.min(range.max, paintMax);
  return max > min || (wear === "battle-scarred" && max === min)
    ? { min, max }
    : null;
}
