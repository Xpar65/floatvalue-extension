import type { CurveVertex, ValidatedCurve } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
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

  const vertices: CurveVertex[] = [];
  let previousFloat = -Infinity;
  for (const vertex of value.fair_price.vertices) {
    if (!Array.isArray(vertex) || vertex.length !== 2) throw new Error("Invalid curve vertex");
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
      throw new Error("Curve vertices must be ascending finite [float, price] pairs");
    }
    vertices.push([float, price]);
    previousFloat = float;
  }

  return {
    venue: "steam",
    marketHashName: expectedMarketHashName,
    currency: "USD",
    floatRange: { min, max },
    computedAt: value.computed_at,
    fairPrice: {
      vertices,
      asOf: value.fair_price.as_of
    }
  };
}
