/**
 * Cslytics design tokens.
 *
 * This file and `src/domain/wear-ranges.ts` are the ONLY places in the extension allowed to
 * contain colour literals. Components reference tokens; if a value is missing, add it here.
 * See `floatvalue-extension-documentation/design/Cslytics Style Guide.md`.
 */
export const CSLYTICS_TOKENS = `
  :host {
    all: initial;
    display: block;

    /* Surfaces */
    --cs-bg:              #0B0F14;
    --cs-surface:         #111827;
    --cs-surface-raised:  #0F172A;
    --cs-surface-inset:   #0F1722;

    /* Brand mark — the icon tile's gradient runs --cs-bg (bottom) to this (top) */
    --cs-icon-tile-top:   #1E2D40;

    /* Borders */
    --cs-border:          rgba(255, 255, 255, 0.10);
    --cs-border-subtle:   rgba(255, 255, 255, 0.08);
    --cs-border-faint:    rgba(255, 255, 255, 0.06);

    /* Overlays */
    --cs-hover:           rgba(255, 255, 255, 0.05);
    --cs-wash:            rgba(255, 255, 255, 0.02);

    /* Text ramp */
    --cs-text:            #E5E7EB;
    --cs-text-muted:      #99A1AF;
    --cs-text-faint:      #6A7282;
    --cs-text-strong:     #F3F4F6;
    --cs-text-on-accent:  #030712;

    /* Accent — the only saturated hue in the chrome */
    --cs-accent:          #FFB900;
    --cs-accent-hover:    #FFD230;
    --cs-accent-border:   rgba(255, 185, 0, 0.30);
    --cs-accent-wash:     rgba(255, 185, 0, 0.10);
    --cs-accent-text:     #FEE685;

    /* Semantic — profit / loss only, never UI chrome */
    --cs-positive:        #00D492;
    --cs-negative:        #FF6467;

    /* Data marks — the two points plotted on a single-variant graph. Distinct hues by request,
       reinforced by distinct shapes (circle vs diamond). Not chrome; never use these on a button. */
    --cs-mark-estimate:   #00D492;
    --cs-mark-listing:    #5EA8FF;

    /* Chart internals — minor grid is the unlabelled decade subdivision on a log axis, so it
       must read as structure behind the data rather than as another line on it. */
    --cs-axis:            rgba(255, 255, 255, 0.18);
    --cs-grid:            rgba(255, 255, 255, 0.06);
    --cs-grid-minor:      rgba(255, 255, 255, 0.03);

    /* Radii */
    --cs-radius-sm:       0.375rem;
    --cs-radius:          0.5rem;
    --cs-radius-lg:       0.75rem;
    --cs-radius-xl:       1rem;
    --cs-radius-full:     9999px;

    /* Modal scrim */
    --cs-scrim:           rgba(7, 10, 15, 0.85);

    /* Type — Geist is unavailable to a content script; the system stack is the guide's default */
    --cs-font:      ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --cs-font-mono: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace;
  }
`;

const sheets = new Map<string, CSSStyleSheet>();

/**
 * Build the shared stylesheet once; every shadow root adopts the same object instead of
 * re-parsing a `<style>` element per render. `minimum_chrome_version` is 120, so
 * `adoptedStyleSheets`/`replaceSync` need no fallback.
 */
export function cslyticsStyleSheet(css: string): CSSStyleSheet {
  const existing = sheets.get(css);
  if (existing) return existing;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSLYTICS_TOKENS + css);
  sheets.set(css, sheet);
  return sheet;
}
