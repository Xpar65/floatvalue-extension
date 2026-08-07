export class SteamSellDialogObserver {
  private observer: MutationObserver | null = null;
  private open = false;
  private priceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly handleInput = (event: Event): void => {
    if (!this.open) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (
      target.id !== "market_sell_currency_input" &&
      target.id !== "market_sell_buyercurrency_input"
    ) {
      return;
    }
    if (this.priceTimer !== null) clearTimeout(this.priceTimer);
    this.priceTimer = setTimeout(() => {
      this.priceTimer = null;
      this.onPriceChange();
    }, 75);
  };

  constructor(
    private readonly onOpen: () => void,
    private readonly onClose: () => void,
    private readonly onPriceChange: () => void = () => undefined
  ) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.sync());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true
    });
    document.addEventListener("input", this.handleInput);
    document.addEventListener("keyup", this.handleInput);
    document.addEventListener("change", this.handleInput);
    this.sync();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    document.removeEventListener("input", this.handleInput);
    document.removeEventListener("keyup", this.handleInput);
    document.removeEventListener("change", this.handleInput);
    if (this.priceTimer !== null) clearTimeout(this.priceTimer);
    this.priceTimer = null;
    if (this.open) this.onClose();
    this.open = false;
  }

  private sync(): void {
    const dialog = document.querySelector("#market_sell_dialog");
    const nextOpen = dialog?.hasAttribute("open") === true;
    if (nextOpen === this.open) return;
    this.open = nextOpen;
    if (nextOpen) this.onOpen();
    else {
      if (this.priceTimer !== null) clearTimeout(this.priceTimer);
      this.priceTimer = null;
      this.onClose();
    }
  }
}
