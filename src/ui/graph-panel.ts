import { bidAtFloat } from "../domain/bid-at-float";
import { priceAtFloat } from "../domain/price-at-float";
import { shouldShowQuality } from "../domain/quality-state";
import { steamListingUrl } from "../domain/steam-listing-url";
import { STEAM_MAX_PLOT_PRICE_USD } from "../domain/steam-price-cap";
import type {
  CurveVertex,
  MarketVariant,
  Quality,
  QualityCurveState,
  ValidatedCurve,
  Wear
} from "../domain/types";
import {
  getWearRange,
  intersectWearWithPaint,
  wearAtFloat,
  WEAR_BOUNDARIES,
  WEAR_RANGES
} from "../domain/wear-ranges";
import { createCslyticsIcon, CSLYTICS_URL } from "./icon";
import { createScale, priceDomain, type AxisScale, type AxisScaleKind } from "./scales";
import { cslyticsStyleSheet } from "./tokens";
import {
  formatCurrency,
  formatTimestamp,
  USD_DISPLAY_CURRENCY,
  type DisplayCurrency
} from "./display-format";

export type { DisplayCurrency } from "./display-format";

const SVG_NS = "http://www.w3.org/2000/svg";
const QUALITY_LABELS: Record<Quality, string> = {
  normal: "Normal",
  stattrak: "StatTrak™",
  souvenir: "Souvenir"
};

/** The four things a curve document can put on the plot, each independently toggleable. */
export const SERIES_KEYS = ["fair", "ask", "bid", "listings"] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];

/**
 * `highest_bid` is the contract's name for the standing buy orders; on the graph it is labelled
 * for what acting on it actually does — sell into the top bid, immediately.
 */
const SERIES_LABELS: Record<SeriesKey, string> = {
  fair: "Fair price",
  ask: "Lowest ask",
  bid: "Instant sell",
  listings: "Listings"
};

/** Clip id is scoped to this panel's shadow root, so a constant is safe across instances. */
const PLOT_CLIP_ID = "cs-plot-clip";

/** Tightest float window a zoom will produce, as a fraction of the full domain. */
const MAX_ZOOM = 1 / 200;
/** Wheel sensitivity in log-space per pixel of deltaY. */
const WHEEL_SENSITIVITY = 0.0015;
/** deltaY is reported in lines (1) or pages (2) on some mice; normalise both to pixels. */
const DELTA_MODE_PIXELS = [1, 16, 400];

export interface GraphPanelModel {
  states: Readonly<Record<Quality, QualityCurveState>>;
  selectedQuality: Quality | null;
  loading: boolean;
  onSelectQuality: (quality: Quality) => void;
  /** The market group route listing dots link back into. Defaults to the current page. */
  pageUrl?: string;
  /** Wallet currency, so the axis and hover figures match the prices Steam shows on the page. */
  displayCurrency?: DisplayCurrency;
  notice?: string | null;
}

export interface SingleVariantGraphPanelModel {
  variant: MarketVariant;
  curve: ValidatedCurve;
  stale: boolean;
  itemFloat?: number | null;
  displayCurrency?: DisplayCurrency;
  buyerPays?: number | null;
  notice?: string | null;
}

interface HeaderModel {
  /** Defaults to the product name; the sell dialog shows the item's market hash name instead. */
  title?: string;
  subtitle?: string;
  /** Formatted figures shown large in the header; `null` renders as unavailable, never as 0. */
  estimate?: string | null;
  listing?: string | null;
}

interface PlotPoint {
  x: number;
  y: number;
}

/** One drawable line. `bid` contributes several — one per covered segment, never joined. */
interface SeriesPlot {
  wear: Wear;
  series: Exclude<SeriesKey, "listings">;
  curve: ValidatedCurve;
  lines: PlotPoint[][];
}

interface ListingPlot {
  wear: Wear;
  curve: ValidatedCurve;
  points: Array<PlotPoint & { id: string }>;
}

