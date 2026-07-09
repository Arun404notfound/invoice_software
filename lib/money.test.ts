import { describe, expect, it } from "vitest";
import {
  formatINR,
  formatIndianNumber,
  paiseToRupees,
  roundToNearestRupee,
  rupeesToPaise,
} from "./money";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise(100)).toBe(10000);
  });

  it("converts fractional rupees without float drift", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1)).toBe(10);
  });

  it("parses decimal strings exactly, avoiding float multiplication entirely", () => {
    expect(rupeesToPaise("1234.5")).toBe(123450);
    expect(rupeesToPaise("-42.50")).toBe(-4250);
    expect(rupeesToPaise("100")).toBe(10000);
  });

  it("throws on non-finite input", () => {
    expect(() => rupeesToPaise(NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Infinity)).toThrow(RangeError);
  });

  it("rejects sub-paise precision — paise is the smallest unit", () => {
    // 1.005 rupees has no exact paise representation; reject rather than
    // silently rounding (and note the JS float literal is already
    // imprecise here — 1.00499999999999989... — another reason to reject).
    expect(() => rupeesToPaise("1.005")).toThrow(RangeError);
    expect(() => rupeesToPaise("12.345")).toThrow(RangeError);
  });

  it("throws on malformed strings", () => {
    expect(() => rupeesToPaise("abc")).toThrow(RangeError);
    expect(() => rupeesToPaise("")).toThrow(RangeError);
  });
});

describe("paiseToRupees", () => {
  it("converts paise back to rupees", () => {
    expect(paiseToRupees(10000)).toBe(100);
    expect(paiseToRupees(1999)).toBe(19.99);
  });

  it("throws on non-integer paise", () => {
    expect(() => paiseToRupees(10.5)).toThrow(RangeError);
  });
});

describe("formatINR", () => {
  it("formats with Indian digit grouping and rupee symbol", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456.00");
  });

  it("formats small amounts", () => {
    expect(formatINR(500)).toBe("₹5.00");
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("formats negative amounts", () => {
    expect(formatINR(-50050)).toBe("-₹500.50");
  });

  it("formats crore-scale amounts with Indian grouping", () => {
    // 1,23,45,678.90 rupees
    expect(formatINR(1_23_45_678_90)).toBe("₹1,23,45,678.90");
  });

  it("throws on non-integer paise", () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
  });
});

describe("formatIndianNumber", () => {
  it("formats without a currency symbol", () => {
    expect(formatIndianNumber(12345600)).toBe("1,23,456.00");
  });
});

describe("roundToNearestRupee", () => {
  it("returns zero round-off for whole rupee amounts", () => {
    expect(roundToNearestRupee(10000)).toEqual({
      roundedPaise: 10000,
      roundOffPaise: 0,
    });
  });

  it("rounds up past the half-rupee mark", () => {
    expect(roundToNearestRupee(10050)).toEqual({
      roundedPaise: 10100,
      roundOffPaise: 50,
    });
  });

  it("rounds down below the half-rupee mark", () => {
    expect(roundToNearestRupee(10049)).toEqual({
      roundedPaise: 10000,
      roundOffPaise: -49,
    });
  });

  it("throws on non-integer paise", () => {
    expect(() => roundToNearestRupee(10.5)).toThrow(RangeError);
  });
});
