// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { GraphPanel } from "../src/ui/graph-panel";
import { InventoryEstimate } from "../src/ui/inventory-estimate";
import { makeCurve } from "./fixtures";

afterEach(() => document.body.replaceChildren());

describe("InventoryEstimate", () => {
  it("renders one linked compact estimate after asset properties with full freshness context", () => {
    document.body.innerHTML = `
      <div id="wear">Wear Rating: <span>0.013942285</span></div>
      <div id="market">Starting at: A$ 0.40</div>`;
    const wear = document.querySelector<HTMLElement>("#wear")!;
    const market = document.querySelector<HTMLElement>("#market")!;
    const estimate = new InventoryEstimate(market);
    estimate.renderEstimate({
      estimateUsd: 0.5,
      displayCurrency: {
        code: "AUD",
        usdRate: 1.5,
        fxAsOf: "2026-08-06",
        fxStale: true
      },
      curve: makeCurve("R8 Revolver | Leafhopper (Factory New)"),
      curveStale: true,
      currencyNotice: "Using a cached FX rate because the live rate is unavailable."
    });

    expect(wear.nextElementSibling).toBe(estimate.element);
    expect(estimate.element.nextElementSibling).toBe(market);
    const root = estimate.element.shadowRoot!;
    expect(root.querySelector(".label")?.textContent).toBe("EST value");
    expect(root.querySelector(".value")?.textContent).toContain("AUD");
    const meta = root.querySelector(".meta")!.textContent!;
    expect(meta.startsWith("data as of: ")).toBe(true);
    expect(meta.endsWith(" · cached")).toBe(true);
    expect(meta).not.toContain("FX");
    // A date alone cannot separate a 1h-old price from a 25h-old one under the ~26h budget, so the
    // exact fair-price/curve/FX timestamps stay reachable on hover rather than being dropped.
    const title = root.querySelector<HTMLElement>(".card")!.title;
    expect(title).toContain("fair price");
    expect(title).toContain("curve computed");
    expect(title).toContain("FX 2026-08-06 (cached)");
    expect(title).toContain("Using a cached FX rate");
    // Staleness reads as a chip, never as colour: amber is the brand accent, so it cannot
    // double as a warning. See the style guide's "Two colour conflicts you must resolve".
    expect(root.querySelector(".warning, .estimate-mark")).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>("a.brand-link")!;
    expect(link.href).toBe("https://www.cslytics.com/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    // The wordmark names the link; the mark alone left it with only a title attribute.
    expect(link.querySelector(".brand-name")?.textContent).toBe("Cslytics");
    expect(root.querySelectorAll("svg.brand-icon")).toHaveLength(1);
    expect(root.querySelector(".chart-wrap, .collapse, canvas")).toBeNull();
  });

  it("shows loading and explicit unavailable states without fabricating zero", () => {
    const market = document.body.appendChild(document.createElement("div"));
    const estimate = new InventoryEstimate(market);
    estimate.showLoading();
    expect(estimate.element.shadowRoot?.textContent).toContain("Loading");
    estimate.showUnavailable("No Cslytics Steam curve is available for this item.");
    expect(estimate.element.shadowRoot?.textContent).toContain("Unavailable");
    expect(estimate.element.shadowRoot?.textContent).not.toContain("0.00");
  });

  it("uses component-specific constructed sheets while sharing sheets between like components", () => {
    const market = document.body.appendChild(document.createElement("div"));
    const first = new InventoryEstimate(market);
    const second = new InventoryEstimate(market);
    const graph = new GraphPanel();
    const firstSheet = first.element.shadowRoot!.adoptedStyleSheets[0];
    const secondSheet = second.element.shadowRoot!.adoptedStyleSheets[0];
    const graphSheet = document.querySelector("#cslytics-float-curves")!.shadowRoot!
      .adoptedStyleSheets[0];
    expect(firstSheet).toBe(secondSheet);
    expect(firstSheet).not.toBe(graphSheet);
  });
});