const PANEL_CSS = `
  :host { width:100%; margin:24px 0 28px; }
  * { box-sizing: border-box; }
  .panel {
    position:relative; width:100%;
    border:1px solid var(--cs-border); border-radius:var(--cs-radius-lg); overflow:hidden;
    color:var(--cs-text); background:var(--cs-surface);
    font: 13px/1.45 var(--cs-font);
  }
  /* Three columns so the figures sit centred regardless of how long the item name is. */
  .header {
    display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
    align-items:flex-start; gap:1rem;
    padding:1.25rem 1.5rem 1rem; border-bottom:1px solid var(--cs-border-faint);
  }
  .header > .collapse { justify-self:end; }
  .heading { min-width:0; }
  .title {
    display:flex; align-items:center; gap:0.5rem; min-width:0;
    font-size:1.125rem; font-weight:600; letter-spacing:-0.01em; color:var(--cs-text-strong);
  }
  .title-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .brand-link { display:flex; flex:none; border-radius:5px; text-decoration:none; transition:opacity 150ms; }
  .brand-link:hover { opacity:.82; }
  .brand-icon { display:block; width:1.25rem; height:1.25rem; flex:none; border-radius:5px; color:var(--cs-accent); }
  .subtitle { margin-top:0.25rem; font-size:0.8125rem; color:var(--cs-text-muted); }

  /* Header figures — the numbers that matter, echoing their marker's colour and shape. */
  .figures { display:flex; flex-wrap:wrap; justify-content:center; gap:0.25rem 1.75rem; }
  .figure { display:flex; flex-direction:column; align-items:center; gap:0.125rem; }
  .figure-label { display:flex; align-items:center; gap:0.375rem; font-size:0.6875rem; letter-spacing:.04em; text-transform:uppercase; color:var(--cs-text-faint); }
  .figure-value { font-size:1.5rem; font-weight:600; line-height:1.1; letter-spacing:-0.02em; color:var(--cs-text-strong); font-variant-numeric:tabular-nums; }
  .figure-mark { width:9px; height:9px; flex:none; }
  .figure[data-kind="estimate"] .figure-mark { border-radius:var(--cs-radius-full); background:var(--cs-mark-estimate); }
  .figure[data-kind="listing"] .figure-mark { transform:rotate(45deg); background:var(--cs-mark-listing); }
  .collapse {
    border:0; border-radius:var(--cs-radius); color:var(--cs-text-faint); background:transparent;
    cursor:pointer; padding:0.25rem 0.5rem; font:inherit;
    transition:background-color 150ms, color 150ms;
  }
  .collapse:hover { background:var(--cs-hover); color:var(--cs-text); }
  .body { padding:16px 1.5rem 18px; }
  .collapsed .body { display:none; }

  /* Controls are grouped by what they do, and each group is shaped differently so the shape
     alone says which: a segmented control picks one of a set, a chip row toggles independent
     series on and off, and a quiet text button changes how the plot is drawn. Three rows of
     identically-styled pills gave no clue which was which. */
  .controls {
    display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:12px;
  }
  .controls-view { margin-left:auto; display:flex; align-items:center; gap:4px; }

  /* Pick one of a set — connected segments inside a single border, like a radio group. */
  .segmented {
    display:inline-flex; align-items:stretch;
    border:1px solid var(--cs-border); border-radius:var(--cs-radius);
    background:var(--cs-wash); overflow:hidden;
  }
  .segmented .quality {
    border:0; border-left:1px solid var(--cs-border); border-radius:0;
    padding:0.375rem 0.875rem; font:inherit;
    background:transparent; color:var(--cs-text-muted); cursor:pointer;
    transition:background-color 150ms, color 150ms;
  }
  .segmented .quality:first-child { border-left:0; }
  .segmented .quality:hover:not(:disabled) { background:var(--cs-hover); color:var(--cs-text); }
  .segmented .quality[data-selected="true"] {
    background:var(--cs-accent-wash); color:var(--cs-accent);
  }
  .segmented .quality:disabled { opacity:.48; cursor:not-allowed; }

  /* Independent on/off switches — separate pills, each carrying the mark it controls. */
  .series-toggles { display:flex; flex-wrap:wrap; gap:6px; }
  .series-toggle {
    display:inline-flex; align-items:center; gap:0.4375rem;
    border:1px solid var(--cs-border); border-radius:var(--cs-radius-full);
    padding:0.25rem 0.6875rem; font:inherit; font-size:0.75rem;
    background:var(--cs-wash); color:var(--cs-text-muted); cursor:pointer;
    transition:background-color 150ms, color 150ms, border-color 150ms;
  }
  .series-toggle:hover { background:var(--cs-hover); color:var(--cs-text); }
  .series-toggle[data-selected="true"] {
    border-color:var(--cs-accent-border); background:var(--cs-accent-wash); color:var(--cs-accent);
  }
  /* A data mark sitting inside chrome, exactly as the header figures already do. */
  .toggle-mark { width:14px; height:8px; flex:none; }
  [data-selected="false"] .toggle-mark { opacity:.4; }

  /* How the plot is drawn, not what is in it — borderless until touched, so these read as
     settings rather than as another thing to choose between. */
  .view-button {
    display:inline-flex; align-items:center; gap:0.5rem;
    border:1px solid transparent; border-radius:var(--cs-radius);
    padding:0.25rem 0.625rem; font:inherit; font-size:0.75rem;
    background:transparent; color:var(--cs-text-faint); cursor:pointer;
    transition:background-color 150ms, color 150ms, border-color 150ms;
  }
  .view-button:hover { background:var(--cs-hover); color:var(--cs-text); }
  .view-button[data-selected="true"] { color:var(--cs-accent); }
  .view-button[hidden] { display:none; }

  /* A switch, not a button: log/linear is a persistent state, and a slider shows which way it
     is set without having to infer it from a highlight. */
  .switch-track {
    position:relative; flex:none; width:26px; height:14px;
    border-radius:var(--cs-radius-full);
    background:var(--cs-border); transition:background-color 150ms;
  }
  .switch-thumb {
    position:absolute; top:2px; left:2px; width:10px; height:10px;
    border-radius:var(--cs-radius-full);
    background:var(--cs-text-faint); transition:transform 150ms, background-color 150ms;
  }
  .view-button[data-selected="true"] .switch-track { background:var(--cs-accent-wash); }
  .view-button[data-selected="true"] .switch-thumb {
    transform:translateX(12px); background:var(--cs-accent);
  }
  .view-button:focus-visible { outline:2px solid var(--cs-accent-border); outline-offset:1px; }
  .status { min-height:260px; display:grid; place-items:center; color:var(--cs-text-muted); text-align:center; padding:24px; }
  .chart-wrap { border:1px solid var(--cs-border-subtle); border-radius:var(--cs-radius); background:var(--cs-bg); overflow:hidden; }
  svg { display:block; width:100%; height:auto; touch-action:none; }
  .axis { stroke:var(--cs-axis); stroke-width:1; }
  .grid { stroke:var(--cs-grid); stroke-width:1; }
  /* The unlabelled decade subdivisions of a log axis: structure, not data. */
  .grid-minor { stroke:var(--cs-grid-minor); stroke-width:1; }
  .tick { fill:var(--cs-text-faint); font-size:11px; }
  .wear-label { font-size:10px; font-weight:700; }
  /* One hue per wear; the series is told apart by dash pattern and weight, so no new colour
     is introduced and a wear stays recognisable across all three of its lines. */
  .curve { fill:none; stroke-width:3; stroke-linejoin:round; stroke-linecap:round; }
  .curve[data-series="ask"] { stroke-width:2; stroke-dasharray:8 5; opacity:.78; }
  .curve[data-series="bid"] { stroke-width:2; stroke-dasharray:1.5 4; opacity:.72; }
  .listing-dot { stroke:var(--cs-bg); stroke-width:1; fill-opacity:.55; }
  .listings-layer:hover .listing-dot { fill-opacity:.8; }
  .listing-link { cursor:pointer; outline:none; }
  .listing-link:hover .listing-dot, .listing-link:focus .listing-dot {
    fill-opacity:1; stroke:var(--cs-accent);
  }
  /* Where one wear tier ends and the next begins. Translucent and in the opening tier's own
     colour, so it delimits the band without competing with the curve drawn in that colour. */
  .wear-divider { stroke-width:1; stroke-opacity:.38; pointer-events:none; }
  .marker { cursor:pointer; stroke-width:3; outline:none; }
  .marker:focus { stroke:var(--cs-accent); }
  .estimate-marker { fill:var(--cs-mark-estimate); stroke:var(--cs-bg); }
  .listing-marker { fill:var(--cs-mark-listing); stroke:var(--cs-bg); }
  .hit { fill:transparent; cursor:crosshair; }
  .hit[data-panning="true"] { cursor:grabbing; }
  .cursor { stroke:var(--cs-accent); stroke-width:1; stroke-dasharray:3 3; opacity:.6; pointer-events:none; }
  .detail { min-height:38px; margin-top:8px; color:var(--cs-text); }
  .detail strong { color:var(--cs-text-strong); }
  .meta { display:flex; justify-content:space-between; gap:12px; margin-top:9px; color:var(--cs-text-faint); font-size:11px; }
  .warning { color:var(--cs-text-faint); }
  .missing { margin-top:8px; color:var(--cs-text-faint); font-size:11px; }
  /* Both points land on the same pixel: one mark, both hues. */
  .marker[data-marker="combined"] { stroke:var(--cs-mark-listing); stroke-width:4; }

  /* Compact — the sell dialog is short and its confirm controls sit below us. */
  :host(.compact) { margin:12px 0 32px; }
  .compact .header { padding:0.875rem 1rem 0.75rem; }
  .compact .title { font-size:0.9375rem; }
  .compact .figures { gap:0.25rem 1.25rem; }
  .compact .figure-value { font-size:1.375rem; }
  .compact .body { padding:10px 1rem 12px; }
  .compact .status { min-height:150px; padding:16px; }
  .compact .detail { min-height:20px; margin-top:6px; font-size:12px; }
  .compact .meta { margin-top:6px; }

  @media (max-width:700px) {
    :host { margin:16px 0 20px; }
    /* Too narrow for three columns: drop the figures onto their own centred row. */
    .header { grid-template-columns:minmax(0,1fr) auto; padding:1rem 1rem 0.75rem; }
    .figures { grid-row:2; grid-column:1 / -1; }
    .body { padding:12px; }
  }
`;

