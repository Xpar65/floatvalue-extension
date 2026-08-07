import type { SteamSellBuyerPriceSnapshot } from "../domain/types";

/** Passed directly to chrome.scripting.executeScript in MAIN world. */
export function extractSteamSellBuyerPriceSnapshot(): SteamSellBuyerPriceSnapshot {
  const pageGlobal = globalThis as typeof globalThis & {
    SellItemDialog?: { GetBuyerPriceAsInt?: () => unknown };
    g_rgWalletInfo?: unknown;
  };
  const dialog = pageGlobal.SellItemDialog;
  let rawPrice: unknown = null;
  try {
    rawPrice = dialog?.GetBuyerPriceAsInt?.call(dialog);
  } catch {
    rawPrice = null;
  }
  const buyerPriceCents =
    typeof rawPrice === "number" && Number.isSafeInteger(rawPrice) && rawPrice >= 0
      ? rawPrice
      : null;

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
  return { buyerPriceCents, walletCurrencyId };
}
