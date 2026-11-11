"use client";

import { Bot } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatNumber } from "@/lib/utils";
import type { AiEmployeeItem } from "@/types/os";

export default function EmployeesPage() {
  const { data, loading, error, refetch } = useApiQuery<AiEmployeeItem[]>(() =>
    codynexApi.employees()
  );

  return (
    <DashboardShell
      title="AI Employees"
      subtitle="20 logical specialist roles instantiated on demand with scoped tool permissions"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No AI employees seeded"
            description="Run the initial database seed to populate the 20 organizational roles."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((emp) => (
              <Card key={emp.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-ink">{emp.roleTitle}</h3>
                    <p className="text-xs text-ink-muted">
                      {emp.department?.name ?? "Department"} · slug: <code>{emp.slug}</code>
                    </p>
                  </div>
                  <Badge tone={emp.isActive ? "green" : "gray"}>
                    {emp.isActive ? "Active" : "Paused"}
                  </Badge>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                  {emp.systemInstruction}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {emp.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded border border-surface-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {tool}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-3 text-xs text-ink-muted tabular-nums">
                  <span>
                    Model: <strong className="text-ink">{emp.preferredProvider}/{emp.preferredModel}</strong>
                  </span>
                  <span>Budget: {formatNumber(emp.dailyTokenBudget)} tok/day</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
