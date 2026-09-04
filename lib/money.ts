/**
 * All money in this app is stored and computed as integer minor units
 * (paise for INR, cents for USD — every supported currency has a 100-unit
 * minor denomination). Never use floating point arithmetic on money
 * amounts — these helpers are the only place minor-unit <-> major-unit
 * conversion and display formatting should happen.
 */

const RUPEE_STRING_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/**
 * Currencies the app can invoice in. INR is the domestic GST currency;
 * every other entry is billed tax-free (see `lib/invoice-calc.ts`). Each
 * currency's minor unit is 1/100 of its major unit, so the integer
 * "paise" storage model works unchanged.
 */
export const SUPPORTED_CURRENCIES = {
  INR: { label: "Indian Rupee", symbol: "₹", locale: "en-IN", taxable: true },
  USD: { label: "US Dollar", symbol: "$", locale: "en-US", taxable: false },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[];

/** Narrows an arbitrary string to a supported currency, falling back to INR. */
export function toCurrencyCode(value: string | null | undefined): CurrencyCode {
  return value && value in SUPPORTED_CURRENCIES
    ? (value as CurrencyCode)
    : "INR";
}

/** Whether invoices in this currency carry GST/tax. Only INR does. */
export function isTaxableCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES[toCurrencyCode(currency)].taxable;
}

/** The currency symbol, e.g. "₹" or "$". */
export function currencySymbol(currency: string): string {
  return SUPPORTED_CURRENCIES[toCurrencyCode(currency)].symbol;
}

/**
 * Formats an integer minor-unit amount in the given currency, e.g.
 * (12345600, "INR") -> "₹1,23,456.00", (12345600, "USD") -> "$123,456.00".
 * Uses the currency's own locale so digit grouping matches convention
 * (Indian 2-2-3 grouping for INR, Western 3-3-3 for USD).
 */
export function formatMoney(minorUnits: number, currency: string): string {
  assertInteger(minorUnits);
  const { locale } = SUPPORTED_CURRENCIES[toCurrencyCode(currency)];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: toCurrencyCode(currency),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Same as `formatMoney` but without the currency symbol. */
export function formatMoneyNumber(minorUnits: number, currency: string): string {
  assertInteger(minorUnits);
  const { locale } = SUPPORTED_CURRENCIES[toCurrencyCode(currency)];
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/**
 * Rounds a total to the currency's conventional invoice increment and
 * returns the round-off delta. INR invoices round to the nearest whole
 * rupee (the long-standing Indian practice); every other currency keeps
 * its exact minor-unit value (no round-off line).
 */
export function roundInvoiceTotal(
  minorUnits: number,
  currency: string,
): { roundedPaise: number; roundOffPaise: number } {
  assertInteger(minorUnits);
  if (toCurrencyCode(currency) === "INR") {
    return roundToNearestRupee(minorUnits);
  }
  return { roundedPaise: minorUnits, roundOffPaise: 0 };
}

/**
 * Converts a rupee amount to integer paise. Prefer passing a `string` (as
 * form inputs naturally provide) — this parses the decimal digits directly
 * and never multiplies a float, so amounts like "1.005" convert exactly.
 * A `number` input is only safe when it's already an integer-or-2dp value
 * that was never round-tripped through float arithmetic (e.g. a literal
 * like 19.99); it's accepted for convenience but goes through the same
 * string parser via `toString()`.
 */
export function rupeesToPaise(rupees: string | number): number {
  if (typeof rupees === "number" && !Number.isFinite(rupees)) {
    throw new RangeError(`rupeesToPaise: not a finite number: ${rupees}`);
  }
  const str = typeof rupees === "number" ? rupees.toString() : rupees.trim();
  if (!RUPEE_STRING_PATTERN.test(str)) {
    throw new RangeError(`rupeesToPaise: invalid rupee amount: ${rupees}`);
  }
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const paddedFraction = (fractionPart + "00").slice(0, 2);
  const paise = Number(wholePart) * 100 + Number(paddedFraction);
  return negative ? -paise : paise;
}

export function paiseToRupees(paise: number): number {
  assertInteger(paise);
  return paise / 100;
}

/**
 * Formats paise as an Indian-locale rupee string, e.g. 12345600 -> "₹1,23,456.00".
 */
export function formatINR(paise: number): string {
  assertInteger(paise);
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return formatted;
}

/**
 * Same as formatINR but without the currency symbol, e.g. "1,23,456.00".
 */
export function formatIndianNumber(paise: number): string {
  assertInteger(paise);
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Rounds a paise amount to the nearest whole rupee, returning both the
 * rounded paise value and the round-off delta (final - original) so callers
 * can show a "Round Off" line only when it's non-zero.
 */
export function roundToNearestRupee(paise: number): {
  roundedPaise: number;
  roundOffPaise: number;
} {
  assertInteger(paise);
  const roundedPaise = Math.round(paise / 100) * 100;
  return { roundedPaise, roundOffPaise: roundedPaise - paise };
}

function assertInteger(value: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Expected an integer paise amount, got: ${value}`);
  }
}
