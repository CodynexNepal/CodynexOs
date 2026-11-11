"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatNumber } from "@/lib/utils";
import type { OverviewResponse } from "@/types/os";

export default function AnalyticsPage() {
  const { data, loading, error, refetch } = useApiQuery<OverviewResponse>(() =>
    codynexApi.overview()
  );

  return (
    <DashboardShell
      title="Analytics"
      subtitle="Measured throughput, completion rates, and department velocity from PostgreSQL"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading && !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          data && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Task Execution Distribution" subtitle="Actual database status totals" />
                <div className="space-y-4 p-5 text-sm">
                  {[
                    { label: "Completed", value: data.tasks.completed, color: "bg-brand-dark" },
                    { label: "Running", value: data.tasks.running, color: "bg-blue-600" },
                    { label: "Pending / Queued", value: data.tasks.pending, color: "bg-amber-500" },
                    { label: "Failed", value: data.tasks.failed, color: "bg-red-600" },
                  ].map((row) => {
                    const total = Math.max(
                      1,
                      data.tasks.completed +
                        data.tasks.running +
                        data.tasks.pending +
                        data.tasks.failed
                    );
                    const pct = Math.round((row.value / total) * 100);
                    return (
                      <div key={row.label} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-ink">{row.label}</span>
                          <span className="tabular-nums text-ink-muted">
                            {formatNumber(row.value)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <CardHeader title="Department Completion" subtitle="Tasks completed vs. total assigned" />
                <div className="divide-y divide-surface-border">
                  {data.departmentPerformance.map((d) => {
                    const rate =
                      d.totalTasks > 0 ? Math.round((d.completed / d.totalTasks) * 100) : 0;
                    return (
                      <div key={d.id} className="flex items-center justify-between px-5 py-3.5 text-xs">
                        <span className="font-semibold text-ink">{d.name}</span>
                        <span className="tabular-nums text-ink-muted">
                          {d.completed}/{d.totalTasks} ({rate}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )
        )}
      </div>
    </DashboardShell>
  );
}
