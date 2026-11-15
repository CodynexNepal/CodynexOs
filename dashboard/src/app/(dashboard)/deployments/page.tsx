"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, ExternalLink, Rocket, X, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import type { ApprovalItem } from "@/types/os";

type ApprovalStatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export default function DeploymentCenterPage() {
  const { refetch: refetchNotifications } = useNotifications();
  const { data, loading, error, refetch } = useApiQuery<ApprovalItem[]>(() =>
    codynexApi.approvals.list()
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>("ALL");

  const counts = useMemo(() => {
    const list = data ?? [];
    return {
      all: list.length,
      pending: list.filter((i) => i.status === "PENDING").length,
      approved: list.filter((i) => i.status === "APPROVED").length,
      rejected: list.filter((i) => i.status === "REJECTED").length,
    };
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (statusFilter === "ALL") return data;
    return data.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const pagination = usePagination(filteredItems, 8);

  const review = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setBusyId(id);
    setActionErr(null);
    try {
      await codynexApi.approvals.review(id, {
        decision,
        ...(notes[id]?.trim() ? { note: notes[id].trim() } : {}),
      });
      refetch();
      refetchNotifications();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell
      title="Deployment & Approval Center"
      subtitle="Human CEO authority gate for production deployments, merges, and outbound campaigns"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("ALL");
                pagination.setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === "ALL"
                  ? "bg-[#0E0F0C] text-white dark:bg-[#FFFFFF] dark:text-[#0E0F0C]"
                  : "bg-surface-muted text-ink-muted hover:text-ink"
              }`}
            >
              All Directives
              <span className="rounded-full bg-surface/30 px-1.5 py-0.2 text-[10px] tabular-nums">
                {counts.all}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("PENDING");
                pagination.setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === "PENDING"
                  ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950"
                  : "bg-surface-muted text-ink-muted hover:text-ink"
              }`}
            >
              <Clock className="h-3 w-3" />
              Pending CEO Gate
              <span className="rounded-full bg-surface/30 px-1.5 py-0.2 text-[10px] tabular-nums">
                {counts.pending}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("APPROVED");
                pagination.setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === "APPROVED"
                  ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white"
                  : "bg-surface-muted text-ink-muted hover:text-ink"
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              Approved
              <span className="rounded-full bg-surface/30 px-1.5 py-0.2 text-[10px] tabular-nums">
                {counts.approved}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("REJECTED");
                pagination.setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === "REJECTED"
                  ? "bg-rose-600 text-white dark:bg-rose-500 dark:text-white"
                  : "bg-surface-muted text-ink-muted hover:text-ink"
              }`}
            >
              <XCircle className="h-3 w-3" />
              Rejected
              <span className="rounded-full bg-surface/30 px-1.5 py-0.2 text-[10px] tabular-nums">
                {counts.rejected}
              </span>
            </button>
          </div>

          <div className="text-xs text-ink-muted tabular-nums">
            Showing <strong className="text-ink">{filteredItems.length}</strong> record(s)
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-surface-border bg-surface p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title={statusFilter === "ALL" ? "No approvals recorded" : `No ${statusFilter.toLowerCase()} approvals`}
            description="Sensitive operations requested by AI departments appear here for your explicit sign-off."
          />
        ) : (
          <>
            <div className="space-y-3">
              {pagination.pageItems.map((item) => (
                <Card key={item.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                        <Badge tone="gray">{item.actionType}</Badge>
                      </div>
                      <h3 className="text-sm font-bold text-ink">{item.summary}</h3>
                      {item.riskAssessment && (
                        <p className="text-xs text-ink-muted">{item.riskAssessment}</p>
                      )}
                      <p className="text-[11px] tabular-nums text-ink-muted">
                        Requested {formatDateTime(item.createdAt)}
                        {item.reviewedAt && ` · Reviewed ${formatDateTime(item.reviewedAt)}`}
                      </p>
                      {item.reviewNote && (
                        <p className="mt-1 rounded bg-surface-muted px-2.5 py-1.5 text-xs text-ink">
                          CEO Note: {item.reviewNote}
                        </p>
                      )}
                      {typeof item.payload?.liveUrl === "string" && (
                        <div className="pt-1">
                          <a
                            href={item.payload.liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-surface-border bg-surface-muted px-2.5 text-xs font-semibold text-ink hover:border-ink"
                          >
                            Open Live Link
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>

                    {item.status === "PENDING" && (
                      <div className="flex w-full flex-col gap-2 sm:w-72">
                        <input
                          type="text"
                          placeholder="Optional CEO review note..."
                          value={notes[item.id] ?? ""}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="h-8 rounded border border-surface-border bg-surface px-2.5 text-xs text-ink"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="flex-1"
                            loading={busyId === item.id}
                            onClick={() => review(item.id, "APPROVED")}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="flex-1"
                            loading={busyId === item.id}
                            onClick={() => review(item.id, "REJECTED")}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={[5, 8, 15, 25, 50]}
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
