import Decimal from "decimal.js";
import { roundInvoiceTotal, isTaxableCurrency } from "./money";

/**
 * Line-item and invoice-level GST calculation. Decimal.js is used only as
 * scratch space for the intermediate multiplication/percentage math (qty ×
 * rate, discount %, tax %) — every quantity that crosses a function
 * boundary or gets stored is an integer paise amount. Never a float.
 */

const ZERO_DP = { toDecimalPlaces: 0, rounding: Decimal.ROUND_HALF_UP } as const;

function roundPaise(value: Decimal): number {
  return value.toDecimalPlaces(ZERO_DP.toDecimalPlaces, ZERO_DP.rounding).toNumber();
}

export interface LineItemCalcInput {
  quantity: string;
  ratePaise: number;
  discountPercent: string;
  taxRatePercent: string;
}

export interface LineItemCalcResult {
  taxableValuePaise: number;
  lineTotalPaise: number;
}

export interface RateBucket {
  taxRatePercent: string;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface InvoiceCalcInput {
  sellerStateCode: string;
  placeOfSupplyStateCode: string;
  isExport: boolean;
  overallDiscountPaise: number;
  lineItems: LineItemCalcInput[];
  /**
   * ISO currency code. Non-INR currencies are billed tax-free and their
   * totals are not rounded to a whole major unit. Defaults to "INR".
   */
  currency?: string;
  /**
   * Forces every line to 0% tax regardless of the entered rate, the same
   * way `isExport` does. Set automatically for non-INR currencies; can also
   * be passed explicitly. Defaults to false.
   */
  taxExempt?: boolean;
}

export interface InvoiceCalcResult {
  lineItems: LineItemCalcResult[];
  subtotalPaise: number;
  discountPaise: number;
  rateBreakdown: RateBucket[];
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

export function calculateInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  if (input.overallDiscountPaise < 0) {
    throw new RangeError("overallDiscountPaise must not be negative");
  }

  const currency = input.currency ?? "INR";
  // Non-INR invoices are always tax-free; `taxExempt` / `isExport` also
  // force 0% for INR (LUT export of services).
  const taxExempt =
    input.taxExempt === true ||
    input.isExport ||
    !isTaxableCurrency(currency);

  const isSameState = input.sellerStateCode === input.placeOfSupplyStateCode;

  const lineResults: LineItemCalcResult[] = [];
  // Grouped by the line's own (pre-export-override) tax rate string.
  const groups = new Map<
    string,
    { effectiveRate: Decimal; taxableSum: Decimal }
  >();

  for (const line of input.lineItems) {
    const qty = new Decimal(line.quantity);
    const rate = new Decimal(line.ratePaise);
    const lineBase = qty.mul(rate);
    const discountFraction = new Decimal(line.discountPercent).div(100);
    const lineDiscount = lineBase.mul(discountFraction);
    const taxableValueExact = lineBase.minus(lineDiscount);
    const taxableValuePaise = roundPaise(taxableValueExact);

    const effectiveRate = taxExempt
      ? new Decimal(0)
      : new Decimal(line.taxRatePercent);
    const lineTaxPaise = roundPaise(
      new Decimal(taxableValuePaise).mul(effectiveRate).div(100),
    );

    lineResults.push({
      taxableValuePaise,
      lineTotalPaise: taxableValuePaise + lineTaxPaise,
    });

    const groupKey = effectiveRate.toString();
    const existing = groups.get(groupKey);
    if (existing) {
      existing.taxableSum = existing.taxableSum.plus(taxableValuePaise);
    } else {
      groups.set(groupKey, { effectiveRate, taxableSum: new Decimal(taxableValuePaise) });
    }
  }

  const subtotalPaise = lineResults.reduce(
    (sum, l) => sum + l.taxableValuePaise,
    0,
  );

  if (input.overallDiscountPaise > subtotalPaise) {
    throw new RangeError(
      `overallDiscountPaise (${input.overallDiscountPaise}) cannot exceed subtotalPaise (${subtotalPaise})`,
    );
  }

