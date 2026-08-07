import type {
  MarketVariant,
  Quality,
  SteamBucket,
  Wear,
  WearOrder
} from "./types";

const QUALITY_MAP: Record<string, Quality> = {
  normal: "normal",
  strange: "stattrak",
  tournament: "souvenir"
};

const EXTERIOR_MAP: Record<
  string,
  { wear: Wear; wearOrder: WearOrder }
> = {
  WearCategory0: { wear: "factory-new", wearOrder: 0 },
  WearCategory1: { wear: "minimal-wear", wearOrder: 1 },
  WearCategory2: { wear: "field-tested", wearOrder: 2 },
  WearCategory3: { wear: "well-worn", wearOrder: 3 },
  WearCategory4: { wear: "battle-scarred", wearOrder: 4 }
};

export function marketVariantFromSteamTags(
  marketHashName: string,
  qualityTag: string,
  exteriorTag: string
): MarketVariant | null {
  const quality = QUALITY_MAP[qualityTag];
  const exterior = EXTERIOR_MAP[exteriorTag];
  if (!quality || !exterior || marketHashName.length === 0) return null;
  return {
    quality,
    wear: exterior.wear,
    wearOrder: exterior.wearOrder,
    marketHashName
  };
}

function filterValue(filters: unknown, category: string): string | null {
  if (!Array.isArray(filters)) return null;
  for (const filter of filters) {
    if (
      Array.isArray(filter) &&
      filter.length >= 2 &&
      filter[0] === category &&
      typeof filter[1] === "string"
    ) {
      return filter[1];
    }
  }
  return null;
}

export function mapSteamBucket(bucket: SteamBucket): MarketVariant | null {
  if (!bucket || typeof bucket.bucket_id !== "string") return null;
  const qualityTag = filterValue(bucket.filters, "Quality");
  const exteriorTag = filterValue(bucket.filters, "Exterior");
  if (!qualityTag || !exteriorTag) return null;
  const variant = marketVariantFromSteamTags(bucket.bucket_id, qualityTag, exteriorTag);
  if (!variant) return null;
  if (typeof bucket.classid === "string") variant.classid = bucket.classid;
  if (typeof bucket.min_price === "string" && /^\d+$/.test(bucket.min_price)) {
    variant.steamMinPriceCents = Number(bucket.min_price);
  }
  return variant;
}

export function mapSteamVariants(buckets: readonly SteamBucket[]): MarketVariant[] {
  const deduped = new Map<string, MarketVariant>();
  for (const bucket of buckets) {
    const variant = mapSteamBucket(bucket);
    if (!variant) continue;
    const key = `${variant.quality}:${variant.wear}`;
    if (!deduped.has(key)) deduped.set(key, variant);
  }
  const qualityOrder: Record<Quality, number> = {
    normal: 0,
    stattrak: 1,
    souvenir: 2
  };
  return [...deduped.values()].sort(
    (a, b) => qualityOrder[a.quality] - qualityOrder[b.quality] || a.wearOrder - b.wearOrder
  );
}

export function variantsForQuality(
  variants: readonly MarketVariant[],
  quality: Quality
): MarketVariant[] {
  return variants.filter((variant) => variant.quality === quality);
}
