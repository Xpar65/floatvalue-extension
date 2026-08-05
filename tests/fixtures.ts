import type {
  QualityCurveState,
  SteamBucket,
  SteamMarketRouteSnapshot,
  ValidatedCurve
} from "../src/domain/types";

function bucket(
  name: string,
  quality: "normal" | "strange" | "tournament",
  exterior: string
): SteamBucket {
  return {
    bucket_id: name,
    filters: [
      ["Quality", quality],
      ["Exterior", exterior]
    ]
  };
}

export const REDLINE_BUCKETS: SteamBucket[] = [
  bucket("AK-47 | Redline (Minimal Wear)", "normal", "WearCategory1"),
  bucket("AK-47 | Redline (Field-Tested)", "normal", "WearCategory2"),
  bucket("AK-47 | Redline (Well-Worn)", "normal", "WearCategory3"),
  bucket("AK-47 | Redline (Battle-Scarred)", "normal", "WearCategory4"),
  bucket("StatTrak™ AK-47 | Redline (Minimal Wear)", "strange", "WearCategory1"),
  bucket("StatTrak™ AK-47 | Redline (Field-Tested)", "strange", "WearCategory2"),
  bucket("StatTrak™ AK-47 | Redline (Well-Worn)", "strange", "WearCategory3"),
  bucket("StatTrak™ AK-47 | Redline (Battle-Scarred)", "strange", "WearCategory4"),
  bucket("Souvenir AK-47 | Redline (Minimal Wear)", "tournament", "WearCategory1"),
  bucket("Souvenir AK-47 | Redline (Field-Tested)", "tournament", "WearCategory2")
];

export const REDLINE_SNAPSHOT: SteamMarketRouteSnapshot = {
  success: true,
  appid: 730,
  buckets: REDLINE_BUCKETS,
  listingQuery: { appid: 730, strItemName: "G1807209A023004" },
  relevantAssetProperties: { "1": true, "2": true, "5": true, "6": true },
  bCommodity: false
};

export function makeCurve(
  marketHashName: string,
  vertices: Array<readonly [number, number]> = [
    [0.15, 42.15],
    [0.2, 38.44],
    [0.37, 35]
  ]
): ValidatedCurve {
  return {
    venue: "steam",
    marketHashName,
    currency: "USD",
    floatRange: { min: 0.1, max: 0.7 },
    computedAt: "2026-08-05T02:08:31Z",
    fairPrice: { vertices, asOf: "2026-08-05T02:00:00Z" }
  };
}

export function makeQualityState(
  quality: QualityCurveState["quality"],
  state: Partial<QualityCurveState> = {}
): QualityCurveState {
  return {
    quality,
    variants: [],
    status: "missing",
    curvesByWear: {},
    staleWears: [],
    missingWears: [],
    errorWears: [],
    ...state
  };
}
