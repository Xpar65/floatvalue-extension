// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quality, QualityCurveState } from "../src/domain/types";
import { GraphPanel } from "../src/ui/graph-panel";
import { makeCurve, makeQualityState } from "./fixtures";

afterEach(() => document.body.replaceChildren());

function statesWithCurves(): Record<Quality, QualityCurveState> {
  return {
    normal: makeQualityState("normal", {
      status: "ready",
      variants: [{ quality: "normal", wear: "field-tested", wearOrder: 2, marketHashName: "normal" }],
      curvesByWear: { "field-tested": makeCurve("normal") }
    }),
    stattrak: makeQualityState("stattrak", {
      status: "ready",
      variants: [{ quality: "stattrak", wear: "field-tested", wearOrder: 2, marketHashName: "stattrak" }],
      curvesByWear: { "field-tested": makeCurve("stattrak", [[0.15, 90], [0.37, 70]]) }
    }),
    souvenir: makeQualityState("souvenir")
  };
}

describe("GraphPanel quality swapping", () => {
  it("renders only the selected quality's paths", () => {
    const panel = new GraphPanel();
    const states = statesWithCurves();
    panel.render({ states, selectedQuality: "normal", loading: false, onSelectQuality: vi.fn() });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(root.querySelectorAll('path[data-quality="normal"]')).toHaveLength(1);
    expect(root.querySelectorAll('path[data-quality="stattrak"]')).toHaveLength(0);

    panel.render({ states, selectedQuality: "stattrak", loading: false, onSelectQuality: vi.fn() });
    expect(root.querySelectorAll('path[data-quality="normal"]')).toHaveLength(0);
    expect(root.querySelectorAll('path[data-quality="stattrak"]')).toHaveLength(1);
  });

  it("keeps all-missing Souvenir hidden and exposes partial Souvenir", () => {
    const panel = new GraphPanel();
    const states = statesWithCurves();
    panel.render({ states, selectedQuality: "normal", loading: false, onSelectQuality: vi.fn() });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(root.querySelector('[data-quality="souvenir"]')).toBeNull();

    states.souvenir = makeQualityState("souvenir", {
      status: "partial",
      variants: [
        { quality: "souvenir", wear: "minimal-wear", wearOrder: 1, marketHashName: "souvenir mw" },
        { quality: "souvenir", wear: "field-tested", wearOrder: 2, marketHashName: "souvenir ft" }
      ],
      curvesByWear: { "minimal-wear": makeCurve("souvenir mw", [[0.1, 100], [0.149, 80]]) },
      missingWears: ["field-tested"]
    });
    panel.render({ states, selectedQuality: "normal", loading: false, onSelectQuality: vi.fn() });
    expect(root.querySelector('[data-quality="souvenir"]')).not.toBeNull();
  });

  it("mounts after Steam price history and zooms a single-variant graph to its wear", () => {
    document.body.innerHTML = `
      <dialog id="market_sell_dialog" open>
        <div id="pricehistory_container"></div>
        <div id="sell-inputs"></div>
      </dialog>`;
    const history = document.querySelector("#pricehistory_container")!;
    const panel = new GraphPanel(history, "after");
    panel.renderSingleVariant({
      variant: {
        quality: "normal",
        wear: "field-tested",
        wearOrder: 2,
        marketHashName: "SSG 08 | Sans Comic (Field-Tested)"
      },
      curve: makeCurve("SSG 08 | Sans Comic (Field-Tested)"),
      stale: true,
      itemFloat: 0.2,
      displayCurrency: {
        code: "AUD",
        usdRate: 1.5,
        fxAsOf: "2026-08-06",
        fxStale: false
      },
      buyerPays: 100
    });

    const host = document.querySelector("#cslytics-float-curves")!;
    const root = host.shadowRoot!;
    expect(history.nextElementSibling).toBe(host);
    expect(root.querySelector(".qualities")).toBeNull();
    expect(root.querySelectorAll('path[data-quality="normal"][data-wear="field-tested"]'))
      .toHaveLength(1);
    const labels = [...root.querySelectorAll(".tick")].map((element) => element.textContent);
    expect(labels).toContain("0.150");
    expect(labels).toContain("0.380");
    expect(root.querySelector(".title")?.textContent).toContain("SSG 08 | Sans Comic (Field-Tested)");
    expect(root.querySelector(".subtitle")?.textContent).toContain("Float 0.20000000");
    const figures = [...root.querySelectorAll(".figure")].map((figure) => ({
      kind: (figure as HTMLElement).dataset.kind,
      text: figure.textContent
    }));
    expect(figures.find((figure) => figure.kind === "estimate")?.text).toContain("EST value");
    expect(figures.find((figure) => figure.kind === "estimate")?.text).toContain("AUD");
    expect(figures.find((figure) => figure.kind === "listing")?.text).toContain("$100.00 AUD");
    expect(root.querySelector('[data-marker="estimate"]')).not.toBeNull();
    expect(root.querySelector('[data-marker="listing"]')).not.toBeNull();
    const listing = root.querySelector('[data-marker="listing"]')!;
    const listingPoints = listing.getAttribute("points")!.split(/[ ,]/).map(Number);
    expect(listingPoints.filter((_, index) => index % 2 === 1).every((y) => y >= 28 && y <= 214))
      .toBe(true);
    listing.dispatchEvent(new Event("pointerenter"));
    expect(root.querySelector(".detail")?.textContent).toContain("your listing");
    expect(root.querySelector(".detail")?.textContent).toContain("$100.00 AUD");
    expect(root.querySelector(".meta")?.textContent).toContain("converted to AUD");
    expect(root.querySelector(".warning")).not.toBeNull();
  });

  it("combines coincident estimate and listing points without shifting them", () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant: {
        quality: "normal",
        wear: "field-tested",
        wearOrder: 2,
        marketHashName: "Example (Field-Tested)"
      },
      curve: makeCurve("Example (Field-Tested)"),
      stale: false,
      itemFloat: 0.2,
      buyerPays: 38.44
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    const combined = root.querySelector('[data-marker="combined"]')!;
    expect(combined).not.toBeNull();
    combined.dispatchEvent(new Event("pointerenter"));
    expect(root.querySelector(".detail")?.textContent).toContain("EST value");
    expect(root.querySelector(".detail")?.textContent).toContain("your listing");
  });
});

