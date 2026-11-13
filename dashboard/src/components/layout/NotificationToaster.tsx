"use client";

import { useRouter } from "next/navigation";
import { Bell, ShieldAlert, X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge, statusTone } from "@/components/ui/Badge";

export function NotificationToaster() {
  const { toasts, dismissToast, markAsRead } = useNotifications();
  const router = useRouter();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((toast) => {
        const isApproval =
          toast.category === "APPROVAL_REQUEST" || toast.linkUrl?.includes("deployment");

        const handleAction = async () => {
          await markAsRead(toast.id);
          dismissToast(toast.id);
          if (toast.linkUrl) {
            router.push(toast.linkUrl);
          } else {
            router.push("/notifications");
          }
        };

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-red-500/20 bg-surface p-4 shadow-xl ring-1 ring-black/5 animate-in slide-in-from-bottom-5 duration-200"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
              {isApproval ? <ShieldAlert className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge tone={statusTone(toast.severity)} className="text-[10px] py-0 px-1.5">
                  {toast.severity}
                </Badge>
                <span className="text-[11px] font-semibold text-ink-muted">
                  {toast.category}
                </span>
              </div>

              <h4 className="mt-1 text-xs font-bold text-ink">{toast.title}</h4>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted leading-relaxed">
                {toast.message}
              </p>

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAction}
                  className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-brand-ink transition-opacity hover:opacity-90"
                >
                  {isApproval ? "Review & Approve" : "View"}
                </button>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded p-1 text-ink-muted hover:text-ink"
              aria-label="Dismiss toast"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
