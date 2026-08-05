import { priceAtFloat } from "../domain/price-at-float";
import { shouldShowQuality } from "../domain/quality-state";
import type { Quality, QualityCurveState, ValidatedCurve, Wear } from "../domain/types";
import {
  getWearRange,
  intersectWearWithPaint,
  wearAtFloat,
  WEAR_RANGES
} from "../domain/wear-ranges";

const SVG_NS = "http://www.w3.org/2000/svg";
const QUALITY_LABELS: Record<Quality, string> = {
  normal: "Normal",
  stattrak: "StatTrak™",
  souvenir: "Souvenir"
};

export interface GraphPanelModel {
  states: Readonly<Record<Quality, QualityCurveState>>;
  selectedQuality: Quality | null;
  loading: boolean;
  onSelectQuality: (quality: Quality) => void;
}

interface GraphSegment {
  wear: Wear;
  curve: ValidatedCurve;
  points: Array<{ x: number; y: number }>;
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel {
    position: fixed; z-index: 2147483000; top: 96px; right: 18px; width: min(540px, calc(100vw - 36px));
    border: 1px solid #34495d; border-radius: 12px; overflow: hidden;
    color: #e9f0f7; background: #111923; box-shadow: 0 14px 44px rgba(0,0,0,.45);
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .header { display:flex; align-items:center; justify-content:space-between; padding: 12px 14px; background:#182431; }
  .title { font-size:14px; font-weight:700; letter-spacing:.01em; }
  .subtitle { color:#94a8bb; font-size:11px; margin-top:2px; }
  .collapse { border:0; border-radius:6px; color:#a9b9c8; background:transparent; cursor:pointer; padding:4px 8px; }
  .collapse:hover { background:#253547; color:white; }
  .body { padding: 12px 14px 14px; }
  .collapsed .body { display:none; }
  .qualities { display:flex; gap:6px; margin-bottom:10px; }
  .quality { border:1px solid #40556b; border-radius:7px; padding:6px 11px; background:#172330; color:#b9c7d4; cursor:pointer; }
  .quality[data-selected="true"] { border-color:#61a9e8; background:#163d5d; color:#fff; }
  .quality:disabled { opacity:.48; cursor:not-allowed; }
  .status { min-height:260px; display:grid; place-items:center; color:#aebdca; text-align:center; padding:24px; }
  .chart-wrap { border:1px solid #2b3d4e; border-radius:8px; background:#0d151e; overflow:hidden; }
  svg { display:block; width:100%; height:auto; touch-action:none; }
  .axis { stroke:#516375; stroke-width:1; }
  .grid { stroke:#263746; stroke-width:1; }
  .tick { fill:#8ea2b5; font-size:11px; }
  .wear-label { font-size:10px; font-weight:700; }
  .curve { fill:none; stroke-width:3; stroke-linejoin:round; stroke-linecap:round; }
  .hit { fill:transparent; cursor:crosshair; }
  .cursor { stroke:#d9e6f2; stroke-width:1; stroke-dasharray:3 3; pointer-events:none; }
  .detail { min-height:38px; margin-top:8px; color:#c6d4df; }
  .detail strong { color:#fff; }
  .legend { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:9px; color:#9eb0bf; font-size:11px; }
  .legend-item { display:flex; gap:5px; align-items:center; }
  .swatch { width:8px; height:8px; border-radius:50%; }
  .meta { display:flex; justify-content:space-between; gap:12px; margin-top:9px; color:#8195a7; font-size:11px; }
  .warning { color:#e5b76d; }
  .missing { margin-top:8px; color:#b8a085; font-size:11px; }
  @media (max-width: 700px) { .panel { top:auto; bottom:12px; right:12px; width:calc(100vw - 24px); } }
`;

export class GraphPanel {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private collapsed = false;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "cslytics-float-curves";
    this.root = this.host.attachShadow({ mode: "open" });
    document.body.append(this.host);
  }

  remove(): void {
    this.host.remove();
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
    this.renderShell((body) => {
      const controls = document.createElement("div");
      controls.className = "qualities";
      for (const quality of ["normal", "stattrak", "souvenir"] as const) {
        const state = model.states[quality];
        if (!shouldShowQuality(state)) continue;
        const button = document.createElement("button");
        button.className = "quality";
        button.type = "button";
        button.dataset.quality = quality;
        button.dataset.selected = String(model.selectedQuality === quality);
        button.textContent = QUALITY_LABELS[quality];
        button.disabled = Object.keys(state.curvesByWear).length === 0;
        button.title = button.disabled
          ? state.status === "loading" || state.status === "not-requested"
            ? `Loading ${QUALITY_LABELS[quality]} curves`
            : `No ${QUALITY_LABELS[quality]} curve data`
          : `Show ${QUALITY_LABELS[quality]} curves`;
        button.addEventListener("click", () => model.onSelectQuality(quality));
        controls.append(button);
      }
      body.append(controls);

      if (!model.selectedQuality) {
        const status = document.createElement("div");
        status.className = "status";
        status.textContent = model.loading
          ? "Checking Cslytics curve coverage…"
          : "No Cslytics float curves are available for this item.";
        body.append(status);
        return;
      }
      this.renderGraph(body, model.states[model.selectedQuality]);
    }, model.selectedQuality ? `${QUALITY_LABELS[model.selectedQuality]} fair price` : undefined);
  }

  private renderShell(renderBody: (body: HTMLElement) => void, subtitle?: string): void {
    this.root.replaceChildren();
    const style = document.createElement("style");
    style.textContent = STYLES;
    const panel = document.createElement("section");
    panel.className = `panel${this.collapsed ? " collapsed" : ""}`;
    panel.setAttribute("aria-label", "Cslytics float curves");
    const header = document.createElement("header");
    header.className = "header";
    const heading = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Cslytics Float Curves";
    heading.append(title);
    if (subtitle) {
      const subtitleElement = document.createElement("div");
      subtitleElement.className = "subtitle";
      subtitleElement.textContent = subtitle;
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
    header.append(heading, collapse);
    const body = document.createElement("div");
    body.className = "body";
    renderBody(body);
    panel.append(header, body);
    this.root.append(style, panel);
  }

  private renderGraph(container: HTMLElement, state: QualityCurveState): void {
    const curves = Object.entries(state.curvesByWear) as Array<[Wear, ValidatedCurve]>;
    const canonical = curves[0]?.[1];
    if (!canonical) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "No curve data is available for this quality.";
      container.append(status);
      return;
    }

    const segments: GraphSegment[] = [];
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
      const points = [
        { x: interval.min, y: priceAtFloat(curve.fairPrice.vertices, interval.min) },
        ...curve.fairPrice.vertices
          .filter(([float]) => float > interval.min && float < interval.max)
          .map(([x, y]) => ({ x, y })),
        { x: interval.max, y: priceAtFloat(curve.fairPrice.vertices, interval.max) }
      ].filter((point): point is { x: number; y: number } => point.y !== null);
      if (points.length > 0) segments.push({ wear, curve, points });
    }

    if (segments.length === 0) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "Curve ranges are inconsistent and cannot be graphed safely.";
      container.append(status);
      return;
    }

    const allPrices = segments.flatMap((segment) => segment.points.map((point) => point.y));
    let yMin = Math.min(...allPrices);
    let yMax = Math.max(...allPrices);
    const yPadding = Math.max((yMax - yMin) * 0.1, yMax * 0.025, 0.01);
    yMin = Math.max(0, yMin - yPadding);
    yMax += yPadding;

    const width = 720;
    const height = 350;
    const margin = { left: 64, right: 18, top: 34, bottom: 42 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const xMin = canonical.floatRange.min;
    const xMax = canonical.floatRange.max;
    const scaleX = (x: number): number => margin.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
    const scaleY = (y: number): number => margin.top + ((yMax - y) / (yMax - yMin)) * plotHeight;

    const chartWrap = document.createElement("div");
    chartWrap.className = "chart-wrap";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${QUALITY_LABELS[state.quality]} fair-price curve by raw float`);

    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const y = margin.top + ratio * plotHeight;
      const price = yMax - ratio * (yMax - yMin);
      svg.append(this.svgLine(margin.left, y, width - margin.right, y, "grid"));
      svg.append(this.svgText(margin.left - 8, y + 4, `$${price.toFixed(2)}`, "tick", "end"));
    }
    for (let index = 0; index <= 5; index += 1) {
      const ratio = index / 5;
      const x = margin.left + ratio * plotWidth;
      const float = xMin + ratio * (xMax - xMin);
      svg.append(this.svgLine(x, margin.top, x, height - margin.bottom, "grid"));
      svg.append(this.svgText(x, height - margin.bottom + 22, float.toFixed(3), "tick", "middle"));
    }
    svg.append(this.svgLine(margin.left, margin.top, margin.left, height - margin.bottom, "axis"));
    svg.append(
      this.svgLine(
        margin.left,
        height - margin.bottom,
        width - margin.right,
        height - margin.bottom,
        "axis"
      )
    );

    for (const range of WEAR_RANGES) {
      const interval = intersectWearWithPaint(range.wear, xMin, xMax);
      if (!interval) continue;
      const mid = (scaleX(interval.min) + scaleX(interval.max)) / 2;
      const label = this.svgText(mid, 20, range.shortLabel, "wear-label", "middle");
      label.setAttribute("fill", range.color);
      svg.append(label);
    }

    for (const segment of segments) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        segment.points
          .map((point, index) => `${index === 0 ? "M" : "L"}${scaleX(point.x)} ${scaleY(point.y)}`)
          .join(" ")
      );
      path.setAttribute("class", "curve");
      path.setAttribute("stroke", getWearRange(segment.wear).color);
      path.dataset.quality = state.quality;
      path.dataset.wear = segment.wear;
      svg.append(path);
    }

    const cursor = this.svgLine(0, margin.top, 0, height - margin.bottom, "cursor");
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
    detail.textContent = "Move over the graph to inspect a raw float.";
    container.append(detail);
    hit.addEventListener("pointermove", (event) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const viewX = ((event.clientX - rect.left) / rect.width) * width;
      const clampedX = Math.min(width - margin.right, Math.max(margin.left, viewX));
      const float = xMin + ((clampedX - margin.left) / plotWidth) * (xMax - xMin);
      cursor.setAttribute("x1", String(clampedX));
      cursor.setAttribute("x2", String(clampedX));
      cursor.setAttribute("visibility", "visible");
      this.renderHoverDetail(detail, state, float);
    });
    hit.addEventListener("pointerleave", () => {
      cursor.setAttribute("visibility", "hidden");
      detail.textContent = "Move over the graph to inspect a raw float.";
    });

    const legend = document.createElement("div");
    legend.className = "legend";
    for (const segment of segments) {
      const item = document.createElement("span");
      item.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = getWearRange(segment.wear).color;
      item.append(swatch, getWearRange(segment.wear).label);
      legend.append(item);
    }
    container.append(legend);

    const meta = document.createElement("div");
    meta.className = "meta";
    const rangeText = document.createElement("span");
    rangeText.textContent = `Raw float ${xMin.toFixed(2)}–${xMax.toFixed(2)}`;
    const oldestAsOf = Math.min(...segments.map((segment) => Date.parse(segment.curve.fairPrice.asOf)));
    const freshness = document.createElement("span");
    freshness.textContent = `Oldest curve ${this.formatTimestamp(oldestAsOf)}`;
    if (state.staleWears.length > 0) freshness.className = "warning";
    meta.append(rangeText, freshness);
    container.append(meta);

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

  private renderHoverDetail(detail: HTMLElement, state: QualityCurveState, float: number): void {
    const wear = wearAtFloat(float);
    if (!wear) {
      detail.textContent = "This float is outside the CS wear range.";
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
    const price = priceAtFloat(curve.fairPrice.vertices, float);
    detail.replaceChildren();
    const priceElement = document.createElement("strong");
    priceElement.textContent = price === null ? "No curve data" : `$${price.toFixed(2)} USD`;
    detail.append(
      `${float.toFixed(5)} · ${getWearRange(wear).label} · `,
      priceElement,
      ` · as of ${this.formatTimestamp(Date.parse(curve.fairPrice.asOf))}`
    );
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

  private formatTimestamp(timestamp: number): string {
    return Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp)
      : "unknown";
  }
}
