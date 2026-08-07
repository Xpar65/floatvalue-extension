import { describe, expect, it, vi } from "vitest";
import { resolveSteamDisplayCurrency } from "../src/content/steam-display-currency";
import type { ExtensionRequest, ExtensionResponse } from "../src/shared/messages";

describe("resolveSteamDisplayCurrency", () => {
  it("resolves a wallet rate and preserves its date and stale state", async () => {
    const send = vi.fn(async (request: ExtensionRequest): Promise<ExtensionResponse> => {
      expect(request).toEqual({ type: "fetch-usd-fx-rate", quoteCurrency: "AUD" });
      return {
        ok: true,
        type: "fetch-usd-fx-rate",
        outcome: {
          status: "success",
          quote: {
            base: "USD",
            quote: "AUD",
            rate: 1.52,
            asOf: "2026-08-06",
            stale: true
          }
        }
      };
    });
    await expect(resolveSteamDisplayCurrency(21, send)).resolves.toMatchObject({
      walletCurrencyCode: "AUD",
      displayCurrency: { code: "AUD", usdRate: 1.52, fxAsOf: "2026-08-06", fxStale: true }
    });
  });

  it("uses an explicit USD fallback for unknown or unavailable wallet FX", async () => {
    const send = vi.fn(async (): Promise<ExtensionResponse> => ({
      ok: true,
      type: "fetch-usd-fx-rate",
      outcome: { status: "error", quoteCurrency: "AUD", message: "offline" }
    }));
    const unknown = await resolveSteamDisplayCurrency(999, send);
    expect(unknown).toMatchObject({ walletCurrencyCode: null, displayCurrency: { code: "USD" } });
    expect(unknown.notice).toContain("showing the estimate in USD");
    expect(send).not.toHaveBeenCalled();

    const unavailable = await resolveSteamDisplayCurrency(21, send);
    expect(unavailable).toMatchObject({
      walletCurrencyCode: "AUD",
      displayCurrency: { code: "USD" }
    });
    expect(unavailable.notice).toContain("AUD FX is unavailable");
  });
});
