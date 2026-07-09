import type { InvoiceStatus } from "@/lib/generated/prisma/client";

/**
 * The single source of truth for legal Invoice status transitions. Every
 * code path that mutates Invoice.status must go through assertTransition —
 * never set `status` directly via Prisma elsewhere.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["VIEWED", "PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"],
  VIEWED: ["PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE"],
  PAID: [],
  CANCELLED: [],
};

export class InvalidInvoiceTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly to: InvoiceStatus,
  ) {
    super(`Illegal invoice status transition: ${from} -> ${to}`);
    this.name = "InvalidInvoiceTransitionError";
  }
}

export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
}

export function isTerminalStatus(status: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
