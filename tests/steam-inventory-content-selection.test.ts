/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://steamcommunity.com/my/inventory"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamInventoryItemSnapshot } from "../src/domain/types";
import type { ExtensionRequest, ExtensionResponse } from "../src/shared/messages";
import { STEAM_INVENTORY_SELECTION_EVENT } from "../src/shared/steam-inventory-selection-bridge";
import { makeCurve } from "./fixtures";

const NAME = "R8 Revolver | Dark Chamber (Minimal Wear)";

function snapshot(marketHashName: string): SteamInventoryItemSnapshot {
  return {
    appid: 730,
    marketHashName,
    marketable: true,
    commodity: false,
    floatValue: 0.075119756,
    walletCurrencyId: 1,
    tags: [
      { category: "Quality", internalName: "normal" },
      { category: "Exterior", internalName: "WearCategory1" }
    ]
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Steam inventory selected-item orchestration", () => {
  it("shows loading immediately and waits for the snapshot matching the visible market link", async () => {
    vi.useFakeTimers();
    const curve = makeCurve(NAME, [
      [0.07, 0.08],
      [0.08, 0.12]
    ]);
    curve.floatRange = { min: 0, max: 1 };
    const sendMessage = vi.fn(
      async (request: ExtensionRequest): Promise<ExtensionResponse> => {
        if (request.type === "fetch-steam-curves") {
          return {
            ok: true,
            type: "fetch-steam-curves",
            outcomes: [
              { status: "success", marketHashName: NAME, curve, stale: false }
            ]
          };
        }
        return { ok: false, message: `Unexpected request: ${request.type}` };
      }
    );
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    // Same shape Steam renders: focus-nav wrapper, then the description container holding the
    // content block and the sell block. See tests/steam-inventory-selection-observer.test.ts.
    document.body.innerHTML = `
      <div id="iteminfo0" data-featuretarget="iteminfo" style="position:absolute"></div>
      <div id="iteminfo1" data-featuretarget="iteminfo" style="position:static">
        <div class="focus-nav-wrapper">
          <div class="ItemDescription">
            <div class="content">
              <img src="https://community.fastly.steamstatic.com/economy/image/abc123/330x192">
              <div>Wear Rating: <span>0.075119756</span></div>
            </div>
            <div id="market-actions">
              <div>Starting at: A$ 0.09</div>
              <a href="https://steamcommunity.com/market/listings/730/R8%20Revolver%20%7C%20Dark%20Chamber%20(Minimal%20Wear)">View in Community Market</a>
            </div>
          </div>
        </div>
      </div>`;

    await import("../src/content/steam-inventory-content");
    const market = document.querySelector<HTMLElement>("#market-actions")!;
    const host = market.previousElementSibling as HTMLElement;
    expect(host.id).toBe("cslytics-inventory-estimate");
    expect(host.shadowRoot?.textContent).toContain("Loading");

    window.dispatchEvent(
      new CustomEvent(STEAM_INVENTORY_SELECTION_EVENT, {
        detail: JSON.stringify(snapshot("R8 Revolver | Leafhopper (Factory New)"))
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(sendMessage).not.toHaveBeenCalled();

    window.dispatchEvent(
      new CustomEvent(STEAM_INVENTORY_SELECTION_EVENT, {
        detail: JSON.stringify(snapshot(NAME))
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: "fetch-steam-curves",
      marketHashNames: [NAME]
    });
    expect(sendMessage).not.toHaveBeenCalledWith({
      type: "extract-steam-inventory-item",
      source: "selection"
    });
    expect(market.previousElementSibling?.id).toBe("cslytics-inventory-estimate");
    expect((market.previousElementSibling as HTMLElement).shadowRoot?.textContent).toContain(
      "USD"
    );
    expect((market.previousElementSibling as HTMLElement).shadowRoot?.querySelector("canvas")).toBeNull();
  });
});
