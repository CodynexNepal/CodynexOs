"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";
import type { ProjectItem, TaskItem } from "@/types/os";

export default function ProjectsPage() {
  const { data, loading, error, refetch } = useApiQuery<ProjectItem[]>(() => codynexApi.projects());
  const tasksQuery = useApiQuery<TaskItem[]>(() => codynexApi.tasks.list());
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            {data.map((p) => {
              const projectTasks = (tasksQuery.data ?? []).filter((t) => t.projectId === p.id);
              const done = projectTasks.filter((t) => t.status === "COMPLETED").length;
              const total = projectTasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const isExpanded = expandedId === p.id;

              return (
                <Card key={p.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
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

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-surface-border pt-3">
                    <div className="flex min-w-[200px] flex-1 items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full bg-brand-dark transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-ink-muted">
                        {done}/{total} tasks ({pct}%)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {isExpanded ? "Hide Tasks" : "View Tasks"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 divide-y divide-surface-border rounded-md border border-surface-border bg-surface-muted/40">
                      {projectTasks.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-ink-muted">
                          No tasks attached to this project yet.
                        </p>
                      ) : (
                        projectTasks.map((t) => (
                          <div
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-ink">{t.title}</span>
                              <span className="ml-2 text-ink-muted">
                                ({t.assignedEmployee?.roleTitle ?? t.taskType})
                              </span>
                            </div>
                            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
