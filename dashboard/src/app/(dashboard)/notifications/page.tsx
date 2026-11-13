"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CheckCheck, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDateTime } from "@/lib/utils";

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    sendTestNotification,
  } = useNotifications();
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulate = async () => {
    try {
      setIsSimulating(true);
      await sendTestNotification({
        category: "APPROVAL_REQUEST",
        severity: "WARNING",
        title: `CEO Approval Needed: Production Deploy #${Math.floor(Math.random() * 900 + 100)}`,
        message: "AI Engineering has completed QA verification and requests sign-off to deploy.",
        linkUrl: "/deployments",
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <DashboardShell
      title="Notifications"
      subtitle="High-signal CEO alerts for approvals, completions, failures, and budget limits"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">
              Total: {notifications.length} notifications
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              {isSimulating ? "Sending..." : "Simulate Alert"}
            </Button>

            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1.5">
                <CheckCheck className="h-4 w-4 text-brand" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {loading && notifications.length === 0 ? (
          <CardListSkeleton count={4} columns={1} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All clear"
            description="Critical alerts, approval requests, and project completions appear here in real time."
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={`p-4 transition-all ${
                  n.isRead
                    ? "opacity-75"
                    : "border-l-4 border-l-red-500 bg-red-500/[0.02] shadow-sm"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {!n.isRead && (
                        <span
                          className="h-2 w-2 rounded-full bg-red-600"
                          title="Unread notification"
                        />
                      )}
                      <Badge tone={statusTone(n.severity)}>{n.severity}</Badge>
                      <span className="text-xs font-semibold text-ink-muted">{n.category}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-ink">{n.title}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{n.message}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-ink-muted">
                      {formatDateTime(n.createdAt)}
                    </span>
                    {(n.category === "APPROVAL_REQUEST" || n.linkUrl) && (
                      <Link
                        href={n.linkUrl || "/deployments"}
                        onClick={() => markAsRead(n.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-brand px-3 text-xs font-semibold text-brand-ink hover:opacity-90"
                      >
                        Review &amp; Approve
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {!n.isRead && (
                      <Button variant="outline" size="sm" onClick={() => markAsRead(n.id)}>
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
