import type { MarketVariant, SteamInventoryItemSnapshot } from "./types";
import { marketVariantFromSteamTags } from "./steam-variants";

const INVENTORY_PATH = /^\/(?:profiles\/[^/]+|id\/[^/]+|my)\/inventory\/?$/;

export interface ClassifiedSteamInventoryItem {
  variant: MarketVariant;
  floatValue: number | null;
  walletCurrencyId: number | null;
}

export function classifySteamInventoryItem(
  pageUrl: string,
  value: unknown
): ClassifiedSteamInventoryItem | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "steamcommunity.com" ||
    !INVENTORY_PATH.test(url.pathname) ||
    typeof value !== "object" ||
    value === null
  ) {
    return null;
  }

  const snapshot = value as Partial<SteamInventoryItemSnapshot>;
  if (
    snapshot.appid !== 730 ||
    snapshot.marketable !== true ||
    snapshot.commodity !== false ||
    typeof snapshot.marketHashName !== "string" ||
    snapshot.marketHashName.length === 0 ||
    !Array.isArray(snapshot.tags)
  ) {
    return null;
  }

  const quality = snapshot.tags.find((tag) => tag.category === "Quality")?.internalName;
  const exterior = snapshot.tags.find((tag) => tag.category === "Exterior")?.internalName;
  if (!quality || !exterior) return null;
  const variant = marketVariantFromSteamTags(snapshot.marketHashName, quality, exterior);
  if (!variant) return null;
  const floatValue =
    typeof snapshot.floatValue === "number" &&
    Number.isFinite(snapshot.floatValue) &&
    snapshot.floatValue >= 0 &&
    snapshot.floatValue <= 1
      ? snapshot.floatValue
      : null;
  const walletCurrencyId =
    typeof snapshot.walletCurrencyId === "number" && Number.isInteger(snapshot.walletCurrencyId)
      ? snapshot.walletCurrencyId
      : null;
  return { variant, floatValue, walletCurrencyId };
}
