"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge, statusTone } from "@/components/ui/Badge";
import { cn, formatDateTime } from "@/lib/utils";

function timeAgo(dateString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 10) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return formatDateTime(dateString);
  }
}

export function NotificationDropdown() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    sendTestNotification,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "approvals">("all");
  const [isSimulating, setIsSimulating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "approvals") {
      return n.category === "APPROVAL_REQUEST" || n.linkUrl?.includes("deployment");
    }
    return true;
  });

  const handleNotificationClick = async (id: string, linkUrl?: string | null) => {
    await markAsRead(id);
    setOpen(false);
    if (linkUrl) {
      router.push(linkUrl);
    } else {
      router.push("/notifications");
    }
  };

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
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button with YouTube-Style Red Number Badge */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-md border border-surface-border bg-surface text-ink transition-colors hover:border-ink",
          open && "border-brand ring-1 ring-brand text-brand"
        )}
      >
        <Bell className="h-4 w-4" />

        {/* YouTube Red Number Badge: Only shown if unreadCount > 0, disappears on click/read */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-surface transition-transform duration-200 animate-in zoom-in-75"
            style={{ backgroundColor: "#ef4444" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown like YouTube */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-lg border border-surface-border bg-surface shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3 bg-surface">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-brand" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center border-b border-surface-border bg-surface-muted/50 px-3 py-1.5 text-xs font-medium gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                filter === "all"
                  ? "bg-surface font-semibold text-ink shadow-sm border border-surface-border"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("approvals")}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                filter === "approvals"
                  ? "bg-surface font-semibold text-ink shadow-sm border border-surface-border"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              Approvals (
              {
                notifications.filter(
                  (n) => n.category === "APPROVAL_REQUEST" || n.linkUrl?.includes("deployment")
                ).length
              }
              )
            </button>
          </div>

          {/* Scrollable Notifications List */}
          <div className="max-h-[380px] divide-y divide-surface-border overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-ink-muted">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="text-xs text-ink-muted/80 mt-0.5">
                  Real-time alerts and approvals will appear here.
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isApproval =
                  notif.category === "APPROVAL_REQUEST" || notif.linkUrl?.includes("deployment");

                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "group relative flex items-start gap-3 p-3.5 text-left transition-colors hover:bg-surface-muted/60",
                      !notif.isRead && "bg-brand/5 dark:bg-brand/10"
                    )}
                  >
                    {/* Unread indicator dot */}
                    <div className="pt-1.5 shrink-0">
                      {!notif.isRead ? (
                        <span
                          className="block h-2 w-2 rounded-full bg-red-600"
                          title="Unread notification"
                        />
                      ) : (
                        <span className="block h-2 w-2 rounded-full bg-surface-border" />
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => handleNotificationClick(notif.id, notif.linkUrl)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={statusTone(notif.severity)} className="text-[10px] py-0 px-1.5">
                          {notif.severity}
                        </Badge>
                        <span className="text-[11px] font-medium text-ink-muted">
                          {notif.category}
                        </span>
                        <span className="ml-auto text-[11px] tabular-nums text-ink-muted">
                          {timeAgo(notif.createdAt)}
                        </span>
                      </div>

                      <h4
                        className={cn(
                          "mt-1 text-xs text-ink",
                          !notif.isRead ? "font-bold" : "font-medium"
                        )}
                      >
                        {notif.title}
                      </h4>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted leading-relaxed">
                        {notif.message}
                      </p>

                      {/* Quick Action Button for Approvals */}
                      {isApproval && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationClick(notif.id, notif.linkUrl || "/deployments");
                            }}
                            className="inline-flex items-center gap-1 rounded bg-brand px-2 py-1 text-[11px] font-semibold text-brand-ink transition-opacity hover:opacity-90"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            Review &amp; Approve
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Mark read checkmark button */}
                    {!notif.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notif.id);
                        }}
                        title="Mark read"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-border/50 text-ink-muted hover:text-ink transition-all"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-surface-border bg-surface px-4 py-2.5 text-xs">
            <button
              type="button"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-brand disabled:opacity-50"
              title="Trigger a test real-time notification"
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>{isSimulating ? "Sending..." : "Test Real-time Alert"}</span>
            </button>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              <span>View all</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
