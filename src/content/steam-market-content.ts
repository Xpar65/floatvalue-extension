import { emptyQualityState, firstAvailableQuality, qualityStateFromOutcomes } from "../domain/quality-state";
import { classifySteamMarketPage } from "../domain/steam-page-classifier";
import { variantsForQuality } from "../domain/steam-variants";
import type { Quality, QualityCurveState, ValidatedCurve } from "../domain/types";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import { USD_DISPLAY_CURRENCY, type DisplayCurrency } from "../ui/display-format";
import { GraphPanel } from "../ui/graph-panel";
import { RouteChangeObserver } from "./route-change-observer";
import { resolveSteamDisplayCurrency } from "./steam-display-currency";
import { SteamListingCardDecorator } from "./steam-listing-cards";
import {
  findSteamPriceHistorySection,
  waitForSteamPriceHistorySection
} from "./steam-inline-mount";

let generation = 0;
let panel: GraphPanel | null = null;
let cards: SteamListingCardDecorator | null = null;
/** Wallet currency, so the graph and card estimates sit beside Steam's prices in the same units. */
let cardCurrency: DisplayCurrency = USD_DISPLAY_CURRENCY;
/** Surfaced on the graph when the wallet currency could not be converted truthfully. */
let currencyNotice: string | null = null;
let selectedQuality: Quality | null = null;
let currentStates: Record<Quality, QualityCurveState> | null = null;
/** Path we last rendered a graph for; guards against tearing it down on a transient re-run. */
let renderedPath: string | null = null;
let reattachTimer: number | null = null;
let reattachesLeft = 0;

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

/** Below Steam's median-sale-prices chart: their price history reads first, ours refines it. */
function ensurePanel(anchor: HTMLElement | null): GraphPanel {
  panel ??= new GraphPanel(anchor, "after");
  panel.mountAfter(anchor);
  return panel;
}

function removePanel(): void {
  stopReattachWatch();
  panel?.remove();
  panel = null;
  cards?.stop();
  cards = null;
  cardCurrency = USD_DISPLAY_CURRENCY;
  currencyNotice = null;
  selectedQuality = null;
  currentStates = null;
  renderedPath = null;
}

/**
 * Steam's React owns the container we insert into, so a re-render there can drop our host. The
 * node survives detachment with its shadow tree intact, so re-appending it is enough — no
 * re-render, no flicker. Bounded so we never thrash against a page that keeps evicting us.
 */
function startReattachWatch(): void {
  reattachesLeft = 20;
  if (reattachTimer !== null) return;
  reattachTimer = window.setInterval(() => {
    if (!panel) return;
    if (panel.isConnected) return;
    if (reattachesLeft <= 0) {
      stopReattachWatch();
      return;
    }
    const anchor = findSteamPriceHistorySection();
    if (!anchor) return;
    reattachesLeft -= 1;
    panel.mountAfter(anchor);
  }, 250);
}

function stopReattachWatch(): void {
  if (reattachTimer === null) return;
  window.clearInterval(reattachTimer);
  reattachTimer = null;
}

/**
 * Tear the panel down only when the route actually moved.
 *
 * Steam's client router calls `replaceState` shortly after hydration, and our MAIN-world extractor
 * hooks that to emit `cslytics:locationchange` — so this module re-runs on a page it already
 * rendered. By then React has consumed `window.SSR.loaderData`, the extractor returns null, and
 * classification fails for a route that is perfectly fine. Removing the panel there deleted a
 * working graph a second after it appeared.
 */
function discardUnlessAlreadyRendered(path: string): void {
  if (renderedPath === path && panel) return;
  removePanel();
}

function renderStates(loading: boolean): void {
  if (!panel || !currentStates) return;
  panel.render({
    states: currentStates,
    selectedQuality,
    loading,
    displayCurrency: cardCurrency,
    notice: currencyNotice,
    onSelectQuality: (quality) => {
      if (!currentStates || Object.keys(currentStates[quality].curvesByWear).length === 0) return;
      selectedQuality = quality;
      renderStates(loading);
    }
  });
  decorateListingCards();
}

/**
 * The listing cards are decorated from every quality at once, not just the selected one: a card is
 * whatever it is, and switching the graph to StatTrak must not restate a Normal listing's estimate.
 */
