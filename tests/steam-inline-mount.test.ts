// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  findSteamPriceHistorySection,
  waitForSteamPriceHistorySection
} from "../src/content/steam-inline-mount";
import { GraphPanel } from "../src/ui/graph-panel";

function addHistorySection(): HTMLElement {
  const section = document.createElement("section");
  section.id = "history";
  section.innerHTML = "<header><h2>Median Sale Prices</h2></header>";
  section.getBoundingClientRect = () => ({ width: 1200, height: 404 }) as DOMRect;
  document.body.append(section);
  return section;
}

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

describe("waiting for Steam to render the price-history section", () => {
  it("resolves immediately when the section is already there", async () => {
    const history = addHistorySection();
    await expect(waitForSteamPriceHistorySection(1000)).resolves.toBe(history);
  });

  /**
   * The reported bug: at document_idle the section does not exist yet, so the panel used to mount
   * at the end of <body> and stay there — the route observer only re-runs on a URL change, which
   * is why it appeared only after clicking a quality tab.
   */
  it("waits for a section React has not rendered yet, then anchors the panel to it", async () => {
    const pending = waitForSteamPriceHistorySection(2000);
    expect(findSteamPriceHistorySection()).toBeNull();

    const history = addHistorySection();
    const anchor = await pending;
    expect(anchor).toBe(history);

    const panel = new GraphPanel(anchor);
    expect(history.previousElementSibling?.id).toBe("cslytics-float-curves");
    expect(document.body.lastElementChild).toBe(history);
    panel.remove();
  });

  it("gives up rather than hanging when the section never appears", async () => {
    await expect(waitForSteamPriceHistorySection(30)).resolves.toBeNull();
  });
});
