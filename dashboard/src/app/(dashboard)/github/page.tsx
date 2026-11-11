"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { repoSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";

interface RepoItem {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  isWriteAuthorized: boolean;
  lastSyncedAt: string | null;
}

export default function GithubPage() {
  const { data, loading, error, refetch } = useApiQuery<RepoItem[]>(() => codynexApi.github.repos());
  const [open, setOpen] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(repoSchema),
    defaultValues: { owner: "", name: "", defaultBranch: "main", isWriteAuthorized: false },
  });

  const onConnect = async (values: {
    owner: string;
    name: string;
    defaultBranch?: string;
    isWriteAuthorized?: boolean;
  }) => {
    setActionErr(null);
    try {
      await codynexApi.github.connectRepo(values);
      reset();
      setOpen(false);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    setActionErr(null);
    try {
      await codynexApi.github.syncRepo(id);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <DashboardShell
      title="GitHub Integration"
      subtitle="Authorized repositories (direct push to default branch is strictly blocked)"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Connect Repository
          </Button>
        </div>

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={GitBranch}
            title="No GitHub repositories connected"
            description="Authorize a repository so Engineering can sync PRs, create task branches, and run CI checks."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data ?? []).map((repo) => (
              <Card key={repo.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      {repo.owner}/{repo.name}
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Protected base: <code>{repo.defaultBranch}</code>
                    </p>
                  </div>
                  <Badge tone={repo.isWriteAuthorized ? "blue" : "gray"}>
                    {repo.isWriteAuthorized ? "PR Write Enabled" : "Read Only"}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3 text-xs text-ink-muted">
                  <span className="tabular-nums">Last sync: {formatDateTime(repo.lastSyncedAt)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(repo.id)}
                    loading={syncingId === repo.id}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync Open PRs
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Authorize GitHub Repository">
        <form onSubmit={handleSubmit(onConnect)} className="space-y-4">
          <Input label="Owner / Org" placeholder="CodynexNepal" error={errors.owner?.message} {...register("owner")} />
          <Input label="Repository Name" placeholder="HostelGhar" error={errors.name?.message} {...register("name")} />
          <Input label="Protected Default Branch" {...register("defaultBranch")} />
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" {...register("isWriteAuthorized")} />
            Allow creating task branches & Pull Requests (never direct push to default branch)
          </label>
          <Button type="submit" variant="dark" loading={isSubmitting}>
            Connect Repository
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
