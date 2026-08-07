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
  /**
   * Steam's numeric wallet currency, when the page exposes it. Optional because it comes from a
   * different global than the route data and may be absent on a signed-out page; the estimates on
   * the listing cards sit beside wallet-currency prices and must be converted to match.
   */
  walletCurrencyId?: number | null;
}

export interface SteamInventoryTag {
  category: string;
  internalName: string;
}

export type SteamInventoryItemSource = "selection" | "sell-dialog";

export interface SteamInventoryItemSnapshot {
  appid: number;
  marketHashName: string;
  marketable: boolean;
  commodity: boolean;
  floatValue: number | null;
  walletCurrencyId: number | null;
  tags: SteamInventoryTag[];
}

export interface SteamSellBuyerPriceSnapshot {
  buyerPriceCents: number | null;
  walletCurrencyId: number | null;
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

/** `fair_price` and `lowest_ask`: one ascending vertex list evaluated with `priceAtFloat`. */
export interface CurveSeries {
  vertices: CurveVertex[];
  asOf: string;
}

/**
 * `highest_bid`: standing buy orders leave float regions uncovered, so the curve arrives as
 * ordered, non-overlapping segments. Interpolate *within* a segment only — the price is null
 * before, between, and after them. See `src/domain/bid-at-float.ts`.
 */
export interface BidSeries {
  segments: CurveVertex[][];
  asOf: string;
}

/** One entry of the venue's authoritative listing book. Prices are USD buyer totals. */
export interface CurveListing {
  id: string;
  float: number;
  price: number;
}

export interface CurveListings {
  entries: CurveListing[];
  asOf: string;
}

export interface ValidatedCurve {
  venue: "steam";
  marketHashName: string;
  currency: "USD";
  floatRange: {
    min: number;
    max: number;
  };
  computedAt: string;
  fairPrice: CurveSeries;
  /**
   * Nullable, never optional: absence is a fact the UI must render as "no data", so every
   * consumer is made to handle it. Documents predating the contract's ask/bid/listings keys
   * parse to null here rather than failing.
   */
  lowestAsk: CurveSeries | null;
  /** Segmented standing-buy-order curve; null when no bid data is available. */
  highestBid: BidSeries | null;
  listings: CurveListings | null;
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

export interface FxRateQuote {
  base: "USD";
  quote: string;
  rate: number;
  asOf: string;
  stale: boolean;
}

export type FxRateOutcome =
  | { status: "success"; quote: FxRateQuote }
  | { status: "error"; quoteCurrency: string; message: string };

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
