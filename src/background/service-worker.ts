import { SteamCurveClient } from "./curve-client";
import { extractSteamMarketRouteSnapshot } from "../page/extract-steam-market-route";
import { extractSteamInventoryItemSnapshot } from "../page/extract-steam-inventory-item";
import { extractSteamSellBuyerPriceSnapshot } from "../page/extract-steam-sell-buyer-price";
import { FxRateClient } from "./fx-rate-client";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";

const curveClient = new SteamCurveClient();
const fxRateClient = new FxRateClient();

chrome.runtime.onMessage.addListener(
  (
    request: ExtensionRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    void handleRequest(request, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "Unknown extension error"
        });
      });
    return true;
  }
);

async function handleRequest(
  request: ExtensionRequest,
  sender: chrome.runtime.MessageSender
): Promise<ExtensionResponse> {
  if (request.type === "extract-steam-market-route") {
    const tabId = sender.tab?.id;
    if (tabId === undefined) throw new Error("Route extraction requires a sender tab");
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId ?? 0] },
      world: "MAIN",
      func: extractSteamMarketRouteSnapshot
    });
    return {
      ok: true,
      type: "extract-steam-market-route",
      snapshot: results[0]?.result ?? null
    };
  }

  if (request.type === "extract-steam-inventory-item") {
    const tabId = sender.tab?.id;
    if (tabId === undefined) throw new Error("Inventory extraction requires a sender tab");
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId ?? 0] },
      world: "MAIN",
      func: extractSteamInventoryItemSnapshot,
      args: [request.source]
    });
    return {
      ok: true,
      type: "extract-steam-inventory-item",
      snapshot: results[0]?.result ?? null
    };
  }

  if (request.type === "extract-steam-sell-buyer-price") {
    const tabId = sender.tab?.id;
    if (tabId === undefined) throw new Error("Buyer-price extraction requires a sender tab");
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId ?? 0] },
      world: "MAIN",
      func: extractSteamSellBuyerPriceSnapshot
    });
    return {
      ok: true,
      type: "extract-steam-sell-buyer-price",
      snapshot: results[0]?.result ?? { buyerPriceCents: null, walletCurrencyId: null }
    };
  }

  if (request.type === "fetch-steam-curves") {
    if (!Array.isArray(request.marketHashNames) || request.marketHashNames.length > 20) {
      throw new Error("Invalid curve request batch");
    }
    if (!request.marketHashNames.every((name) => typeof name === "string" && name.length > 0)) {
      throw new Error("Invalid market_hash_name");
    }
    return {
      ok: true,
      type: "fetch-steam-curves",
      outcomes: await curveClient.fetchMany(request.marketHashNames)
    };
  }


  if (request.type === "fetch-usd-fx-rate") {
    if (typeof request.quoteCurrency !== "string" || !/^[A-Z]{3}$/.test(request.quoteCurrency)) {
      throw new Error("Invalid FX quote currency");
    }
    return {
      ok: true,
      type: "fetch-usd-fx-rate",
      outcome: await fxRateClient.fetchRate(request.quoteCurrency)
    };
  }

  return { ok: false, message: "Unknown extension request" };
}
