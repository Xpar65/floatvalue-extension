import type { EstimateRange } from "../domain/estimate-range";
import { formatCurrency, type DisplayCurrency } from "./display-format";
import { createCslyticsIcon } from "./icon";
import { cslyticsStyleSheet } from "./tokens";

/** Marks our host inside Steam's card so a re-scan updates it instead of adding a second one. */
export const LISTING_RANGE_HOST_ATTR = "data-cslytics-range";

export interface ListingRangeModel {
  range: EstimateRange;
  displayCurrency: DisplayCurrency;
  float: number;
}

/**
 * One line inside a listing card. It sits in the same metadata row as Pattern Template and Wear
 * Rating and is deliberately quieter than either: it is a reference figure next to Steam's own
 * asking price, not a competing headline. The exact numbers and their provenance go in the
 * tooltip rather than on screen.
 */
const LISTING_RANGE_CSS = `
  :host { display:inline-flex; min-width:0; }
  * { box-sizing:border-box; }
  .chip {
    display:inline-flex; align-items:center; gap:0.3125rem;
    font:11px/1.45 var(--cs-font); white-space:nowrap;
  }
  .icon { display:block; width:0.75rem; height:0.75rem; flex:none; color:var(--cs-accent); }
  .label { color:var(--cs-text-faint); }
  .value { color:var(--cs-text); font-variant-numeric:tabular-nums; }
`;

/** Creates the host element for a card, ready to be placed in Steam's DOM. */
export function createListingRangeHost(): HTMLElement {
  const host = document.createElement("span");
  host.setAttribute(LISTING_RANGE_HOST_ATTR, "");
  const root = host.attachShadow({ mode: "open" });
  root.adoptedStyleSheets = [cslyticsStyleSheet(LISTING_RANGE_CSS)];
  return host;
}

/**
 * Renders the range into a host built by `createListingRangeHost`.
 *
 * A missing side is stated as the one figure that exists, never filled in with the other and
 * never with 0 — `highest_bid` in particular leaves whole float regions genuinely uncovered.
 */
export function renderListingRange(host: HTMLElement, model: ListingRangeModel): void {
  const root = host.shadowRoot;
  if (!root) return;
  const { code, usdRate } = model.displayCurrency;
  const low = model.range.low === null ? null : model.range.low * usdRate;
  const high = model.range.high === null ? null : model.range.high * usdRate;

  let label: string;
  let value: string;
  if (low !== null && high !== null) {
    label = "EST";
    value = `${formatCurrency(low, code, true)} – ${formatCurrency(high, code, true)}`;
  } else if (low !== null) {
    label = "Instant sell";
    value = formatCurrency(low, code, true);
  } else if (high !== null) {
    label = "Lowest ask";
    value = formatCurrency(high, code, true);
  } else {
    root.replaceChildren();
    return;
  }

  const chip = document.createElement("span");
  chip.className = "chip";
  const icon = createCslyticsIcon();
  icon.setAttribute("class", "icon");
  const labelElement = document.createElement("span");
  labelElement.className = "label";
  labelElement.textContent = label;
  const valueElement = document.createElement("span");
  valueElement.className = "value";
  valueElement.textContent = value;
  chip.append(icon, labelElement, valueElement);

  const detail = [
    `Cslytics estimate at float ${model.float.toFixed(8)}`,
    low === null ? null : `instant sell ${formatCurrency(low, code)}`,
    high === null ? null : `lowest ask ${formatCurrency(high, code)}`
  ].filter((part): part is string => part !== null);
  chip.title = detail.join(" · ");

  root.replaceChildren(chip);
}
