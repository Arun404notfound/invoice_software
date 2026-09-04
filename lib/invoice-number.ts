import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Indian financial year runs April 1 -> March 31, formatted "YYYY-YY"
 * (e.g. a date in July 2026 or February 2027 both fall in "2026-27").
 */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed; 3 = April
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

export function formatInvoiceNumber(
  format: string,
  financialYear: string,
  seq: number,
): string {
  const seqStr = String(seq).padStart(4, "0");
  return format.replace("{FY}", financialYear).replace("{seq}", seqStr);
}

/**
 * Atomically increments the Sequence row for `key`, creating it at 0 first
 * if absent, and returns the new value. Must be called inside a Prisma
 * transaction — the `FOR UPDATE` row lock is only meaningful within one,
 * and is what makes concurrent callers serialize instead of racing.
 */
export async function allocateSequenceNumber(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<number> {
  await tx.$executeRaw`INSERT INTO "Sequence" ("key", "lastValue") VALUES (${key}, 0) ON CONFLICT ("key") DO NOTHING`;
  const rows = await tx.$queryRaw<
    { lastValue: number }[]
  >`SELECT "lastValue" FROM "Sequence" WHERE "key" = ${key} FOR UPDATE`;
  const current = rows[0]?.lastValue ?? 0;
  const next = current + 1;
  await tx.$executeRaw`UPDATE "Sequence" SET "lastValue" = ${next} WHERE "key" = ${key}`;
  return next;
}

/**
 * Allocates the next sequential, per-financial-year invoice number. Never
 * reuses a number, even for cancelled invoices, because the sequence only
 * ever moves forward. Must run inside the same transaction that creates/
 * updates the Invoice row, so a rolled-back send can't leak a burned number
 * — though note numbers are only allocated on Send, not on Draft creation.
 */
export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  invoiceNumberFormat: string,
  date: Date = new Date(),
  seriesKey: string = "invoice",
): Promise<{ number: string; financialYear: string }> {
  const financialYear = getFinancialYear(date);
  const key = `${seriesKey}:${financialYear}`;
  const seq = await allocateSequenceNumber(tx, key);
  const number = formatInvoiceNumber(invoiceNumberFormat, financialYear, seq);
  return { number, financialYear };
}
