// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { findListingCards, SteamListingCardDecorator } from "../src/content/steam-listing-cards";
import type { ValidatedCurve } from "../src/domain/types";
import { USD_DISPLAY_CURRENCY } from "../src/ui/display-format";
import { LISTING_RANGE_HOST_ATTR } from "../src/ui/listing-range";
import { makeCurve } from "./fixtures";

const NORMAL = "P250 | Muertos (Field-Tested)";
const STATTRAK = "StatTrak™ P250 | Muertos (Field-Tested)";

const withSeries = (name: string, askTop: number): ValidatedCurve =>
  makeCurve(name, undefined, {
    lowestAsk: { asOf: "2026-08-05T22:10:00Z", vertices: [[0.15, askTop], [0.37, askTop - 5]] },
    highestBid: { asOf: "2026-08-05T22:05:00Z", segments: [[[0.15, 30], [0.37, 26]]] }
  });

/**
 * Steam's real card markup, reduced to the parts we key off. The class names are the hashed ones
 * from the live page precisely so a test fails if anything starts depending on them.
 */
function card(name: string, float: string): string {
  return `
    <div class="BPTxiJF58z0- _-1PRvvg35hk-">
      <div class="_6ogph74EeuE-">
        <span class="NWgTAn1-iiQ-">Classified Pistol</span>
        <div class="_1WHxiF6PoO0-"><span class="h9k0m4mdzeY-">${name}</span></div>
      </div>
      <div class="EnFuoPFRUQw-">
        <div class="AShqAv8lMaM- sI7wun-GD7g-">
          <div class="NWgTAn1-iiQ-">Pattern Template<!-- -->: <span>993</span></div>
          <div class="NWgTAn1-iiQ-">Wear Rating<!-- -->: <span>${float}</span></div>
        </div>
        <div class="Psv8L3U3Y44-"><span>A$29.72</span><button type="button">Buy</button></div>
      </div>
    </div>`;
}

const chips = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[${LISTING_RANGE_HOST_ATTR}]`)
];
const chipText = (host: HTMLElement): string => host.shadowRoot?.textContent ?? "";

let decorator: SteamListingCardDecorator | null = null;

afterEach(() => {
  decorator?.stop();
  decorator = null;
  document.body.replaceChildren();
});

describe("findListingCards", () => {
  it("reads the item and float off a card without touching a single class name", () => {
    document.body.innerHTML = card(NORMAL, "0.248159155");
    const found = findListingCards(document, [NORMAL]);
    expect(found).toHaveLength(1);
    expect(found[0]!.marketHashName).toBe(NORMAL);
    expect(found[0]!.float).toBeCloseTo(0.248159155, 9);
    // The chip is destined for the row that already holds Pattern Template and Wear Rating.
    expect(found[0]!.metaRow.textContent).toContain("Pattern Template");
  });

  it("prefers the longest matching name so StatTrak is never read as Normal", () => {
    document.body.innerHTML = card(STATTRAK, "0.3");
    const found = findListingCards(document, [NORMAL, STATTRAK]);
    expect(found[0]!.marketHashName).toBe(STATTRAK);
  });

  it("ignores a card whose item is not one we hold a curve for", () => {
    document.body.innerHTML = card("AWP | Asiimov (Field-Tested)", "0.3");
    expect(findListingCards(document, [NORMAL])).toHaveLength(0);
  });

  it("ignores a card with no usable float", () => {
    document.body.innerHTML = card(NORMAL, "unknown");
    expect(findListingCards(document, [NORMAL])).toHaveLength(0);
  });

  it("finds every card in a grid", () => {
    document.body.innerHTML = `<div>${card(NORMAL, "0.2")}${card(NORMAL, "0.31")}${card(
      STATTRAK,
      "0.25"
    )}</div>`;
    expect(findListingCards(document, [NORMAL, STATTRAK])).toHaveLength(3);
  });
});

describe("SteamListingCardDecorator", () => {
  const model = {
    curvesByName: new Map([
      [NORMAL, withSeries(NORMAL, 45)],
      [STATTRAK, withSeries(STATTRAK, 120)]
    ]),
    displayCurrency: USD_DISPLAY_CURRENCY
  };

  it("puts one range chip on each card, in that card's own units", () => {
    document.body.innerHTML = `<div>${card(NORMAL, "0.15")}${card(STATTRAK, "0.15")}</div>`;
    decorator = new SteamListingCardDecorator();
    decorator.update(model);

    const rendered = chips();
    expect(rendered).toHaveLength(2);
    expect(chipText(rendered[0]!)).toContain("EST");
    expect(chipText(rendered[0]!)).toContain("$30.00");
    expect(chipText(rendered[0]!)).toContain("$45.00");
    // The StatTrak card is priced off the StatTrak curve, not the selected one.
    expect(chipText(rendered[1]!)).toContain("$120.00");
  });

  it("converts into the wallet currency the card's own price is in", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update({
      curvesByName: model.curvesByName,
      displayCurrency: { code: "AUD", usdRate: 1.5, fxAsOf: "2026-08-06", fxStale: false }
    });
    expect(chipText(chips()[0]!)).toContain("45.00");
    expect(chipText(chips()[0]!)).toContain("67.50");
  });

  it("states the one side that exists rather than inventing the other", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update({
      curvesByName: new Map([
        [
          NORMAL,
          makeCurve(NORMAL, undefined, {
            lowestAsk: { asOf: "2026-08-05T22:10:00Z", vertices: [[0.15, 45], [0.37, 38]] }
          })
        ]
      ]),
      displayCurrency: USD_DISPLAY_CURRENCY
    });
    const text = chipText(chips()[0]!);
    expect(text).toContain("Lowest ask");
    expect(text).not.toContain("–");
    expect(text).not.toContain("0.00");
  });

  it("adds nothing at all to a card it has no series for", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update({
      curvesByName: new Map([[NORMAL, makeCurve(NORMAL)]]),
      displayCurrency: USD_DISPLAY_CURRENCY
    });
    expect(chips()).toHaveLength(0);
  });

  it("never doubles up when the same cards are decorated again", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update(model);
    decorator.update(model);
    decorator.update(model);
    expect(chips()).toHaveLength(1);
  });

  it("re-prices a row React recycled for a different listing", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update(model);
    expect(chipText(chips()[0]!)).toContain("$45.00");

    const wearValue = [...document.querySelectorAll("span")].find(
      (span) => span.textContent === "0.15"
    )!;
    wearValue.textContent = "0.37";
    decorator.update(model);
    expect(chips()).toHaveLength(1);
    expect(chipText(chips()[0]!)).toContain("$40.00");
  });

  it("keeps decorating after React replaces the whole grid", () => {
    document.body.innerHTML = `<div id="grid">${card(NORMAL, "0.15")}</div>`;
    decorator = new SteamListingCardDecorator();
    decorator.update(model);
    expect(chips()).toHaveLength(1);

    // A new grid element entirely: the remembered scope is stale and must be relearned.
    document.body.innerHTML = `<div id="grid2">${card(NORMAL, "0.2")}${card(NORMAL, "0.3")}</div>`;
    decorator.update(model);
    expect(chips()).toHaveLength(2);
  });

  it("takes its chips back out on stop", () => {
    document.body.innerHTML = card(NORMAL, "0.15");
    decorator = new SteamListingCardDecorator();
    decorator.update(model);
    expect(chips()).toHaveLength(1);
    decorator.stop();
    expect(chips()).toHaveLength(0);
  });
});
