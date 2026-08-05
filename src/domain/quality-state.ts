import type {
  CurveFetchOutcome,
  MarketVariant,
  Quality,
  QualityCurveState
} from "./types";

export function emptyQualityState(
  quality: Quality,
  variants: MarketVariant[]
): QualityCurveState {
  return {
    quality,
    variants,
    status: variants.length > 0 ? "not-requested" : "missing",
    curvesByWear: {},
    staleWears: [],
    missingWears: [],
    errorWears: []
  };
}

export function qualityStateFromOutcomes(
  quality: Quality,
  variants: MarketVariant[],
  outcomes: readonly CurveFetchOutcome[]
): QualityCurveState {
  const outcomeByName = new Map(outcomes.map((outcome) => [outcome.marketHashName, outcome]));
  const curvesByWear: QualityCurveState["curvesByWear"] = {};
  const staleWears: QualityCurveState["staleWears"] = [];
  const missingWears: QualityCurveState["missingWears"] = [];
  const errorWears: QualityCurveState["errorWears"] = [];

  for (const variant of variants) {
    const outcome = outcomeByName.get(variant.marketHashName);
    if (!outcome || outcome.status === "error") {
      errorWears.push(variant.wear);
    } else if (outcome.status === "missing") {
      missingWears.push(variant.wear);
    } else {
      curvesByWear[variant.wear] = outcome.curve;
      if (outcome.stale) staleWears.push(variant.wear);
    }
  }

  const successCount = Object.keys(curvesByWear).length;
  let status: QualityCurveState["status"];
  if (successCount === variants.length && variants.length > 0) status = "ready";
  else if (successCount > 0) status = "partial";
  else if (errorWears.length > 0 && missingWears.length === 0) status = "error";
  else status = "missing";

  return {
    quality,
    variants,
    status,
    curvesByWear,
    staleWears,
    missingWears,
    errorWears
  };
}

export function firstAvailableQuality(
  states: Readonly<Record<Quality, QualityCurveState>>
): Quality | null {
  for (const quality of ["normal", "stattrak", "souvenir"] as const) {
    if (Object.keys(states[quality].curvesByWear).length > 0) return quality;
  }
  return null;
}

export function shouldShowQuality(state: QualityCurveState): boolean {
  if (state.quality === "normal") return state.variants.length > 0;
  if (state.quality === "stattrak") return state.variants.length > 0;
  return Object.keys(state.curvesByWear).length > 0;
}