  // Distribute the overall discount across tax-rate buckets proportional to
  // each bucket's share of the subtotal, then dump any rounding remainder
  // on the last bucket so the buckets' discounts sum exactly to the input.
  const sortedGroupKeys = [...groups.keys()].sort(
    (a, b) => Number(a) - Number(b),
  );

  const rateBreakdown: RateBucket[] = [];
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let discountAllocated = 0;

  sortedGroupKeys.forEach((key, index) => {
    const group = groups.get(key)!;
    const isLast = index === sortedGroupKeys.length - 1;

    let groupDiscount: number;
    if (subtotalPaise === 0) {
      groupDiscount = 0;
    } else if (isLast) {
      groupDiscount = input.overallDiscountPaise - discountAllocated;
    } else {
      const share = group.taxableSum.div(subtotalPaise);
      groupDiscount = roundPaise(
        new Decimal(input.overallDiscountPaise).mul(share),
      );
    }
    discountAllocated += groupDiscount;

    const taxableAfterDiscount = roundPaise(group.taxableSum) - groupDiscount;
    const groupTax = roundPaise(
      new Decimal(taxableAfterDiscount).mul(group.effectiveRate).div(100),
    );

    let bucketCgst = 0;
    let bucketSgst = 0;
    let bucketIgst = 0;
    if (group.effectiveRate.isZero()) {
      // no tax to split
    } else if (isSameState) {
      bucketCgst = roundPaise(new Decimal(groupTax).div(2));
      bucketSgst = groupTax - bucketCgst;
    } else {
      bucketIgst = groupTax;
    }

    cgstPaise += bucketCgst;
    sgstPaise += bucketSgst;
    igstPaise += bucketIgst;

    rateBreakdown.push({
      taxRatePercent: key,
      taxableValuePaise: taxableAfterDiscount,
      cgstPaise: bucketCgst,
      sgstPaise: bucketSgst,
      igstPaise: bucketIgst,
    });
  });

  const preRoundTotal =
    subtotalPaise - input.overallDiscountPaise + cgstPaise + sgstPaise + igstPaise;
  const { roundedPaise: totalPaise, roundOffPaise } = roundInvoiceTotal(
    preRoundTotal,
    currency,
  );

  return {
    lineItems: lineResults,
    subtotalPaise,
    discountPaise: input.overallDiscountPaise,
    rateBreakdown,
    cgstPaise,
    sgstPaise,
    igstPaise,
    roundOffPaise,
    totalPaise,
  };
}

interface StringableDecimal {
  toString(): string;
}

export interface InvoiceLikeForRecalc {
  placeOfSupplyStateCode: string;
  isExport: boolean;
  discountPaise: number;
  currency?: string;
  lineItems: {
    quantity: StringableDecimal | string;
    ratePaise: number;
    discountPercent: StringableDecimal | string;
    taxRatePercent: StringableDecimal | string;
  }[];
}

/**
 * Recomputes the full GST breakdown (including the rate-wise bucket table
 * needed for the PDF's tax summary) from an already-persisted invoice's
 * line items. calculateInvoice is pure, so re-running it against the same
 * stored inputs reproduces exactly the numbers that were saved — this is
 * the single source of truth rather than persisting a separate snapshot
 * that could drift.
 */
export function recalculateInvoice(
  sellerStateCode: string,
  invoice: InvoiceLikeForRecalc,
): InvoiceCalcResult {
  return calculateInvoice({
    sellerStateCode,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    isExport: invoice.isExport,
    currency: invoice.currency ?? "INR",
    overallDiscountPaise: invoice.discountPaise,
    lineItems: invoice.lineItems.map((li) => ({
      quantity: li.quantity.toString(),
      ratePaise: li.ratePaise,
      discountPercent: li.discountPercent.toString(),
      taxRatePercent: li.taxRatePercent.toString(),
    })),
  });
}
