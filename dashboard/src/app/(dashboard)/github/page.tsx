"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { FolderTree, GitBranch, GitPullRequest, Plus, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi, unwrap } from "@/lib/codynexOs";
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

interface RepoAnalysis {
  fullName: string;
  language: string;
  defaultBranch: string;
  openIssuesCount: number;
  isPrivate: boolean;
  rootEntries: Array<{ name: string; type: string; path: string }>;
}

export default function GithubPage() {
  const { data, loading, error, refetch } = useApiQuery<RepoItem[]>(() => codynexApi.github.repos());
  const [open, setOpen] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [prRepo, setPrRepo] = useState<RepoItem | null>(null);
  const [branchName, setBranchName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [creatingPr, setCreatingPr] = useState(false);

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
    setActionMsg(null);
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
    setActionMsg(null);
    try {
      await codynexApi.github.syncRepo(id);
      setActionMsg("Synchronized open Pull Requests from GitHub.");
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id);
    setActionErr(null);
    try {
      const res = await codynexApi.github.analyzeRepo(id);
      setAnalysis(unwrap<RepoAnalysis>(res.data));
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prRepo) return;
    setCreatingPr(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      await codynexApi.github.createBranchPr(prRepo.id, {
        branchName,
        title: prTitle,
        body: prBody,
      });
      setPrRepo(null);
      setBranchName("");
      setPrTitle("");
      setPrBody("");
      setActionMsg("Created isolated branch and opened Pull Request on GitHub.");
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setCreatingPr(false);
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
        {actionMsg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {actionMsg}
          </div>
        )}
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
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-3 text-xs text-ink-muted">
                  <span className="tabular-nums">Last sync: {formatDateTime(repo.lastSyncedAt)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAnalyze(repo.id)}
                      loading={analyzingId === repo.id}
                    >
                      <FolderTree className="h-3.5 w-3.5" />
                      Analyze
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(repo.id)}
                      loading={syncingId === repo.id}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync PRs
                    </Button>
                    {repo.isWriteAuthorized && (
                      <Button variant="dark" size="sm" onClick={() => setPrRepo(repo)}>
                        <GitPullRequest className="h-3.5 w-3.5" />
                        New PR
                      </Button>
                    )}
                  </div>
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

      <Modal
        open={Boolean(analysis)}
        onClose={() => setAnalysis(null)}
        title={analysis ? `Repository Analysis — ${analysis.fullName}` : "Analysis"}
      >
        {analysis && (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{analysis.language}</Badge>
              <Badge tone="gray">Base: {analysis.defaultBranch}</Badge>
              <Badge tone="gray">{analysis.openIssuesCount} open issues</Badge>
            </div>
            <div className="divide-y divide-surface-border rounded-md border border-surface-border">
              {analysis.rootEntries.map((entry) => (
                <div key={entry.path} className="flex items-center justify-between px-3 py-2">
                  <span className="font-mono text-ink">{entry.path}</span>
                  <span className="text-ink-muted">{entry.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(prRepo)}
        onClose={() => setPrRepo(null)}
        title={prRepo ? `Create Isolated Branch & PR — ${prRepo.owner}/${prRepo.name}` : "Create PR"}
      >
        <form onSubmit={handleCreatePr} className="space-y-4">
          <Input
            label="Task Branch Name"
            placeholder="codynex/feature-analytics"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            required
          />
          <Input
            label="Pull Request Title"
            placeholder="feat: add analytics module"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            required
          />
          <Textarea
            label="Pull Request Summary"
            rows={3}
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
          />
          <Button type="submit" variant="dark" loading={creatingPr}>
            Create Branch & Open PR
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
