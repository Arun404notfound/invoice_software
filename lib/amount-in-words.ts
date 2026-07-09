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

/** Formats an integer paise amount as the "amount in words" line for an
 * invoice PDF, e.g. 123456789 -> "Rupees Twelve Lakh Thirty-Four Thousand
 * Five Hundred Sixty-Seven and Eighty-Nine Paise Only". */
export function amountInWordsFromPaise(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new RangeError(
      `amountInWordsFromPaise: expected a non-negative integer paise amount, got ${paise}`,
    );
  }
  const rupees = Math.floor(paise / 100);
  const paiseRemainder = paise % 100;

  const rupeeWords = numberToIndianWords(rupees);
  if (paiseRemainder === 0) {
    return `Rupees ${rupeeWords} Only`;
  }
  const paiseWords = numberToIndianWords(paiseRemainder);
  return `Rupees ${rupeeWords} and ${paiseWords} Paise Only`;
}
