import { describe, expect, it } from "vitest";
import { calculateInvoice } from "./invoice-calc";

describe("calculateInvoice — same state (CGST+SGST split)", () => {
  it("splits tax evenly into CGST and SGST when seller and place of supply match", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 1_000_000, // ₹10,000
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    expect(result.subtotalPaise).toBe(1_000_000);
    expect(result.cgstPaise).toBe(90_000);
    expect(result.sgstPaise).toBe(90_000);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(1_180_000);
    expect(result.roundOffPaise).toBe(0);
    expect(result.lineItems[0]).toEqual({
      taxableValuePaise: 1_000_000,
      lineTotalPaise: 1_180_000,
    });
  });

  it("splits an odd tax amount without losing a paise (cgst + sgst === tax)", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 101, // 18% of 101 = 18.18 -> rounds to 18 (odd)
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    expect(result.cgstPaise + result.sgstPaise).toBe(18);
    expect(result.cgstPaise).toBe(9);
    expect(result.sgstPaise).toBe(9);
  });
});

describe("calculateInvoice — inter-state (IGST)", () => {
  it("applies full-rate IGST when seller and place of supply differ", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "29",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 1_000_000,
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    expect(result.igstPaise).toBe(180_000);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.totalPaise).toBe(1_180_000);
  });
});

describe("calculateInvoice — export mode", () => {
  it("forces 0% tax regardless of the line's entered tax rate", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "29",
      isExport: true,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 1_000_000,
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(1_000_000);
    expect(result.rateBreakdown).toEqual([
      {
        taxRatePercent: "0",
        taxableValuePaise: 1_000_000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      },
    ]);
  });
});

describe("calculateInvoice — non-INR currency (tax-free)", () => {
  it("charges no tax and keeps exact cents (no whole-unit round-off)", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      currency: "USD",
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "3",
          ratePaise: 33_33, // $33.33 → line total $99.99
          discountPercent: "0",
          taxRatePercent: "18", // entered rate is ignored for non-INR
        },
      ],
    });

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.subtotalPaise).toBe(99_99);
    expect(result.totalPaise).toBe(99_99);
    expect(result.roundOffPaise).toBe(0);
    expect(result.rateBreakdown).toEqual([
      {
        taxRatePercent: "0",
        taxableValuePaise: 99_99,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      },
    ]);
  });

  it("still applies discounts for non-INR invoices", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "29",
      isExport: false,
      currency: "USD",
      overallDiscountPaise: 10_00,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 100_00,
          discountPercent: "0",
          taxRatePercent: "0",
        },
      ],
    });

    expect(result.subtotalPaise).toBe(100_00);
    expect(result.discountPaise).toBe(10_00);
    expect(result.totalPaise).toBe(90_00);
  });
});

describe("calculateInvoice — per-line discount and fractional quantity", () => {
  it("applies per-line discount percent before tax", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 1_000_000,
          discountPercent: "10",
          taxRatePercent: "18",
        },
      ],
    });

    // 1,000,000 - 10% = 900,000 taxable
    expect(result.lineItems[0].taxableValuePaise).toBe(900_000);
    expect(result.cgstPaise).toBe(81_000);
    expect(result.sgstPaise).toBe(81_000);
  });

  it("handles fractional quantities using exact decimal math, not floats", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "2.5",
          ratePaise: 100_00, // ₹100.00/hr
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    // 2.5 * 10000 paise = 25000 paise taxable
    expect(result.lineItems[0].taxableValuePaise).toBe(25_000);
  });
});

describe("calculateInvoice — round-off", () => {
  it("produces a non-zero round-off line when the total isn't a whole rupee", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 0,
      lineItems: [
        {
          quantity: "1",
          ratePaise: 999, // taxable 999, 18% tax = 179.82 -> rounds to 180; total = 1179 paise = 11.79
          discountPercent: "0",
          taxRatePercent: "18",
        },
      ],
    });

    expect(result.totalPaise % 100).toBe(0);
    expect(result.roundOffPaise).not.toBe(0);
  });
});

describe("calculateInvoice — overall discount across multiple tax-rate buckets", () => {
  it("distributes the overall discount proportionally and sums exactly", () => {
    const result = calculateInvoice({
      sellerStateCode: "27",
      placeOfSupplyStateCode: "27",
      isExport: false,
      overallDiscountPaise: 50_000, // ₹500
      lineItems: [
        {
          quantity: "1",
          ratePaise: 800_000, // 18% bucket
          discountPercent: "0",
          taxRatePercent: "18",
        },
        {
          quantity: "1",
          ratePaise: 200_000, // 5% bucket
          discountPercent: "0",
          taxRatePercent: "5",
        },
      ],
    });

    expect(result.subtotalPaise).toBe(1_000_000);
    expect(result.discountPaise).toBe(50_000);

    // Buckets' taxable values (post-discount) should sum to subtotal - discount.
    const taxableSum = result.rateBreakdown.reduce(
      (sum, b) => sum + b.taxableValuePaise,
      0,
    );
    expect(taxableSum).toBe(950_000);

    // 5% bucket (₹2,000 share -> 20% of subtotal): discount 10,000, taxable
    // 190,000, tax 9,500 split 4,750/4,750.
    const fivePercentBucket = result.rateBreakdown.find(
      (b) => b.taxRatePercent === "5",
    );
    expect(fivePercentBucket).toEqual({
      taxRatePercent: "5",
      taxableValuePaise: 190_000,
      cgstPaise: 4_750,
      sgstPaise: 4_750,
      igstPaise: 0,
    });

    // 18% bucket (₹8,000 share -> 80% of subtotal, gets the rounding
    // remainder as the last sorted bucket): discount 40,000, taxable
    // 760,000, tax 136,800 split 68,400/68,400.
    const eighteenPercentBucket = result.rateBreakdown.find(
      (b) => b.taxRatePercent === "18",
    );
    expect(eighteenPercentBucket).toEqual({
      taxRatePercent: "18",
      taxableValuePaise: 760_000,
      cgstPaise: 68_400,
      sgstPaise: 68_400,
      igstPaise: 0,
    });

    expect(result.cgstPaise).toBe(73_150);
    expect(result.sgstPaise).toBe(73_150);
    expect(result.totalPaise).toBe(1_096_300);
    expect(result.roundOffPaise).toBe(0);
  });

  it("throws if the overall discount exceeds the subtotal", () => {
    expect(() =>
      calculateInvoice({
        sellerStateCode: "27",
        placeOfSupplyStateCode: "27",
        isExport: false,
        overallDiscountPaise: 2_000_000,
        lineItems: [
          {
            quantity: "1",
            ratePaise: 1_000_000,
            discountPercent: "0",
            taxRatePercent: "18",
          },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("throws on a negative overall discount", () => {
    expect(() =>
      calculateInvoice({
        sellerStateCode: "27",
        placeOfSupplyStateCode: "27",
        isExport: false,
        overallDiscountPaise: -1,
        lineItems: [],
      }),
    ).toThrow(RangeError);
  });
});
