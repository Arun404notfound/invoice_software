"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  type DatePreset,
} from "@/lib/dashboard";
import { CURRENCY_CODES } from "@/lib/money";

const STATUS_OPTIONS = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

const ALL = "__all__";

interface ClientOption {
  id: string;
  name: string;
}

export function DashboardFilters({
  clients,
  current,
}: {
  clients: ClientOption[];
  current: {
    preset: DatePreset;
    from: string;
    to: string;
    clientId: string;
    currency: string;
    status: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState<DatePreset>(current.preset);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const [clientId, setClientId] = useState(current.clientId || ALL);
  const [currency, setCurrency] = useState(current.currency || ALL);
  const [status, setStatus] = useState(current.status || ALL);

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    const set = (key: string, value: string | null) => {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    };
    set("preset", preset);
    set("from", preset === "custom" ? from : null);
    set("to", preset === "custom" ? to : null);
    set("clientId", clientId);
    set("currency", currency);
    set("status", status);
    router.push(`${pathname}?${params.toString()}`);
  }

  function reset() {
    setPreset("this_fy");
    setFrom("");
    setTo("");
    setClientId(ALL);
    setCurrency(ALL);
    setStatus(ALL);
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="preset">Period</Label>
        <Select value={preset} onValueChange={(v) => v && setPreset(v as DatePreset)}>
          <SelectTrigger id="preset" className="w-48">
            <SelectValue>
              {(v: string | null) =>
                v ? DATE_PRESET_LABELS[v as DatePreset] : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {DATE_PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="clientId">Client</Label>
        <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
          <SelectTrigger id="clientId" className="w-48">
            <SelectValue>
              {(v: string | null) =>
                !v || v === ALL
                  ? "All clients"
                  : clients.find((c) => c.id === v)?.name ?? "All clients"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">Currency</Label>
        <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
          <SelectTrigger id="currency" className="w-32">
            <SelectValue>
              {(v: string | null) =>
                !v || v === ALL ? "All" : v
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {CURRENCY_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger id="status" className="w-40">
            <SelectValue>
              {(v: string | null) =>
                !v || v === ALL ? "All" : v.replace(/_/g, " ")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={apply}>
          Apply
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
