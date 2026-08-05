import { SteamCurveClient } from "./curve-client";
import { extractSteamMarketRouteSnapshot } from "../page/extract-steam-market-route";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";

const curveClient = new SteamCurveClient();

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

  return { ok: false, message: "Unknown extension request" };
}
