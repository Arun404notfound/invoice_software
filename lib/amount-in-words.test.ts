import { describe, expect, it } from "vitest";
import {
  amountInWordsForCurrency,
  amountInWordsFromPaise,
  numberToIndianWords,
  numberToInternationalWords,
} from "./amount-in-words";

describe("numberToIndianWords", () => {
  it("handles zero", () => {
    expect(numberToIndianWords(0)).toBe("Zero");
  });

  it("handles single and double digits", () => {
    expect(numberToIndianWords(1)).toBe("One");
    expect(numberToIndianWords(19)).toBe("Nineteen");
    expect(numberToIndianWords(20)).toBe("Twenty");
    expect(numberToIndianWords(56)).toBe("Fifty-Six");
  });

  it("handles hundreds", () => {
    expect(numberToIndianWords(100)).toBe("One Hundred");
    expect(numberToIndianWords(456)).toBe("Four Hundred Fifty-Six");
  });

  it("handles thousands", () => {
    expect(numberToIndianWords(1_000)).toBe("One Thousand");
    expect(numberToIndianWords(23_456)).toBe(
      "Twenty-Three Thousand Four Hundred Fifty-Six",
    );
  });

  it("handles lakh", () => {
    expect(numberToIndianWords(1_00_000)).toBe("One Lakh");
    expect(numberToIndianWords(12_34_567)).toBe(
      "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven",
    );
  });

  it("handles crore", () => {
    expect(numberToIndianWords(1_00_00_000)).toBe("One Crore");
    expect(numberToIndianWords(1_23_45_678)).toBe(
      "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight",
    );
  });

  it("rejects negative and non-integer input", () => {
    expect(() => numberToIndianWords(-1)).toThrow(RangeError);
    expect(() => numberToIndianWords(1.5)).toThrow(RangeError);
  });
});

describe("amountInWordsFromPaise", () => {
  it("formats zero", () => {
    expect(amountInWordsFromPaise(0)).toBe("Rupees Zero Only");
  });

  it("formats a whole-rupee amount with no paise remainder", () => {
    expect(amountInWordsFromPaise(1 * 100)).toBe("Rupees One Only"); // ₹1.00
    expect(amountInWordsFromPaise(100 * 100)).toBe("Rupees One Hundred Only"); // ₹100.00
  });

  it("formats one lakh rupees", () => {
    expect(amountInWordsFromPaise(1_00_000 * 100)).toBe(
      "Rupees One Lakh Only",
    ); // ₹1,00,000.00
  });

  it("formats one crore rupees", () => {
    expect(amountInWordsFromPaise(1_00_00_000 * 100)).toBe(
      "Rupees One Crore Only",
    ); // ₹1,00,00,000.00
  });

  it("appends the paise remainder in words", () => {
    // ₹1,23,456.78
    expect(amountInWordsFromPaise(1_23_456 * 100 + 78)).toBe(
      "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only",
    );
  });

  it("rejects negative and non-integer paise", () => {
    expect(() => amountInWordsFromPaise(-1)).toThrow(RangeError);
    expect(() => amountInWordsFromPaise(10.5)).toThrow(RangeError);
  });
});

describe("numberToInternationalWords", () => {
  it("handles zero and small numbers", () => {
    expect(numberToInternationalWords(0)).toBe("Zero");
    expect(numberToInternationalWords(56)).toBe("Fifty-Six");
    expect(numberToInternationalWords(456)).toBe("Four Hundred Fifty-Six");
  });

  it("uses thousand / million / billion groupings", () => {
    expect(numberToInternationalWords(1_000)).toBe("One Thousand");
    expect(numberToInternationalWords(1_234_567)).toBe(
      "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven",
    );
    expect(numberToInternationalWords(2_000_000_000)).toBe("Two Billion");
  });

  it("rejects negative and non-integer input", () => {
    expect(() => numberToInternationalWords(-1)).toThrow(RangeError);
    expect(() => numberToInternationalWords(1.5)).toThrow(RangeError);
  });
});

describe("amountInWordsForCurrency", () => {
  it("formats INR like the legacy helper", () => {
    expect(amountInWordsForCurrency(1_23_456 * 100 + 78, "INR")).toBe(
      "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only",
    );
  });

  it("formats USD with dollars, cents, and short-scale words", () => {
    expect(amountInWordsForCurrency(0, "USD")).toBe("US Dollars Zero Only");
    expect(amountInWordsForCurrency(123_456_789, "USD")).toBe(
      "US Dollars One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven and Eighty-Nine Cents Only",
    );
    expect(amountInWordsForCurrency(500_00, "USD")).toBe(
      "US Dollars Five Hundred Only",
    );
  });

  it("falls back to INR wording for an unknown currency", () => {
    expect(amountInWordsForCurrency(100, "EUR")).toBe("Rupees One Only");
  });
});
