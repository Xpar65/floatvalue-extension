# floatvalue-extension

A Chrome extension (Manifest V3) that shows **float-granular fair-price estimates and curves** on
Steam's 2026 Counter-Strike 2 market and inventory pages, backed by
[Cslytics](https://cslytics.com)'s public, FREE curve API.

It discovers the exact Normal, StatTrak™, and available Souvenir wear variants embedded by Steam,
downloads their `fair_price`, `lowest_ask`, and segmented `highest_bid` curves plus current listing
books, and evaluates them locally—no account, API key, or server round trip per inspected float.

## Status

The TypeScript implementation positively targets float-bearing CS2 finishes and ignores cases and
other commodities. Market pages swap the complete graph when Normal/StatTrak/Souvenir quality
changes. Selecting an inventory item adds a compact wallet-currency `EST value` between Steam's
Wear Rating and Starting at rows; opening Sell adds the exact-item graph separately.

## What it talks to

```text
GET https://api.cslytics.com/free/v1/steam/curves/{name_hash}.json
GET https://api.cslytics.com/free/v1/fx-rates.json
```

`name_hash = lowercase_hex(SHA256(UTF8(exact market_hash_name)))`, computed client-side. The
curve response contains USD fair/ask/bid curves, the venue's compact listing snapshot, and
freshness metadata. Normal curves interpolate linearly and flat-clamp; bid curves interpolate only
inside their explicit segments. No account or API key is required or accepted.

Inventory display conversion uses Cslytics' one-file USD rate snapshot for all 41 Steam wallet
currencies. It is cached locally for 12 hours with a labelled seven-day fallback; item, float,
price, asset, and account data remain local.

## Develop

Requires a current Node.js release and npm.

```text
npm install
npm run check
```

Useful commands:

- `npm run dev` — rebuild continuously while editing.
- `npm test` — run the unit/component test suite.
- `npm run typecheck` — run strict TypeScript checking.
- `npm run build` — create the unpacked extension in `dist/`.

To try it locally, run `npm run build`, open `chrome://extensions`, enable Developer mode, choose
**Load unpacked**, and select this repository's `dist` directory.

