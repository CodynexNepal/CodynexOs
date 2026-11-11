"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { formatDateTime } from "@/lib/utils";

interface PullRequestItem {
  id: string;
  prNumber: number;
  branchName: string;
  title: string;
  status: string;
  htmlUrl: string;
  createdAt: string;
}

const PR_STATUSES = ["ALL", "OPEN", "READY_FOR_REVIEW", "CHECKS_FAILED", "MERGED"] as const;

export default function CodeReviewPage() {
  const [filter, setFilter] = useState<string>("ALL");
  const { data, loading, error, refetch } = useApiQuery<PullRequestItem[]>(() =>
    codynexApi.github.pullRequests()
  );

  const visible = (data ?? []).filter((pr) => filter === "ALL" || pr.status === filter);

  return (
    <DashboardShell
      title="Code Review"
      subtitle="Pull requests synced from connected repositories awaiting CTO / QA verification"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PR_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilter(st)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === st
                    ? "border-brand-ink bg-brand text-brand-ink"
                    : "border-surface-border bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
          <Link
            href="/github"
            className="inline-flex h-8 items-center rounded-md border border-surface-border bg-surface px-3 text-xs font-semibold text-ink hover:border-ink"
          >
            Manage Repositories
          </Link>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={GitPullRequest}
            title="No pull requests matching filter"
            description="Connect a repository in GitHub Integration and sync open Pull Requests."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((pr) => (
              <Card key={pr.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tabular-nums text-ink-muted">
                      #{pr.prNumber}
                    </span>
                    <h3 className="text-sm font-bold text-ink">{pr.title}</h3>
                    <Badge tone={statusTone(pr.status)}>{pr.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Branch: <code>{pr.branchName}</code> · Synced {formatDateTime(pr.createdAt)}
                  </p>
                </div>
                <a
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-surface-border px-3 text-xs font-semibold text-ink hover:border-ink"
                >
                  Open on GitHub
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
