import { describe, expect, it } from "vitest";
import { classifySteamMarketPage } from "../src/domain/steam-page-classifier";
import { REDLINE_SNAPSHOT } from "./fixtures";

const REDLINE_URL = "https://steamcommunity.com/market/listings/730/G1807209A023004";

describe("classifySteamMarketPage", () => {
  it("supports the Redline and maps all quality variants", () => {
    const result = classifySteamMarketPage(REDLINE_URL, REDLINE_SNAPSHOT);
    expect(result?.decodedGroupId).toMatchObject({ defIndex: 7, paintKit: 282 });
    expect(result?.variants.filter((variant) => variant.quality === "normal")).toHaveLength(4);
    expect(result?.variants.filter((variant) => variant.quality === "stattrak")).toHaveLength(4);
    expect(result?.variants.filter((variant) => variant.quality === "souvenir")).toHaveLength(2);
    expect(result?.variants.some((variant) => variant.wear === "factory-new")).toBe(false);
  });

  it("preserves the exact StatTrak trademark in market_hash_name", () => {
    const result = classifySteamMarketPage(REDLINE_URL, REDLINE_SNAPSHOT);
    expect(result?.variants.find((variant) => variant.quality === "stattrak")?.marketHashName)
      .toContain("StatTrak™");
  });

  it("rejects Gamma Case", () => {
    expect(
      classifySteamMarketPage("https://steamcommunity.com/market/listings/730/G188C213004", {
        ...REDLINE_SNAPSHOT,
        bCommodity: true,
        buckets: [],
        listingQuery: { appid: 730, strItemName: "G188C213004" },
        relevantAssetProperties: {}
      })
    ).toBeNull();
  });

  it("rejects TF2 before bucket parsing", () => {
    expect(
      classifySteamMarketPage(
        "https://steamcommunity.com/market/listings/440/Mann%20Co.%20Supply%20Crate%20Key",
        REDLINE_SNAPSHOT
      )
    ).toBeNull();
  });

  it("rejects commodity, missing float property, and route mismatch", () => {
    expect(classifySteamMarketPage(REDLINE_URL, { ...REDLINE_SNAPSHOT, bCommodity: true })).toBeNull();
    expect(
      classifySteamMarketPage(REDLINE_URL, {
        ...REDLINE_SNAPSHOT,
        relevantAssetProperties: { "2": false }
      })
    ).toBeNull();
    expect(
      classifySteamMarketPage(REDLINE_URL, {
        ...REDLINE_SNAPSHOT,
        listingQuery: { appid: 730, strItemName: "G188C213004" }
      })
    ).toBeNull();
  });
});
