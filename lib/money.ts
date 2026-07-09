/**
 * All money in this app is stored and computed as integer paise. Never use
 * floating point arithmetic on rupee amounts — these helpers are the only
 * place paise <-> rupee conversion and display formatting should happen.
 */

const RUPEE_STRING_PATTERN = /^-?\d+(\.\d{1,2})?$/;

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
