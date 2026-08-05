// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { findSteamPriceHistorySection } from "../src/content/steam-inline-mount";
import { GraphPanel } from "../src/ui/graph-panel";

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline Steam graph mounting", () => {
  it("mounts immediately before Steam's native price-history section", () => {
    document.body.innerHTML = `
      <div id="market-content">
        <section id="history"><header><h2>Median Sale Prices</h2></header></section>
      </div>`;
    const history = document.querySelector<HTMLElement>("#history");
    if (!history) throw new Error("fixture history section is missing");
    history.getBoundingClientRect = () =>
      ({ width: 1200, height: 404 } as DOMRect);

    const anchor = findSteamPriceHistorySection();
    const panel = new GraphPanel(anchor);

    expect(anchor).toBe(history);
    expect(history.previousElementSibling?.id).toBe("cslytics-float-curves");
    expect(document.body.lastElementChild?.id).toBe("market-content");
    panel.remove();
  });

  it("uses chart structure when Steam localizes the heading", () => {
    document.body.innerHTML = `
      <section id="history">
        <h2>Mediane Verkaufspreise</h2>
        <button>1</button><button>2</button><button>3</button>
        <svg></svg>
      </section>`;
    const history = document.querySelector<HTMLElement>("#history");
    if (!history) throw new Error("fixture history section is missing");
    history.getBoundingClientRect = () =>
      ({ width: 1200, height: 404 } as DOMRect);

    expect(findSteamPriceHistorySection()).toBe(history);
  });
});