describe("GraphPanel curve series and listings", () => {
  const singleVariant = {
    quality: "normal" as const,
    wear: "field-tested" as const,
    wearOrder: 2 as const,
    marketHashName: "Example (Field-Tested)"
  };

  function renderCurve(extras: Parameters<typeof makeCurve>[2]): ShadowRoot {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant: singleVariant,
      curve: makeCurve(singleVariant.marketHashName, undefined, extras),
      stale: false
    });
    return document.querySelector("#cslytics-float-curves")!.shadowRoot!;
  }

  it("renders a document with no ask, bid, or listings exactly as before", () => {
    const root = renderCurve({});
    expect(root.querySelectorAll('path[data-series="fair"]')).toHaveLength(1);
    expect(root.querySelectorAll('path[data-series="ask"]')).toHaveLength(0);
    expect(root.querySelectorAll('circle[data-series="listings"]')).toHaveLength(0);
    // Nothing to choose between, so no series chrome is added for it — but the price axis is
    // always switchable, and that control lives in the view group, not among the series chips.
    expect(root.querySelector(".series-toggle")).toBeNull();
    expect(root.querySelector(".view-button[data-scale]")).not.toBeNull();
  });

  it("plots each listing entry as a point", () => {
    const root = renderCurve({
      listings: {
        asOf: "2026-08-05T22:15:00Z",
        entries: [
          { id: "a", float: 0.2, price: 40 },
          { id: "b", float: 0.3, price: 44 },
          // Outside the Field-Tested window, so it belongs to another wear's graph.
          { id: "c", float: 0.5, price: 20 }
        ]
      }
    });
    expect(root.querySelectorAll('circle[data-series="listings"]')).toHaveLength(2);
  });

  it("draws each bid segment separately and never bridges the gap", () => {
    const root = renderCurve({
      highestBid: {
        asOf: "2026-08-05T22:05:00Z",
        segments: [
          [[0.15, 30], [0.24, 28]],
          [[0.31, 26], [0.37, 24]]
        ]
      }
    });
    const paths = [...root.querySelectorAll('path[data-series="bid"]')];
    expect(paths).toHaveLength(2);
    // One move-to per path: the gap is two separate lines, never one line drawn across it.
    for (const path of paths) {
      const d = path.getAttribute("d")!;
      expect(d.startsWith("M")).toBe(true);
      expect(d.match(/M/g)).toHaveLength(1);
    }
  });

  it("toggles a series off and keeps the control that turns it back on", () => {
    const root = renderCurve({
      lowestAsk: { asOf: "2026-08-05T22:10:00Z", vertices: [[0.15, 45], [0.37, 38]] }
    });
    expect(root.querySelectorAll('path[data-series="ask"]')).toHaveLength(1);

    const askChip = root.querySelector<HTMLButtonElement>('.series-toggle[data-series="ask"]')!;
    expect(askChip.dataset.selected).toBe("true");
    askChip.click();

    const afterHide = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(afterHide.querySelectorAll('path[data-series="ask"]')).toHaveLength(0);
    expect(afterHide.querySelectorAll('path[data-series="fair"]')).toHaveLength(1);
    const rehide = afterHide.querySelector<HTMLButtonElement>('.series-toggle[data-series="ask"]')!;
    expect(rehide.dataset.selected).toBe("false");

    rehide.click();
    const afterShow = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(afterShow.querySelectorAll('path[data-series="ask"]')).toHaveLength(1);
  });

  it("keeps the toggles on screen when everything has been hidden", () => {
    const root = renderCurve({
      listings: { asOf: "2026-08-05T22:15:00Z", entries: [{ id: "a", float: 0.2, price: 40 }] }
    });
    root.querySelector<HTMLButtonElement>('.series-toggle[data-series="fair"]')!.click();
    let current = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    current.querySelector<HTMLButtonElement>('.series-toggle[data-series="listings"]')!.click();

    current = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(current.querySelector(".chart-wrap")).toBeNull();
    expect(current.querySelectorAll(".series-toggle").length).toBeGreaterThan(0);

    // Not a dead end: the controls still work.
    current.querySelector<HTMLButtonElement>('.series-toggle[data-series="fair"]')!.click();
    const revived = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(revived.querySelectorAll('path[data-series="fair"]')).toHaveLength(1);
  });

  it("plots every wear present, with no per-wear switches to hide them", () => {
    const panel = new GraphPanel();
    const states = statesWithCurves();
    states.normal = makeQualityState("normal", {
      status: "ready",
      variants: [
        { quality: "normal", wear: "minimal-wear", wearOrder: 1, marketHashName: "mw" },
        { quality: "normal", wear: "field-tested", wearOrder: 2, marketHashName: "ft" }
      ],
      curvesByWear: {
        "minimal-wear": makeCurve("mw", [[0.1, 100], [0.149, 80]]),
        "field-tested": makeCurve("ft")
      }
    });
    panel.render({ states, selectedQuality: "normal", loading: false, onSelectQuality: vi.fn() });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(root.querySelectorAll('path[data-series="fair"]')).toHaveLength(2);
    expect(root.querySelector(".wear-toggle")).toBeNull();
  });

  it("divides the wear tiers with a translucent line in the opening tier's colour", () => {
    const panel = new GraphPanel();
    panel.render({
      states: statesWithCurves(),
      selectedQuality: "normal",
      loading: false,
      onSelectQuality: vi.fn()
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    // The fixture paint spans 0.10–0.70, so MW/FT/WW/BS open inside it but FN's 0 does not.
    const dividers = [...root.querySelectorAll("line.wear-divider")];
    expect(dividers).toHaveLength(3);
    // Field-Tested opens at 0.15 and carries its own hue, never the accent.
    expect(dividers.map((line) => line.getAttribute("stroke"))).toContain("#c08a4a");
  });

  it("drops the divider for a boundary scrolled out of the visible window", () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant: singleVariant,
      curve: makeCurve(singleVariant.marketHashName),
      stale: false
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    // A single Field-Tested graph spans 0.15–0.38 exactly: both ends are the axis, not a division.
    expect(root.querySelectorAll("line.wear-divider")).toHaveLength(0);
  });

  it("links each listing dot to that listing on the market group page", () => {
    const panel = new GraphPanel();
    const states = statesWithCurves();
    states.normal = makeQualityState("normal", {
      status: "ready",
      variants: [
        { quality: "normal", wear: "field-tested", wearOrder: 2, marketHashName: "ft" }
      ],
      curvesByWear: {
        "field-tested": makeCurve("ft", undefined, {
          listings: {
            asOf: "2026-08-05T22:15:00Z",
            entries: [{ id: "517500653879896104", float: 0.2, price: 40 }]
          }
        })
      }
    });
    panel.render({
      states,
      selectedQuality: "normal",
      loading: false,
      onSelectQuality: vi.fn(),
      pageUrl: "https://steamcommunity.com/market/listings/730/G1807209A023004"
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    const link = root.querySelector('a[data-listing="517500653879896104"]')!;
    expect(link.getAttribute("href")).toBe(
      "https://steamcommunity.com/market/listings/730/G1807209A023004?detail=517500653879896104"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.querySelector('circle[data-series="listings"]')).not.toBeNull();
  });

  it("leaves a listing unlinked when the page has no group route to link into", () => {
    const root = renderCurve({
      listings: {
        asOf: "2026-08-05T22:15:00Z",
        entries: [{ id: "517500653879896104", float: 0.2, price: 40 }]
      }
    });
    // renderSingleVariant is the sell dialog: an inventory URL carries no group code.
    expect(root.querySelector("a[data-listing]")).toBeNull();
    expect(root.querySelectorAll('circle[data-series="listings"]')).toHaveLength(1);
  });

  it("caps the axis at Steam's maximum purchase price and says so", () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant: singleVariant,
      curve: makeCurve(singleVariant.marketHashName, [[0.15, 5000], [0.37, 500]]),
      stale: false
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    const ticks = [...root.querySelectorAll(".tick")].map((tick) => tick.textContent);
    expect(ticks).toContain("$2,000.00");
    expect(ticks.some((tick) => tick?.includes("5,000"))).toBe(false);
    expect(root.querySelector('[data-note="price-cap"]')?.textContent).toContain("2,000.00");
    // Geometry above the cap must be clipped, not drawn over the header.
    expect(root.querySelector('path[data-series="fair"]')?.closest("g")?.getAttribute("clip-path"))
      .toBe("url(#cs-plot-clip)");
  });

  it("leaves the axis uncapped when the whole curve is above the cap", () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant: singleVariant,
      curve: makeCurve(singleVariant.marketHashName, [[0.15, 9000], [0.37, 6000]]),
      stale: false
    });
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(root.querySelector('[data-note="price-cap"]')).toBeNull();
    expect(root.querySelectorAll('path[data-series="fair"]')).toHaveLength(1);
  });

  it("reports ask and bid alongside the fair price on hover", () => {
    const root = renderCurve({
      lowestAsk: { asOf: "2026-08-05T22:10:00Z", vertices: [[0.15, 45], [0.37, 38]] },
      highestBid: { asOf: "2026-08-05T22:05:00Z", segments: [[[0.15, 30], [0.37, 24]]] }
    });
    const hit = root.querySelector(".hit")!;
    const svg = root.querySelector(".chart-wrap svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
    hit.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 }));
    const text = root.querySelector(".detail")!.textContent!;
    expect(text).toContain("ask");
    expect(text).toContain("instant sell");
  });
});

