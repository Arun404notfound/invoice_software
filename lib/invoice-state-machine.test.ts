import { describe, expect, it } from "vitest";
import {
  InvalidInvoiceTransitionError,
  assertTransition,
  canTransition,
  isTerminalStatus,
} from "./invoice-state-machine";
import type { InvoiceStatus } from "@/lib/generated/prisma/client";

const ALL_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
  "OVERDUE",
];

// The exact legal-transition table from the product spec.
const LEGAL: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["VIEWED", "PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"],
  VIEWED: ["PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE"],
  PAID: [],
  CANCELLED: [],
};

describe("invoice state machine — exhaustive transition matrix", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const shouldBeLegal = LEGAL[from].includes(to);
      const label = shouldBeLegal ? "allows" : "rejects";

      it(`${label} ${from} -> ${to}`, () => {
        expect(canTransition(from, to)).toBe(shouldBeLegal);

        if (shouldBeLegal) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTransition(from, to)).toThrow(
            InvalidInvoiceTransitionError,
          );
        }
      });
    }
  }
});

describe("invoice state machine — terminal states", () => {
  it("PAID and CANCELLED are terminal", () => {
    expect(isTerminalStatus("PAID")).toBe(true);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
  });

  it("all other statuses are non-terminal", () => {
    expect(isTerminalStatus("DRAFT")).toBe(false);
    expect(isTerminalStatus("SENT")).toBe(false);
    expect(isTerminalStatus("VIEWED")).toBe(false);
    expect(isTerminalStatus("PARTIALLY_PAID")).toBe(false);
    expect(isTerminalStatus("OVERDUE")).toBe(false);
  });
});

describe("invoice state machine — error shape", () => {
  it("carries the from/to statuses on the thrown error", () => {
    try {
      assertTransition("PAID", "DRAFT");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInvoiceTransitionError);
      const transitionError = error as InvalidInvoiceTransitionError;
      expect(transitionError.from).toBe("PAID");
      expect(transitionError.to).toBe("DRAFT");
    }
  });
});
