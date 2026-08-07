import type {
  SteamInventoryItemSnapshot,
  SteamInventoryItemSource
} from "../domain/types";

/**
 * This function is passed directly to chrome.scripting.executeScript in MAIN world.
 * Keep it self-contained and return only the fields required to classify the item.
 */
export function extractSteamInventoryItemSnapshot(
  source: SteamInventoryItemSource
): SteamInventoryItemSnapshot | null {
  const pageGlobal = globalThis as typeof globalThis & {
    SellItemDialog?: { m_item?: unknown };
    g_ActiveInventory?: { selectedItem?: unknown };
    g_rgWalletInfo?: unknown;
  };
  const item =
    source === "selection"
      ? pageGlobal.g_ActiveInventory?.selectedItem
      : source === "sell-dialog"
        ? pageGlobal.SellItemDialog?.m_item
        : undefined;
  if (typeof item !== "object" || item === null) return null;
  const itemRecord = item as Record<string, unknown>;
  const description = itemRecord.description;
  if (typeof description !== "object" || description === null) return null;
  const descriptionRecord = description as Record<string, unknown>;
  if (
    typeof itemRecord.appid !== "number" ||
    typeof descriptionRecord.market_hash_name !== "string"
  ) {
    return null;
  }

  const tags = Array.isArray(descriptionRecord.tags)
    ? descriptionRecord.tags.flatMap((tag): SteamInventoryItemSnapshot["tags"] => {
        if (typeof tag !== "object" || tag === null) return [];
        const tagRecord = tag as Record<string, unknown>;
        if (
          typeof tagRecord.category !== "string" ||
          typeof tagRecord.internal_name !== "string"
        ) {
          return [];
        }
        return [{ category: tagRecord.category, internalName: tagRecord.internal_name }];
      })
    : [];

  const floatProperty = Array.isArray(itemRecord.asset_properties)
    ? itemRecord.asset_properties.find((property) => {
        if (typeof property !== "object" || property === null) return false;
        const propertyId = (property as Record<string, unknown>).propertyid;
        return propertyId === 2 || propertyId === "2";
      })
    : undefined;
  const rawFloat =
    typeof floatProperty === "object" && floatProperty !== null
      ? (floatProperty as Record<string, unknown>).float_value
      : undefined;
  const parsedFloat =
    typeof rawFloat === "number"
      ? rawFloat
      : typeof rawFloat === "string" && rawFloat.trim() !== ""
        ? Number(rawFloat)
        : Number.NaN;
  const floatValue =
    Number.isFinite(parsedFloat) && parsedFloat >= 0 && parsedFloat <= 1 ? parsedFloat : null;

  const walletInfo = pageGlobal.g_rgWalletInfo;
  const rawCurrencyId =
    typeof walletInfo === "object" && walletInfo !== null
      ? (walletInfo as Record<string, unknown>).wallet_currency
      : undefined;
  const walletCurrencyId =
    typeof rawCurrencyId === "number" && Number.isInteger(rawCurrencyId)
      ? rawCurrencyId
      : typeof rawCurrencyId === "string" && /^\d+$/.test(rawCurrencyId)
        ? Number(rawCurrencyId)
        : null;

  return {
    appid: itemRecord.appid,
    marketHashName: descriptionRecord.market_hash_name,
    marketable: descriptionRecord.marketable === true || descriptionRecord.marketable === 1,
    commodity: descriptionRecord.commodity === true || descriptionRecord.commodity === 1,
    floatValue,
    walletCurrencyId,
    tags
  };
}
