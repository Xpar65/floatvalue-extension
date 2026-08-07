const HISTORY_HEADING = "median sale prices";

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function chartSectionForHeading(heading: Element): HTMLElement | null {
  let current = heading.parentElement;
  let fallback = current;
  for (let depth = 0; current && depth < 4; depth += 1) {
    fallback = current;
    const rect = current.getBoundingClientRect();
    if (rect.width >= 500 && rect.height >= 180) return current;
    current = current.parentElement;
  }
  return fallback;
}

/**
 * Finds Steam's native price-history section so our graph participates in the
 * normal document layout. The structural fallback supports localized headings
 * when the section still contains Steam's chart and period controls.
 */
export function findSteamPriceHistorySection(
  root: ParentNode = document
): HTMLElement | null {
  const headings = [...root.querySelectorAll("h1, h2, h3")];
  const namedHeading = headings.find((heading) => normalizedText(heading) === HISTORY_HEADING);
  if (namedHeading) return chartSectionForHeading(namedHeading);

  for (const heading of headings) {
    const section = chartSectionForHeading(heading);
    if (!section) continue;
    const controls = section.querySelectorAll("button, [role='tab']").length;
    if (controls >= 3 && section.querySelector("svg, canvas")) return section;
  }
  return null;
}

/**
 * Resolves once Steam has rendered the price-history section, or with null if it never does.
 *
 * The content script runs at `document_idle`, which on this React route is usually *before* the
 * section exists. Mounting against a null anchor strands the panel at the end of `<body>`, and
 * `RouteChangeObserver` only re-runs the load when `location.href` changes — so the panel stayed
 * stranded until the user happened to switch quality tab, which does change the URL. Wait for the
 * anchor instead of racing it.
 */
export function waitForSteamPriceHistorySection(
  timeoutMs = 15_000,
  root: ParentNode = document
): Promise<HTMLElement | null> {
  const existing = findSteamPriceHistorySection(root);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: HTMLElement | null): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const found = findSteamPriceHistorySection(root);
      if (found) finish(found);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