function decorateListingCards(): void {
  if (!currentStates) return;
  const curvesByName = new Map<string, ValidatedCurve>();
  for (const state of Object.values(currentStates)) {
    for (const variant of state.variants) {
      const curve = state.curvesByWear[variant.wear];
      if (curve) curvesByName.set(variant.marketHashName, curve);
    }
  }
  if (curvesByName.size === 0) return;
  cards ??= new SteamListingCardDecorator();
  cards.update({ curvesByName, displayCurrency: cardCurrency });
}

async function loadCurrentPage(): Promise<void> {
  const thisGeneration = ++generation;
  const path = location.pathname;
  // Before anything else: the section we mount against is rendered client-side and is usually
  // absent at document_idle. The manifest already restricts this script to market listing routes,
  // so there is no wrong page to wait on.
  const anchor = await waitForSteamPriceHistorySection();
  if (thisGeneration !== generation) return;

  let extraction: ExtensionResponse;
  try {
    extraction = await send({ type: "extract-steam-market-route" });
  } catch {
    if (thisGeneration === generation) discardUnlessAlreadyRendered(path);
    return;
  }
  if (thisGeneration !== generation) return;
  if (!extraction.ok || extraction.type !== "extract-steam-market-route") {
    discardUnlessAlreadyRendered(path);
    return;
  }
  const group = classifySteamMarketPage(location.href, extraction.snapshot);
  if (!group) {
    discardUnlessAlreadyRendered(path);
    return;
  }
  renderedPath = path;

  // Resolved before the curves arrive so the first decoration is already in wallet currency; a
  // failure here is not fatal, it just leaves the card estimates labelled USD.
  const currency = await resolveSteamDisplayCurrency(
    extraction.snapshot?.walletCurrencyId ?? null,
    send
  );
  if (thisGeneration !== generation) return;
  cardCurrency = currency.displayCurrency;
  currencyNotice = currency.notice;

  const graphPanel = ensurePanel(anchor);
  startReattachWatch();
  graphPanel.showLoading();
  selectedQuality = null;
  currentStates = {
    normal: emptyQualityState("normal", variantsForQuality(group.variants, "normal")),
    stattrak: emptyQualityState("stattrak", variantsForQuality(group.variants, "stattrak")),
    souvenir: emptyQualityState("souvenir", variantsForQuality(group.variants, "souvenir"))
  };

  for (const quality of ["normal", "stattrak", "souvenir"] as const) {
    if (thisGeneration !== generation || !currentStates) return;
    const variants = currentStates[quality].variants;
    if (variants.length === 0) continue;
    currentStates[quality] = { ...currentStates[quality], status: "loading" };
    renderStates(true);
    let response: ExtensionResponse;
    try {
      response = await send({
        type: "fetch-steam-curves",
        marketHashNames: variants.map((variant) => variant.marketHashName)
      });
    } catch (error) {
      response = {
        ok: false,
        message: error instanceof Error ? error.message : "Curve request failed"
      };
    }
    if (thisGeneration !== generation || !currentStates) return;
    const outcomes =
      response.ok && response.type === "fetch-steam-curves"
        ? response.outcomes
        : variants.map((variant) => ({
            status: "error" as const,
            marketHashName: variant.marketHashName,
            message: response.ok ? "Unexpected response" : response.message
          }));
    currentStates[quality] = qualityStateFromOutcomes(quality, variants, outcomes);
    if (
      selectedQuality === null ||
      Object.keys(currentStates[selectedQuality].curvesByWear).length === 0
    ) {
      selectedQuality = firstAvailableQuality(currentStates);
    }
    renderStates(quality !== "souvenir");
  }

  if (thisGeneration !== generation || !currentStates) return;
  selectedQuality = selectedQuality ?? firstAvailableQuality(currentStates);
  if (!selectedQuality) {
    const requestFailed = Object.values(currentStates).some((state) => state.errorWears.length > 0);
    graphPanel.showMessage(
      requestFailed
        ? "Cslytics curve data could not be loaded. Try reloading the page."
        : "No Cslytics float curves are available for this item."
    );
  } else renderStates(false);
}

const routeObserver = new RouteChangeObserver(() => {
  void loadCurrentPage();
});
routeObserver.start();
void loadCurrentPage();

/**
 * Detach every listener, timer, and DOM node this module owns.
 *
 * A content script normally lives until the page unloads, so nothing calls this in production —
 * but the module installs a document-level observer and an interval at import, and without a way
 * to stop them a second instance keeps resurrecting the first one's panel. Tests import this
 * module repeatedly; they need it, and the observer already had `.stop()` going unused.
 */
export function stopSteamMarketContent(): void {
  generation += 1;
  routeObserver.stop();
  removePanel();
}
