// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findSteamInventoryEstimateAnchor,
  findSteamInventoryEstimateTarget,
  SteamInventorySelectionObserver
} from "../src/content/steam-inventory-selection-observer";

/**
 * Mirrors the panel Steam actually renders: an empty `[data-featuretarget=iteminfo]` root that React
 * portals into, a focus-nav wrapper `<div>`, then the bordered description container holding the
 * content block (image … Wear Rating) and the sell block (Starting at / listing link / Sell).
 * `accessories` reproduces the extra market links stickers and charms add inside the content block.
 */
function itemInfo(
  id: string,
  position: "absolute" | "static",
  name: string,
  accessories: string[] = []
): string {
  return `
    <div id="${id}" data-featuretarget="iteminfo" style="position:${position}">
      <div class="focus-nav-wrapper">
        <div class="ItemDescription">
          <div class="content">
            <img src="https://community.fastly.steamstatic.com/economy/image/abc123/330x192">
            <div class="item-name">${name}</div>
            ${accessories
              .map(
                (accessory) => `
            <div class="accessory">
              <a href="https://steamcommunity.com/market/listings/730/${encodeURIComponent(
                accessory
              )}">${accessory}</a>
            </div>`
              )
              .join("")}
            <div class="wear-rating">Wear Rating: <span>0.013942285</span></div>
          </div>
          <div class="market-actions">
            <div>Starting at: A$ 0.40</div>
            <a href="https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}">
              View in Community Market
            </a>
            <button>Sell</button>
          </div>
        </div>
      </div>
    </div>`;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("SteamInventorySelectionObserver", () => {
  it("finds the active React market block through Steam's focus-nav wrapper", () => {
    document.body.innerHTML = `
      <div class="inventory_page_right">
        ${itemInfo("iteminfo0", "absolute", "Old Item (Factory New)")}
        ${itemInfo("iteminfo1", "static", "R8 Revolver | Leafhopper (Factory New)")}
      </div>`;

    const anchor = findSteamInventoryEstimateAnchor();
    expect(anchor).toBe(document.querySelector("#iteminfo1 .market-actions"));
    expect(anchor?.previousElementSibling?.className).toBe("content");
    expect(findSteamInventoryEstimateTarget()?.marketHashName).toBe(
      "R8 Revolver | Leafhopper (Factory New)"
    );
  });

  it("ignores the market links attached stickers and charms render above the sell block", () => {
    document.body.innerHTML = `
      <div class="inventory_page_right">
        ${itemInfo("iteminfo0", "absolute", "Old Item (Factory New)")}
        ${itemInfo("iteminfo1", "static", "AK-47 | Redline (Field-Tested)", [
          "Sticker | Titan (Holo) | Katowice 2014",
          "Charm | Die-cast AK"
        ])}
      </div>`;

    expect(findSteamInventoryEstimateAnchor()).toBe(
      document.querySelector("#iteminfo1 .market-actions")
    );
    expect(findSteamInventoryEstimateTarget()?.marketHashName).toBe(
      "AK-47 | Redline (Field-Tested)"
    );
  });

  it("reports no target for a panel React has not filled in yet", () => {
    document.body.innerHTML = `
      <div class="inventory_page_right">
        <div id="iteminfo0" data-featuretarget="iteminfo"></div>
        <div id="iteminfo1" data-featuretarget="iteminfo"></div>
      </div>`;

    expect(findSteamInventoryEstimateTarget()).toBeNull();
  });

  it("continuously reports the active target and notices a reused panel's changed link", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="inventory_page_right">
        ${itemInfo("iteminfo0", "absolute", "Old Item (Factory New)")}
        ${itemInfo("iteminfo1", "static", "R8 Revolver | Leafhopper (Factory New)")}
      </div>`;
    const onSelection = vi.fn();
    const observer = new SteamInventorySelectionObserver(onSelection);
    observer.start();
    const firstAnchor = document.querySelector<HTMLElement>("#iteminfo1 .market-actions")!;
    expect(onSelection).toHaveBeenLastCalledWith({
      anchor: firstAnchor,
      marketHashName: "R8 Revolver | Leafhopper (Factory New)"
    });

    firstAnchor.append(document.createElement("div"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSelection).toHaveBeenLastCalledWith({
      anchor: firstAnchor,
      marketHashName: "R8 Revolver | Leafhopper (Factory New)"
    });

    firstAnchor.querySelector("a")!.href =
      "https://steamcommunity.com/market/listings/730/R8%20Revolver%20%7C%20Dark%20Chamber%20(Minimal%20Wear)";
    await vi.advanceTimersByTimeAsync(250);
    expect(onSelection).toHaveBeenLastCalledWith({
      anchor: firstAnchor,
      marketHashName: "R8 Revolver | Dark Chamber (Minimal Wear)"
    });

    document.querySelector<HTMLElement>("#iteminfo1")!.style.position = "absolute";
    document.querySelector<HTMLElement>("#iteminfo0")!.style.position = "static";
    await vi.advanceTimersByTimeAsync(0);
    expect(onSelection).toHaveBeenLastCalledWith({
      anchor: document.querySelector<HTMLElement>("#iteminfo0 .market-actions"),
      marketHashName: "Old Item (Factory New)"
    });

    observer.stop();
    expect(onSelection).toHaveBeenLastCalledWith(null);
  });
});
