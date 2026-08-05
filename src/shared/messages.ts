import type {
  CurveFetchOutcome,
  SteamMarketRouteSnapshot
} from "../domain/types";

export type ExtensionRequest =
  | { type: "extract-steam-market-route" }
  | { type: "fetch-steam-curves"; marketHashNames: string[] };

export type ExtensionResponse =
  | {
      ok: true;
      type: "extract-steam-market-route";
      snapshot: SteamMarketRouteSnapshot | null;
    }
  | {
      ok: true;
      type: "fetch-steam-curves";
      outcomes: CurveFetchOutcome[];
    }
  | {
      ok: false;
      message: string;
    };
