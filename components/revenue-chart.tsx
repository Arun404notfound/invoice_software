"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, SUPPORTED_CURRENCIES, toCurrencyCode } from "@/lib/money";
import type { MonthlyPoint } from "@/lib/dashboard";

function compactMoney(minorUnits: number, currency: string): string {
  const { locale } = SUPPORTED_CURRENCIES[toCurrencyCode(currency)];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: toCurrencyCode(currency),
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(minorUnits / 100);
}

export function RevenueChart({
  data,
  currency,
}: {
  data: MonthlyPoint[];
  currency: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No invoices in this period.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          width={72}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => compactMoney(Number(value) || 0, currency)}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-foreground)" }}
          formatter={(value, name) => [
            formatMoney(Number(value) || 0, currency),
            String(name),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="invoicedPaise"
          name="Invoiced"
          fill="var(--color-chart-1)"
          radius={[3, 3, 0, 0]}
          maxBarSize={44}
        />
        <Bar
          dataKey="receivedPaise"
          name="Received"
          fill="var(--color-chart-3)"
          radius={[3, 3, 0, 0]}
          maxBarSize={44}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
