import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import {
  allocateSequenceNumber,
  formatInvoiceNumber,
  generateInvoiceNumber,
  getFinancialYear,
} from "./invoice-number";
import { prisma } from "./prisma";

describe("getFinancialYear", () => {
  it("treats April 1 as the start of the financial year", () => {
    expect(getFinancialYear(new Date(2026, 3, 1))).toBe("2026-27");
  });

  it("treats March 31 as the end of the previous financial year", () => {
    expect(getFinancialYear(new Date(2026, 2, 31))).toBe("2025-26");
  });

  it("handles mid-year dates", () => {
    expect(getFinancialYear(new Date(2026, 6, 8))).toBe("2026-27");
    expect(getFinancialYear(new Date(2027, 0, 15))).toBe("2026-27");
  });

  it("rolls the short end-year over correctly across a century boundary", () => {
    expect(getFinancialYear(new Date(2099, 3, 1))).toBe("2099-00");
  });
});

describe("formatInvoiceNumber", () => {
  it("substitutes {FY} and zero-pads {seq} to 4 digits", () => {
    expect(formatInvoiceNumber("TG/{FY}/{seq}", "2026-27", 42)).toBe(
      "TG/2026-27/0042",
    );
  });

  it("handles sequence numbers beyond 4 digits without truncating", () => {
    expect(formatInvoiceNumber("TG/{FY}/{seq}", "2026-27", 12345)).toBe(
      "TG/2026-27/12345",
    );
  });

  it("supports a custom format string", () => {
    expect(formatInvoiceNumber("INV-{seq}-{FY}", "2026-27", 1)).toBe(
      "INV-0001-2026-27",
    );
  });
});

describe("generateInvoiceNumber — concurrency (real DB row lock)", () => {
  const testKey = `invoice:TEST-CONCURRENCY-${Date.now()}`;

  afterAll(async () => {
    await prisma.sequence.deleteMany({ where: { key: testKey } });
    await prisma.$disconnect();
  });

  it("never issues a duplicate number under concurrent callers", async () => {
    const CONCURRENCY = 20;
    // A date far outside any real financial year in use, so the Sequence
    // row this test creates/deletes can never collide with (or wipe out)
    // real invoice-numbering data. A previous version of this test used a
    // plausible near-future date, which happened to land in the same FY as
    // real dev/production data and corrupted the shared counter when the
    // test's cleanup step deleted it — never derive a test-only key from a
    // real-looking date again.
    const fixedDate = new Date(9999, 3, 1);

    // generateInvoiceNumber derives its Sequence key from the financial
    // year of `date`, so to exercise real concurrent contention on a single
    // row we call it with the same fixed date across all callers.
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        prisma.$transaction((tx) =>
          generateInvoiceNumber(tx, "TG/{FY}/{seq}", fixedDate),
        ),
      ),
    );

    const numbers = results.map((r) => r.number);
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(CONCURRENCY);

    const fy = results[0].financialYear;
    expect(fy).toBe("9999-00");
    await prisma.sequence.deleteMany({ where: { key: `invoice:${fy}` } });
  });

  it("resumes from the last allocated value rather than restarting", async () => {
    await prisma.sequence.upsert({
      where: { key: testKey },
      update: { lastValue: 10 },
      create: { key: testKey, lastValue: 10 },
    });

    const next = await prisma.$transaction((tx) =>
      allocateSequenceNumber(tx, testKey),
    );

    expect(next).toBe(11);
  });
});
