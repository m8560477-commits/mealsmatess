import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getAdminTelemetry } from "@/lib/admin-analytics.functions";
import { AreaTrend, BarBreakdown, DonutBreakdown } from "@/components/admin/charts";

export function TelemetryTab({ range }: { range: { from: string; to: string } }) {
  const q = useQuery({
    queryKey: ["admin-telemetry", range.from, range.to],
    queryFn: () => getAdminTelemetry({ data: range }),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const t = q.data;
  if (!t) return null;

  const kpis = [
    { label: "Events", value: t.totals.events.toLocaleString() },
    { label: "Success rate", value: `${t.totals.successRate}%` },
    { label: "Errors", value: t.totals.errors.toLocaleString() },
    { label: "Active users", value: t.totals.activeUsers.toLocaleString() },
    { label: "Avg latency", value: `${t.totals.avgLatencyMs} ms` },
    { label: "P95 latency", value: `${t.totals.p95LatencyMs} ms` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 font-display text-2xl">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 font-medium">Events per day</h3>
          <AreaTrend
            data={t.series.map((s) => ({ date: s.date, value: s.count }))}
            dataKey="value"
            color="hsl(var(--primary))"
          />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 font-medium">By kind</h3>
          <DonutBreakdown data={t.events_by_kind} dataKey="count" nameKey="name" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 font-medium">Top events</h3>
        <BarBreakdown
          data={t.events_by_name.slice(0, 10).map((e) => ({ name: e.name, count: e.count }))}
          dataKey="count"
          xKey="name"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">Event</th>
                <th className="pb-2">Count</th>
                <th className="pb-2">Errors</th>
                <th className="pb-2">Success</th>
                <th className="pb-2">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {t.events_by_name.map((e) => (
                <tr key={e.name} className="border-t border-border/60">
                  <td className="py-2 font-mono text-xs">{e.name}</td>
                  <td>{e.count}</td>
                  <td>{e.errors}</td>
                  <td>{e.successRate}%</td>
                  <td>{e.avgLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
