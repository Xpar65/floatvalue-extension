/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://steamcommunity.com/my/inventory"}
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionRequest, ExtensionResponse } from "../src/shared/messages";
import { makeCurve } from "./fixtures";

const NAME = "R8 Revolver | Dark Chamber (Minimal Wear)";
/** The stale, pre-mount value `CModal.AdjustSizing` leaves on the dialog. */
const STALE_TOP = "151px";

let resizeCallback: (() => void) | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    resizeCallback = null;
  }
}

function setDialogHeight(dialog: HTMLElement, height: number): void {
  Object.defineProperty(dialog, "offsetHeight", { value: height, configurable: true });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Steam sell dialog layout", () => {
  it("re-centres Steam's dialog instead of nesting a second scroll container", async () => {
    const curve = makeCurve(NAME, [
      [0.07, 0.08],
      [0.08, 0.12]
    ]);
    curve.floatRange = { min: 0, max: 1 };
    const sendMessage = vi.fn(async (request: ExtensionRequest): Promise<ExtensionResponse> => {
      switch (request.type) {
        case "extract-steam-inventory-item":
          return {
            ok: true,
            type: "extract-steam-inventory-item",
            snapshot: {
              appid: 730,
              marketHashName: NAME,
              marketable: true,
              commodity: false,
              floatValue: 0.075119756,
              walletCurrencyId: 1,
              tags: [
                { category: "Quality", internalName: "normal" },
                { category: "Exterior", internalName: "WearCategory1" }
              ]
            }
          };
        case "fetch-steam-curves":
          return {
            ok: true,
            type: "fetch-steam-curves",
            outcomes: [{ status: "success", marketHashName: NAME, curve, stale: false }]
          };
        case "extract-steam-sell-buyer-price":
          return {
            ok: true,
            type: "extract-steam-sell-buyer-price",
            snapshot: { buyerPriceCents: 11, walletCurrencyId: 1 }
          };
        default:
          return { ok: false, message: `Unexpected request: ${request.type}` };
      }
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    // Steam's own skeleton: `.newmodal_content` is the scroll container, capped by
    // `CModal.AdjustSizing`, and it holds the confirm button. See the inventory HAR.
    document.body.innerHTML = `
      <style>.newmodal_content { padding-bottom: 24px; overflow: auto; }</style>
      <dialog id="market_sell_dialog" class="newmodal" open
              style="position:fixed;left:200px;top:${STALE_TOP}">
        <div class="newmodal_header_border"><div class="newmodal_header"></div></div>
        <div class="newmodal_content_border">
          <div class="newmodal_content" style="max-height:648px">
            <div class="market_dialog_content_frame">
              <div id="pricehistory_container"></div>
              <button id="market_sell_dialog_accept"><span>OK, put it up for sale</span></button>
            </div>
          </div>
        </div>
      </dialog>`;
    const dialog = document.querySelector<HTMLElement>("#market_sell_dialog")!;
    const scroller = document.querySelector<HTMLElement>(".newmodal_content")!;
    const basePaddingBottom = getComputedStyle(scroller).paddingBottom;
    setDialogHeight(dialog, 700);

    await import("../src/content/steam-inventory-content");
    await flush();

    const host = document.querySelector<HTMLElement>("#cslytics-float-curves")!;
    expect(host.previousElementSibling?.id).toBe("pricehistory_container");
    expect(host.shadowRoot?.querySelector("svg")).not.toBeNull();

    // One scrollbar: the dialog itself must stay unclipped so only `.newmodal_content` scrolls.
    expect(dialog.style.overflowY).toBe("");
    expect(dialog.style.overflow).toBe("");
    expect(dialog.style.maxHeight).toBe("");

    // Re-centred against the height the panel actually gave it, so the bottom of the dialog —
    // and with it the confirm button — stays inside the viewport.
    expect(dialog.style.top).toBe("34px");
    expect(700 + 34).toBeLessThanOrEqual(window.innerHeight);

    // The confirm button no longer sits flush against the bottom of the scroll container.
    expect(Number.parseFloat(scroller.style.paddingBottom)).toBeGreaterThan(
      Number.parseFloat(basePaddingBottom)
    );
    expect(Number.parseFloat(scroller.style.paddingBottom)).toBe(24 + 28);

    // Later height changes (loading row → graph, collapsing the panel) re-centre too.
    setDialogHeight(dialog, 720);
    resizeCallback?.();
    expect(dialog.style.top).toBe("24px");

    dialog.removeAttribute("open");
    await flush();

    expect(document.querySelector("#cslytics-float-curves")).toBeNull();
    expect(dialog.style.top).toBe(STALE_TOP);
    expect(scroller.style.paddingBottom).toBe("");
    expect(resizeCallback).toBeNull();
  });
});
