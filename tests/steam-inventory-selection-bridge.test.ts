// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSteamInventorySelectionBridge } from "../src/page/steam-inventory-selection-bridge";
import {
  parseSteamInventorySelectionDetail,
  STEAM_INVENTORY_SELECTION_EVENT,
  STEAM_INVENTORY_SELECTION_REQUEST_EVENT
} from "../src/shared/steam-inventory-selection-bridge";

function selectedItem(name = "R8 Revolver | Leafhopper (Factory New)") {
  return {
    appid: 730,
    assetid: "private-asset-id",
    description: {
      market_hash_name: name,
      marketable: 1,
      commodity: 0,
      tags: [
        { category: "Quality", internal_name: "normal" },
        { category: "Exterior", internal_name: "WearCategory0" }
      ]
    },
    asset_properties: [{ propertyid: 2, float_value: "0.075119756" }]
  };
}

let dispose: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  delete (globalThis as typeof globalThis & { g_ActiveInventory?: unknown }).g_ActiveInventory;
  delete (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo;
});

afterEach(() => {
  dispose?.();
  dispose = null;
  vi.useRealTimers();
});

describe("Steam inventory MAIN-world selection bridge", () => {
  it("emits the sanitized selection when Steam data arrives after the bridge", async () => {
    const details: string[] = [];
    window.addEventListener(STEAM_INVENTORY_SELECTION_EVENT, ((event: CustomEvent<string>) => {
      details.push(event.detail);
    }) as EventListener);
    const bridge = installSteamInventorySelectionBridge();
    dispose = () => bridge.dispose();
    expect(parseSteamInventorySelectionDetail(details.at(-1))).toEqual({
      ok: true,
      snapshot: null,
      serialized: "null"
    });

    (globalThis as typeof globalThis & { g_ActiveInventory?: unknown }).g_ActiveInventory = {
      selectedItem: selectedItem()
    };
    (globalThis as typeof globalThis & { g_rgWalletInfo?: unknown }).g_rgWalletInfo = {
      wallet_currency: 21
    };
    await vi.advanceTimersByTimeAsync(50);

    const parsed = parseSteamInventorySelectionDetail(details.at(-1));
    expect(parsed.ok && parsed.snapshot).toMatchObject({
      appid: 730,
      marketHashName: "R8 Revolver | Leafhopper (Factory New)",
      floatValue: 0.075119756,
      walletCurrencyId: 21
    });
    expect(details.at(-1)).not.toContain("private-asset-id");

    const eventCount = details.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(details).toHaveLength(eventCount);
  });

  it("responds with the current snapshot when the isolated listener starts later", () => {
    (globalThis as typeof globalThis & { g_ActiveInventory?: unknown }).g_ActiveInventory = {
      selectedItem: selectedItem("R8 Revolver | Dark Chamber (Minimal Wear)")
    };
    const bridge = installSteamInventorySelectionBridge();
    dispose = () => bridge.dispose();

    const details: string[] = [];
    window.addEventListener(STEAM_INVENTORY_SELECTION_EVENT, ((event: CustomEvent<string>) => {
      details.push(event.detail);
    }) as EventListener);
    window.dispatchEvent(new Event(STEAM_INVENTORY_SELECTION_REQUEST_EVENT));

    const parsed = parseSteamInventorySelectionDetail(details.at(-1));
    expect(parsed.ok && parsed.snapshot?.marketHashName).toBe(
      "R8 Revolver | Dark Chamber (Minimal Wear)"
    );
  });

  it("rejects malformed cross-world event payloads", () => {
    expect(parseSteamInventorySelectionDetail("not-json")).toEqual({ ok: false });
    expect(
      parseSteamInventorySelectionDetail(
        JSON.stringify({
          appid: 730,
          marketHashName: "Bad",
          marketable: true,
          commodity: false,
          floatValue: 0.1,
          walletCurrencyId: null,
          tags: [null]
        })
      )
    ).toEqual({ ok: false });
  });
});
