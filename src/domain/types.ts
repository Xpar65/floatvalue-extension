export const QUALITIES = ["normal", "stattrak", "souvenir"] as const;
export type Quality = (typeof QUALITIES)[number];

export const WEARS = [
  "factory-new",
  "minimal-wear",
  "field-tested",
  "well-worn",
  "battle-scarred"
] as const;
export type Wear = (typeof WEARS)[number];
export type WearOrder = 0 | 1 | 2 | 3 | 4;

export interface SteamBucket {
  bucket_id: string;
  filters: unknown;
  classid?: string;
  min_price?: string;
}

export interface SteamMarketRouteSnapshot {
  success: boolean;
  appid: number;
  buckets: SteamBucket[];
  listingQuery: {
    appid: number;
    strItemName: string;
  };
  relevantAssetProperties: Record<string, boolean>;
  bCommodity: boolean;
}

export interface MarketVariant {
  quality: Quality;
  wear: Wear;
  wearOrder: WearOrder;
  marketHashName: string;
  classid?: string;
  steamMinPriceCents?: number;
}

export type CurveVertex = readonly [float: number, price: number];

export interface ValidatedCurve {
  venue: "steam";
  marketHashName: string;
  currency: "USD";
  floatRange: {
    min: number;
    max: number;
  };
  computedAt: string;
  fairPrice: {
    vertices: CurveVertex[];
    asOf: string;
  };
}

export type CurveFetchOutcome =
  | {
      status: "success";
      marketHashName: string;
      curve: ValidatedCurve;
      stale: boolean;
    }
  | {
      status: "missing";
      marketHashName: string;
    }
  | {
      status: "error";
      marketHashName: string;
      message: string;
    };

export type QualityCurveStatus =
  | "not-requested"
  | "loading"
  | "ready"
  | "partial"
  | "missing"
  | "error";

export interface QualityCurveState {
  quality: Quality;
  variants: MarketVariant[];
  status: QualityCurveStatus;
  curvesByWear: Partial<Record<Wear, ValidatedCurve>>;
  staleWears: Wear[];
  missingWears: Wear[];
  errorWears: Wear[];
}
