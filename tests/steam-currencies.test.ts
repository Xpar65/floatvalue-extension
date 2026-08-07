import { describe, expect, it } from "vitest";
import { STEAM_CURRENCY_CODES, steamCurrencyCode } from "../src/domain/steam-currency-codes";

describe("Steam wallet currency map", () => {
  it("contains the supplied unique mappings for IDs 1 through 41", () => {
    expect(Object.keys(STEAM_CURRENCY_CODES).map(Number)).toEqual(
      Array.from({ length: 41 }, (_, index) => index + 1)
    );
    expect(new Set(Object.values(STEAM_CURRENCY_CODES)).size).toBe(41);
    expect(steamCurrencyCode(1)).toBe("USD");
    expect(steamCurrencyCode(21)).toBe("AUD");
    expect(steamCurrencyCode(41)).toBe("UYU");
  });

  it("does not reinterpret unknown IDs as USD", () => {
    expect(steamCurrencyCode(null)).toBeNull();
    expect(steamCurrencyCode(0)).toBeNull();
    expect(steamCurrencyCode(42)).toBeNull();
  });
});
