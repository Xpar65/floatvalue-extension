/**
 * The Cslytics bar-chart mark, inlined for use inside the panel's shadow root.
 *
 * Adapted from `src/assets/icon.svg`: intrinsic width/height dropped (CSS sizes it), the bars'
 * legacy v3 amber replaced with `currentColor` so the header drives them with
 * `var(--cs-accent)`, the tile gradient bound to tokens, and the gradient id namespaced so it
 * cannot collide with an id in Steam's document.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
const GRADIENT_ID = "cslytics-icon-tile";
export const CSLYTICS_URL = "https://www.cslytics.com";

/** x, y, width, height, rx — the five bars, in the source artwork's 1024px coordinate space. */
const BARS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [216, 650, 64, 104, 32],
  [304, 335, 68, 419, 34],
  [398, 555, 136, 199, 34],
  [568, 240, 68, 514, 34],
  [662, 682, 184, 72, 36]
];

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/**
 * Build the mark as real DOM (no `innerHTML`). Decorative: the adjacent panel title already
 * names the panel, so it is hidden from assistive technology.
 */
export function createCslyticsIcon(): SVGSVGElement {
  const root = svg("svg", {
    viewBox: "150 150 724 724",
    class: "brand-icon",
    "aria-hidden": "true",
    focusable: "false"
  });

  const defs = svg("defs", {});
  const gradient = svg("linearGradient", { id: GRADIENT_ID, x1: "0", y1: "1", x2: "0", y2: "0" });
  gradient.append(
    svg("stop", { offset: "0%", "stop-color": "var(--cs-bg)" }),
    svg("stop", { offset: "100%", "stop-color": "var(--cs-icon-tile-top)" })
  );
  defs.append(gradient);
  root.append(defs);

  root.append(
    svg("rect", {
      x: "156",
      y: "176",
      width: "712",
      height: "672",
      rx: "82",
      fill: `url(#${GRADIENT_ID})`
    })
  );

  for (const [x, y, width, height, rx] of BARS) {
    root.append(
      svg("rect", {
        x: String(x),
        y: String(y),
        width: String(width),
        height: String(height),
        rx: String(rx),
        fill: "currentColor",
        stroke: "currentColor",
        "stroke-width": "10"
      })
    );
  }

  return root;
}
