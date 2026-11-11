import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-border/60", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-surface-border bg-surface px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h4 className="mt-3 text-sm font-semibold text-ink">{title}</h4>
      <p className="mt-1 max-w-md text-[13px] text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-red-400 px-2.5 py-1 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40"
        >
          Retry
        </button>
      )}
    </div>
  );
}