export class GraphPanel {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private collapsed = false;
  /** Set by the single-variant graph: the sell dialog's confirm controls sit below the panel. */
  private compact = false;
  /**
   * Toggle state lives on the instance, not in the model. Both render entry points are re-entered
   * constantly by their callers — a quality click, and every debounced keystroke in the sell
   * dialog — and each one calls `renderShell()`, which replaces the whole shadow tree. Keeping the
   * sets here means neither content script has to thread UI state, the same way `collapsed` works.
   */
  private readonly hiddenSeries = new Set<SeriesKey>();
  /**
   * Log by default: a market-listing graph stacks every wear of a paint on one axis, and
   * Factory New against Battle-Scarred routinely spans two orders of magnitude — linear renders
   * the cheap end as a flat line on the floor.
   */
  private scaleKind: AxisScaleKind = "log";
  /**
   * The zoomed float window, and the full domain it was taken against. Keeping the domain lets a
   * re-render tell "same graph, user has zoomed" from "different item, drop the zoom" — the sell
   * dialog re-renders on every debounced keystroke, and typing a price must not reset the view.
   */
  private zoomWindow: { min: number; max: number; domainMin: number; domainMax: number } | null =
    null;
  /** Replays the last render so a toggle can rebuild the graph — and rescale its axis. */
  private lastRender: (() => void) | null = null;

  constructor(anchor: Element | null = null, placement: "before" | "after" = "before") {
    this.host = document.createElement("div");
    this.host.id = "cslytics-float-curves";
    this.root = this.host.attachShadow({ mode: "open" });
    // Adopt the shared sheet once; renderShell() clears content but never the stylesheet.
    this.root.adoptedStyleSheets = [cslyticsStyleSheet(PANEL_CSS)];
    if (placement === "after") this.mountAfter(anchor);
    else this.mountBefore(anchor);
  }

  mountBefore(anchor: Element | null): void {
    if (anchor?.parentNode) anchor.before(this.host);
    else if (!this.host.isConnected) document.body.append(this.host);
  }

  mountAfter(anchor: Element | null): void {
    if (anchor?.parentNode) anchor.after(this.host);
    else if (!this.host.isConnected) document.body.append(this.host);
  }

  remove(): void {
    this.host.remove();
  }

  /** False once Steam's React drops our node while re-rendering the parent we mounted into. */
  get isConnected(): boolean {
    return this.host.isConnected;
  }

  showLoading(message = "Finding available float curves…"): void {
    this.renderShell((body) => {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = message;
      body.append(status);
    });
  }

  showMessage(message: string): void {
    this.renderShell((body) => {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = message;
      body.append(status);
    });
  }

  render(model: GraphPanelModel): void {
    this.lastRender = () => this.render(model);
    this.renderShell((body) => {
      const quality = this.renderQualitySegmented(model);
      if (!model.selectedQuality) {
        if (quality) {
          const controls = document.createElement("div");
          controls.className = "controls";
          controls.append(quality);
          body.append(controls);
        }
        const status = document.createElement("div");
        status.className = "status";
        status.textContent = model.loading
          ? "Checking Cslytics curve coverage…"
          : "No Cslytics float curves are available for this item.";
        body.append(status);
        return;
      }
      this.renderGraph(body, model.states[model.selectedQuality], {
        qualityControl: quality,
        pageUrl: model.pageUrl ?? location.href,
        displayCurrency: model.displayCurrency ?? USD_DISPLAY_CURRENCY,
        notice: model.notice ?? null
      });
    });
  }

  /**
   * Quality is a pick-one choice, so it is a segmented control rather than another row of pills:
   * the connected shape says "one of these" before the label is read. The selected quality is
   * legible from the control itself, which is why the header no longer repeats it as a subtitle.
   */
  private renderQualitySegmented(model: GraphPanelModel): HTMLElement | null {
    const group = document.createElement("div");
    group.className = "segmented";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Quality");
    for (const quality of ["normal", "stattrak", "souvenir"] as const) {
      const state = model.states[quality];
      if (!shouldShowQuality(state)) continue;
      const button = document.createElement("button");
      button.className = "quality";
      button.type = "button";
      button.dataset.quality = quality;
      button.dataset.selected = String(model.selectedQuality === quality);
      button.setAttribute("aria-pressed", String(model.selectedQuality === quality));
      button.textContent = QUALITY_LABELS[quality];
      button.disabled = Object.keys(state.curvesByWear).length === 0;
      button.title = button.disabled
        ? state.status === "loading" || state.status === "not-requested"
          ? `Loading ${QUALITY_LABELS[quality]} curves`
          : `No ${QUALITY_LABELS[quality]} curve data`
        : `Show ${QUALITY_LABELS[quality]} curves`;
      button.addEventListener("click", () => model.onSelectQuality(quality));
      group.append(button);
    }
    return group.childElementCount > 0 ? group : null;
  }

  renderSingleVariant(model: SingleVariantGraphPanelModel): void {
    this.lastRender = () => this.renderSingleVariant(model);
    const curvesByWear: Partial<Record<Wear, ValidatedCurve>> = {
      [model.variant.wear]: model.curve
    };
    const state: QualityCurveState = {
      quality: model.variant.quality,
      variants: [model.variant],
      status: "ready",
      curvesByWear,
      staleWears: model.stale ? [model.variant.wear] : [],
      missingWears: [],
      errorWears: []
    };
    const currency = model.displayCurrency ?? USD_DISPLAY_CURRENCY;
    const visibleRange = intersectWearWithPaint(
      model.variant.wear,
      model.curve.floatRange.min,
      model.curve.floatRange.max
    );
    const validFloat =
      typeof model.itemFloat === "number" &&
      Number.isFinite(model.itemFloat) &&
      visibleRange !== null &&
      model.itemFloat >= visibleRange.min &&
      model.itemFloat <= visibleRange.max
        ? model.itemFloat
        : null;
    const estimateUsd =
      validFloat === null ? null : priceAtFloat(model.curve.fairPrice.vertices, validFloat);
    const listing =
      typeof model.buyerPays === "number" && Number.isFinite(model.buyerPays) && model.buyerPays > 0
        ? model.buyerPays
        : null;
    this.compact = true;
    this.renderShell(
      (body) =>
        this.renderGraph(body, state, {
          focusedWear: model.variant.wear,
          itemFloat: validFloat,
          displayCurrency: currency,
          buyerPays: model.buyerPays ?? null,
          notice: model.notice ?? null
        }),
      {
        title: model.variant.marketHashName,
        estimate:
          estimateUsd === null
            ? null
            : formatCurrency(estimateUsd * currency.usdRate, currency.code),
        listing: listing === null ? null : formatCurrency(listing, currency.code),
        subtitle:
          validFloat === null
            ? "Float unavailable"
            : `Float ${validFloat.toFixed(8)} · ${getWearRange(model.variant.wear).label}`
      }
    );
  }

