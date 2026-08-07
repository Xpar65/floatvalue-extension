import type { SteamMarketRouteSnapshot } from "../domain/types";

/**
 * This function is passed directly to chrome.scripting.executeScript in MAIN world.
 * Keep it self-contained: imported helpers are not available after Chrome serializes it.
 */
export function extractSteamMarketRouteSnapshot(): SteamMarketRouteSnapshot | null {
  const pageGlobal = globalThis as typeof globalThis & {
    SSR?: { loaderData?: unknown[] };
    g_rgWalletInfo?: unknown;
    __cslyticsRouteHookInstalled?: boolean;
  };
  if (!pageGlobal.__cslyticsRouteHookInstalled) {
    pageGlobal.__cslyticsRouteHookInstalled = true;
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      history[method] = function (
        this: History,
        ...args: Parameters<History[typeof method]>
      ): void {
        original.apply(this, args);
        document.dispatchEvent(new Event("cslytics:locationchange"));
      } as History[typeof method];
    }
  }
  // Same global the inventory extractor reads; it belongs to Steam's shared page chrome rather
  // than to the route data, so it is captured independently and may legitimately be absent.
  const walletInfo = pageGlobal.g_rgWalletInfo;
  const rawWalletCurrency =
    typeof walletInfo === "object" && walletInfo !== null
      ? (walletInfo as Record<string, unknown>).wallet_currency
      : undefined;
  const chromeCurrencyId =
    typeof rawWalletCurrency === "number" && Number.isInteger(rawWalletCurrency)
      ? rawWalletCurrency
      : null;

  const loaderData = pageGlobal.SSR?.loaderData;
  if (!Array.isArray(loaderData)) return null;

  /**
   * The 2026 market pages ship no `g_rgWalletInfo` at all — the only statement of the currency
   * every price on the page is denominated in is the market shell's own `filterConfig.currency`,
   * which sits in a *different* loader entry from the listing route data. It is also the more
   * accurate number of the two: it is what Steam formatted the visible prices with.
   */
  let filterCurrencyId: number | null = null;
  for (const candidate of loaderData) {
    let parsed: unknown = candidate;
    if (typeof candidate === "string") {
      if (!candidate.includes('"filterConfig"')) continue;
      try {
        parsed = JSON.parse(candidate) as unknown;
      } catch {
        continue;
      }
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const filterConfig = (parsed as Record<string, unknown>).filterConfig;
    if (typeof filterConfig !== "object" || filterConfig === null) continue;
    const currency = (filterConfig as Record<string, unknown>).currency;
    if (typeof currency !== "object" || currency === null) continue;
    const raw = (currency as Record<string, unknown>).eCurrency;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      filterCurrencyId = raw;
      break;
    }
  }
  const walletCurrencyId = filterCurrencyId ?? chromeCurrencyId;

  for (const candidate of loaderData) {
    let parsed: unknown = candidate;
    if (typeof candidate === "string") {
      // Avoid parsing unrelated account/session loaders at all.
      if (!candidate.includes('"listingQuery"') || !candidate.includes('"buckets"')) continue;
      try {
        parsed = JSON.parse(candidate) as unknown;
      } catch {
        continue;
      }
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const record = parsed as Record<string, unknown>;
    const query = record.listingQuery;
    if (
      !Array.isArray(record.buckets) ||
      typeof record.bCommodity !== "boolean" ||
      typeof query !== "object" ||
      query === null ||
      typeof (query as Record<string, unknown>).strItemName !== "string"
    ) {
      continue;
    }

    const buckets = record.buckets.flatMap((bucket): SteamMarketRouteSnapshot["buckets"] => {
      if (typeof bucket !== "object" || bucket === null) return [];
      const source = bucket as Record<string, unknown>;
      if (typeof source.bucket_id !== "string" || !Array.isArray(source.filters)) return [];
      const filters = source.filters
        .filter(
          (filter): filter is [string, string] =>
            Array.isArray(filter) &&
            filter.length >= 2 &&
            typeof filter[0] === "string" &&
            typeof filter[1] === "string"
        )
        .map(([category, value]) => [category, value]);
      const safeBucket: SteamMarketRouteSnapshot["buckets"][number] = {
        bucket_id: source.bucket_id,
        filters
      };
      if (typeof source.classid === "string") safeBucket.classid = source.classid;
      if (typeof source.min_price === "string") safeBucket.min_price = source.min_price;
      return [safeBucket];
    });

    const rawProperties = record.relevantAssetProperties;
    const relevantAssetProperties: Record<string, boolean> = {};
    if (typeof rawProperties === "object" && rawProperties !== null) {
      for (const [key, value] of Object.entries(rawProperties)) {
        if (typeof value === "boolean") relevantAssetProperties[key] = value;
      }
    }

    return {
      success: record.success === true,
      appid: typeof record.appid === "number" ? record.appid : Number.NaN,
      buckets,
      listingQuery: {
        appid:
          typeof (query as Record<string, unknown>).appid === "number"
            ? ((query as Record<string, unknown>).appid as number)
            : Number.NaN,
        strItemName: (query as Record<string, unknown>).strItemName as string
      },
      relevantAssetProperties,
      bCommodity: record.bCommodity,
      walletCurrencyId
    };
  }
  return null;
}
