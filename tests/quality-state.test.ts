import { describe, expect, it } from "vitest";
import {
  firstAvailableQuality,
  qualityStateFromOutcomes,
  shouldShowQuality
} from "../src/domain/quality-state";
import { mapSteamVariants, variantsForQuality } from "../src/domain/steam-variants";
import type { Quality, QualityCurveState } from "../src/domain/types";
import { makeCurve, makeQualityState, REDLINE_BUCKETS } from "./fixtures";

const variants = mapSteamVariants(REDLINE_BUCKETS);

describe("quality coverage", () => {
  it("builds partial Souvenir state without fabricating a missing wear", () => {
    const souvenir = variantsForQuality(variants, "souvenir");
    const state = qualityStateFromOutcomes("souvenir", souvenir, [
      {
        status: "success",
        marketHashName: souvenir[0]!.marketHashName,
        curve: makeCurve(souvenir[0]!.marketHashName),
        stale: false
      },
      { status: "missing", marketHashName: souvenir[1]!.marketHashName }
    ]);
    expect(state.status).toBe("partial");
    expect(Object.keys(state.curvesByWear)).toHaveLength(1);
    expect(state.missingWears).toEqual([souvenir[1]!.wear]);
    expect(shouldShowQuality(state)).toBe(true);
  });

  it("hides all-missing Souvenir but keeps all-missing StatTrak visible", () => {
    const souvenir = makeQualityState("souvenir", { variants: variantsForQuality(variants, "souvenir") });
    const stattrak = makeQualityState("stattrak", { variants: variantsForQuality(variants, "stattrak") });
    expect(shouldShowQuality(souvenir)).toBe(false);
    expect(shouldShowQuality(stattrak)).toBe(true);
  });

  it("falls back Normal then StatTrak then Souvenir", () => {
    const makeStates = (available: Quality): Record<Quality, QualityCurveState> => ({
      normal: makeQualityState("normal"),
      stattrak: makeQualityState("stattrak"),
      souvenir: makeQualityState("souvenir"),
      [available]: makeQualityState(available, {
        curvesByWear: { "field-tested": makeCurve(`${available} curve`) }
      })
    });
    expect(firstAvailableQuality(makeStates("normal"))).toBe("normal");
    expect(firstAvailableQuality(makeStates("stattrak"))).toBe("stattrak");
    expect(firstAvailableQuality(makeStates("souvenir"))).toBe("souvenir");
  });
});
