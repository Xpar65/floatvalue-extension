import type { SteamInventoryItemSnapshot } from "../domain/types";

export const STEAM_INVENTORY_SELECTION_EVENT = "cslytics:steam-inventory-selection";
export const STEAM_INVENTORY_SELECTION_READY_EVENT =
  "cslytics:steam-inventory-selection-ready";
export const STEAM_INVENTORY_SELECTION_REQUEST_EVENT =
  "cslytics:steam-inventory-selection-request";

export type ParsedSteamInventorySelection =
  | { ok: true; snapshot: SteamInventoryItemSnapshot | null; serialized: string }
  | { ok: false };

export function parseSteamInventorySelectionDetail(
  detail: unknown
): ParsedSteamInventorySelection {
  if (typeof detail !== "string" || detail.length === 0 || detail.length > 65_536) {
    return { ok: false };
  }

  let value: unknown;
  try {
    value = JSON.parse(detail);
  } catch {
    return { ok: false };
  }
  if (value === null) return { ok: true, snapshot: null, serialized: detail };
  if (typeof value !== "object") return { ok: false };

  const snapshot = value as Partial<SteamInventoryItemSnapshot>;
  if (
    typeof snapshot.appid !== "number" ||
    !Number.isInteger(snapshot.appid) ||
    typeof snapshot.marketHashName !== "string" ||
    snapshot.marketHashName.length === 0 ||
    typeof snapshot.marketable !== "boolean" ||
    typeof snapshot.commodity !== "boolean" ||
    !(
      snapshot.floatValue === null ||
      (typeof snapshot.floatValue === "number" &&
        Number.isFinite(snapshot.floatValue) &&
        snapshot.floatValue >= 0 &&
        snapshot.floatValue <= 1)
    ) ||
    !(
      snapshot.walletCurrencyId === null ||
      (typeof snapshot.walletCurrencyId === "number" &&
        Number.isInteger(snapshot.walletCurrencyId))
    ) ||
    !Array.isArray(snapshot.tags) ||
    !snapshot.tags.every(
      (tag) =>
        typeof tag === "object" &&
        tag !== null &&
        typeof tag.category === "string" &&
        typeof tag.internalName === "string"
    )
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    snapshot: snapshot as SteamInventoryItemSnapshot,
    serialized: detail
  };
}
