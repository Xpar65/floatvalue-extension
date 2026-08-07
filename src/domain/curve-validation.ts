import type {
  BidSeries,
  CurveListing,
  CurveListings,
  CurveSeries,
  CurveVertex,
  ValidatedCurve
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * An ascending `[float, price]` list, or null if anything about it is unusable.
 *
 * `fair_price` treats null as fatal; the optional series treat it as "no data". Both share these
 * rules so a curve can never be half-trusted.
 */
function parseVertices(value: unknown): CurveVertex[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const vertices: CurveVertex[] = [];
  let previousFloat = -Infinity;
  for (const vertex of value) {
    if (!Array.isArray(vertex) || vertex.length !== 2) return null;
    const [float, price] = vertex;
    if (
      typeof float !== "number" ||
      typeof price !== "number" ||
      !Number.isFinite(float) ||
      !Number.isFinite(price) ||
      float < 0 ||
      float > 1 ||
      price < 0 ||
      float <= previousFloat
    ) {
      return null;
    }
    vertices.push([float, price]);
    previousFloat = float;
  }
  return vertices;
}

/** `fair_price` / `lowest_ask`. Returns null rather than throwing; callers decide how fatal it is. */
function parseCurveSeries(value: unknown): CurveSeries | null {
  if (!isRecord(value)) return null;
  if (!validTimestamp(value.as_of)) return null;
  const vertices = parseVertices(value.vertices);
  return vertices === null ? null : { vertices, asOf: value.as_of };
}

/**
 * `highest_bid`. Segments must be ordered and non-overlapping, because the gaps between them are
 * load-bearing — they are where the price is legitimately null. A single bad segment drops the
 * whole field: a partially trusted bid curve invites bridging a gap that isn't really there.
 */
function parseBidSeries(value: unknown): BidSeries | null {
  if (!isRecord(value)) return null;
  if (!validTimestamp(value.as_of)) return null;
  if (!Array.isArray(value.segments) || value.segments.length === 0) return null;
  const segments: CurveVertex[][] = [];
  let previousMax = -Infinity;
  for (const rawSegment of value.segments) {
    const vertices = parseVertices(rawSegment);
    if (vertices === null) return null;
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (!first || !last) return null;
    if (first[0] <= previousMax) return null;
    previousMax = last[0];
    segments.push(vertices);
  }
  return { segments, asOf: value.as_of };
}

/**
 * `listings`. A complete-but-empty scan is `{as_of, entries: []}` and stays valid; `null` means no
 * authoritative scan exists. Individual malformed entries — including the contract's nullable
 * `float`, which has no x position to plot at — are dropped rather than failing the book.
 */
function parseListings(value: unknown): CurveListings | null {
  if (!isRecord(value)) return null;
  if (!validTimestamp(value.as_of)) return null;
  if (!Array.isArray(value.entries)) return null;
  const entries: CurveListing[] = [];
  for (const entry of value.entries) {
    if (!isRecord(entry)) continue;
    const { id, float, price } = entry;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof float !== "number" || !Number.isFinite(float) || float < 0 || float > 1) continue;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) continue;
    entries.push({ id, float, price });
  }
  return { entries, asOf: value.as_of };
}

export function validateCurveResponse(
  value: unknown,
  expectedMarketHashName: string
): ValidatedCurve {
  if (!isRecord(value)) throw new Error("Curve response is not an object");
  if (value.venue !== "steam") throw new Error("Curve venue is not steam");
  if (value.market_hash_name !== expectedMarketHashName) {
    throw new Error("Curve market_hash_name does not match the request");
  }
  if (value.currency !== "USD") throw new Error("Curve currency is not USD");
  if (!validTimestamp(value.computed_at)) throw new Error("Invalid computed_at");
  if (!isRecord(value.float_range)) throw new Error("Invalid float_range");
  const min = value.float_range.min;
  const max = value.float_range.max;
  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max > 1 ||
    min > max
  ) {
    throw new Error("Invalid float_range bounds");
  }
  if (!isRecord(value.fair_price)) throw new Error("Invalid fair_price");
  if (!validTimestamp(value.fair_price.as_of)) throw new Error("Invalid fair_price.as_of");
  if (!Array.isArray(value.fair_price.vertices) || value.fair_price.vertices.length === 0) {
    throw new Error("fair_price.vertices must be non-empty");
  }
  const fairPrice = parseCurveSeries(value.fair_price);
  if (!fairPrice) {
    throw new Error("Curve vertices must be ascending finite [float, price] pairs");
  }

  return {
    venue: "steam",
    marketHashName: expectedMarketHashName,
    currency: "USD",
    floatRange: { min, max },
    computedAt: value.computed_at,
    fairPrice,
    // Optional by contract and absent from documents published before it changed. Malformed data
    // here degrades to "no data" instead of destroying a fair_price curve that renders fine.
    lowestAsk: parseCurveSeries(value.lowest_ask),
    highestBid: parseBidSeries(value.highest_bid),
    listings: parseListings(value.listings)
  };
}
