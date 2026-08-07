// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSteamSellBuyerPriceSnapshot } from "../src/page/extract-steam-sell-buyer-price";

afterEach(() => {
  delete (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog;
  delete (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo;
});

describe("extractSteamSellBuyerPriceSnapshot", () => {
  it("uses Steam's localized buyer-price parser and returns integer hundredths", () => {
    const parser = vi.fn(() => 1842);
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      GetBuyerPriceAsInt: parser
    };
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: "21"
    };
    expect(extractSteamSellBuyerPriceSnapshot()).toEqual({
      buyerPriceCents: 1842,
      walletCurrencyId: 21
    });
    expect(parser).toHaveBeenCalledOnce();
  });

  it("returns null instead of leaking exceptions or invalid prices", () => {
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      GetBuyerPriceAsInt: () => {
        throw new Error("empty input");
      }
    };
    expect(extractSteamSellBuyerPriceSnapshot()).toEqual({
      buyerPriceCents: null,
      walletCurrencyId: null
    });
  });
});
