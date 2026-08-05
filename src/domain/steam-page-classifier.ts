import { decodeBucketId, type DecodedBucketId } from "./steam-bucket-id";
import { mapSteamVariants } from "./steam-variants";
import type {
  MarketVariant,
  SteamBucket,
  SteamMarketRouteSnapshot
} from "./types";

export interface SupportedSteamMarketGroup {
  groupId: string;
  decodedGroupId: DecodedBucketId;
  variants: MarketVariant[];
  snapshot: SteamMarketRouteSnapshot;
}

function isSteamBucket(value: unknown): value is SteamBucket {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { bucket_id?: unknown }).bucket_id === "string" &&
    "filters" in value
  );
}

export function isSteamMarketRouteSnapshot(
  value: unknown
): value is SteamMarketRouteSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const query = record.listingQuery;
  const properties = record.relevantAssetProperties;
  return (
    typeof record.success === "boolean" &&
    typeof record.appid === "number" &&
    Array.isArray(record.buckets) &&
    record.buckets.every(isSteamBucket) &&
    typeof query === "object" &&
    query !== null &&
    typeof (query as Record<string, unknown>).appid === "number" &&
    typeof (query as Record<string, unknown>).strItemName === "string" &&
    typeof properties === "object" &&
    properties !== null &&
    typeof record.bCommodity === "boolean"
  );
}

export function classifySteamMarketPage(
  pageUrl: string,
  value: unknown
): SupportedSteamMarketGroup | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "steamcommunity.com") return null;
  const route = /^\/market\/listings\/(\d+)\/([^/]+)\/?$/.exec(url.pathname);
  if (!route || route[1] !== "730" || !route[2]) return null;
  if (!isSteamMarketRouteSnapshot(value)) return null;
  if (!value.success || value.appid !== 730 || value.listingQuery.appid !== 730) return null;
  if (value.listingQuery.strItemName !== route[2]) return null;
  if (value.bCommodity !== false || value.relevantAssetProperties["2"] !== true) return null;

  let decodedGroupId: DecodedBucketId;
  try {
    decodedGroupId = decodeBucketId(route[2]);
  } catch {
    return null;
  }
  if (decodedGroupId.paintKit === undefined) return null;

  const variants = mapSteamVariants(value.buckets);
  if (variants.length === 0) return null;
  return {
    groupId: route[2],
    decodedGroupId,
    variants,
    snapshot: value
  };
}
