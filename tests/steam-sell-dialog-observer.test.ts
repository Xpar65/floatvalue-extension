// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SteamSellDialogObserver } from "../src/content/steam-sell-dialog-observer";

afterEach(() => document.body.replaceChildren());

describe("SteamSellDialogObserver", () => {
  it("reports each open and close transition, including a reparented dialog", async () => {
    document.body.innerHTML = '<div id="holder"><dialog id="market_sell_dialog"></dialog></div>';
    const dialog = document.querySelector("#market_sell_dialog")!;
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const observer = new SteamSellDialogObserver(onOpen, onClose);
    observer.start();

    document.body.append(dialog);
    dialog.setAttribute("open", "");
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));

    dialog.removeAttribute("open");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    dialog.setAttribute("open", "");
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2));
    observer.stop();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("debounces changes from both Steam price inputs", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <dialog id="market_sell_dialog" open>
        <input id="market_sell_currency_input">
        <input id="market_sell_buyercurrency_input">
      </dialog>`;
    const onPriceChange = vi.fn();
    const observer = new SteamSellDialogObserver(vi.fn(), vi.fn(), onPriceChange);
    observer.start();
    const seller = document.querySelector<HTMLInputElement>("#market_sell_currency_input")!;
    const buyer = document.querySelector<HTMLInputElement>("#market_sell_buyercurrency_input")!;
    seller.dispatchEvent(new Event("input", { bubbles: true }));
    buyer.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    vi.advanceTimersByTime(74);
    expect(onPriceChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPriceChange).toHaveBeenCalledOnce();
    observer.stop();
    vi.useRealTimers();
  });
});
