"use client";

import { Building2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatNumber } from "@/lib/utils";
import type { AiEmployeeItem, DepartmentItem } from "@/types/os";

export default function DepartmentsPage() {
  const depts = useApiQuery<DepartmentItem[]>(() => codynexApi.departments());
  const emps = useApiQuery<AiEmployeeItem[]>(() => codynexApi.employees());

  return (
    <DashboardShell title="Departments" subtitle="Functional units and daily AI token allocations">
      <div className="space-y-4">
        {depts.error && <ErrorBanner message={depts.error} onRetry={depts.refetch} />}
        {depts.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !depts.data || depts.data.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No departments found"
            description="Seed the database to configure Executive, Engineering, Marketing, Sales, and Operations."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {depts.data.map((d) => {
              const members = (emps.data ?? []).filter((e) => e.departmentId === d.id);
              return (
                <Card key={d.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-ink">{d.name}</h3>
                    <Badge tone={d.isActive ? "green" : "gray"}>
                      {members.length} roles
                    </Badge>
                  </div>
                  <p className="mt-2 text-[13px] text-ink-muted">{d.description}</p>
                  <div className="mt-4 border-t border-surface-border pt-3 text-xs text-ink-muted tabular-nums">
                    Daily budget: <strong className="text-ink">{formatNumber(d.dailyTokenBudget)}</strong> tokens
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
