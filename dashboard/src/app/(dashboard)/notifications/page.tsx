"use client";

import { Bell, CheckCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";

interface NotificationItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { data, loading, error, refetch } = useApiQuery<NotificationItem[]>(() =>
    codynexApi.notifications.list()
  );

  const markRead = async (id: string) => {
    await codynexApi.notifications.markRead(id);
    refetch();
  };

  const markAll = async () => {
    await codynexApi.notifications.markAllRead();
    refetch();
  };

  return (
    <DashboardShell
      title="Notifications"
      subtitle="High-signal CEO alerts for approvals, completions, failures, and budget limits"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All clear"
            description="Critical alerts, approval requests, and project completions appear here."
          />
        ) : (
          <div className="space-y-3">
            {data.map((n) => (
              <Card key={n.id} className={`p-4 ${n.isRead ? "opacity-75" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(n.severity)}>{n.severity}</Badge>
                      <span className="text-xs font-semibold text-ink-muted">{n.category}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-ink">{n.title}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-ink-muted">
                      {formatDateTime(n.createdAt)}
                    </span>
                    {!n.isRead && (
                      <Button variant="outline" size="sm" onClick={() => markRead(n.id)}>
                        Mark read
                      </Button>
                    )}
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
