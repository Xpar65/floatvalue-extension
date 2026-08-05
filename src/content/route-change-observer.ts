export class RouteChangeObserver {
  private lastHref = location.href;
  private debounceTimer: number | null = null;
  private readonly mutationObserver: MutationObserver;
  private readonly onNavigation = (): void => this.checkSoon();

  constructor(private readonly callback: (href: string) => void) {
    this.mutationObserver = new MutationObserver(() => this.checkSoon());
  }

  start(): void {
    window.addEventListener("popstate", this.onNavigation);
    window.addEventListener("hashchange", this.onNavigation);
    document.addEventListener("cslytics:locationchange", this.onNavigation);
    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  stop(): void {
    window.removeEventListener("popstate", this.onNavigation);
    window.removeEventListener("hashchange", this.onNavigation);
    document.removeEventListener("cslytics:locationchange", this.onNavigation);
    this.mutationObserver.disconnect();
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
  }

  private checkSoon(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      if (location.href === this.lastHref) return;
      this.lastHref = location.href;
      this.callback(this.lastHref);
    }, 120);
  }
}
