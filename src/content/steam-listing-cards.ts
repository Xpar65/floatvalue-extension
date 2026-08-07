import { estimateRangeAtFloat, hasEstimate } from "../domain/estimate-range";
import type { ValidatedCurve } from "../domain/types";
import type { DisplayCurrency } from "../ui/display-format";
import {
  createListingRangeHost,
  LISTING_RANGE_HOST_ATTR,
  renderListingRange
} from "../ui/listing-range";

/**
 * The estimate chip on each of Steam's listing cards.
 *
 * Steam's 2026 market ships hashed class names (`BPTxiJF58z0-`) that change with every deploy, so
 * nothing here selects on them. A card is found by its "Wear Rating" text node — the one piece of
 * the card that is content rather than markup — and is tied to an item by matching the market hash
 * names we already fetched curves for against the card's own text. That means a Steam CSS rebuild
 * cannot break this, and a card we cannot confidently identify is simply left alone.
 */

const WEAR_RATING_LABEL = "wear rating";
/** How far above the Wear Rating row a card's own item name is allowed to be. */
const MAX_CARD_DEPTH = 10;
/** Steam re-renders the grid in bursts (filter, sort, page); coalesce into one scan. */
const RESCAN_DEBOUNCE_MS = 200;

export interface ListingCardModel {
  /** Exact market hash name → its validated curve, across every quality on the page. */
  curvesByName: ReadonlyMap<string, ValidatedCurve>;
  displayCurrency: DisplayCurrency;
}

interface FoundCard {
  /** The row holding Pattern Template and Wear Rating; the chip becomes its last child. */
  metaRow: HTMLElement;
  marketHashName: string;
  float: number;
}

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The elements whose own text labels a Wear Rating row.
 *
 * Walks text nodes rather than elements: there is exactly one matching text node per card, and
 * testing `textContent` on every element on the page would re-read each subtree once per ancestor.
 */
function wearRatingRows(root: Node): HTMLElement[] {
  const owner = root.ownerDocument ?? (root as Document);
  const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rows: HTMLElement[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text !== WEAR_RATING_LABEL && text !== `${WEAR_RATING_LABEL}:`) continue;
    const parent = node.parentElement;
    if (parent) rows.push(parent);
  }
  return rows;
}

/** The float Steam printed on the card, or null when the row does not end in a usable one. */
function floatFromRow(row: HTMLElement): number | null {
  const match = /([0-9]*\.?[0-9]+)\s*$/.exec(normalizedText(row));
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/**
 * The item a card is for, by matching known market hash names against the card's text.
 *
 * Longest match wins so `StatTrak™ AK-47 | Redline (Field-Tested)` is never mistaken for the
 * Normal name it contains, and the search stops at the innermost ancestor that names anything —
 * go higher and you reach the grid, which contains every name at once.
 */
function marketHashNameFor(row: HTMLElement, names: readonly string[]): string | null {
  let current = row.parentElement;
  for (let depth = 0; current && depth < MAX_CARD_DEPTH; depth += 1) {
    const text = normalizedText(current);
    let best: string | null = null;
    for (const name of names) {
      if (text.includes(name) && (best === null || name.length > best.length)) best = name;
    }
    if (best !== null) return best;
    current = current.parentElement;
  }
  return null;
}

export function findListingCards(root: ParentNode, names: readonly string[]): FoundCard[] {
  if (names.length === 0) return [];
  const cards: FoundCard[] = [];
  for (const row of wearRatingRows(root as unknown as Node)) {
    const metaRow = row.parentElement;
    if (!metaRow) continue;
    const float = floatFromRow(row);
    if (float === null) continue;
    const marketHashName = marketHashNameFor(row, names);
    if (marketHashName === null) continue;
    cards.push({ metaRow, marketHashName, float });
  }
  return cards;
}

/** The innermost element containing all of `elements`, or null if they share no root. */
function commonAncestor(elements: readonly HTMLElement[]): HTMLElement | null {
  const first = elements[0];
  if (!first) return null;
  let candidate: HTMLElement | null = first;
  while (candidate && !elements.every((element) => candidate!.contains(element))) {
    candidate = candidate.parentElement;
  }
  return candidate;
}

export class SteamListingCardDecorator {
  private model: ListingCardModel | null = null;
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  /**
   * The listings grid, learned from the first successful scan. Every later scan walks only this
   * subtree instead of the whole document — React churns constantly on this route, and a
   * full-document text walk every couple of hundred milliseconds is the one real cost here.
   */
  private scope: HTMLElement | null = null;

  constructor(private readonly root: ParentNode = document) {}

  /** Applies a new curve set and begins keeping the cards decorated as Steam re-renders them. */
  update(model: ListingCardModel): void {
    this.model = model;
    this.scan();
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleScan());
    const target = this.root instanceof Document ? this.root.documentElement : this.root;
    if (target instanceof Node) {
      this.observer.observe(target, { childList: true, subtree: true });
    }
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.model = null;
    this.scope = null;
    for (const host of this.root.querySelectorAll(`[${LISTING_RANGE_HOST_ATTR}]`)) host.remove();
  }

  private scheduleScan(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, RESCAN_DEBOUNCE_MS) as unknown as number;
  }

  /**
   * Re-decorates every card currently on screen.
   *
   * Idempotent by design: React owns these rows and drops our node whenever it re-renders one, and
   * it also recycles a row for a different listing. Reusing the host that is already there and
   * rewriting its contents covers both without tracking which card is which.
   */
  private scan(): void {
    const model = this.model;
    if (!model) return;
    // Disconnected while we mutate: our own inserts would otherwise queue another scan forever.
    this.observer?.disconnect();
    try {
      const names = [...model.curvesByName.keys()];
      // A remembered grid that React has since replaced finds nothing; fall back and relearn.
      const scoped = this.scope?.isConnected ? findListingCards(this.scope, names) : [];
      const found = scoped.length > 0 ? scoped : findListingCards(this.root, names);
      if (scoped.length === 0) {
        this.scope = commonAncestor(found.map((card) => card.metaRow));
      }
      for (const card of found) {
        const curve = model.curvesByName.get(card.marketHashName);
        if (!curve) continue;
        const range = estimateRangeAtFloat(curve, card.float);
        const existing = card.metaRow.querySelector<HTMLElement>(
          `:scope > [${LISTING_RANGE_HOST_ATTR}]`
        );
        if (!hasEstimate(range)) {
          existing?.remove();
          continue;
        }
        const host = existing ?? createListingRangeHost();
        renderListingRange(host, {
          range,
          displayCurrency: model.displayCurrency,
          float: card.float
        });
        if (!existing) card.metaRow.append(host);
      }
    } finally {
      const target = this.root instanceof Document ? this.root.documentElement : this.root;
      if (this.observer && target instanceof Node) {
        this.observer.observe(target, { childList: true, subtree: true });
      }
    }
  }
}
