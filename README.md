# floatvalue-extension

A Chrome extension (Manifest V3) that shows unified **float-granular fair-price curves** on
Steam's 2026 Counter-Strike 2 market pages, backed by [Cslytics](https://cslytics.com)'s public,
unauthenticated FREE curve API.

It discovers the exact Normal, StatTrak™, and available Souvenir wear variants embedded by Steam,
downloads their `fair_price` curves, and interpolates them locally—no account, API key, or server
round trip per inspected float.

## Status

The first Steam 2026 listing-page implementation is scaffolded in TypeScript. It positively targets
float-bearing CS2 finishes, ignores cases and other commodities, and swaps the complete graph when
Normal/StatTrak/Souvenir quality changes.

## What it talks to

```text
GET https://api.cslytics.com/free/v1/steam/curves/{name_hash}.json
```

`name_hash = lowercase_hex(SHA256(UTF8(exact market_hash_name)))`, computed client-side. The
response contains only a USD `fair_price` curve—an ascending `[float, price]` vertex list, linear
between vertices and flat-clamped outside. No account or API key is required or accepted.

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

## Where to read next

- [AGENTS.md](AGENTS.md) — local repository guidance and the engineering non-negotiables inherited
  from the upstream contract.
