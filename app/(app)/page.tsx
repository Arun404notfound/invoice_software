import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardFilters } from "@/components/dashboard-filters";
import { RevenueChart } from "@/components/revenue-chart";
import { StatusBadge } from "@/components/status-badge";
import {
  aggregateDashboard,
  resolveDateRange,
  DATE_PRESETS,
  type DashboardInvoice,
  type DatePreset,
} from "@/lib/dashboard";
import { formatMoney, SUPPORTED_CURRENCIES, toCurrencyCode } from "@/lib/money";
import type { Prisma } from "@/lib/generated/prisma/client";

type SearchParams = Record<string, string | string[] | undefined>;

function pick(params: SearchParams, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const presetParam = pick(params, "preset");
  const preset: DatePreset = (DATE_PRESETS as readonly string[]).includes(
    presetParam,
  )
    ? (presetParam as DatePreset)
    : "this_fy";
  const from = pick(params, "from");
  const to = pick(params, "to");
  const clientId = pick(params, "clientId");
  const currencyFilter = pick(params, "currency");
  const statusParam = pick(params, "status");
  const status = (INVOICE_STATUSES as readonly string[]).includes(statusParam)
    ? statusParam
    : "";

  const range = resolveDateRange(preset, from, to);

  const issueDateFilter: Prisma.DateTimeFilter = {};
  if (range.from) issueDateFilter.gte = range.from;
  if (range.to) issueDateFilter.lte = range.to;

  const where: Prisma.InvoiceWhereInput = {
    ...(range.from || range.to ? { issueDate: issueDateFilter } : {}),
    ...(clientId ? { clientId } : {}),
    ...(currencyFilter ? { currency: currencyFilter } : {}),
    ...(status ? { status: status as (typeof INVOICE_STATUSES)[number] } : {}),
  };

  const [rows, clients] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        status: true,
        currency: true,
        issueDate: true,
        dueDate: true,
        totalPaise: true,
        amountPaidPaise: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { issueDate: "asc" },
    }),
    prisma.client.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const data = aggregateDashboard(rows as DashboardInvoice[]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, receivables, and aging — filter by period, client, currency,
          and status.
        </p>
      </div>

      <DashboardFilters
        clients={clients}
        current={{ preset, from, to, clientId, currency: currencyFilter, status }}
      />

      {data.totalInvoices === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base font-medium text-muted-foreground">
              Nothing to show
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No invoices match these filters. Widen the period or clear a filter.
          </CardContent>
        </Card>
      ) : (
        <>
          {data.byCurrency.map((summary) => {
            const currencyLabel =
              SUPPORTED_CURRENCIES[toCurrencyCode(summary.currency)].label;
            return (
              <section key={summary.currency} className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {summary.currency} · {currencyLabel}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Invoiced"
                    value={formatMoney(summary.invoicedPaise, summary.currency)}
                    hint={`${summary.invoiceCount} invoice${
                      summary.invoiceCount === 1 ? "" : "s"
                    }`}
                  />
                  <StatCard
                    label="Received"
                    value={formatMoney(summary.receivedPaise, summary.currency)}
                  />
                  <StatCard
                    label="Outstanding"
                    value={formatMoney(
                      summary.outstandingPaise,
                      summary.currency,
                    )}
                  />
                  <StatCard
                    label="Overdue"
                    value={formatMoney(summary.overduePaise, summary.currency)}
                    hint={`${summary.overdueCount} invoice${
                      summary.overdueCount === 1 ? "" : "s"
                    }`}
                    emphasis={summary.overduePaise > 0}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Monthly invoiced vs received
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RevenueChart
                      data={data.monthlyByCurrency[summary.currency] ?? []}
                      currency={summary.currency}
                    />
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  {INVOICE_STATUSES.filter(
                    (s) => (summary.statusCounts[s] ?? 0) > 0,
                  ).map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs"
                    >
                      <StatusBadge status={s} />
                      <span className="text-muted-foreground">
                        {summary.statusCounts[s]}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            );
          })}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By client</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Client</th>
                    <th className="px-3 py-2 font-medium">Currency</th>
                    <th className="px-3 py-2 font-medium text-right">Invoiced</th>
                    <th className="px-3 py-2 font-medium text-right">Received</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Outstanding
                    </th>
                    <th className="px-3 py-2 font-medium text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.map((c) => (
                    <tr
                      key={`${c.clientId}:${c.currency}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2">{c.clientName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.currency}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(c.invoicedPaise, c.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(c.receivedPaise, c.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(c.outstandingPaise, c.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">{c.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${
          emphasis ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
