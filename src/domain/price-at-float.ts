import type { CurveVertex } from "./types";

// Ported verbatim in behavior from the frozen Cslytics v1 contract.
export function priceAtFloat(
  vertices: readonly CurveVertex[] | null | undefined,
  f: number
): number | null {
  if (!vertices || vertices.length === 0) return null;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (!first || !last) return null;
  if (vertices.length === 1 || f <= first[0]) return Number(first[1]);
  if (f >= last[0]) return Number(last[1]);
  let lo = 0;
  let hi = vertices.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const vertex = vertices[mid];
    if (!vertex) return null;
    if (vertex[0] <= f) lo = mid;
    else hi = mid;
  }
  const a = vertices[lo];
  const b = vertices[hi];
  if (!a || !b) return null;
  const [ax, ay] = a;
  const [bx, by] = b;
  return ay + (by - ay) * ((f - ax) / (bx - ax));
}