describe("GraphPanel price axis and zoom", () => {
  const variant = {
    quality: "normal" as const,
    wear: "field-tested" as const,
    wearOrder: 2 as const,
    marketHashName: "Example (Field-Tested)"
  };

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const shadow = (): ShadowRoot => document.querySelector("#cslytics-float-curves")!.shadowRoot!;
  const ticks = (): string[] =>
    [...shadow().querySelectorAll(".tick")].map((tick) => tick.textContent ?? "");
  const floatTicks = (): string[] => ticks().filter((label) => /^\d\.\d{3}$/.test(label));

  /** Two decades of price across one wear — the case a linear axis renders as a flat floor. */
  function renderSpread(): GraphPanel {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant,
      curve: makeCurve(variant.marketHashName, [[0.15, 1500], [0.37, 15]]),
      stale: false
    });
    return panel;
  }

  /** jsdom gives every element a zero-width box, which would make every pointer x meaningless. */
  function measurableChart(): void {
    const svg = shadow().querySelector(".chart-wrap svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
  }

  it("defaults to a log price axis with round decade labels", () => {
    renderSpread();
    expect(shadow().querySelector<HTMLElement>(".view-button[data-scale]")!.dataset.selected)
      .toBe("true");
    expect(ticks()).toContain("$1,000.00");
    expect(ticks()).toContain("$100.00");
    expect(ticks()).toContain("$20.00");
  });

  it("presents the scale as a switch, with the slider tracking its state", () => {
    renderSpread();
    const toggle = shadow().querySelector<HTMLButtonElement>(".view-button[data-scale]")!;
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.querySelector(".switch-track .switch-thumb")).not.toBeNull();

    toggle.click();
    const flipped = shadow().querySelector<HTMLButtonElement>(".view-button[data-scale]")!;
    expect(flipped.getAttribute("aria-checked")).toBe("false");
    expect(flipped.dataset.selected).toBe("false");
    expect(flipped.querySelector(".switch-track .switch-thumb")).not.toBeNull();
  });

  it("draws unlabelled decade subdivisions between the labelled lines", () => {
    renderSpread();
    expect(shadow().querySelectorAll("line.grid-minor").length).toBeGreaterThan(0);
  });

  /**
   * The sell dialog plots one wear, whose fair price spans a fraction of a decade — far too
   * narrow to contain round decades. It gets a log grid all the same, or it reads as a linear
   * graph with a log switch stuck on.
   */
  it("gives one wear's narrow price range the same log grid as a full listing", () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant,
      curve: makeCurve(variant.marketHashName),
      stale: false
    });
    expect(ticks()).toContain("$35.00");
    expect(ticks()).toContain("$40.00");
    expect(ticks()).toContain("$45.00");
    expect(shadow().querySelectorAll("line.grid-minor").length).toBeGreaterThan(0);
    panel.remove();
  });

  it("switches to a linear axis and back without losing the control", () => {
    renderSpread();
    shadow().querySelector<HTMLButtonElement>(".view-button[data-scale]")!.click();

    const linear = shadow().querySelector<HTMLElement>(".view-button[data-scale]")!;
    expect(linear.dataset.scale).toBe("linear");
    expect(linear.dataset.selected).toBe("false");
    // A linear axis divides the padded range evenly, so the round decades disappear.
    expect(ticks()).toContain("$0.00");
    expect(ticks()).not.toContain("$1,000.00");
    expect(shadow().querySelectorAll("line.grid-minor")).toHaveLength(0);

    shadow().querySelector<HTMLButtonElement>(".view-button[data-scale]")!.click();
    expect(ticks()).toContain("$1,000.00");
  });

  it("zooms the float axis about the cursor and offers a way back", async () => {
    renderSpread();
    measurableChart();
    expect(floatTicks()).toContain("0.150");
    expect(floatTicks()).toContain("0.380");
    expect(shadow().querySelector<HTMLButtonElement>('.view-button[data-action="reset-zoom"]')!.hidden).toBe(true);

    const hit = shadow().querySelector(".hit")!;
    hit.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 500, cancelable: true, bubbles: true }));
    await nextFrame();

    const zoomed = floatTicks();
    expect(zoomed).not.toContain("0.150");
    expect(zoomed).not.toContain("0.380");
    expect(Number(zoomed[0])).toBeGreaterThan(0.15);
    expect(Number(zoomed[zoomed.length - 1])).toBeLessThan(0.38);
    expect(shadow().querySelector<HTMLButtonElement>('.view-button[data-action="reset-zoom"]')!.hidden).toBe(false);

    shadow().querySelector<HTMLButtonElement>('.view-button[data-action="reset-zoom"]')!.click();
    await nextFrame();
    expect(floatTicks()).toContain("0.150");
    expect(floatTicks()).toContain("0.380");
    expect(shadow().querySelector<HTMLButtonElement>('.view-button[data-action="reset-zoom"]')!.hidden).toBe(true);
  });

  /**
   * The sell dialog's estimate marker sits in the middle of the plot, over the hit rect — the
   * natural place to point at before scrolling. A wheel there used to miss the zoom entirely and
   * scroll the dialog we made scrollable instead.
   */
  it("zooms from a wheel anywhere over the chart, including on the estimate marker", async () => {
    const panel = new GraphPanel();
    panel.renderSingleVariant({
      variant,
      curve: makeCurve(variant.marketHashName, [[0.15, 1500], [0.37, 15]]),
      stale: false,
      itemFloat: 0.2
    });
    measurableChart();
    const marker = shadow().querySelector(".estimate-marker")!;
    const event = new WheelEvent("wheel", {
      deltaY: -200,
      clientX: 500,
      cancelable: true,
      bubbles: true
    });
    marker.dispatchEvent(event);
    await nextFrame();

    expect(event.defaultPrevented).toBe(true);
    expect(floatTicks()).not.toContain("0.150");
    expect(shadow().querySelector<HTMLButtonElement>('.view-button[data-action="reset-zoom"]')!.hidden)
      .toBe(false);
    panel.remove();
  });

  it("rescales the price axis to what the zoomed window actually contains", async () => {
    renderSpread();
    measurableChart();
    const full = ticks();

    // Zoom hard into the cheap end, where the whole visible run sits under $100.
    const hit = shadow().querySelector(".hit")!;
    for (let index = 0; index < 6; index += 1) {
      hit.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, clientX: 950, cancelable: true, bubbles: true }));
      await nextFrame();
    }
    const zoomed = ticks();
    expect(zoomed).not.toEqual(full);
    expect(zoomed).not.toContain("$1,000.00");
  });

  it("pans the window without changing how far it is zoomed in", async () => {
    renderSpread();
    measurableChart();
    const hit = shadow().querySelector(".hit")!;
    hit.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 500, cancelable: true, bubbles: true }));
    await nextFrame();

    const before = floatTicks().map(Number);
    const beforeSpan = before[before.length - 1]! - before[0]!;

    hit.dispatchEvent(new MouseEvent("pointerdown", { clientX: 500, button: 0 }));
    hit.dispatchEvent(new MouseEvent("pointermove", { clientX: 600 }));
    await nextFrame();
    hit.dispatchEvent(new MouseEvent("pointerup", { clientX: 600 }));

    const after = floatTicks().map(Number);
    // Dragging right walks the window down the float axis, at the same magnification. Both
    // spans are read off 3-decimal tick labels, so they only agree to within a rounding step.
    expect(after[0]!).toBeLessThan(before[0]!);
    expect(after[after.length - 1]! - after[0]!).toBeCloseTo(beforeSpan, 2);
  });

  it("holds the window against the ends of the domain instead of over-panning", async () => {
    renderSpread();
    measurableChart();
    const hit = shadow().querySelector(".hit")!;
    hit.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 500, cancelable: true, bubbles: true }));
    await nextFrame();

    hit.dispatchEvent(new MouseEvent("pointerdown", { clientX: 500, button: 0 }));
    hit.dispatchEvent(new MouseEvent("pointermove", { clientX: 5000 }));
    await nextFrame();
    hit.dispatchEvent(new MouseEvent("pointerup", { clientX: 5000 }));

    const labels = floatTicks().map(Number);
    expect(labels[0]).toBeCloseTo(0.15, 6);
    expect(labels[labels.length - 1]!).toBeLessThan(0.38);
  });

  it("keeps the hover readout working while not panning", () => {
    renderSpread();
    measurableChart();
    const hit = shadow().querySelector(".hit")!;
    hit.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 }));
    expect(shadow().querySelector(".detail")!.textContent).toContain("Field-Tested");
  });

  it("keeps the zoom across a re-render of the same item but drops it for a new domain", async () => {
    const panel = renderSpread();
    measurableChart();
    const hit = shadow().querySelector(".hit")!;
    hit.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 500, cancelable: true, bubbles: true }));
    await nextFrame();
    const zoomed = floatTicks();

    // The sell dialog re-renders on every debounced keystroke; typing a price must not undo it.
    panel.renderSingleVariant({
      variant,
      curve: makeCurve(variant.marketHashName, [[0.15, 1500], [0.37, 15]]),
      stale: false,
      buyerPays: 42
    });
    expect(floatTicks()).toEqual(zoomed);

    // A different wear is a different float domain, so the old window no longer means anything.
    panel.renderSingleVariant({
      variant: { ...variant, wear: "well-worn", wearOrder: 3, marketHashName: "Example (Well-Worn)" },
      curve: makeCurve("Example (Well-Worn)", [[0.38, 20], [0.44, 12]]),
      stale: false
    });
    expect(floatTicks()).toContain("0.380");
  });
});

