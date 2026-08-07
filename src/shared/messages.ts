import type {
  CurveFetchOutcome,
  FxRateOutcome,
  SteamInventoryItemSnapshot,
  SteamInventoryItemSource,
  SteamMarketRouteSnapshot,
  SteamSellBuyerPriceSnapshot
} from "../domain/types";

export type ExtensionRequest =
  | { type: "extract-steam-market-route" }
  | { type: "extract-steam-inventory-item"; source: SteamInventoryItemSource }
  | { type: "extract-steam-sell-buyer-price" }
  | { type: "fetch-steam-curves"; marketHashNames: string[] }
  | { type: "fetch-usd-fx-rate"; quoteCurrency: string };

export type ExtensionResponse =
  | {
      ok: true;
      type: "extract-steam-market-route";
      snapshot: SteamMarketRouteSnapshot | null;
    }
  | {
      ok: true;
      type: "extract-steam-inventory-item";
      snapshot: SteamInventoryItemSnapshot | null;
    }
  | {
      ok: true;
      type: "extract-steam-sell-buyer-price";
      snapshot: SteamSellBuyerPriceSnapshot;
    }
  | {
      ok: true;
      type: "fetch-steam-curves";
      outcomes: CurveFetchOutcome[];
    }
  | {
      ok: true;
      type: "fetch-usd-fx-rate";
      outcome: FxRateOutcome;
    }
  | {
      ok: false;
      message: string;
    };
