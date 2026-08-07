import { describe, expect, it } from "vitest";
import { steamListingUrl } from "../src/domain/steam-listing-url";

const GROUP = "https://steamcommunity.com/market/listings/730/G1807209A023004";

describe("steamListingUrl", () => {
  it("appends the listing selector to the group route the page is already on", () => {
    expect(steamListingUrl(GROUP, "517500653879896104")).toBe(
      `${GROUP}?detail=517500653879896104`
    );
  });

  it("tolerates a trailing slash", () => {
    expect(steamListingUrl(`${GROUP}/`, "42")).toBe(`${GROUP}/?detail=42`);
  });

  it("drops whatever query or fragment the user arrived with", () => {
    // Steam's own filter state is not ours to propagate: the link must mean the same thing
    // regardless of how the user got to the page.
    expect(steamListingUrl(`${GROUP}?filter=knife#foo`, "42")).toBe(`${GROUP}?detail=42`);
  });

  it("escapes a listing id rather than pasting it into the URL", () => {
    expect(steamListingUrl(GROUP, "a b&c")).toBe(`${GROUP}?detail=a%20b%26c`);
  });

  it("refuses any page that is not a market group route", () => {
    // The sell dialog plots the same book from an inventory page, which has no group code.
    expect(steamListingUrl("https://steamcommunity.com/id/someone/inventory", "42")).toBeNull();
    expect(steamListingUrl("https://steamcommunity.com/market/", "42")).toBeNull();
    expect(steamListingUrl("https://steamcommunity.com/market/listings/730", "42")).toBeNull();
    expect(steamListingUrl("https://steamcommunity.com/market/listings/730/a/b", "42")).toBeNull();
  });

  it("refuses a look-alike host or an insecure scheme", () => {
    expect(steamListingUrl("https://evil.com/market/listings/730/G1", "42")).toBeNull();
    expect(steamListingUrl("https://steamcommunity.com.evil.com/market/listings/730/G1", "42"))
      .toBeNull();
    expect(steamListingUrl("http://steamcommunity.com/market/listings/730/G1", "42")).toBeNull();
  });

  it("returns null rather than a half-built URL for junk input", () => {
    expect(steamListingUrl("not a url", "42")).toBeNull();
    expect(steamListingUrl(GROUP, "")).toBeNull();
  });
});
