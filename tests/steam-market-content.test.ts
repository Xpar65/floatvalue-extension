/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://steamcommunity.com/market/listings/730/G1807209A023004"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionRequest, ExtensionResponse } from "../src/shared/messages";
import { makeCurve, REDLINE_SNAPSHOT } from "./fixtures";

const ROUTE = "/market/listings/730/G1807209A023004";

function addHistorySection(): HTMLElement {
  const section = document.createElement("section");
  section.innerHTML = "<header><h2>Median Sale Prices</h2></header>";
  section.getBoundingClientRect = () => ({ width: 1200, height: 404 }) as DOMRect;
  document.body.append(section);
  return section;
}

/** `snapshot` is read at call time so a test can simulate Steam discarding `window.SSR`. */
function stubChrome(snapshot: () => unknown, fxRate: number | null = null): void {
  const sendMessage = vi.fn(async (request: ExtensionRequest): Promise<ExtensionResponse> => {
    if (request.type === "extract-steam-market-route") {
      return {
        ok: true,
        type: "extract-steam-market-route",
        snapshot: snapshot() as ExtensionResponse extends { snapshot: infer S } ? S : never
      } as ExtensionResponse;
    }
    if (request.type === "fetch-steam-curves") {
      return {
        ok: true,
        type: "fetch-steam-curves",
        outcomes: request.marketHashNames.map((marketHashName) => ({
          status: "success" as const,
          marketHashName,
          curve: makeCurve(marketHashName),
          stale: false
        }))
      };
    }
    if (request.type === "fetch-usd-fx-rate" && fxRate !== null) {
      return {
        ok: true,
        type: "fetch-usd-fx-rate",
        outcome: {
          status: "success",
          quote: {
            base: "USD",
            quote: request.quoteCurrency,
            rate: fxRate,
            asOf: "2026-08-07",
            stale: false
          }
        }
      };
    }
    return { ok: false, message: "unexpected request" };
  });
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
}

const panelInDocument = (): Element | null => document.querySelector("#cslytics-float-curves");

/** Long enough to clear RouteChangeObserver's 120ms debounce and the async load that follows. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));

/**
 * The module self-starts on import. Without tearing the previous instance down, its observer and
 * re-attach timer stay live and resurrect a stale panel into the next test's DOM.
 */
let stop: (() => void) | null = null;

async function startContentScript(): Promise<void> {
  const module = await import("../src/content/steam-market-content");
  stop = module.stopSteamMarketContent;
}

afterEach(() => {
  stop?.();
  stop = null;
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  history.replaceState(null, "", ROUTE);
});

describe("Steam market listing orchestration", () => {
  it("mounts the graph against Steam's price-history section", async () => {
    const section = addHistorySection();
    stubChrome(() => REDLINE_SNAPSHOT);
    await startContentScript();

    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull());
    expect(section.nextElementSibling).toBe(panelInDocument());
  });

  /**
   * The regression: Steam's router calls replaceState after hydration, our MAIN-world extractor
   * hooks that into `cslytics:locationchange`, and the re-run can no longer read `window.SSR`.
   * Classification then fails for a route we already rendered — which used to delete the graph
   * about a second after it appeared.
   */
  it("keeps the graph when a post-hydration re-run can no longer read Steam's SSR data", async () => {
    addHistorySection();
    let hydrated = false;
    stubChrome(() => (hydrated ? null : REDLINE_SNAPSHOT));
    await startContentScript();
    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull());

    hydrated = true;
    history.replaceState(null, "", `${ROUTE}?filter=whatever`);
    document.dispatchEvent(new Event("cslytics:locationchange"));
    await settle();

    expect(panelInDocument()).not.toBeNull();
  });

  it("still removes the graph when the route actually leaves the item", async () => {
    addHistorySection();
    let onItemRoute = true;
    stubChrome(() => (onItemRoute ? REDLINE_SNAPSHOT : null));
    await startContentScript();
    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull());

    onItemRoute = false;
    history.replaceState(null, "", "/market/listings/730/SomeOtherGroup");
    document.dispatchEvent(new Event("cslytics:locationchange"));
    await settle();

    expect(panelInDocument()).toBeNull();
  });

  /**
   * The graph used to keep its own USD axis while the listing cards beside it were already
   * converted, so the two disagreed on the same page for any non-USD wallet.
   */
  it("renders the graph in the wallet currency, not USD", async () => {
    addHistorySection();
    stubChrome(() => ({ ...REDLINE_SNAPSHOT, walletCurrencyId: 3 }), 0.9);
    await startContentScript();
    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull());

    await vi.waitFor(() => {
      const text = panelInDocument()!.shadowRoot!.textContent ?? "";
      expect(text).toContain("converted to EUR");
    });
  });

  it("re-attaches itself when Steam's React drops the node", async () => {
    const section = addHistorySection();
    stubChrome(() => REDLINE_SNAPSHOT);
    await startContentScript();
    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull());

    panelInDocument()!.remove();
    expect(panelInDocument()).toBeNull();

    await vi.waitFor(() => expect(panelInDocument()).not.toBeNull(), { timeout: 2000 });
    expect(section.nextElementSibling).toBe(panelInDocument());
  });
});
