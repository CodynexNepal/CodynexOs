"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";
import type { ProjectItem } from "@/types/os";

export default function ProjectsPage() {
  const { data, loading, error, refetch } = useApiQuery<ProjectItem[]>(() => codynexApi.projects());

  return (
    <DashboardShell title="Projects" subtitle="Structured initiatives generated from CEO instructions">
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Issue a natural-language directive in the AI Command Center to create your first structured project."
            action={
              <Link
                href="/command"
                className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-xs font-semibold text-brand-ink"
              >
                Open AI Command Center
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {data.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold text-ink">{p.title}</h3>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      <Badge tone="gray">{p.priority}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink-muted">{p.ceoInstruction}</p>
                  </div>
                  <div className="text-right text-xs text-ink-muted tabular-nums">
                    <p>Created {formatDateTime(p.createdAt)}</p>
                    {p.completedAt && <p>Completed {formatDateTime(p.completedAt)}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
