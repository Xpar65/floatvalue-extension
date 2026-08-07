// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSteamMarketRouteSnapshot } from "../src/page/extract-steam-market-route";
import { REDLINE_SNAPSHOT } from "./fixtures";

afterEach(() => {
  delete (globalThis as typeof globalThis & { SSR?: unknown }).SSR;
  delete (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo;
});

function loadRoute(): void {
  (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
    loaderData: [JSON.stringify(REDLINE_SNAPSHOT)]
  };
}

/** The market shell loader entry, verbatim in shape from a live AUD listing page. */
const MARKET_SHELL_LOADER = JSON.stringify({
  backgroundAppID: 730,
  filterConfig: {
    currency: {
      strSymbol: "A$",
      bSuffixSymbol: false,
      bSpaceForSymbol: true,
      bWholeUnitsOnly: false,
      eCurrency: 21,
      strDecimalSymbol: ".",
      strThousandsSeparator: ","
    },
    maxPrice: 284492,
    bNewMarket: true
  },
  marketEligibility: { bEligible: true },
  bShowAdminActions: false,
  loadID: 0.22242151248594777
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

  it("captures the wallet currency from Steam's page chrome, not from the route loader", () => {
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: 21,
      wallet_balance: "must-not-cross",
      steamid: "private"
    };
    loadRoute();
    const result = extractSteamMarketRouteSnapshot();
    expect(result?.walletCurrencyId).toBe(21);
    // Only the currency id crosses; the rest of the wallet global stays in the page.
    expect(JSON.stringify(result)).not.toContain("must-not-cross");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  /**
   * The regression: 2026 market pages ship no `g_rgWalletInfo`, so the currency came back null and
   * every graph fell back to a USD axis while Steam's own prices beside it were in AUD.
   */
  it("reads the currency from the market shell loader when Steam ships no wallet global", () => {
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: [MARKET_SHELL_LOADER, JSON.stringify(REDLINE_SNAPSHOT)]
    };
    expect(extractSteamMarketRouteSnapshot()?.walletCurrencyId).toBe(21);
  });

  /** The shell currency is what Steam formatted the visible prices with, so it wins. */
  it("prefers the market shell currency over the page chrome's wallet currency", () => {
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: 1
    };
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: [MARKET_SHELL_LOADER, JSON.stringify(REDLINE_SNAPSHOT)]
    };
    expect(extractSteamMarketRouteSnapshot()?.walletCurrencyId).toBe(21);
  });

  it("reports no wallet currency rather than guessing one", () => {
    loadRoute();
    expect(extractSteamMarketRouteSnapshot()?.walletCurrencyId).toBeNull();

    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: "21"
    };
    expect(extractSteamMarketRouteSnapshot()?.walletCurrencyId).toBeNull();
  });

  it("never trusts a wallet currency planted in the route loader", () => {
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: [JSON.stringify({ ...REDLINE_SNAPSHOT, walletCurrencyId: 999 })]
    };
    expect(extractSteamMarketRouteSnapshot()?.walletCurrencyId).toBeNull();
  });

  it("returns null for malformed or unrelated loaders", () => {
    (globalThis as typeof globalThis & { SSR?: unknown }).SSR = {
      loaderData: ["not json", JSON.stringify({ account: true })]
    };
    expect(extractSteamMarketRouteSnapshot()).toBeNull();
  });
});
