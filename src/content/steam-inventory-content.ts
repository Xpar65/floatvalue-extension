import {
  classifySteamInventoryItem,
  type ClassifiedSteamInventoryItem
} from "../domain/steam-inventory-classifier";
import { steamCurrencyCode } from "../domain/steam-currency-codes";
import { priceAtFloat } from "../domain/price-at-float";
import type { SteamInventoryItemSnapshot, ValidatedCurve } from "../domain/types";
import { intersectWearWithPaint } from "../domain/wear-ranges";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import {
  parseSteamInventorySelectionDetail,
  STEAM_INVENTORY_SELECTION_EVENT,
  STEAM_INVENTORY_SELECTION_READY_EVENT,
  STEAM_INVENTORY_SELECTION_REQUEST_EVENT
} from "../shared/steam-inventory-selection-bridge";
import { GraphPanel, type DisplayCurrency } from "../ui/graph-panel";
import { InventoryEstimate } from "../ui/inventory-estimate";
import { resolveSteamDisplayCurrency } from "./steam-display-currency";
import {
  SteamInventorySelectionObserver,
  type SteamInventoryEstimateTarget
} from "./steam-inventory-selection-observer";
import { SteamSellDialogObserver } from "./steam-sell-dialog-observer";

interface ActiveSellGraph {
  panel: GraphPanel;
  item: ClassifiedSteamInventoryItem;
  curve: ValidatedCurve;
  stale: boolean;
  walletCurrencyCode: string | null;
  displayCurrency: DisplayCurrency;
  buyerPays: number | null;
  notice: string | null;
}

let generation = 0;
let priceGeneration = 0;
let panel: GraphPanel | null = null;
let activeGraph: ActiveSellGraph | null = null;
let restoreDialogStyle: (() => void) | null = null;
let selectionGeneration = 0;
let estimate: InventoryEstimate | null = null;
let estimateTarget: SteamInventoryEstimateTarget | null = null;
let activeTargetAnchor: HTMLElement | null = null;
let activeTargetMarketHashName: string | null = null;
let activeSnapshotSerialized: string | undefined;
let latestSelectionSnapshot: SteamInventoryItemSnapshot | null = null;
let latestSelectionSerialized: string | undefined;
let selectionWaitTimer: ReturnType<typeof setTimeout> | null = null;

const SELECTION_DATA_TIMEOUT_MS = 5_000;

/** Steam's own floor for a modal's distance from the top of the viewport (`CModal.AdjustSizing`). */
const DIALOG_VIEWPORT_MARGIN_PX = 12;
/** Extra room below Steam's confirm button so it never sits flush against the scroll boundary. */
const DIALOG_BOTTOM_BREATHING_ROOM_PX = 28;

/**
 * `.newmodal_content` is already Steam's scroll container: `CModal.AdjustSizing` caps it at
 * `viewportHeight - 120` and `shared_global.css` gives it `overflow: auto`, and the agreement
 * checkbox and confirm button live inside it. So the panel must not introduce a scroll container
 * of its own — that is the second scrollbar.
 *
 * What actually pushes the confirm button off-screen is the dialog's *position*. `AdjustSizing`
 * runs once inside `CModal.Show()`, before the panel mounts, and centres the dialog by writing a
 * fixed `top` derived from the height it had then. Growing the content afterwards extends the
 * dialog downwards from that stale `top`, past the bottom of a viewport it can no longer scroll
 * into. Re-run Steam's own centring formula whenever our content resizes it, and pad the scroll
 * container so the button is not flush with its bottom edge. The author's inline values are
 * remembered so closing the dialog leaves no trace.
 */
function keepDialogReachable(dialog: HTMLElement): void {
  restoreDialogStyle?.();

  const scroller = dialog.querySelector<HTMLElement>(".newmodal_content");
  const previousTop = dialog.style.top;
  const previousPaddingBottom = scroller?.style.paddingBottom ?? "";

  if (scroller) {
    const padding = Number.parseFloat(getComputedStyle(scroller).paddingBottom);
    const base = Number.isFinite(padding) ? padding : 0;
    scroller.style.paddingBottom = `${base + DIALOG_BOTTOM_BREATHING_ROOM_PX}px`;
  }

  const recentre = (): void => {
    // Touch-friendly mode drops the cap and positions the dialog absolutely, so the page itself
    // scrolls to the button; a viewport-relative `top` would be wrong there.
    if (getComputedStyle(dialog).position !== "fixed") return;
    const height = dialog.offsetHeight;
    if (height <= 0) return;
    const top = Math.max(
      DIALOG_VIEWPORT_MARGIN_PX,
      Math.floor((window.innerHeight - height) / 2)
    );
    dialog.style.top = `${top}px`;
  };

  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => recentre()) : null;
  observer?.observe(dialog);
  recentre();

  restoreDialogStyle = () => {
    observer?.disconnect();
    dialog.style.top = previousTop;
    if (scroller) scroller.style.paddingBottom = previousPaddingBottom;
  };
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

