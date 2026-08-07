import type { ValidatedCurve } from "../domain/types";
import {
  formatCurrency,
  formatDate,
  formatTimestamp,
  type DisplayCurrency
} from "./display-format";
import { createCslyticsIcon, CSLYTICS_URL } from "./icon";
import { cslyticsStyleSheet } from "./tokens";

export const INVENTORY_ESTIMATE_HOST_ID = "cslytics-inventory-estimate";

export interface InventoryEstimateModel {
  estimateUsd: number;
  displayCurrency: DisplayCurrency;
  curve: ValidatedCurve;
  curveStale: boolean;
  currencyNotice: string | null;
}

/**
 * Steam's description container gives its children no horizontal padding, so the card insets itself
 * to sit inside the panel's border rather than flush against it. Staleness is signalled by the
 * `⚠ cached` chips in the meta line, never by colour — amber is the brand accent here, so it can no
 * longer mean "warning".
 */
const INLINE_ESTIMATE_CSS = `
  :host { width:100%; min-width:0; }
  * { box-sizing:border-box; }
  .card {
    margin:0.25rem 0.5rem 0.5rem;
    padding:0.625rem 0.75rem;
    background:var(--cs-surface);
    border:1px solid var(--cs-border);
    border-radius:var(--cs-radius-lg);
    color:var(--cs-text); font:13px/1.45 var(--cs-font);
  }
  .head { display:flex; align-items:center; gap:0.5rem; min-width:0; }
  .brand-link {
    display:flex; align-items:center; gap:0.4rem; flex:none;
    color:var(--cs-text); text-decoration:none; transition:color 150ms;
  }
  .brand-link:hover { color:var(--cs-accent); }
  .brand-icon {
    display:block; width:1.5rem; height:1.5rem; flex:none;
    color:var(--cs-accent);
  }
  .brand-name {
    font-size:0.8125rem; font-weight:600; letter-spacing:-0.01em; white-space:nowrap;
  }
  .label {
    padding-left:0.5rem; border-left:1px solid var(--cs-border);
    color:var(--cs-text-muted); font-size:0.6875rem; font-weight:600;
    letter-spacing:.06em; text-transform:uppercase; white-space:nowrap;
  }
  .value {
    margin-left:auto; padding-left:0.5rem; white-space:nowrap;
    color:var(--cs-text-strong); font-size:1rem; font-weight:600;
    font-variant-numeric:tabular-nums;
  }
  .meta {
    margin:0.375rem 0 0;
    color:var(--cs-text-faint); font-size:0.6875rem; line-height:1.4;
  }
`;

export class InventoryEstimate {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;

  constructor(marketSection: HTMLElement) {
    this.host = document.createElement("div");
    this.host.id = INVENTORY_ESTIMATE_HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.adoptedStyleSheets = [cslyticsStyleSheet(INLINE_ESTIMATE_CSS)];
    marketSection.before(this.host);
  }

  get element(): HTMLElement {
    return this.host;
  }

  remove(): void {
    this.host.remove();
  }

  showLoading(): void {
    this.render("Loading…", null);
  }

  showUnavailable(reason: string): void {
    this.render("Unavailable", reason);
  }

  renderEstimate(model: InventoryEstimateModel): void {
    const { displayCurrency, curve } = model;
    const asOf = Date.parse(curve.fairPrice.asOf);

    // The visible line stays to one short phrase. The exact fair-price / curve / FX timestamps the
    // ~26h freshness budget turns on are moved to the tooltip rather than dropped — a date alone
    // cannot separate a one-hour-old price from a twenty-five-hour-old one.
    const detail: string[] = [
      `fair price ${formatTimestamp(asOf)}`,
      `curve computed ${formatTimestamp(Date.parse(curve.computedAt))}`
    ];
    if (displayCurrency.code !== "USD" && displayCurrency.fxAsOf !== null) {
      detail.push(`FX ${displayCurrency.fxAsOf}${displayCurrency.fxStale ? " (cached)" : ""}`);
    }
    if (model.curveStale) detail.push("cached curve");
    if (model.currencyNotice) detail.push(model.currencyNotice);

    const stale = model.curveStale || displayCurrency.fxStale;
    this.render(
      formatCurrency(model.estimateUsd * displayCurrency.usdRate, displayCurrency.code),
      `data as of: ${formatDate(asOf)}${stale ? " · cached" : ""}`,
      detail.join(" · ")
    );
  }

  private render(value: string, meta: string | null, detail?: string): void {
    this.root.replaceChildren();
    const card = document.createElement("section");
    card.className = "card";
    card.setAttribute("aria-label", "Cslytics estimated value");
    card.setAttribute("aria-live", "polite");

    const head = document.createElement("div");
    head.className = "head";

    const brandLink = document.createElement("a");
    brandLink.className = "brand-link";
    brandLink.href = CSLYTICS_URL;
    brandLink.target = "_blank";
    brandLink.rel = "noopener noreferrer";
    brandLink.title = "Open cslytics.com";
    const brandName = document.createElement("span");
    brandName.className = "brand-name";
    brandName.textContent = "Cslytics";
    // The mark stays decorative; the wordmark is what gives this link its accessible name.
    brandLink.append(createCslyticsIcon(), brandName);

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "EST value";
    const valueElement = document.createElement("strong");
    valueElement.className = "value";
    valueElement.textContent = value;
    head.append(brandLink, label, valueElement);
    card.append(head);

    if (meta !== null) {
      const metaElement = document.createElement("p");
      metaElement.className = "meta";
      metaElement.textContent = meta;
      card.append(metaElement);
    }
    card.title = detail ?? card.textContent ?? "Cslytics estimated value";
    this.root.append(card);
  }
}
