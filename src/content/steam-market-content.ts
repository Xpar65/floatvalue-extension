import { emptyQualityState, firstAvailableQuality, qualityStateFromOutcomes } from "../domain/quality-state";
import { classifySteamMarketPage } from "../domain/steam-page-classifier";
import { variantsForQuality } from "../domain/steam-variants";
import type { Quality, QualityCurveState } from "../domain/types";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import { GraphPanel } from "../ui/graph-panel";
import { RouteChangeObserver } from "./route-change-observer";
import { findSteamPriceHistorySection } from "./steam-inline-mount";

let generation = 0;
let panel: GraphPanel | null = null;
let selectedQuality: Quality | null = null;
let currentStates: Record<Quality, QualityCurveState> | null = null;

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;
}

function ensurePanel(): GraphPanel {
  panel ??= new GraphPanel(findSteamPriceHistorySection());
  panel.mountBefore(findSteamPriceHistorySection());
  return panel;
}

function removePanel(): void {
  panel?.remove();
  panel = null;
  selectedQuality = null;
  currentStates = null;
}

function renderStates(loading: boolean): void {
  if (!panel || !currentStates) return;
  panel.render({
    states: currentStates,
    selectedQuality,
    loading,
    onSelectQuality: (quality) => {
      if (!currentStates || Object.keys(currentStates[quality].curvesByWear).length === 0) return;
      selectedQuality = quality;
      renderStates(loading);
    }
  });
}

async function loadCurrentPage(): Promise<void> {
  const thisGeneration = ++generation;
  let extraction: ExtensionResponse;
  try {
    extraction = await send({ type: "extract-steam-market-route" });
  } catch {
    if (thisGeneration === generation) removePanel();
    return;
  }
  if (thisGeneration !== generation) return;
  if (!extraction.ok || extraction.type !== "extract-steam-market-route") {
    removePanel();
    return;
  }
  const group = classifySteamMarketPage(location.href, extraction.snapshot);
  if (!group) {
    removePanel();
    return;
  }

  const graphPanel = ensurePanel();
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