function removePanel(): void {
  panel?.remove();
  panel = null;
  activeGraph = null;
  restoreDialogStyle?.();
  restoreDialogStyle = null;
}

function removeEstimate(): void {
  if (selectionWaitTimer !== null) clearTimeout(selectionWaitTimer);
  selectionWaitTimer = null;
  estimate?.remove();
  estimate = null;
}

function renderActiveGraph(graph: ActiveSellGraph): void {
  graph.panel.renderSingleVariant({
    variant: graph.item.variant,
    curve: graph.curve,
    stale: graph.stale,
    itemFloat: graph.item.floatValue,
    displayCurrency: graph.displayCurrency,
    buyerPays: graph.buyerPays,
    notice: graph.notice
  });
}

async function handleDialogOpen(): Promise<void> {
  const thisGeneration = ++generation;
  priceGeneration += 1;
  removePanel();

  let extraction: ExtensionResponse;
  try {
    extraction = await send({ type: "extract-steam-inventory-item", source: "sell-dialog" });
  } catch {
    return;
  }
  if (thisGeneration !== generation) return;
  if (!extraction.ok || extraction.type !== "extract-steam-inventory-item") return;

  const item = classifySteamInventoryItem(location.href, extraction.snapshot);
  if (!item) return;
  const anchor = document.querySelector<HTMLElement>("#market_sell_dialog #pricehistory_container");
  if (!anchor) return;

  const dialog = anchor.closest<HTMLElement>("#market_sell_dialog");
  if (dialog) keepDialogReachable(dialog);

  const graphPanel = new GraphPanel(anchor, "after");
  panel = graphPanel;
  graphPanel.showLoading("Loading this item's fair-price curve…");

  const [curveResponse, currency] = await Promise.all([
    send({ type: "fetch-steam-curves", marketHashNames: [item.variant.marketHashName] }).catch(
      (error: unknown): ExtensionResponse => ({
        ok: false,
        message: error instanceof Error ? error.message : "Curve request failed"
      })
    ),
    resolveSteamDisplayCurrency(item.walletCurrencyId, send)
  ]);
  if (thisGeneration !== generation || panel !== graphPanel) return;

  if (!curveResponse.ok || curveResponse.type !== "fetch-steam-curves") {
    graphPanel.showMessage(
      "The Cslytics curve could not be loaded. Close and reopen the sell dialog to retry."
    );
    return;
  }
  const outcome = curveResponse.outcomes.find(
    (candidate) => candidate.marketHashName === item.variant.marketHashName
  );
  if (!outcome || outcome.status === "error") {
    graphPanel.showMessage(
      "The Cslytics curve could not be loaded. Close and reopen the sell dialog to retry."
    );
  } else if (outcome.status === "missing") {
    graphPanel.showMessage("No Cslytics float curve is available for this item.");
  } else {
    activeGraph = {
      panel: graphPanel,
      item,
      curve: outcome.curve,
      stale: outcome.stale,
      walletCurrencyCode: currency.walletCurrencyCode,
      displayCurrency: currency.displayCurrency,
      buyerPays: null,
      notice: currency.notice
    };
    renderActiveGraph(activeGraph);
    void refreshBuyerPrice();
  }
}

async function resolveInventoryEstimate(
  target: SteamInventoryEstimateTarget,
  snapshot: SteamInventoryItemSnapshot,
  inlineEstimate: InventoryEstimate,
  thisGeneration: number
): Promise<void> {
  const item = classifySteamInventoryItem(location.href, snapshot);
  if (!item || item.variant.marketHashName !== target.marketHashName) {
    inlineEstimate.showUnavailable("Selected item data is unavailable.");
    return;
  }

  if (item.floatValue === null) {
    inlineEstimate.showUnavailable("Float unavailable for this item.");
    return;
  }

  const [curveResponse, currency] = await Promise.all([
    send({ type: "fetch-steam-curves", marketHashNames: [item.variant.marketHashName] }).catch(
      (error: unknown): ExtensionResponse => ({
        ok: false,
        message: error instanceof Error ? error.message : "Curve request failed"
      })
    ),
    resolveSteamDisplayCurrency(item.walletCurrencyId, send)
  ]);
  if (
    thisGeneration !== selectionGeneration ||
    estimate !== inlineEstimate ||
    !target.anchor.isConnected
  ) {
    return;
  }

  if (!curveResponse.ok || curveResponse.type !== "fetch-steam-curves") {
    inlineEstimate.showUnavailable("The Cslytics curve could not be loaded.");
    return;
  }
  const outcome = curveResponse.outcomes.find(
    (candidate) => candidate.marketHashName === item.variant.marketHashName
  );
  if (!outcome || outcome.status === "error") {
    inlineEstimate.showUnavailable("The Cslytics curve could not be loaded.");
    return;
  }
  if (outcome.status === "missing") {
    inlineEstimate.showUnavailable("No Cslytics Steam curve is available for this item.");
    return;
  }

  const visibleRange = intersectWearWithPaint(
    item.variant.wear,
    outcome.curve.floatRange.min,
    outcome.curve.floatRange.max
  );
  if (
    visibleRange === null ||
    item.floatValue < visibleRange.min ||
    item.floatValue > visibleRange.max
  ) {
    inlineEstimate.showUnavailable("The item float is outside this curve's usable range.");
    return;
  }
  const estimateUsd = priceAtFloat(outcome.curve.fairPrice.vertices, item.floatValue);
  if (estimateUsd === null) {
    inlineEstimate.showUnavailable("No fair-price value is available at this float.");
    return;
  }
  inlineEstimate.renderEstimate({
    estimateUsd,
    displayCurrency: currency.displayCurrency,
    curve: outcome.curve,
    curveStale: outcome.stale,
    currencyNotice: currency.notice
  });
}

