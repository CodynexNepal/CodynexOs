"use client";

import { ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";

interface QaReportItem {
  id: string;
  taskId: string;
  verdict: string;
  failedComponent: string | null;
  correctionTaskId: string | null;
  summary: string;
  checksExecuted: Array<{ name: string; status: string; output?: string }>;
  createdAt: string;
}

export default function TestingCenterPage() {
  const { data, loading, error, refetch } = useApiQuery<QaReportItem[]>(() =>
    codynexApi.qa.reports()
  );

  return (
    <DashboardShell
      title="Testing Center"
      subtitle="Independent QA verification evidence and automatic correction-task links"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No QA verification reports yet"
            description="QA Engineer verification runs record TypeScript, ESLint, unit, and integration test evidence here."
          />
        ) : (
          <div className="space-y-3">
            {data.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(r.verdict)}>{r.verdict}</Badge>
                    <span className="text-sm font-bold text-ink">{r.summary}</span>
                  </div>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatDateTime(r.createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.checksExecuted.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded border border-surface-border bg-surface-muted px-2.5 py-1 text-xs text-ink"
                    >
                      {c.name}: <strong>{c.status}</strong>
                    </span>
                  ))}
                </div>
                {r.correctionTaskId && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                    Spawned correction task: <code>{r.correctionTaskId}</code>
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
