// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSteamMarketRouteSnapshot } from "../src/page/extract-steam-market-route";
import { REDLINE_SNAPSHOT } from "./fixtures";

afterEach(() => {
  delete (globalThis as typeof globalThis & { SSR?: unknown }).SSR;
});

describe("extractSteamMarketRouteSnapshot", () => {
  it("finds route data at any loader index and returns only whitelisted fields", () => {
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: [
        JSON.stringify({ strWebAPIToken: "must-not-cross", steamid: "private" }),
        JSON.stringify(REDLINE_SNAPSHOT)
      ]
    };
    const result = extractSteamMarketRouteSnapshot();
    expect(result).toEqual(REDLINE_SNAPSHOT);
    expect(result).not.toHaveProperty("strWebAPIToken");
    expect(JSON.stringify(result)).not.toContain("must-not-cross");

    const navigation = vi.fn();
    document.addEventListener("cslytics:locationchange", navigation, { once: true });
    history.pushState({}, "", "/market/listings/730/G1807209A023004?sort=1");
    expect(navigation).toHaveBeenCalledOnce();
  });

  it("returns null for malformed or unrelated loaders", () => {
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: ["not json", JSON.stringify({ account: true })]
    };
    expect(extractSteamMarketRouteSnapshot()).toBeNull();
  });
});
