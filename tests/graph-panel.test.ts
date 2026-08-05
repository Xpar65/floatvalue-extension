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
});
