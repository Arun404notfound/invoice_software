/**
 * Pure helpers behind the dashboard: turning a filter preset into a date
 * range, and rolling a set of invoices up into the summary numbers and
 * time series the page renders. Kept free of Prisma/React so it can be
 * unit-tested in isolation — the page does the querying and passes plain
 * rows in.
 */

import { toCurrencyCode } from "./money";

export const DATE_PRESETS = [
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
  "this_fy",
  "last_fy",
  "year_to_date",
  "all_time",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_fy: "This financial year",
  last_fy: "Last financial year",
  year_to_date: "Year to date",
  all_time: "All time",
  custom: "Custom range",
};

export interface DateRange {
  /** Inclusive start, at 00:00:00.000. `null` means unbounded. */
  from: Date | null;
  /** Inclusive end, at 23:59:59.999. `null` means unbounded. */
  to: Date | null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * The April-March Indian financial year containing `date`. Returns the
 * first instant of April 1 and the last instant of the following March 31.
 */
export function financialYearRange(date: Date): { from: Date; to: Date } {
  const month = date.getMonth(); // 0 = Jan
  const startYear = month >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    from: new Date(startYear, 3, 1, 0, 0, 0, 0),
    to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
}

/**
 * Resolves a preset (and, for "custom", the raw yyyy-mm-dd strings) into a
 * concrete date range. Unknown/parse-failed custom dates fall back to
 * unbounded on that side.
 */
export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case "this_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    case "last_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "last_30_days":
      return {
        from: startOfDay(new Date(now.getTime() - 29 * 86_400_000)),
        to: endOfDay(now),
      };
    case "last_90_days":
      return {
        from: startOfDay(new Date(now.getTime() - 89 * 86_400_000)),
        to: endOfDay(now),
      };
    case "this_fy":
      return financialYearRange(now);
    case "last_fy": {
      const thisFy = financialYearRange(now);
      return financialYearRange(
        new Date(thisFy.from.getFullYear() - 1, 5, 1),
      );
    }
    case "year_to_date":
      return {
        from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        to: endOfDay(now),
      };
    case "all_time":
      return { from: null, to: null };
    case "custom": {
      const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
      return {
        from: from && !Number.isNaN(from.getTime()) ? from : null,
        to: to && !Number.isNaN(to.getTime()) ? to : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface DashboardInvoice {
  id: string;
  status: string;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  totalPaise: number;
  amountPaidPaise: number;
  client: { id: string; name: string };
}

export interface CurrencySummary {
  currency: string;
  invoicedPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  overdueCount: number;
  /** Count of non-cancelled invoices. */
  invoiceCount: number;
  statusCounts: Record<string, number>;
}

export interface ClientSummary {
  clientId: string;
  clientName: string;
  currency: string;
  invoicedPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
  invoiceCount: number;
}

export interface MonthlyPoint {
  /** Sort key, e.g. "2026-04". */
  month: string;
  /** Display label, e.g. "Apr 2026". */
  label: string;
  invoicedPaise: number;
  receivedPaise: number;
}

export interface DashboardData {
  byCurrency: CurrencySummary[];
  byClient: ClientSummary[];
  /** One ordered, gap-filled series per currency. */
  monthlyByCurrency: Record<string, MonthlyPoint[]>;
  /** Total invoices considered, including cancelled. */
  totalInvoices: number;
}

const CANCELLED = "CANCELLED";
const PAID = "PAID";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

/** Every "yyyy-mm" key from `first` to `last` inclusive, chronologically. */
function monthKeysBetween(first: string, last: string): string[] {
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const keys: string[] = [];
  let y = fy;
  let m = fm;
  // Guard against a pathological range blowing up (max ~50 years).
  for (let i = 0; i < 600; i++) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y === ly && m === lm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export function aggregateDashboard(
  invoices: DashboardInvoice[],
  now: Date = new Date(),
): DashboardData {
  const currencyMap = new Map<string, CurrencySummary>();
  const clientMap = new Map<string, ClientSummary>();
  const monthlyMap = new Map<string, Map<string, MonthlyPoint>>();

  function currencySummary(currency: string): CurrencySummary {
    let s = currencyMap.get(currency);
    if (!s) {
      s = {
        currency,
        invoicedPaise: 0,
        receivedPaise: 0,
        outstandingPaise: 0,
        overduePaise: 0,
        overdueCount: 0,
        invoiceCount: 0,
        statusCounts: {},
      };
      currencyMap.set(currency, s);
    }
    return s;
  }

  for (const inv of invoices) {
    const currency = toCurrencyCode(inv.currency);
    const summary = currencySummary(currency);
    summary.statusCounts[inv.status] =
      (summary.statusCounts[inv.status] ?? 0) + 1;

    if (inv.status === CANCELLED) continue;

    const balance = Math.max(inv.totalPaise - inv.amountPaidPaise, 0);
    summary.invoicedPaise += inv.totalPaise;
    summary.receivedPaise += inv.amountPaidPaise;
    summary.outstandingPaise += balance;
    summary.invoiceCount += 1;

    const isOverdue =
      inv.status !== PAID && balance > 0 && inv.dueDate.getTime() < now.getTime();
    if (isOverdue) {
      summary.overduePaise += balance;
      summary.overdueCount += 1;
    }

    const clientKey = `${inv.client.id}:${currency}`;
    let client = clientMap.get(clientKey);
    if (!client) {
      client = {
        clientId: inv.client.id,
        clientName: inv.client.name,
        currency,
        invoicedPaise: 0,
        receivedPaise: 0,
        outstandingPaise: 0,
        invoiceCount: 0,
      };
      clientMap.set(clientKey, client);
    }
    client.invoicedPaise += inv.totalPaise;
    client.receivedPaise += inv.amountPaidPaise;
    client.outstandingPaise += balance;
    client.invoiceCount += 1;

    let series = monthlyMap.get(currency);
    if (!series) {
      series = new Map();
      monthlyMap.set(currency, series);
    }
    const key = monthKey(inv.issueDate);
    const point =
      series.get(key) ??
      { month: key, label: monthLabel(key), invoicedPaise: 0, receivedPaise: 0 };
    point.invoicedPaise += inv.totalPaise;
    point.receivedPaise += inv.amountPaidPaise;
    series.set(key, point);
  }

  const monthlyByCurrency: Record<string, MonthlyPoint[]> = {};
  for (const [currency, series] of monthlyMap) {
    const presentKeys = [...series.keys()].sort();
    if (presentKeys.length === 0) {
      monthlyByCurrency[currency] = [];
      continue;
    }
    const allKeys = monthKeysBetween(
      presentKeys[0],
      presentKeys[presentKeys.length - 1],
    );
    monthlyByCurrency[currency] = allKeys.map(
      (key) =>
        series.get(key) ?? {
          month: key,
          label: monthLabel(key),
          invoicedPaise: 0,
          receivedPaise: 0,
        },
    );
  }

  const byCurrency = [...currencyMap.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );

  const byClient = [...clientMap.values()].sort(
    (a, b) =>
      b.outstandingPaise - a.outstandingPaise ||
      b.invoicedPaise - a.invoicedPaise ||
      a.clientName.localeCompare(b.clientName),
  );

  return {
    byCurrency,
    byClient,
    monthlyByCurrency,
    totalInvoices: invoices.length,
  };
}
