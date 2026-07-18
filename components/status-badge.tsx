import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/generated/prisma/client";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  SENT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  VIEWED: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  PARTIALLY_PAID: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PAID: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  OVERDUE: "bg-red-500/15 text-red-400 border-red-500/30",
  CANCELLED: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 line-through",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Finalized",
  VIEWED: "Viewed",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
