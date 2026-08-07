import { steamCurrencyCode, type SteamCurrencyIso } from "../domain/steam-currency-codes";
import type { ExtensionRequest, ExtensionResponse } from "../shared/messages";
import { USD_DISPLAY_CURRENCY, type DisplayCurrency } from "../ui/display-format";

type SendExtensionRequest = (request: ExtensionRequest) => Promise<ExtensionResponse>;

export interface SteamDisplayCurrencyResolution {
  walletCurrencyCode: SteamCurrencyIso | null;
  displayCurrency: DisplayCurrency;
  notice: string | null;
}

export async function resolveSteamDisplayCurrency(
  walletCurrencyId: number | null,
  send: SendExtensionRequest
): Promise<SteamDisplayCurrencyResolution> {
  const walletCurrencyCode = steamCurrencyCode(walletCurrencyId);
  if (walletCurrencyCode === null) {
    return {
      walletCurrencyCode,
      displayCurrency: USD_DISPLAY_CURRENCY,
      notice: "Steam wallet currency not recognized; showing the estimate in USD."
    };
  }
  if (walletCurrencyCode === "USD") {
    return { walletCurrencyCode, displayCurrency: USD_DISPLAY_CURRENCY, notice: null };
  }

  try {
    const response = await send({
      type: "fetch-usd-fx-rate",
      quoteCurrency: walletCurrencyCode
    });
    if (
      response.ok &&
      response.type === "fetch-usd-fx-rate" &&
      response.outcome.status === "success"
    ) {
      const quote = response.outcome.quote;
      return {
        walletCurrencyCode,
        displayCurrency: {
          code: quote.quote,
          usdRate: quote.rate,
          fxAsOf: quote.asOf,
          fxStale: quote.stale
        },
        notice: quote.stale ? "Using a cached FX rate because the live rate is unavailable." : null
      };
    }
  } catch {
    // The truthful fallback below keeps wallet prices off a USD axis.
  }

  return {
    walletCurrencyCode,
    displayCurrency: USD_DISPLAY_CURRENCY,
    notice: `${walletCurrencyCode} FX is unavailable; showing the estimate in USD.`
  };
}