  private renderShell(renderBody: (body: HTMLElement) => void, header: HeaderModel = {}): void {
    this.root.replaceChildren();
    this.host.classList.toggle("compact", this.compact);
    const panel = document.createElement("section");
    panel.className = `panel${this.collapsed ? " collapsed" : ""}${this.compact ? " compact" : ""}`;
    panel.setAttribute("aria-label", "Cslytics float curves");
    const headerElement = document.createElement("header");
    headerElement.className = "header";
    const heading = document.createElement("div");
    heading.className = "heading";
    const title = document.createElement("div");
    title.className = "title";
    const titleText = document.createElement("span");
    titleText.className = "title-text";
    titleText.textContent = header.title ?? "Cslytics Float Curves";
    const brandLink = document.createElement("a");
    brandLink.className = "brand-link";
    brandLink.href = CSLYTICS_URL;
    brandLink.target = "_blank";
    brandLink.rel = "noopener noreferrer";
    brandLink.title = "Open cslytics.com";
    brandLink.append(createCslyticsIcon());
    title.append(brandLink, titleText);
    heading.append(title);
    if (header.subtitle) {
      const subtitleElement = document.createElement("div");
      subtitleElement.className = "subtitle";
      subtitleElement.textContent = header.subtitle;
      heading.append(subtitleElement);
    }
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "collapse";
    collapse.textContent = this.collapsed ? "Expand" : "Collapse";
    collapse.addEventListener("click", () => {
      this.collapsed = !this.collapsed;
      panel.classList.toggle("collapsed", this.collapsed);
      collapse.textContent = this.collapsed ? "Expand" : "Collapse";
    });
    // Centre column: only the figures that actually have a value — absent stays blank.
    const figures = document.createElement("div");
    figures.className = "figures";
    if (header.estimate) figures.append(this.renderFigure("estimate", "EST value", header.estimate));
    if (header.listing) figures.append(this.renderFigure("listing", "Your listing", header.listing));
    headerElement.append(heading, figures, collapse);
    const body = document.createElement("div");
    body.className = "body";
    renderBody(body);
    panel.append(headerElement, body);
    this.root.append(panel);
  }

  /** A large header number tied to its plotted marker by colour and shape. */
  private renderFigure(kind: "estimate" | "listing", label: string, value: string): HTMLElement {
    const figure = document.createElement("div");
    figure.className = "figure";
    figure.dataset.kind = kind;
    const labelElement = document.createElement("div");
    labelElement.className = "figure-label";
    const mark = document.createElement("span");
    mark.className = "figure-mark";
    labelElement.append(mark, label);
    const valueElement = document.createElement("div");
    valueElement.className = "figure-value";
    valueElement.textContent = value;
    figure.append(labelElement, valueElement);
    return figure;
  }

  /**
   * Trim a vertex list to a float interval, evaluating the true curve value at each cut so the
   * clipped ends sit on the line rather than at the nearest vertex. Prices are converted last,
   * keeping the frozen USD model intact right up to the pixel.
   */
  private clipVertices(
    vertices: readonly CurveVertex[],
    interval: { min: number; max: number },
    usdRate: number
  ): PlotPoint[] {
    return [
      { x: interval.min, y: priceAtFloat(vertices, interval.min) },
      ...vertices
        .filter(([float]) => float > interval.min && float < interval.max)
        .map(([x, y]) => ({ x, y })),
      { x: interval.max, y: priceAtFloat(vertices, interval.max) }
    ]
      .filter((point): point is PlotPoint => point.y !== null)
      .map((point) => ({ x: point.x, y: point.y * usdRate }));
  }

