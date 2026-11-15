"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { CheckSquare, Eye, Plus, RotateCcw, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { StructuredReportView } from "@/components/domain/StructuredReportView";
import { useApiQuery } from "@/hooks/useApi";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type {
  AiEmployeeItem,
  DepartmentItem,
  ProjectItem,
  TaskItem,
  TaskLogItem,
} from "@/types/os";

const STATUS_FILTERS = [
  "ALL",
  "QUEUED",
  "RUNNING",
  "BLOCKED",
  "PENDING_APPROVAL",
  "FAILED",
  "COMPLETED",
] as const;

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const { data, loading, error, refetch } = useApiQuery<TaskItem[]>(
    () =>
      codynexApi.tasks.list(statusFilter === "ALL" ? undefined : { status: statusFilter }),
    [statusFilter]
  );
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  useEffect(() => {
    if (data) setTasks(data);
  }, [data]);

  const pagination = usePagination(tasks, 15);
  const projectsQuery = useApiQuery<ProjectItem[]>(() => codynexApi.projects());
  const deptsQuery = useApiQuery<DepartmentItem[]>(() => codynexApi.departments());
  const empsQuery = useApiQuery<AiEmployeeItem[]>(() => codynexApi.employees());

  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [logs, setLogs] = useState<TaskLogItem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("code");
  const [creating, setCreating] = useState(false);

  // Throttled refetch to protect backend from rapid polling
  const lastRefetchRef = useRef<number>(0);
  const throttledRefetch = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current > 5000) {
      lastRefetchRef.current = now;
      refetch();
    }
  }, [refetch]);

  // WebSocket Live Updates — pure websocket state synchronization without HTTP hammering
  useDomainSocket((eventName, payload) => {
    if (eventName === "task:updated" && payload) {
      const update = payload as {
        taskId?: string;
        status?: TaskItem["status"];
        error?: string;
        retryCount?: number;
      };
      if (update.taskId) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === update.taskId
              ? {
                  ...t,
                  status: update.status || t.status,
                  errorMessage: update.error !== undefined ? update.error : t.errorMessage,
                  retryCount: update.retryCount !== undefined ? update.retryCount : t.retryCount,
                }
              : t
          )
        );
        // Only throttle refetch when task reaches a final state
        if (update.status === "COMPLETED" || update.status === "FAILED") {
          throttledRefetch();
        }
      }
    } else if (eventName === "task:step" && payload) {
      const stepData = payload as { taskId?: string; action?: string; detail?: string };
      if (stepData.taskId && selectedTask && stepData.taskId === selectedTask.id) {
        setLogs((prev) => [
          ...prev,
          {
            id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            taskId: stepData.taskId!,
            level: "INFO",
            message: `[${stepData.action || "STEP"}] ${stepData.detail || ""}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } else if (eventName === "task:log" && payload && typeof payload === "object") {
      const logItem = payload as TaskLogItem;
      if (selectedTask && logItem.taskId === selectedTask.id) {
        setLogs((prev) => {
          if (prev.some((l) => l.id === logItem.id)) return prev;
          return [...prev, logItem];
        });
      }
    }
  });

  // Keep selectedTask synchronized with live task updates
  useEffect(() => {
    if (selectedTask && tasks.length > 0) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (
        updated &&
        (updated.status !== selectedTask.status ||
          updated.retryCount !== selectedTask.retryCount ||
          updated.outputPayload !== selectedTask.outputPayload)
      ) {
        setSelectedTask(updated);
      }
    }
  }, [tasks, selectedTask]);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setActionError(null);
    try {
      await codynexApi.tasks.create({
        projectId,
        departmentId,
        ...(assignedEmployeeId ? { assignedEmployeeId } : {}),
        title,
        description,
        taskType,
      });
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      refetch();
    } catch (err) {
      setActionError(toApiError(err).message);
    } finally {
      setCreating(false);
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? "border-brand-ink bg-brand text-brand-ink"
                    : "border-surface-border bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="No matching tasks"
            description="Tasks created by the AI COO orchestrator or manually queued appear here."
          />
        ) : (
          <>
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
                  {pagination.pageItems.map((t) => (
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
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </>
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Manual Task">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Select project...</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">Select department...</option>
                {(deptsQuery.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">
                AI Employee (Optional)
              </label>
              <select
                value={assignedEmployeeId}
                onChange={(e) => setAssignedEmployeeId(e.target.value)}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">Auto / Unassigned</option>
                {(empsQuery.data ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.roleTitle}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Task Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="code">code</option>
                <option value="architecture">architecture</option>
                <option value="qa_verify">qa_verify</option>
                <option value="research">research</option>
                <option value="planning">planning</option>
              </select>
            </div>
          </div>
          <Textarea
            label="Task Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <Button type="submit" variant="dark" loading={creating}>
            Queue Task
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
