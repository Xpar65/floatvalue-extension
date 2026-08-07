// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extractSteamInventoryItemSnapshot } from "../src/page/extract-steam-inventory-item";

afterEach(() => {
  delete (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog;
  delete (globalThis as typeof globalThis & { g_ActiveInventory?: unknown }).g_ActiveInventory;
  delete (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo;
});

describe("extractSteamInventoryItemSnapshot", () => {
  it("returns only the exact market identity and internal classification tags", () => {
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      m_item: {
        appid: 730,
        assetid: "private-asset-id",
        owner: "private-account",
        asset_properties: [
          { propertyid: 1, int_value: "906" },
          { propertyid: 2, float_value: "0.0353697091341018677" },
          { propertyid: 6, string_value: "opaque" }
        ],
        description: {
          market_hash_name: "StatTrak™ SSG 08 | Sans Comic (Field-Tested)",
          marketable: 1,
          commodity: 0,
          fraudwarnings: ["not-required"],
          tags: [
            { category: "Quality", internal_name: "strange", localized_tag_name: "StatTrak™" },
            { category: "Exterior", internal_name: "WearCategory2" },
            { category: "Rarity", internal_name: "Rarity_Common_Weapon" },
            { category: 42, internal_name: "invalid" }
          ]
        }
      }
    };
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: 21
    };

    const result = extractSteamInventoryItemSnapshot("sell-dialog");
    expect(result).toEqual({
      appid: 730,
      marketHashName: "StatTrak™ SSG 08 | Sans Comic (Field-Tested)",
      marketable: true,
      commodity: false,
      floatValue: 0.03536970913410187,
      walletCurrencyId: 21,
      tags: [
        { category: "Quality", internalName: "strange" },
        { category: "Exterior", internalName: "WearCategory2" },
        { category: "Rarity", internalName: "Rarity_Common_Weapon" }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(result).not.toHaveProperty("assetid");
    expect(result).not.toHaveProperty("asset_properties");
  });

  it("returns null item context for malformed float and wallet values", () => {
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      m_item: {
        appid: 730,
        asset_properties: [{ propertyid: 2, float_value: "not-a-float" }],
        description: {
          market_hash_name: "Example (Field-Tested)",
          marketable: 1,
          commodity: 0,
          tags: []
        }
      }
    };
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: "AUD"
    };
    expect(extractSteamInventoryItemSnapshot("sell-dialog")).toMatchObject({
      floatValue: null,
      walletCurrencyId: null
    });
  });

  it("returns null when Steam has no selected sell item", () => {
    expect(extractSteamInventoryItemSnapshot("sell-dialog")).toBeNull();
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      m_item: { appid: 730, description: {} }
    };
    expect(extractSteamInventoryItemSnapshot("sell-dialog")).toBeNull();
  });

  it("reads the active inventory selection independently of the sell dialog", () => {
    (globalThis as typeof globalThis & { g_ActiveInventory?: unknown }).g_ActiveInventory = {
      selectedItem: {
        appid: 730,
        assetid: "private-selected-asset",
        asset_properties: [{ propertyid: 2, float_value: "0.013942285" }],
        description: {
          market_hash_name: "R8 Revolver | Leafhopper (Factory New)",
          marketable: 1,
          commodity: 0,
          tags: [
            { category: "Quality", internal_name: "normal" },
            { category: "Exterior", internal_name: "WearCategory0" }
          ]
        }
      }
    };
    (globalThis as typeof globalThis & { SellItemDialog?: unknown }).SellItemDialog = {
      m_item: { appid: 440, description: { market_hash_name: "Wrong source" } }
    };

    const result = extractSteamInventoryItemSnapshot("selection");
    expect(result).toMatchObject({
      marketHashName: "R8 Revolver | Leafhopper (Factory New)",
      floatValue: 0.013942285
    });
    expect(result).not.toHaveProperty("assetid");
  });
});
