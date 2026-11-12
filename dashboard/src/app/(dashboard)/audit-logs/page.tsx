"use client";

import { ScrollText } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";

interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const { data, loading, error, refetch } = useApiQuery<AuditEntry[]>(() => codynexApi.auditLogs());
  const pagination = usePagination(data ?? [], 15);

  return (
    <DashboardShell
      title="Audit Logs"
      subtitle="Immutable trail of CEO decisions, authentication events, and worker state transitions"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events yet"
            description="Authentication, approvals, settings changes, and task mutations are recorded here."
          />
        ) : (
          <>
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-surface-border bg-surface-muted uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pagination.pageItems.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-semibold text-ink">{row.action}</td>
                      <td className="px-4 py-3">
                        <Badge tone="gray">{row.actorType}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {row.resourceType} {row.resourceId ? `(${row.resourceId.slice(0, 8)})` : ""}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">{row.ipAddress || "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">
                        {formatDateTime(row.createdAt)}
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
    </DashboardShell>
  );
}