  /** The line style a series is drawn in, reproduced small so the legend and chips can show it. */
  private seriesMark(key: SeriesKey): SVGSVGElement {
    const mark = document.createElementNS(SVG_NS, "svg");
    mark.setAttribute("viewBox", "0 0 14 8");
    mark.setAttribute("class", "toggle-mark");
    mark.setAttribute("aria-hidden", "true");
    if (key === "listings") {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", "7");
      dot.setAttribute("cy", "4");
      dot.setAttribute("r", "3");
      dot.setAttribute("fill", "currentColor");
      mark.append(dot);
      return mark;
    }
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "4");
    line.setAttribute("x2", "14");
    line.setAttribute("y2", "4");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", key === "fair" ? "3" : "2");
    if (key === "ask") line.setAttribute("stroke-dasharray", "4 2.5");
    if (key === "bid") line.setAttribute("stroke-dasharray", "1 2");
    mark.append(line);
    return mark;
  }

  /**
   * One control bar, grouped by function. Availability is derived from the *unfiltered* curves,
   * so a chip for something currently hidden is still offered — otherwise hiding a series would
   * remove its own switch. Returns the reset-zoom button, which only `redraw` knows when to show.
   */
  private renderControls(
    container: HTMLElement,
    allCurves: Array<[Wear, ValidatedCurve]>,
    qualityControl: HTMLElement | null
  ): HTMLButtonElement {
    const bar = document.createElement('div');
    bar.className = 'controls';
    if (qualityControl) bar.append(qualityControl);

    const available = new Set<SeriesKey>();
    for (const [, curve] of allCurves) {
      if (curve.fairPrice.vertices.length > 0) available.add('fair');
      if (curve.lowestAsk) available.add('ask');
      if (curve.highestBid) available.add('bid');
      if (curve.listings && curve.listings.entries.length > 0) available.add('listings');
    }
    // With only fair_price there is nothing to choose between — Steam's documents once looked
    // like that, and a lone switch that can only turn the graph off is not a choice.
    if (available.size > 1) {
      const group = document.createElement('div');
      group.className = 'series-toggles';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Series');
      for (const key of SERIES_KEYS) {
        if (!available.has(key)) continue;
        const visible = !this.hiddenSeries.has(key);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'series-toggle';
        button.dataset.series = key;
        button.dataset.selected = String(visible);
        button.setAttribute('aria-pressed', String(visible));
        button.title = `${visible ? "Hide" : "Show"} ${SERIES_LABELS[key].toLowerCase()}`;
        button.append(this.seriesMark(key), SERIES_LABELS[key]);
        button.addEventListener('click', () => {
          if (visible) this.hiddenSeries.add(key);
          else this.hiddenSeries.delete(key);
          this.lastRender?.();
        });
        group.append(button);
      }
      bar.append(group);
    }

    const view = document.createElement('div');
    view.className = 'controls-view';
    const logarithmic = this.scaleKind === 'log';
    const scale = document.createElement('button');
    scale.type = 'button';
    scale.className = 'view-button';
    scale.dataset.scale = this.scaleKind;
    scale.dataset.selected = String(logarithmic);
    scale.setAttribute('role', 'switch');
    scale.setAttribute('aria-checked', String(logarithmic));
    scale.title = logarithmic ? 'Switch to a linear price axis' : 'Switch to a log price axis';
    const track = document.createElement('span');
    track.className = 'switch-track';
    const thumb = document.createElement('span');
    thumb.className = 'switch-thumb';
    track.append(thumb);
    scale.append(track, 'Log scale');
    // A full re-render rather than a redraw: flipping the scale rebuilds the axis, the grid and
    // every path, and it happens on a click rather than per animation frame.
    scale.addEventListener('click', () => {
      this.scaleKind = logarithmic ? 'linear' : 'log';
      this.lastRender?.();
    });
    const resetZoom = document.createElement('button');
    resetZoom.type = 'button';
    resetZoom.className = 'view-button';
    resetZoom.dataset.action = 'reset-zoom';
    resetZoom.textContent = 'Reset zoom';
    resetZoom.title = 'Show the whole float range again';
    resetZoom.hidden = true;
    resetZoom.addEventListener('click', () => {
      this.zoomWindow = null;
      this.lastRender?.();
    });
    view.append(scale, resetZoom);
    bar.append(view);

    container.append(bar);
    return resetZoom;
  }


  private renderGraph(
    container: HTMLElement,
    state: QualityCurveState,
    options: {
      focusedWear?: Wear;
      itemFloat?: number | null;
      displayCurrency?: DisplayCurrency;
      buyerPays?: number | null;
      notice?: string | null;
      qualityControl?: HTMLElement | null;
      pageUrl?: string;
    } = {}
  ): void {
    const focusedWear = options.focusedWear;
    const displayCurrency = options.displayCurrency ?? {
      code: "USD",
      usdRate: 1,
      fxAsOf: null,
      fxStale: false
    };
    const usdRate = displayCurrency.usdRate;
    const allCurves = (Object.entries(state.curvesByWear) as Array<[Wear, ValidatedCurve]>).filter(
      ([wear]) => focusedWear === undefined || wear === focusedWear
    );
    const canonical = allCurves[0]?.[1];
    if (!canonical) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "No curve data is available for this quality.";
      container.append(status);
      return;
    }

    // Rendered before every early return below: if hiding a series emptied the graph, the
    // controls to bring it back must still be on screen.
    const resetZoom = this.renderControls(container, allCurves, options.qualityControl ?? null);

    const curves = allCurves;
    const segments: SeriesPlot[] = [];
    const listingPlots: ListingPlot[] = [];
    const inconsistent: Wear[] = [];
    for (const [wear, curve] of curves) {
      if (
        curve.floatRange.min !== canonical.floatRange.min ||
        curve.floatRange.max !== canonical.floatRange.max
      ) {
        inconsistent.push(wear);
        continue;
      }
      const interval = intersectWearWithPaint(
        wear,
        canonical.floatRange.min,
        canonical.floatRange.max
      );
      if (!interval) continue;

      if (!this.hiddenSeries.has("fair")) {
        const points = this.clipVertices(curve.fairPrice.vertices, interval, usdRate);
        if (points.length > 0) segments.push({ wear, series: "fair", curve, lines: [points] });
      }
      if (!this.hiddenSeries.has("ask") && curve.lowestAsk) {
        const points = this.clipVertices(curve.lowestAsk.vertices, interval, usdRate);
        if (points.length > 0) segments.push({ wear, series: "ask", curve, lines: [points] });
      }
      if (!this.hiddenSeries.has("bid") && curve.highestBid) {
        // One line per covered segment. Clipping each to its own coverage is what stops a gap
        // from being drawn across; the contract forbids any value between segments.
        const lines = curve.highestBid.segments
          .map((segment) => {
            const first = segment[0];
            const last = segment[segment.length - 1];
            if (!first || !last) return [];
            const lo = Math.max(interval.min, first[0]);
            const hi = Math.min(interval.max, last[0]);
            return hi < lo ? [] : this.clipVertices(segment, { min: lo, max: hi }, usdRate);
          })
          .filter((points) => points.length > 0);
        if (lines.length > 0) segments.push({ wear, series: "bid", curve, lines });
      }
      if (!this.hiddenSeries.has("listings") && curve.listings) {
        const points = curve.listings.entries
          .filter((entry) => entry.float >= interval.min && entry.float <= interval.max)
          .map((entry) => ({ id: entry.id, x: entry.float, y: entry.price * usdRate }));
        if (points.length > 0) listingPlots.push({ wear, curve, points });
      }
    }

    if (segments.length === 0 && listingPlots.length === 0) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent =
        inconsistent.length > 0 && curves.length > 0
          ? "Curve ranges are inconsistent and cannot be graphed safely."
          : "Nothing is selected to plot.";
      container.append(status);
      return;
    }

    const focusedDomain = focusedWear
      ? intersectWearWithPaint(focusedWear, canonical.floatRange.min, canonical.floatRange.max)
      : null;
    if (focusedWear && !focusedDomain) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "This wear is outside the paint's achievable float range.";
      container.append(status);
      return;
    }

    const itemFloat =
      typeof options.itemFloat === "number" &&
      Number.isFinite(options.itemFloat) &&
      options.itemFloat >= (focusedDomain?.min ?? canonical.floatRange.min) &&
      options.itemFloat <= (focusedDomain?.max ?? canonical.floatRange.max)
        ? options.itemFloat
        : null;
    const estimateUsd =
      itemFloat === null ? null : priceAtFloat(canonical.fairPrice.vertices, itemFloat);
    const estimate = estimateUsd === null ? null : estimateUsd * usdRate;
    const listing =
      itemFloat !== null &&
      typeof options.buyerPays === "number" &&
      Number.isFinite(options.buyerPays) &&
      options.buyerPays > 0
        ? options.buyerPays
        : null;
    const width = 1000;
    const height = this.compact ? 250 : 350;
    const margin = { left: 64, right: 18, top: this.compact ? 28 : 34, bottom: this.compact ? 36 : 42 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const plotRight = width - margin.right;
    const plotBottom = height - margin.bottom;
    const xMin = focusedDomain?.min ?? canonical.floatRange.min;
    const xMax = focusedDomain?.max ?? canonical.floatRange.max;
    // Nothing above Steam's per-purchase maximum is buyable, so an outlier up there must not
    // squash the range that is. The cap is USD, applied through the same rate as the plotted
    // values; if everything is above it, `priceDomain` leaves the axis uncapped rather than
    // handing back an empty plot.
    const capDisplay = STEAM_MAX_PLOT_PRICE_USD * usdRate;

    // A zoom belongs to the float domain it was taken against. Re-rendering the same graph keeps
    // the view — the sell dialog re-renders on every debounced keystroke, and typing a price must
    // not throw the user back out — but a different domain drops it rather than showing an
    // arbitrary window of a curve nobody zoomed into.
    if (
      this.zoomWindow &&
      (this.zoomWindow.domainMin !== xMin || this.zoomWindow.domainMax !== xMax)
    ) {
      this.zoomWindow = null;
    }

    // Everything plotted is created once here and *repositioned* by `redraw`. Panning must never
    // rebuild the tree: `renderShell` replaces the whole shadow root, which at 60fps would mean
    // reconstructing the header, the chips and the legend on every pointermove.
    const paths: Array<{ element: SVGPathElement; points: PlotPoint[] }> = [];
    const dots: Array<{ element: SVGCircleElement; x: number; y: number }> = [];
    const marks: Array<{ x: number; y: number; place: (px: number, py: number) => void }> = [];

    const chartWrap = document.createElement("div");
    chartWrap.className = "chart-wrap";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${QUALITY_LABELS[state.quality]} fair-price curve by raw float`);

    // Grid, ticks and wear labels all move with the view, so they share a layer that is rebuilt
    // wholesale — a couple of dozen nodes, against potentially hundreds in the plot itself.
    const gridLayer = document.createElementNS(SVG_NS, "g");
    svg.append(gridLayer);
    svg.append(this.svgLine(margin.left, margin.top, margin.left, plotBottom, "axis"));
    svg.append(this.svgLine(margin.left, plotBottom, plotRight, plotBottom, "axis"));
    const wearLayer = document.createElementNS(SVG_NS, "g");
    svg.append(wearLayer);

    // Capping the y-axis and zooming the x-axis both let geometry fall outside the plot; without
    // this it would draw over the wear labels and the header.
    const defs = document.createElementNS(SVG_NS, "defs");
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", PLOT_CLIP_ID);
    const clipRect = document.createElementNS(SVG_NS, "rect");
    clipRect.setAttribute("x", String(margin.left));
    clipRect.setAttribute("y", String(margin.top));
    clipRect.setAttribute("width", String(plotWidth));
    clipRect.setAttribute("height", String(plotHeight));
    clip.append(clipRect);
    defs.append(clip);
    svg.append(defs);

    const plotLayer = document.createElementNS(SVG_NS, "g");
    plotLayer.setAttribute("clip-path", `url(#${PLOT_CLIP_ID})`);
    svg.append(plotLayer);

    for (const segment of segments) {
      for (const line of segment.lines) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("class", "curve");
        path.setAttribute("stroke", getWearRange(segment.wear).color);
        path.dataset.quality = state.quality;
        path.dataset.wear = segment.wear;
        path.dataset.series = segment.series;
        plotLayer.append(path);
        paths.push({ element: path, points: line });
      }
    }

    const cursor = this.svgLine(0, margin.top, 0, plotBottom, "cursor");
    cursor.setAttribute("visibility", "hidden");
    svg.append(cursor);
    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("x", String(margin.left));
    hit.setAttribute("y", String(margin.top));
    hit.setAttribute("width", String(plotWidth));
    hit.setAttribute("height", String(plotHeight));
    hit.setAttribute("class", "hit");
    svg.append(hit);
    chartWrap.append(svg);
    container.append(chartWrap);

    const detail = document.createElement("div");
    detail.className = "detail";
    const defaultDetail = "Move over the graph to inspect a raw float.";
    detail.textContent = defaultDetail;
    container.append(detail);

    const markerText = (label: string, price: number): string =>
      `${label} · Float ${itemFloat?.toFixed(8) ?? "unavailable"} · ${formatCurrency(
        price,
        displayCurrency.code
      )}`;
    const addMarkerInteractions = (marker: SVGElement, text: string): void => {
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", text);
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = text;
      marker.append(title);
      const show = (): void => {
        detail.textContent = text;
      };
      const hide = (): void => {
        detail.textContent = defaultDetail;
      };
      marker.addEventListener("pointerenter", show);
      marker.addEventListener("pointerleave", hide);
      marker.addEventListener("focus", show);
      marker.addEventListener("blur", hide);
    };

    // Above the hit rect so the dots are hoverable, below the estimate markers so those stay
    // readable. One delegated listener pair, not four per dot — a book can be hundreds of entries.
    if (listingPlots.length > 0) {
      const layer = document.createElementNS(SVG_NS, "g");
      layer.setAttribute("class", "listings-layer");
      layer.setAttribute("clip-path", `url(#${PLOT_CLIP_ID})`);
      const pageUrl = options.pageUrl ?? location.href;
      for (const plot of listingPlots) {
        const color = getWearRange(plot.wear).color;
        for (const point of plot.points) {
          const dot = document.createElementNS(SVG_NS, "circle");
          dot.setAttribute("r", "3.5");
          dot.setAttribute("class", "listing-dot");
          dot.setAttribute("fill", color);
          dot.dataset.series = "listings";
          dot.dataset.wear = plot.wear;
          // The market group page can address this exact listing; the sell dialog cannot, and
          // gets no link rather than a guessed one.
          const href = steamListingUrl(pageUrl, point.id);
          const text = `Listing · Float ${point.x.toFixed(8)} · ${formatCurrency(
            point.y,
            displayCurrency.code
          )}${href ? " · click to open on Steam" : ""}`;
          dot.dataset.detail = text;
          const title = document.createElementNS(SVG_NS, "title");
          title.textContent = text;
          dot.append(title);
          if (href) {
            const link = document.createElementNS(SVG_NS, "a");
            link.setAttribute("class", "listing-link");
            link.setAttribute("href", href);
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
            link.dataset.listing = point.id;
            link.append(dot);
            layer.append(link);
          } else layer.append(dot);
          dots.push({ element: dot, x: point.x, y: point.y });
        }
      }
      layer.addEventListener("pointerover", (event) => {
        const target = event.target;
        if (target instanceof SVGElement && target.dataset.detail) {
          detail.textContent = target.dataset.detail;
        }
      });
      layer.addEventListener("pointerout", () => {
        detail.textContent = defaultDetail;
      });
      svg.append(layer);
    }

    if (itemFloat !== null && estimate !== null) {
      // Clipped like everything else: with the price cap, an estimate above it has no place
      // on the plot and must not spill over the header.
      const markerLayer = document.createElementNS(SVG_NS, "g");
      markerLayer.setAttribute("clip-path", `url(#${PLOT_CLIP_ID})`);
      svg.append(markerLayer);
      if (listing !== null && Math.abs(listing - estimate) < 0.005) {
        const marker = document.createElementNS(SVG_NS, "circle");
        marker.setAttribute("r", "9");
        marker.setAttribute("class", "marker estimate-marker");
        marker.dataset.marker = "combined";
        addMarkerInteractions(
          marker,
          `${markerText("EST value", estimate)} · ${markerText("your listing", listing)}`
        );
        markerLayer.append(marker);
        marks.push({ x: itemFloat, y: estimate, place: placeCircle(marker) });
      } else {
        const estimateMarker = document.createElementNS(SVG_NS, "circle");
        estimateMarker.setAttribute("r", "7");
        estimateMarker.setAttribute("class", "marker estimate-marker");
        estimateMarker.dataset.marker = "estimate";
        addMarkerInteractions(estimateMarker, markerText("EST value", estimate));
        markerLayer.append(estimateMarker);
        marks.push({ x: itemFloat, y: estimate, place: placeCircle(estimateMarker) });

        if (listing !== null) {
          const listingMarker = document.createElementNS(SVG_NS, "polygon");
          listingMarker.setAttribute("class", "marker listing-marker");
          listingMarker.dataset.marker = "listing";
          addMarkerInteractions(listingMarker, markerText("your listing", listing));
          markerLayer.append(listingMarker);
          marks.push({ x: itemFloat, y: listing, place: placeDiamond(listingMarker, 9) });
        }
      }
    }

    // No legend: the series chips above already carry every line style and its label, and the
    // wear bands are named and divided on the plot itself. Repeating both under the chart was
    // the single largest block of redundant text in the panel.
    const meta = document.createElement("div");
    meta.className = "meta";
    const rangeText = document.createElement("span");
    const timestamps = [
      ...segments.map((segment) => Date.parse(segment.curve.fairPrice.asOf)),
      ...listingPlots.map((plot) => Date.parse(plot.curve.listings?.asOf ?? ""))
    ].filter((value) => Number.isFinite(value));
    const oldestAsOf = Math.min(...timestamps);
    const freshness = document.createElement("span");
    const fxText =
      displayCurrency.code === "USD" || displayCurrency.fxAsOf === null
        ? "USD model"
        : `USD model · converted to ${displayCurrency.code} · FX ${displayCurrency.fxAsOf}`;
    const stale = state.staleWears.length > 0 || displayCurrency.fxStale;
    // Staleness is routine under the ~26h freshness budget: signal it with a glyph, not colour.
    freshness.textContent = `${stale ? "⚠ " : ""}${fxText} · Oldest curve ${formatTimestamp(
      oldestAsOf
    )}`;
    if (stale) freshness.className = "warning";
    meta.append(rangeText, freshness);
    container.append(meta);

    // Both notes are owned by `redraw`: zooming changes whether the cap binds, and the scale
    // switch changes whether anything is unplottable. Anchored to `meta` so they keep their
    // place among the footnotes however often they come and go.
    const capNote = document.createElement("div");
    capNote.className = "missing";
    capNote.dataset.note = "price-cap";
    const logNote = document.createElement("div");
    logNote.className = "missing warning";
    logNote.dataset.note = "log-scale";
    const setNote = (element: HTMLElement, show: boolean): void => {
      if (!show) element.remove();
      else if (!element.isConnected) meta.after(element);
    };

    let xScale: AxisScale = createScale("linear", xMin, xMax, margin.left, plotRight);

    const redraw = (): void => {
      const view = this.zoomWindow ?? { min: xMin, max: xMax };
      xScale = createScale("linear", view.min, view.max, margin.left, plotRight);

      // The price axis fits what is actually on screen: the reason to zoom into a stretch that
      // looks flat at full extent is to find out that it is not.
      const visible: number[] = [];
      for (const path of paths) visible.push(...valuesWithin(path.points, view.min, view.max));
      for (const dot of dots) if (dot.x >= view.min && dot.x <= view.max) visible.push(dot.y);
      for (const mark of marks) if (mark.x >= view.min && mark.x <= view.max) visible.push(mark.y);
      const domain = priceDomain(visible, this.scaleKind, capDisplay);
      const yScale = createScale(
        this.scaleKind === "log" && domain.min > 0 ? "log" : "linear",
        domain.min,
        domain.max,
        plotBottom,
        margin.top
      );

      const ticks = yScale.ticks(this.compact ? 4 : 5);
      const grid: SVGElement[] = [];
      for (const value of ticks.minor) {
        const y = yScale.at(value);
        grid.push(this.svgLine(margin.left, y, plotRight, y, "grid-minor"));
      }
      for (const value of ticks.major) {
        const y = yScale.at(value);
        grid.push(this.svgLine(margin.left, y, plotRight, y, "grid"));
        grid.push(
          this.svgText(
            margin.left - 8,
            y + 4,
            formatCurrency(value, displayCurrency.code, true),
            "tick",
            "end"
          )
        );
      }
      for (let index = 0; index <= 5; index += 1) {
        const ratio = index / 5;
        const x = margin.left + ratio * plotWidth;
        const float = view.min + ratio * (view.max - view.min);
        grid.push(this.svgLine(x, margin.top, x, plotBottom, "grid"));
        grid.push(this.svgText(x, plotBottom + 22, float.toFixed(3), "tick", "middle"));
      }
      gridLayer.replaceChildren(...grid);

      // Wear bands are read off the visible window, so zooming into Field-Tested leaves its
      // label centred over the part of the band still on screen. Each band is closed by a
      // translucent divider at the float where the next one starts.
      const wearMarks: SVGElement[] = [];
      for (const boundary of WEAR_BOUNDARIES) {
        if (boundary.at <= view.min || boundary.at >= view.max) continue;
        const x = xScale.at(boundary.at);
        const divider = this.svgLine(x, margin.top, x, plotBottom, "wear-divider");
        divider.setAttribute("stroke", boundary.color);
        wearMarks.push(divider);
      }
      for (const range of WEAR_RANGES) {
        const interval = intersectWearWithPaint(range.wear, view.min, view.max);
        if (!interval) continue;
        const label = this.svgText(
          (xScale.at(interval.min) + xScale.at(interval.max)) / 2,
          20,
          range.shortLabel,
          "wear-label",
          "middle"
        );
        label.setAttribute("fill", range.color);
        wearMarks.push(label);
      }
      wearLayer.replaceChildren(...wearMarks);

      for (const path of paths) {
        path.element.setAttribute(
          "d",
          path.points
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${xScale.at(point.x)} ${yScale.at(point.y)}`
            )
            .join(" ")
        );
      }
      for (const dot of dots) {
        dot.element.setAttribute("cx", String(xScale.at(dot.x)));
        dot.element.setAttribute("cy", String(yScale.at(dot.y)));
      }
      for (const mark of marks) mark.place(xScale.at(mark.x), yScale.at(mark.y));

      // The gesture hint rides on the range line rather than taking a row of its own.
      rangeText.textContent = `Raw float ${view.min.toFixed(2)}–${view.max.toFixed(
        2
      )} · scroll to zoom, drag to pan`;
      if (domain.capped) {
        capNote.textContent = `Axis capped at ${formatCurrency(
          capDisplay,
          displayCurrency.code
        )} — Steam's maximum purchase price.`;
      }
      setNote(capNote, domain.capped);
      // Honours "absent is no data, never 0": a value a log axis cannot place is called out
      // rather than quietly clipped under the axis and read as missing.
      if (domain.droppedNonPositive > 0) {
        logNote.textContent = `${domain.droppedNonPositive} point${
          domain.droppedNonPositive === 1 ? "" : "s"
        } at or below zero cannot be drawn on a log axis — switch to linear to see ${
          domain.droppedNonPositive === 1 ? "it" : "them"
        }.`;
      }
      setNote(logNote, domain.droppedNonPositive > 0);
      resetZoom.hidden = this.zoomWindow === null;
    };

    // One redraw per animation frame however many wheel or move events arrive in between.
    let frame = 0;
    const schedule = (): void => {
      if (frame !== 0) return;
      if (typeof requestAnimationFrame !== "function") {
        redraw();
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        redraw();
      });
    };

    /** Clamps a proposed window to the full domain and to the zoom limit, then redraws. */
    const setView = (min: number, max: number): void => {
      const fullSpan = xMax - xMin;
      let lo = min;
      let hi = max;
      const minSpan = fullSpan * MAX_ZOOM;
      if (hi - lo < minSpan) {
        const middle = (lo + hi) / 2;
        lo = middle - minSpan / 2;
        hi = middle + minSpan / 2;
      }
      if (hi - lo >= fullSpan) {
        if (this.zoomWindow === null) return;
        this.zoomWindow = null;
        schedule();
        return;
      }
      // Panning past an end slides the window back rather than shrinking it, so a drag at full
      // zoom-in keeps the same magnification all the way to the edge.
      if (lo < xMin) {
        hi += xMin - lo;
        lo = xMin;
      }
      if (hi > xMax) {
        lo -= hi - xMax;
        hi = xMax;
      }
      this.zoomWindow = {
        min: Math.max(xMin, lo),
        max: Math.min(xMax, hi),
        domainMin: xMin,
        domainMax: xMax
      };
      schedule();
    };

    const floatAtClientX = (clientX: number): number | null => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const viewX = ((clientX - rect.left) / rect.width) * width;
      return xScale.invert(Math.min(plotRight, Math.max(margin.left, viewX)));
    };

    // On the whole chart, not just the hit rect: the markers, the listing dots and the axis
    // labels all sit above or outside it, and the sell dialog's estimate marker sits in the
    // middle of the plot — pointing at the thing you want to zoom into and scrolling must not be
    // the one gesture that scrolls the dialog instead.
    svg.addEventListener(
      "wheel",
      (event) => {
        // Without this the Steam page — or, in the sell dialog, the dialog we made scrollable —
        // scrolls behind the graph, taking it out of the viewport mid-gesture. Requires the
        // non-passive listener below. Stopping propagation as well keeps Steam's own price
        // history chart from acting on a gesture we have already consumed.
        event.preventDefault();
        event.stopPropagation();
        const anchor = floatAtClientX(event.clientX);
        if (anchor === null) return;
        const pixels = event.deltaY * (DELTA_MODE_PIXELS[event.deltaMode] ?? 1);
        const factor = Math.exp(pixels * WHEEL_SENSITIVITY);
        const view = this.zoomWindow ?? { min: xMin, max: xMax };
        // Anchored on the cursor: the float under the pointer stays under the pointer.
        setView(anchor - (anchor - view.min) * factor, anchor + (view.max - anchor) * factor);
      },
      { passive: false }
    );

    let pan: { pointerId: number; clientX: number; min: number; max: number } | null = null;
    const endPan = (): void => {
      if (pan === null) return;
      // Pointer capture is best-effort: it keeps a fast drag from escaping the rect, but jsdom
      // and older engines simply do not implement it, and panning works without it.
      if (typeof pan.pointerId === "number") hit.releasePointerCapture?.(pan.pointerId);
      pan = null;
      delete hit.dataset.panning;
    };
    hit.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const view = this.zoomWindow ?? { min: xMin, max: xMax };
      pan = { pointerId: event.pointerId, clientX: event.clientX, min: view.min, max: view.max };
      hit.dataset.panning = "true";
      if (typeof event.pointerId === "number") hit.setPointerCapture?.(event.pointerId);
    });
    hit.addEventListener("pointerup", endPan);
    hit.addEventListener("pointercancel", endPan);
    hit.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (this.zoomWindow === null) return;
      this.zoomWindow = null;
      schedule();
    });
    resetZoom.addEventListener("click", () => {
      this.zoomWindow = null;
      schedule();
    });

    hit.addEventListener("pointermove", (event) => {
      if (pan !== null) {
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0) return;
        // Drag moves the data with the pointer, so the window shifts the opposite way.
        const perPixel = ((pan.max - pan.min) / plotWidth) * (width / rect.width);
        const shift = (event.clientX - pan.clientX) * perPixel;
        setView(pan.min - shift, pan.max - shift);
        return;
      }
      const float = floatAtClientX(event.clientX);
      if (float === null) return;
      const cursorX = xScale.at(float);
      cursor.setAttribute("x1", String(cursorX));
      cursor.setAttribute("x2", String(cursorX));
      cursor.setAttribute("visibility", "visible");
      this.renderHoverDetail(detail, state, float, focusedWear, displayCurrency);
    });
    hit.addEventListener("pointerleave", () => {
      endPan();
      cursor.setAttribute("visibility", "hidden");
      detail.textContent = defaultDetail;
    });

    redraw();

    if (options.notice) {
      const notice = document.createElement("div");
      notice.className = "missing warning";
      notice.textContent = options.notice;
      container.append(notice);
    }

    const missing = [...new Set([...state.missingWears, ...state.errorWears, ...inconsistent])];
    if (missing.length > 0) {
      const missingElement = document.createElement("div");
      missingElement.className = "missing";
      missingElement.textContent = `No usable curve: ${missing
        .sort((a, b) => getWearRange(a).order - getWearRange(b).order)
        .map((wear) => getWearRange(wear).shortLabel)
        .join(", ")}`;
      container.append(missingElement);
    }
  }

  private renderHoverDetail(
    detail: HTMLElement,
    state: QualityCurveState,
    float: number,
    focusedWear: Wear | undefined,
    displayCurrency: DisplayCurrency
  ): void {
    const wear = wearAtFloat(float);
    if (!wear) {
      detail.textContent = "This float is outside the CS wear range.";
      return;
    }
    if (focusedWear && wear !== focusedWear) {
      detail.textContent = `${float.toFixed(5)} is outside the sold item's ${
        getWearRange(focusedWear).label
      } range.`;
      return;
    }
    const variantExists = state.variants.some((variant) => variant.wear === wear);
    const curve = state.curvesByWear[wear];
    if (!variantExists) {
      detail.textContent = `${float.toFixed(5)} · ${getWearRange(wear).label} is not available for this paint.`;
      return;
    }
    if (!curve) {
      detail.textContent = `${float.toFixed(5)} · ${getWearRange(wear).label} · No curve data`;
      return;
    }
    if (float < curve.floatRange.min || float > curve.floatRange.max) {
      detail.textContent = `${float.toFixed(5)} is outside this paint's achievable range.`;
      return;
    }
    const price = this.hiddenSeries.has("fair")
      ? null
      : priceAtFloat(curve.fairPrice.vertices, float);
    detail.replaceChildren();
    const priceElement = document.createElement("strong");
    priceElement.textContent =
      price === null
        ? "No curve data"
        : formatCurrency(price * displayCurrency.usdRate, displayCurrency.code);
    detail.append(`${float.toFixed(5)} · ${getWearRange(wear).label} · `, priceElement);

    // The other two series only when they exist and are shown; absent stays silent, never zero.
    const ask =
      this.hiddenSeries.has("ask") || !curve.lowestAsk
        ? null
        : priceAtFloat(curve.lowestAsk.vertices, float);
    if (ask !== null) {
      detail.append(
        ` · ask ${formatCurrency(ask * displayCurrency.usdRate, displayCurrency.code)}`
      );
    }
    const bid =
      this.hiddenSeries.has("bid") || !curve.highestBid
        ? null
        : bidAtFloat(curve.highestBid.segments, float);
    if (bid !== null) {
      detail.append(
        ` · instant sell ${formatCurrency(bid * displayCurrency.usdRate, displayCurrency.code)}`
      );
    }
    detail.append(` · as of ${formatTimestamp(Date.parse(curve.fairPrice.asOf))}`);
  }

  private svgLine(x1: number, y1: number, x2: number, y2: number, className: string): SVGLineElement {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("class", className);
    return line;
  }

  private svgText(
    x: number,
    y: number,
    text: string,
    className: string,
    anchor: "start" | "middle" | "end"
  ): SVGTextElement {
    const element = document.createElementNS(SVG_NS, "text");
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    element.setAttribute("class", className);
    element.setAttribute("text-anchor", anchor);
    element.textContent = text;
    return element;
  }

}

