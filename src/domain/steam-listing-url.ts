/**
 * Deep links from a plotted listing dot back to that listing on Steam.
 *
 * The 2026 market group page addresses an individual listing by appending a `detail` parameter to
 * the group route it is already on — the group code (`G1807209A023004`) is the last path segment,
 * so the link is built from the page's own URL rather than from anything in the curve document.
 */

/**
 * Separator between the group route and the listing selector. Isolated here because it is the one
 * part of the format that cannot be derived: swap to "#" if Steam routes this as a fragment.
 */
const DETAIL_SEPARATOR = "?";

const LISTING_ROUTE = /^\/market\/listings\/\d+\/[^/]+\/?$/;

/**
 * The URL for one listing on the market group page, or null when the current page is not a market
 * group route — the inventory sell dialog plots the same book but has no group code to link into,
 * and a wrong link is worse than none.
 */
export function steamListingUrl(pageUrl: string, listingId: string): string | null {
  if (!listingId) return null;
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "steamcommunity.com") return null;
  if (!LISTING_ROUTE.test(url.pathname)) return null;
  // Deliberately dropped: any query or fragment already on the page. Steam's own filter state is
  // not ours to propagate, and carrying it would make the link depend on how the user got here.
  return `${url.origin}${url.pathname}${DETAIL_SEPARATOR}detail=${encodeURIComponent(listingId)}`;
}
