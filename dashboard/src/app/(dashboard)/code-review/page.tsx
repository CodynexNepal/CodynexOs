"use client";

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

export default function CodeReviewPage() {
  const { data, loading, error, refetch } = useApiQuery<PullRequestItem[]>(() =>
    codynexApi.github.pullRequests()
  );

  return (
    <DashboardShell
      title="Code Review"
      subtitle="Pull requests synced from connected repositories awaiting CTO / QA verification"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={GitPullRequest}
            title="No pull requests synced"
            description="Connect a repository in GitHub Integration and sync open Pull Requests."
          />
        ) : (
          <div className="space-y-3">
            {data.map((pr) => (
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
