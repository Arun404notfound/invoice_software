import { describe, expect, it } from "vitest";
import {
  aggregateDashboard,
  financialYearRange,
  resolveDateRange,
  type DashboardInvoice,
} from "./dashboard";

const NOW = new Date(2026, 8, 3, 12, 0, 0); // 3 Sep 2026

describe("financialYearRange", () => {
  it("spans April 1 to March 31 for a mid-year date", () => {
    const { from, to } = financialYearRange(new Date(2026, 6, 15));
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(3);
    expect(from.getDate()).toBe(1);
    expect(to.getFullYear()).toBe(2027);
    expect(to.getMonth()).toBe(2);
    expect(to.getDate()).toBe(31);
  });

  it("uses the previous year's April for a Jan-Mar date", () => {
    const { from } = financialYearRange(new Date(2026, 1, 10));
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(3);
  });
});

describe("resolveDateRange", () => {
  it("this_month covers the calendar month of `now`", () => {
    const { from, to } = resolveDateRange("this_month", null, null, NOW);
    expect(from).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it("last_30_days is a 30-day inclusive window ending today", () => {
    const { from, to } = resolveDateRange("last_30_days", null, null, NOW);
    expect(from).toEqual(new Date(2026, 7, 5, 0, 0, 0, 0));
    expect(to?.getDate()).toBe(3);
  });

  it("all_time is unbounded", () => {
    expect(resolveDateRange("all_time", null, null, NOW)).toEqual({
      from: null,
      to: null,
    });
  });

  it("custom parses yyyy-mm-dd and ignores invalid input", () => {
    const { from, to } = resolveDateRange("custom", "2026-01-01", "nope", NOW);
    expect(from).toEqual(new Date("2026-01-01T00:00:00"));
    expect(to).toBeNull();
  });

  it("last_fy is the financial year before this one", () => {
    const { from, to } = resolveDateRange("last_fy", null, null, NOW);
    // NOW is in FY 2026-27, so last FY is 2025-26.
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(3);
    expect(to.getFullYear()).toBe(2026);
    expect(to.getMonth()).toBe(2);
  });
});

function invoice(overrides: Partial<DashboardInvoice>): DashboardInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    status: "SENT",
    currency: "INR",
    issueDate: new Date(2026, 3, 10),
    dueDate: new Date(2026, 3, 25),
    totalPaise: 100_00,
    amountPaidPaise: 0,
    client: { id: "c1", name: "Acme" },
    ...overrides,
  };
}

describe("aggregateDashboard", () => {
  it("splits totals by currency and computes outstanding", () => {
    const data = aggregateDashboard(
      [
        invoice({ currency: "INR", totalPaise: 100_00, amountPaidPaise: 40_00 }),
        invoice({ currency: "USD", totalPaise: 200_00, amountPaidPaise: 0 }),
      ],
      NOW,
    );

    const inr = data.byCurrency.find((c) => c.currency === "INR")!;
    const usd = data.byCurrency.find((c) => c.currency === "USD")!;
    expect(inr.invoicedPaise).toBe(100_00);
    expect(inr.receivedPaise).toBe(40_00);
    expect(inr.outstandingPaise).toBe(60_00);
    expect(usd.outstandingPaise).toBe(200_00);
  });

  it("excludes cancelled invoices from money totals but still counts their status", () => {
    const data = aggregateDashboard(
      [
        invoice({ status: "CANCELLED", totalPaise: 999_00 }),
        invoice({ status: "PAID", totalPaise: 50_00, amountPaidPaise: 50_00 }),
      ],
      NOW,
    );
    const inr = data.byCurrency[0];
    expect(inr.invoicedPaise).toBe(50_00);
    expect(inr.invoiceCount).toBe(1);
    expect(inr.statusCounts.CANCELLED).toBe(1);
    expect(inr.statusCounts.PAID).toBe(1);
  });

  it("flags overdue invoices by due date and unpaid balance", () => {
    const data = aggregateDashboard(
      [
        invoice({
          status: "SENT",
          dueDate: new Date(2026, 0, 1), // well before NOW
          totalPaise: 100_00,
          amountPaidPaise: 30_00,
        }),
        invoice({
          status: "PAID",
          dueDate: new Date(2026, 0, 1),
          totalPaise: 100_00,
          amountPaidPaise: 100_00,
        }),
      ],
      NOW,
    );
    const inr = data.byCurrency[0];
    expect(inr.overdueCount).toBe(1);
    expect(inr.overduePaise).toBe(70_00);
  });

  it("builds a gap-filled monthly series per currency", () => {
    const data = aggregateDashboard(
      [
        invoice({ issueDate: new Date(2026, 3, 5), totalPaise: 100_00 }), // Apr
        invoice({ issueDate: new Date(2026, 5, 5), totalPaise: 300_00 }), // Jun
      ],
      NOW,
    );
    const series = data.monthlyByCurrency.INR;
    expect(series.map((p) => p.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(series[0].invoicedPaise).toBe(100_00);
    expect(series[1].invoicedPaise).toBe(0);
    expect(series[2].invoicedPaise).toBe(300_00);
  });

  it("ranks clients by outstanding balance", () => {
    const data = aggregateDashboard(
      [
        invoice({ client: { id: "a", name: "Alpha" }, totalPaise: 100_00 }),
        invoice({
          client: { id: "b", name: "Bravo" },
          totalPaise: 500_00,
          amountPaidPaise: 0,
        }),
      ],
      NOW,
    );
    expect(data.byClient[0].clientName).toBe("Bravo");
    expect(data.byClient[1].clientName).toBe("Alpha");
  });
});
