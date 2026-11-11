import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  green: "bg-[#EAFCCB] text-[#14532D] border border-[#9FE870] dark:bg-[#163300] dark:text-[#C3FF7D] dark:border-[#2F5D14]",
  dark: "bg-brand-ink text-white border border-brand-ink",
  gray: "bg-surface-muted text-ink-muted border border-surface-border",
  red: "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900",
  amber: "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  blue: "bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        tones[tone] ?? tones.gray,
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (
    ["COMPLETED", "PASSED", "APPROVED", "ACTIVE", "CONNECTED", "HEALTHY", "SUCCESS", "WON"].includes(
      s
    )
  ) {
    return "green";
  }
  if (
    ["PENDING", "PENDING_APPROVAL", "AWAITING_CLARIFICATION", "RATE_LIMITED", "DRAFT", "OPEN"].includes(
      s
    )
  ) {
    return "amber";
  }
  if (
    ["FAILED", "REJECTED", "CANCELLED", "BLOCKED", "QUOTA_EXHAUSTED", "ERROR", "OPTED_OUT"].includes(
      s
    )
  ) {
    return "red";
  }
  if (["RUNNING", "QUEUED", "UNDER_REVIEW", "PLANNING", "CONTACTED", "QUALIFIED"].includes(s)) {
    return "blue";
  }
  return "gray";
}
