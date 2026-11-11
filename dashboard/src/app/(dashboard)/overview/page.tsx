"use client";

import Link from "next/link";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime, formatNumber } from "@/lib/utils";
import type { OverviewResponse } from "@/types/os";

export default function OverviewPage() {
  const { data, loading, error, refetch } = useApiQuery<OverviewResponse>(() =>
    codynexApi.overview()
  );

  useDomainSocket(() => {
    refetch();
  });

  return (
    <DashboardShell
      title="Executive Overview"
      subtitle="Live PostgreSQL telemetry across AI departments, tasks, and cost guardrails"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-dark" />
            <span>
              Database:{" "}
              <strong className="text-ink">{data?.systemHealth.database ?? "CHECKING"}</strong>
            </span>
            <span>·</span>
            <span>
              Paid Providers:{" "}
              <strong className="text-ink">
                {data?.aiUsage.allowPaidProviders ? "ENABLED" : "DISABLED (NPR 0 MODE)"}
              </strong>
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={refetch} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatBox label="Total AI Employees" value={formatNumber(data.totalAiEmployees)} sub={`${data.activeAgents} currently active`} />
                <StatBox label="Completed Tasks" value={formatNumber(data.tasks.completed)} sub={`${data.tasks.running} running now`} />
                <StatBox label="Pending / Queued" value={formatNumber(data.tasks.pending)} sub={`${data.tasks.failed} failed`} />
                <StatBox label="Running Projects" value={formatNumber(data.projects.running)} sub={`${data.projects.requiringApproval} awaiting approval`} />
                <StatBox label="AI Token Consumption" value={formatNumber(data.aiUsage.totalTokens)} sub={`Limit: ${formatNumber(data.aiUsage.dailyTokenLimit)} / day`} />
                <StatBox label="Estimated API Spend" value={`$${data.aiUsage.estimatedCostUsd.toFixed(4)}`} sub={`${data.aiUsage.requestCount} requests logged`} />
                <StatBox label="System Health" value={data.systemHealth.status} sub={`DB: ${data.systemHealth.database}`} />
                <StatBox label="Pending Approvals" value={formatNumber(data.projects.requiringApproval)} sub="CEO gate active" href="/deployments" />
              </div>

              {data.providers.every((p) => !p.configured || p.isPaid) && (
                <Card className="border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-950 dark:text-amber-100">
                        Free-tier AI providers are not configured yet
                      </p>
                      <p className="mt-0.5 text-amber-900 dark:text-amber-200">
                        Gemini and Groq keys are empty. CodyNex OS runs in deterministic planning mode at NPR 0 until you add a free-tier key in{" "}
                        <Link href="/settings" className="underline font-semibold">
                          Settings
                        </Link>
                        .
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Department Performance" subtitle="Live task counts per department" />
                  <div className="divide-y divide-surface-border">
                    {data.departmentPerformance.map((dept) => (
                      <div key={dept.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                        <div>
                          <p className="font-semibold text-ink">{dept.name}</p>
                          <p className="text-xs text-ink-muted tabular-nums">
                            {dept.totalTasks} total · {dept.running} running
                          </p>
                        </div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <Badge tone="green">{dept.completed} done</Badge>
                          {dept.failed > 0 && <Badge tone="red">{dept.failed} failed</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardHeader
                    title="Recent Activity"
                    subtitle="Latest persistent audit trail entries"
                    action={
                      <Link href="/audit-logs" className="text-xs font-semibold text-ink underline">
                        View all
                      </Link>
                    }
                  />
                  <div className="divide-y divide-surface-border">
                    {data.recentActivity.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-ink-muted">
                        No audit events recorded yet.
                      </p>
                    ) : (
                      data.recentActivity.slice(0, 8).map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{ev.action}</p>
                            <p className="truncate text-ink-muted">
                              {ev.actorType} · {ev.resourceType}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge tone={statusTone(ev.action)}>{ev.actorType}</Badge>
                            <span className="tabular-nums text-ink-muted">
                              {formatDateTime(ev.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </>
          )
        )}
      </div>
    </DashboardShell>
  );
}

function StatBox({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const inner = (
    <Card className="p-4 transition-colors hover:border-ink/40">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{sub}</p>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
