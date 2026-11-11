import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md rounded-card border border-surface-border bg-surface p-8 text-center shadow-card">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The requested CodyNex OS view does not exist or has moved.
        </p>
        <Link
          href="/overview"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-dark"
        >
          Return to Overview
        </Link>
      </div>
    </div>
  );
}
