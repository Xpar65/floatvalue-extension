import { describe, expect, it } from "vitest";
import { classifySteamInventoryItem } from "../src/domain/steam-inventory-classifier";
import type { SteamInventoryItemSnapshot } from "../src/domain/types";

const INVENTORY_URL = "https://steamcommunity.com/profiles/76561198000000000/inventory/#730";
const SNAPSHOT: SteamInventoryItemSnapshot = {
  appid: 730,
  marketHashName: "SSG 08 | Sans Comic (Factory New)",
  marketable: true,
  commodity: false,
  floatValue: 0.03536970913410187,
  walletCurrencyId: 21,
  tags: [
    { category: "Quality", internalName: "normal" },
    { category: "Exterior", internalName: "WearCategory0" }
  ]
};

describe("classifySteamInventoryItem", () => {
  it("maps the selected item without changing its exact market_hash_name", () => {
    expect(classifySteamInventoryItem(INVENTORY_URL, SNAPSHOT)).toEqual({
      variant: {
        quality: "normal",
        wear: "factory-new",
        wearOrder: 0,
        marketHashName: SNAPSHOT.marketHashName
      },
      floatValue: SNAPSHOT.floatValue,
      walletCurrencyId: 21
    });
  });

  it("maps StatTrak and Souvenir from Steam's internal quality tags", () => {
    expect(
      classifySteamInventoryItem("https://steamcommunity.com/id/trader/inventory", {
        ...SNAPSHOT,
        marketHashName: "StatTrak™ Example (Minimal Wear)",
        tags: [
          { category: "Quality", internalName: "strange" },
          { category: "Exterior", internalName: "WearCategory1" }
        ]
      })
    ).toMatchObject({ variant: { quality: "stattrak", wear: "minimal-wear" } });
    expect(
      classifySteamInventoryItem("https://steamcommunity.com/my/inventory/", {
        ...SNAPSHOT,
        marketHashName: "Souvenir Example (Battle-Scarred)",
        tags: [
          { category: "Quality", internalName: "tournament" },
          { category: "Exterior", internalName: "WearCategory4" }
        ]
      })
    ).toMatchObject({ variant: { quality: "souvenir", wear: "battle-scarred" } });
  });

  it("rejects unsupported routes, apps, flags, and missing classification tags", () => {
    expect(classifySteamInventoryItem("https://example.com/my/inventory", SNAPSHOT)).toBeNull();
    expect(
      classifySteamInventoryItem("https://steamcommunity.com/market/listings/730/item", SNAPSHOT)
    ).toBeNull();
    expect(classifySteamInventoryItem(INVENTORY_URL, { ...SNAPSHOT, appid: 440 })).toBeNull();
    expect(
      classifySteamInventoryItem(INVENTORY_URL, { ...SNAPSHOT, marketable: false })
    ).toBeNull();
    expect(
      classifySteamInventoryItem(INVENTORY_URL, { ...SNAPSHOT, commodity: true })
    ).toBeNull();
    expect(classifySteamInventoryItem(INVENTORY_URL, { ...SNAPSHOT, tags: [] })).toBeNull();
  });
});
