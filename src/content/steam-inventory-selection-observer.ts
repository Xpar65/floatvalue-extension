export interface SteamInventoryEstimateTarget {
  anchor: HTMLElement;
  marketHashName: string;
}

function marketHashNameFromLink(link: HTMLAnchorElement): string | null {
  let url: URL;
  try {
    url = new URL(link.getAttribute("href") ?? "", location.href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "steamcommunity.com") return null;
  const prefix = "/market/listings/730/";
  if (!url.pathname.startsWith(prefix)) return null;
  const encodedName = url.pathname.slice(prefix.length);
  if (encodedName.length === 0) return null;
  try {
    const marketHashName = decodeURIComponent(encodedName);
    return marketHashName.length > 0 ? marketHashName : null;
  } catch {
    return null;
  }
}

const MARKET_LINK_SELECTOR =
  'a[href*="steamcommunity.com/market/listings/730/"], a[href^="/market/listings/730/"]';

/**
 * The item image opens Steam's description block. Any ancestor containing it is that block rather
 * than the sell block, so it marks where the upward search must stop.
 */
const ITEM_IMAGE_SELECTOR = 'img[src*="/economy/image/"]';

/**
 * Steam renders these panels with React, portalled through a focus-nav wrapper `<div>`, so the sell
 * block sits at no fixed depth below `#iteminfoN` and we cannot anchor off `firstElementChild`.
 * Attached stickers and charms each render their own market link *above* the sell block, so the
 * panel's own listing link is the last one, never the first.
 */
function marketSectionTarget(itemInfo: HTMLElement): SteamInventoryEstimateTarget | null {
  const marketLinks = itemInfo.querySelectorAll<HTMLAnchorElement>(MARKET_LINK_SELECTOR);
  const marketLink = marketLinks[marketLinks.length - 1];
  if (!marketLink) return null;
  const marketHashName = marketHashNameFromLink(marketLink);
  if (marketHashName === null) return null;

  // Climb to the outermost ancestor that still follows earlier panel content, so the estimate lands
  // between the description (ending in Wear Rating) and the sell block (Starting at / Volume).
  let anchor: HTMLElement | null = null;
  for (
    let node: HTMLElement | null = marketLink;
    node !== null && node !== itemInfo;
    node = node.parentElement
  ) {
    if (node.querySelector(ITEM_IMAGE_SELECTOR) !== null) break;
    if (node.previousElementSibling instanceof HTMLElement) anchor = node;
  }
  return anchor === null ? null : { anchor, marketHashName };
}

export function findSteamInventoryEstimateTarget(
  root: ParentNode = document
): SteamInventoryEstimateTarget | null {
  const candidates = [...root.querySelectorAll<HTMLElement>("#iteminfo0, #iteminfo1")]
    .map((itemInfo) => ({ itemInfo, target: marketSectionTarget(itemInfo) }))
    .filter(
      (candidate): candidate is { itemInfo: HTMLElement; target: SteamInventoryEstimateTarget } =>
        candidate.target !== null
    );
  const active = candidates.find(({ itemInfo }) => itemInfo.style.position === "static");
  if (active) return active.target;
  return (
    candidates.find(
      ({ itemInfo }) => itemInfo.style.position !== "absolute" && itemInfo.style.display !== "none"
    )?.target ?? null
  );
}

export function findSteamInventoryEstimateAnchor(root: ParentNode = document): HTMLElement | null {
  return findSteamInventoryEstimateTarget(root)?.anchor ?? null;
}

export class SteamInventorySelectionObserver {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private safetyTimer: ReturnType<typeof setInterval> | null = null;
  private hasTarget = false;

  constructor(
    private readonly onSelection: (target: SteamInventoryEstimateTarget | null) => void
  ) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleSync());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
      childList: true,
      subtree: true
    });
    this.safetyTimer = setInterval(() => this.sync(), 250);
    this.sync();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.safetyTimer !== null) clearInterval(this.safetyTimer);
    this.safetyTimer = null;
    if (this.hasTarget) this.onSelection(null);
    this.hasTarget = false;
  }

  private scheduleSync(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sync();
    }, 0);
  }

  private sync(): void {
    const target = findSteamInventoryEstimateTarget();
    this.hasTarget = target !== null;
    this.onSelection(target);
  }
}