describe("GraphPanel branding and styling", () => {
  it("puts the Cslytics mark in the header of both graphs", () => {
    const listing = new GraphPanel();
    listing.render({
      states: statesWithCurves(),
      selectedQuality: "normal",
      loading: false,
      onSelectQuality: vi.fn()
    });
    const listingRoot = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(listingRoot.querySelector(".header .title .brand-icon")).not.toBeNull();
    expect(listingRoot.querySelector(".title")?.textContent).toContain("Cslytics Float Curves");
    listing.remove();

    const sell = new GraphPanel();
    sell.renderSingleVariant({
      variant: {
        quality: "normal",
        wear: "field-tested",
        wearOrder: 2,
        marketHashName: "Example (Field-Tested)"
      },
      curve: makeCurve("Example (Field-Tested)"),
      stale: false,
      itemFloat: 0.2
    });
    const sellRoot = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    expect(sellRoot.querySelector(".header .title .brand-icon")).not.toBeNull();
    // No listing price yet: leave the figure out rather than printing a placeholder.
    expect(sellRoot.querySelector('.figure[data-kind="estimate"]')).not.toBeNull();
    expect(sellRoot.querySelector('.figure[data-kind="listing"]')).toBeNull();
    expect(sellRoot.querySelector(".figures")?.textContent).not.toContain("Unavailable");
  });

  it("links the mark to cslytics.com", () => {
    const panel = new GraphPanel();
    panel.showLoading();
    const root = document.querySelector("#cslytics-float-curves")!.shadowRoot!;
    const link = root.querySelector<HTMLAnchorElement>(".header a.brand-link")!;
    expect(link.href).toBe("https://www.cslytics.com/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.querySelector(".brand-icon")).not.toBeNull();
  });

  it("shares one constructed stylesheet across panels instead of re-parsing per render", () => {
    const first = new GraphPanel();
    const second = new GraphPanel();
    first.showLoading();
    first.showMessage("again");
    second.showLoading();

    const roots = [...document.querySelectorAll("#cslytics-float-curves")].map(
      (host) => host.shadowRoot!
    );
    expect(roots).toHaveLength(2);
    // No <style> element is rebuilt per render when constructed sheets are available.
    expect(roots.every((root) => root.querySelectorAll("style").length === 0)).toBe(true);
    expect(roots[0]!.adoptedStyleSheets[0]).toBe(roots[1]!.adoptedStyleSheets[0]);
  });
});
