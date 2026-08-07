/** Steam wallet / market currency id → ISO 4217 code. */
export const STEAM_CURRENCY_CODES = {
  1: "USD",
  2: "GBP",
  3: "EUR",
  4: "CHF",
  5: "RUB",
  6: "PLN",
  7: "BRL",
  8: "JPY",
  9: "NOK",
  10: "IDR",
  11: "MYR",
  12: "PHP",
  13: "SGD",
  14: "THB",
  15: "VND",
  16: "KRW",
  17: "TRY",
  18: "UAH",
  19: "MXN",
  20: "CAD",
  21: "AUD",
  22: "NZD",
  23: "CNY",
  24: "INR",
  25: "CLP",
  26: "PEN",
  27: "COP",
  28: "ZAR",
  29: "HKD",
  30: "TWD",
  31: "SAR",
  32: "AED",
  33: "SEK",
  34: "ARS",
  35: "ILS",
  36: "BYN",
  37: "KZT",
  38: "KWD",
  39: "QAR",
  40: "CRC",
  41: "UYU"
} as const satisfies Record<number, string>;

export type SteamCurrencyId = keyof typeof STEAM_CURRENCY_CODES;
export type SteamCurrencyIso = (typeof STEAM_CURRENCY_CODES)[SteamCurrencyId];

export function steamCurrencyCode(currencyId: number | null): SteamCurrencyIso | null {
  if (currencyId === null || !Number.isInteger(currencyId)) return null;
  return STEAM_CURRENCY_CODES[currencyId as SteamCurrencyId] ?? null;
}

export function isSteamCurrencyCode(value: unknown): value is SteamCurrencyIso {
  return (
    typeof value === "string" &&
    (Object.values(STEAM_CURRENCY_CODES) as readonly string[]).includes(value)
  );
}
