const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens];
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (remainder) parts.push(twoDigitsToWords(remainder));
  return parts.join(" ");
}

/** Converts a non-negative integer to words using the Indian numbering
 * system (thousand / lakh / crore groupings), e.g. 1234567 ->
 * "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven". */
export function numberToIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(
      `numberToIndianWords: expected a non-negative integer, got ${n}`,
    );
  }
  if (n === 0) return "Zero";

  let remaining = n;
  const crore = Math.floor(remaining / 1_00_00_000);
  remaining %= 1_00_00_000;
  const lakh = Math.floor(remaining / 1_00_000);
  remaining %= 1_00_000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  const hundredAndBelow = remaining;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (hundredAndBelow) parts.push(threeDigitsToWords(hundredAndBelow));

  return parts.join(" ");
}

/** Converts a non-negative integer to words using the international
 * (short-scale) numbering system — thousand / million / billion / trillion
 * groupings — e.g. 1234567 -> "One Million Two Hundred Thirty-Four Thousand
 * Five Hundred Sixty-Seven". Used for non-INR (USD) invoices. */
export function numberToInternationalWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(
      `numberToInternationalWords: expected a non-negative integer, got ${n}`,
    );
  }
  if (n === 0) return "Zero";

  const SCALES = ["", " Thousand", " Million", " Billion", " Trillion"];
  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  if (groups.length > SCALES.length) {
    throw new RangeError(`numberToInternationalWords: number too large: ${n}`);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(`${threeDigitsToWords(groups[i])}${SCALES[i]}`);
  }
  return parts.join(" ");
}

interface CurrencyWords {
  /** e.g. "Rupees", "US Dollars" */
  major: string;
  /** e.g. "Paise", "Cents" */
  minor: string;
  toWords: (n: number) => string;
}

const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  INR: { major: "Rupees", minor: "Paise", toWords: numberToIndianWords },
  USD: { major: "US Dollars", minor: "Cents", toWords: numberToInternationalWords },
};

/** Formats an integer minor-unit amount as the "amount in words" line for
 * an invoice PDF in the given currency, e.g.
 * (123456789, "INR") -> "Rupees Twelve Lakh Thirty-Four Thousand Five
 * Hundred Sixty-Seven and Eighty-Nine Paise Only";
 * (123456789, "USD") -> "US Dollars One Million Two Hundred Thirty-Four
 * Thousand Five Hundred Sixty-Seven and Eighty-Nine Cents Only". */
export function amountInWordsForCurrency(
  minorUnits: number,
  currency: string,
): string {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) {
    throw new RangeError(
      `amountInWordsForCurrency: expected a non-negative integer amount, got ${minorUnits}`,
    );
  }
  const words = CURRENCY_WORDS[currency] ?? CURRENCY_WORDS.INR;
  const major = Math.floor(minorUnits / 100);
  const minorRemainder = minorUnits % 100;

  const majorWords = words.toWords(major);
  if (minorRemainder === 0) {
    return `${words.major} ${majorWords} Only`;
  }
  const minorWords = words.toWords(minorRemainder);
  return `${words.major} ${majorWords} and ${minorWords} ${words.minor} Only`;
}

/** Formats an integer paise amount as the "amount in words" line for an
 * INR invoice PDF, e.g. 123456789 -> "Rupees Twelve Lakh Thirty-Four
 * Thousand Five Hundred Sixty-Seven and Eighty-Nine Paise Only". */
export function amountInWordsFromPaise(paise: number): string {
  return amountInWordsForCurrency(paise, "INR");
}