function resetInventoryEstimate(target: SteamInventoryEstimateTarget): void {
  const thisGeneration = ++selectionGeneration;
  removeEstimate();
  activeTargetAnchor = target.anchor;
  activeTargetMarketHashName = target.marketHashName;
  activeSnapshotSerialized = latestSelectionSerialized;

  const inlineEstimate = new InventoryEstimate(target.anchor);
  estimate = inlineEstimate;
  inlineEstimate.showLoading();

  const snapshot = latestSelectionSnapshot;
  if (!snapshot || snapshot.marketHashName !== target.marketHashName) {
    selectionWaitTimer = setTimeout(() => {
      selectionWaitTimer = null;
      if (
        thisGeneration === selectionGeneration &&
        estimate === inlineEstimate &&
        target.anchor.isConnected &&
        latestSelectionSnapshot?.marketHashName !== target.marketHashName
      ) {
        inlineEstimate.showUnavailable("Selected item data is still loading from Steam.");
      }
    }, SELECTION_DATA_TIMEOUT_MS);
    return;
  }

  void resolveInventoryEstimate(target, snapshot, inlineEstimate, thisGeneration);
}

function reconcileInventorySelection(): void {
  const target = estimateTarget;
  if (!target) {
    if (estimate || activeTargetAnchor) {
      selectionGeneration += 1;
      removeEstimate();
    }
    activeTargetAnchor = null;
    activeTargetMarketHashName = null;
    activeSnapshotSerialized = latestSelectionSerialized;
    return;
  }

  const unchanged =
    activeTargetAnchor === target.anchor &&
    activeTargetMarketHashName === target.marketHashName &&
    activeSnapshotSerialized === latestSelectionSerialized &&
    estimate?.element.isConnected === true;
  if (unchanged) return;
  resetInventoryEstimate(target);
}

function handleSelectionEvent(event: Event): void {
  const parsed = parseSteamInventorySelectionDetail((event as CustomEvent<unknown>).detail);
  if (!parsed.ok) return;
  latestSelectionSnapshot = parsed.snapshot;
  latestSelectionSerialized = parsed.serialized;
  reconcileInventorySelection();
}

function requestCurrentSelection(): void {
  window.dispatchEvent(new Event(STEAM_INVENTORY_SELECTION_REQUEST_EVENT));
}

async function refreshBuyerPrice(): Promise<void> {
  const thisPriceGeneration = ++priceGeneration;
  const graph = activeGraph;
  if (!graph) return;
  let response: ExtensionResponse;
  try {
    response = await send({ type: "extract-steam-sell-buyer-price" });
  } catch {
    if (thisPriceGeneration === priceGeneration && activeGraph === graph) {
      graph.buyerPays = null;
      renderActiveGraph(graph);
    }
    return;
  }
  if (thisPriceGeneration !== priceGeneration || activeGraph !== graph) return;
  if (!response.ok || response.type !== "extract-steam-sell-buyer-price") {
    graph.buyerPays = null;
    renderActiveGraph(graph);
    return;
  }

  const dynamicCurrency = steamCurrencyCode(response.snapshot.walletCurrencyId);
  const currenciesMatch =
    dynamicCurrency !== null &&
    dynamicCurrency === graph.walletCurrencyCode &&
    dynamicCurrency === graph.displayCurrency.code;
  const cents = response.snapshot.buyerPriceCents;
  graph.buyerPays =
    currenciesMatch && typeof cents === "number" && Number.isSafeInteger(cents) && cents > 0
      ? cents / 100
      : null;
  renderActiveGraph(graph);
}

function handleDialogClose(): void {
  generation += 1;
  priceGeneration += 1;
  removePanel();
}

const observer = new SteamSellDialogObserver(
  () => void handleDialogOpen(),
  handleDialogClose,
  () => void refreshBuyerPrice()
);
observer.start();

const selectionObserver = new SteamInventorySelectionObserver(
  (target) => {
    estimateTarget = target;
    reconcileInventorySelection();
  }
);
window.addEventListener(STEAM_INVENTORY_SELECTION_EVENT, handleSelectionEvent);
window.addEventListener(STEAM_INVENTORY_SELECTION_READY_EVENT, requestCurrentSelection);
selectionObserver.start();
requestCurrentSelection();
