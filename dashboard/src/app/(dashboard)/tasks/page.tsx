"use client";

import { useState } from "react";
import { CheckSquare, Eye, RotateCcw, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StructuredReportView } from "@/components/domain/StructuredReportView";
import { useApiQuery } from "@/hooks/useApi";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { TaskItem, TaskLogItem } from "@/types/os";

export default function TasksPage() {
  const { data, loading, error, refetch } = useApiQuery<TaskItem[]>(() => codynexApi.tasks.list());
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [logs, setLogs] = useState<TaskLogItem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useDomainSocket(() => {
    refetch();
  });

  const openLogs = async (task: TaskItem) => {
    setSelectedTask(task);
    setLogs([]);
    try {
      const res = await codynexApi.tasks.logs(task.id);
      setLogs(unwrap<TaskLogItem[]>(res.data));
    } catch (err) {
      setActionError(toApiError(err).message);
    }
  };

  const handleRetry = async (id: string) => {
    setActionError(null);
    try {
      await codynexApi.tasks.retry(id);
      refetch();
    } catch (err) {
      setActionError(toApiError(err).message);
    }
  };

  const handleCancel = async (id: string) => {
    setActionError(null);
    try {
      await codynexApi.tasks.cancel(id);
      refetch();
    } catch (err) {
      setActionError(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Tasks"
      subtitle="PostgreSQL-persisted durable execution queue with bounded retries and verification logs"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionError && <ErrorBanner message={actionError} />}

        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="No tasks in queue"
            description="Tasks created by the AI COO orchestrator appear here with live execution logs."
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Department / Agent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Retries</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{t.title}</p>
                      <p className="line-clamp-1 text-xs text-ink-muted">{t.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-ink">{t.department?.name ?? "—"}</p>
                      <p className="text-ink-muted">{t.assignedEmployee?.roleTitle ?? "Unassigned"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-ink-muted">
                      {t.retryCount} / {t.maxRetries}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-ink-muted">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => openLogs(t)}>
                          <Eye className="h-3.5 w-3.5" />
                          Logs
                        </Button>
                        {["FAILED", "BLOCKED", "CANCELLED"].includes(t.status) && (
                          <Button variant="outline" size="sm" onClick={() => handleRetry(t.id)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </Button>
                        )}
                        {["QUEUED", "PENDING_APPROVAL", "BLOCKED"].includes(t.status) && (
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(t.id)}>
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={selectedTask ? `Task Logs — ${selectedTask.title}` : "Task Logs"}
      >
        {selectedTask && (
          <div className="space-y-4 text-xs">
            <div className="rounded-md border border-surface-border bg-surface-muted/40 p-3.5">
              <p className="mb-2 font-semibold text-ink">Execution Output & Verification</p>
              {selectedTask.outputPayload ? (
                <StructuredReportView content={selectedTask.outputPayload} />
              ) : (
                <p className="text-ink-muted">Status: {selectedTask.status}</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-ink">Execution Log History</p>
              {logs.length === 0 ? (
                <p className="text-ink-muted">No logs recorded yet.</p>
              ) : (
                logs.map((l) => (
                  <div
                    key={l.id}
                    className="rounded border border-surface-border bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge tone={statusTone(l.level)}>{l.level}</Badge>
                      <span className="tabular-nums text-ink-muted">
                        {formatDateTime(l.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-ink">{l.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}
