import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canTransition } from "@/lib/invoice-state-machine";
import { formatINR, formatIndianNumber } from "@/lib/money";
import { GST_STATE_BY_CODE } from "@/lib/constants/gst-states";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { publicShareToken: token },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  const businessProfile = await prisma.businessProfile.findFirst();

  if (!invoice || invoice.status === "DRAFT" || !businessProfile) {
    notFound();
  }

  const viewer = await getCurrentUser();
  let status = invoice.status;

  if (!viewer && canTransition(invoice.status, "VIEWED")) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "VIEWED" },
    });
    await prisma.activityLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "VIEW",
        beforeJson: { status: invoice.status },
        afterJson: { status: "VIEWED" },
        actorId: null,
      },
    });
    status = "VIEWED";
  }

  const isSameState = businessProfile.stateCode === invoice.placeOfSupplyStateCode;

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10 text-neutral-900">
      <div className="mx-auto max-w-3xl rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-lg font-semibold">
              {businessProfile.tradeName ?? businessProfile.legalName}
            </h1>
            {businessProfile.gstin ? (
              <p className="text-sm text-neutral-500">
                GSTIN: {businessProfile.gstin}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{invoice.number}</p>
            <p className="text-sm text-neutral-500">
              Status: {status.replace("_", " ")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
              Bill To
            </p>
            <p className="font-medium">{invoice.client.name}</p>
            {invoice.client.company ? <p>{invoice.client.company}</p> : null}
            {invoice.client.gstin ? (
              <p className="text-neutral-500">GSTIN: {invoice.client.gstin}</p>
            ) : null}
          </div>
          <div className="text-right text-neutral-500">
            <p>Issue Date: {dateFormatter.format(invoice.issueDate)}</p>
            <p>Due Date: {dateFormatter.format(invoice.dueDate)}</p>
            <p>
              Place of Supply: {invoice.placeOfSupplyStateCode} —{" "}
              {GST_STATE_BY_CODE.get(invoice.placeOfSupplyStateCode)}
            </p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="border-b border-neutral-200 px-2 py-2">
                Description
              </th>
              <th className="border-b border-neutral-200 px-2 py-2 text-right">
                Qty
              </th>
              <th className="border-b border-neutral-200 px-2 py-2 text-right">
                Rate
              </th>
              <th className="border-b border-neutral-200 px-2 py-2 text-right">
                Tax %
              </th>
              <th className="border-b border-neutral-200 px-2 py-2 text-right">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id}>
                <td className="border-b border-neutral-100 px-2 py-2">
                  {li.description}
                </td>
                <td className="border-b border-neutral-100 px-2 py-2 text-right">
                  {li.quantity.toString()} {li.unit}
                </td>
                <td className="border-b border-neutral-100 px-2 py-2 text-right">
                  {formatIndianNumber(li.ratePaise)}
                </td>
                <td className="border-b border-neutral-100 px-2 py-2 text-right">
                  {li.taxRatePercent.toString()}%
                </td>
                <td className="border-b border-neutral-100 px-2 py-2 text-right">
                  {formatIndianNumber(li.lineTotalPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="mt-4 ml-auto w-64 text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-neutral-500">Subtotal</td>
              <td className="py-1 text-right">{formatINR(invoice.subtotalPaise)}</td>
            </tr>
            {invoice.discountPaise > 0 ? (
              <tr>
                <td className="py-1 text-neutral-500">Discount</td>
                <td className="py-1 text-right">
                  -{formatINR(invoice.discountPaise)}
                </td>
              </tr>
            ) : null}
            {isSameState && !invoice.isExport ? (
              <>
                <tr>
                  <td className="py-1 text-neutral-500">CGST</td>
                  <td className="py-1 text-right">{formatINR(invoice.cgstPaise)}</td>
                </tr>
                <tr>
                  <td className="py-1 text-neutral-500">SGST</td>
                  <td className="py-1 text-right">{formatINR(invoice.sgstPaise)}</td>
                </tr>
              </>
            ) : null}
            {!isSameState && !invoice.isExport ? (
              <tr>
                <td className="py-1 text-neutral-500">IGST</td>
                <td className="py-1 text-right">{formatINR(invoice.igstPaise)}</td>
              </tr>
            ) : null}
            {invoice.roundOffPaise !== 0 ? (
              <tr>
                <td className="py-1 text-neutral-500">Round Off</td>
                <td className="py-1 text-right">
                  {formatINR(invoice.roundOffPaise)}
                </td>
              </tr>
            ) : null}
            <tr className="border-t border-neutral-200 font-semibold">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right">{formatINR(invoice.totalPaise)}</td>
            </tr>
            <tr>
              <td className="py-1 text-neutral-500">Paid</td>
              <td className="py-1 text-right">
                {formatINR(invoice.amountPaidPaise)}
              </td>
            </tr>
          </tbody>
        </table>

        {invoice.isExport && businessProfile.exportDeclarationText ? (
          <p className="mt-4 text-xs italic text-neutral-500">
            {businessProfile.exportDeclarationText}
          </p>
        ) : null}

        {invoice.notes ? (
          <div className="mt-6 text-sm">
            <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">
              Notes
            </p>
            <p className="text-neutral-600">{invoice.notes}</p>
          </div>
        ) : null}

        <div className="mt-8 flex justify-end border-t border-neutral-200 pt-6">
          <a
            href={`/api/i/${token}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}