/** The curve's value at `x`, or null when `x` lies outside the points' own span. */
function interpolateY(points: readonly PlotPoint[], x: number): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  // Never extrapolate: a bid segment must not be treated as covering the gap beside it.
  if (!first || !last || x < first.x || x > last.x) return null;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!a || !b || b.x < x) continue;
    return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return last.y;
}

/**
 * Every value a line takes inside a float window — the vertices within it, plus the true value at
 * each edge. Without the edges, zooming between two vertices would leave the price axis with
 * nothing to scale to even though a line runs right across the plot.
 */
function valuesWithin(points: readonly PlotPoint[], min: number, max: number): number[] {
  const values: number[] = [];
  for (const point of points) {
    if (point.x >= min && point.x <= max) values.push(point.y);
  }
  for (const edge of [min, max]) {
    const value = interpolateY(points, edge);
    if (value !== null) values.push(value);
  }
  return values;
}

function placeCircle(element: SVGCircleElement): (x: number, y: number) => void {
  return (x, y) => {
    element.setAttribute("cx", String(x));
    element.setAttribute("cy", String(y));
  };
}

function placeDiamond(
  element: SVGPolygonElement,
  radius: number
): (x: number, y: number) => void {
  return (x, y) => {
    element.setAttribute(
      "points",
      `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`
    );
  };
}
