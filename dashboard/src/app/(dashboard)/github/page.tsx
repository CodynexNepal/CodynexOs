"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  AlertTriangle,
  CheckCircle2,
  CornerDownLeft,
  Download,
  FileCode2,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Key,
  Package,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Terminal,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
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

interface WorkspaceState {
  cloned: boolean;
  entries: Array<{ name: string; path: string; type: "file" | "dir"; size?: number }>;
  gitState: { branch: string; status: string; diff: string };
}

interface RepositoryDiagnostic {
  owner: string;
  name: string;
  exists: boolean;
  isPrivate: boolean;
  defaultBranch: string;
  hasAccess: boolean;
  hasPushPermission: boolean;
  effectiveWriteAuthorized: boolean;
  diagnosticCode: string;
  failureReason: string | null;
  correctiveAction: string | null;
}

interface GithubDiagnosticState {
  configured: boolean;
  authenticated: boolean;
  authenticatedAccount: string | null;
  accountType?: "User" | "Organization";
  tokenType: string;
  tokenScopes?: string;
  repositoryAccessStatus: "FULL" | "PARTIAL" | "DENIED" | "NOT_TESTED";
  repositoryWritePermission: boolean;
  pushReadiness: boolean;
  diagnosticCode: string;
  failureReason: string | null;
  recommendedAction: string | null;
  testedRepositories: RepositoryDiagnostic[];
  detail: string;
}

export default function GithubPage() {
  const { data, loading, error, refetch } = useApiQuery<RepoItem[]>(() => codynexApi.github.repos());
  const [connectOpen, setConnectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOwner, setImportOwner] = useState("CodynexNepal");
  const [importing, setImporting] = useState(false);

  const [newName, setNewName] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);

  const [activeRepo, setActiveRepo] = useState<RepoItem | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileCommitMsg, setNewFileCommitMsg] = useState("");
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [workspaceCommitMsg, setWorkspaceCommitMsg] = useState("");
  const [fileCommitMsg, setFileCommitMsg] = useState("");
  const [branchName, setBranchName] = useState(() => `codynex/feature-${Date.now().toString(36)}`);
  const [prTitle, setPrTitle] = useState("");
  const [checksResult, setChecksResult] = useState<{
    verdict: string;
    checks: Array<{ name: string; status: string; output: string }>;
  } | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<GithubDiagnosticState | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Interactive Git Terminal state
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<
    Array<{
      command: string;
      stdout: string;
      stderr: string;
      exitCode: number;
      timestamp: string;
    }>
  >([
    {
      command: "git status",
      stdout: "Interactive Git Terminal ready. Type any git command (e.g. status, add -A, commit, diff, log, branch).",
      stderr: "",
      exitCode: 0,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(repoSchema),
    defaultValues: { owner: "", name: "", defaultBranch: "main", isWriteAuthorized: true },
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
      setConnectOpen(false);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleProbeGithub = async () => {
    setBusyAction("probe");
    setActionErr(null);
    try {
      const res = await codynexApi.github.probe();
      const diag = unwrap<GithubDiagnosticState>(res.data);
      setProbeResult(diag);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiagnoseRepo = async (repoId: string) => {
    setBusyAction(`diag-${repoId}`);
    setActionErr(null);
    try {
      const res = await codynexApi.github.diagnoseRepo(repoId);
      const diag = unwrap<RepositoryDiagnostic>(res.data);
      if (diag.effectiveWriteAuthorized) {
        setActionMsg(`✓ Verified Write & Push authorization for ${diag.owner}/${diag.name}.`);
      } else {
        setActionErr(
          `[${diag.diagnosticCode}] ${diag.failureReason || "Write permission missing"}. Action: ${diag.correctiveAction}`
        );
      }
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await codynexApi.github.importOrg(importOwner);
      const out = unwrap<{ count: number; owner: string }>(res.data);
      setActionMsg(`Imported ${out.count} repositories from '${out.owner}'.`);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setImporting(false);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRepo(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await codynexApi.github.createRepo({
        name: newName,
        description: newDesc,
        ...(newOwner.trim() ? { owner: newOwner.trim() } : {}),
        isPrivate: newPrivate,
      });
      const created = unwrap<RepoItem>(res.data);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setActionMsg(`Created GitHub repository ${created.owner}/${created.name} and cloned workspace.`);
      refetch();
      await loadWorkspace(created, "");
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setCreatingRepo(false);
    }
  };

  const loadWorkspace = async (repo: RepoItem, subPath: string) => {
    setActiveRepo(repo);
    setCurrentPath(subPath);
    setSelectedFile(null);
    setChecksResult(null);
    setActionErr(null);
    try {
      const res = await codynexApi.github.workspaceFiles(repo.id, subPath);
      setWorkspace(unwrap<WorkspaceState>(res.data));
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleWorkspaceSync = async () => {
    if (!activeRepo) return;
    setBusyAction("sync");
    setActionErr(null);
    try {
      await codynexApi.github.workspaceSync(activeRepo.id);
      setActionMsg(`Synced local workspace with GitHub for ${activeRepo.owner}/${activeRepo.name}.`);
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    if (!activeRepo) return;
    setActionErr(null);
    try {
      const res = await codynexApi.github.workspaceReadFile(activeRepo.id, filePath);
      const file = unwrap<{ path: string; content: string }>(res.data);
      setSelectedFile(file);
      setEditContent(file.content);
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleSaveFile = async (commit = false) => {
    if (!activeRepo || !selectedFile) return;
    setBusyAction("save");
    setActionErr(null);
    try {
      await codynexApi.github.workspaceWriteFiles(activeRepo.id, {
        branchName,
        files: [{ path: selectedFile.path, content: editContent }],
      });
      if (commit) {
        const msg = fileCommitMsg.trim() || `feat: update ${selectedFile.path}`;
        const res = await codynexApi.github.workspaceCommit(activeRepo.id, {
          branchName,
          commitMessage: msg,
        });
        const out = unwrap<{ commitSha?: string }>(res.data);
        setActionMsg(
          `Saved & committed '${selectedFile.path}' on branch '${branchName}' (${
            out.commitSha ? out.commitSha.slice(0, 7) : "committed"
          }).`
        );
        setFileCommitMsg("");
      } else {
        setActionMsg(`Saved '${selectedFile.path}' on branch '${branchName}'.`);
      }
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleWorkspaceCommit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRepo) return;
    setBusyAction("commit");
    setActionErr(null);
    try {
      const msg = workspaceCommitMsg.trim() || `chore: update workspace files on ${branchName}`;
      const res = await codynexApi.github.workspaceCommit(activeRepo.id, {
        branchName,
        commitMessage: msg,
      });
      const out = unwrap<{ committed: boolean; commitSha?: string }>(res.data);
      if (out.committed) {
        setActionMsg(
          `Staged and committed changes on '${branchName}' (${
            out.commitSha ? out.commitSha.slice(0, 7) : "new commit"
          }).`
        );
      } else {
        setActionMsg(`No changes to commit on '${branchName}' (working tree clean).`);
      }
      setCommitModalOpen(false);
      setWorkspaceCommitMsg("");
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepo || !newFilePath.trim()) return;
    setBusyAction("new-file");
    setActionErr(null);
    try {
      await codynexApi.github.workspaceWriteFiles(activeRepo.id, {
        branchName,
        files: [{ path: newFilePath.trim(), content: newFileContent }],
      });
      const commitMsg = newFileCommitMsg.trim() || `feat: add ${newFilePath.trim()}`;
      const res = await codynexApi.github.workspaceCommit(activeRepo.id, {
        branchName,
        commitMessage: commitMsg,
      });
      const out = unwrap<{ commitSha?: string }>(res.data);
      setNewFileOpen(false);
      setActionMsg(
        `Created & committed '${newFilePath.trim()}' on branch '${branchName}' (${
          out.commitSha ? out.commitSha.slice(0, 7) : "committed"
        }).`
      );
      setNewFilePath("");
      setNewFileContent("");
      setNewFileCommitMsg("");
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleInstallDeps = async () => {
    if (!activeRepo) return;
    setBusyAction("install-deps");
    setActionErr(null);
    try {
      const res = await codynexApi.github.workspaceInstallDeps(activeRepo.id);
      const out = unwrap<{ success: boolean; output: string }>(res.data);
      if (out.success) {
        setActionMsg("Dependencies installed successfully in workspace (node_modules ready).");
      } else {
        setActionErr(`Dependency installation failed: ${out.output}`);
      }
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunChecks = async () => {
    if (!activeRepo) return;
    setBusyAction("checks");
    setActionErr(null);
    try {
      const res = await codynexApi.github.workspaceRunChecks(activeRepo.id);
      setChecksResult(unwrap(res.data));
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePushPr = async () => {
    if (!activeRepo) return;
    setBusyAction("push");
    setActionErr(null);
    try {
      const res = await codynexApi.github.workspacePushPr(activeRepo.id, {
        branchName,
        title: prTitle || `chore: update ${activeRepo.name} via CodyNex OS`,
      });
      const out = unwrap<{ commitSha: string; pullRequest: { prNumber: number } }>(res.data);
      setActionMsg(
        `Committed (${out.commitSha.slice(0, 7)}), pushed branch '${branchName}', opened PR #${out.pullRequest.prNumber}, and queued CEO Approval in Deployment Center.`
      );
      setBranchName(`codynex/feature-${Date.now().toString(36)}`);
      await loadWorkspace(activeRepo, currentPath);
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunTerminalCommand = async (cmdToRun?: string) => {
    const rawCmd = (cmdToRun !== undefined ? cmdToRun : terminalInput).trim();
    if (!rawCmd || !activeRepo) return;
    setTerminalRunning(true);
    setTerminalInput("");
    setCmdHistory((prev) => [rawCmd, ...prev.filter((c) => c !== rawCmd)]);
    setHistoryIndex(-1);

    try {
      const res = await codynexApi.github.workspaceTerminal(activeRepo.id, { command: rawCmd });
      const data = unwrap<{ stdout: string; stderr: string; exitCode: number; branch: string }>(
        res.data
      );
      setTerminalLogs((prev) => [
        ...prev,
        {
          command: rawCmd,
          stdout: data.stdout || "",
          stderr: data.stderr || "",
          exitCode: data.exitCode,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      if (data.branch) {
        setBranchName(data.branch);
      }
      if (
        rawCmd.includes("commit") ||
        rawCmd.includes("add") ||
        rawCmd.includes("checkout") ||
        rawCmd.includes("switch") ||
        rawCmd.includes("pull") ||
        rawCmd.includes("push") ||
        rawCmd.includes("reset")
      ) {
        loadWorkspace(activeRepo, currentPath);
      }
    } catch (err) {
      setTerminalLogs((prev) => [
        ...prev,
        {
          command: rawCmd,
          stdout: "",
          stderr: toApiError(err).message,
          exitCode: 1,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setTerminalRunning(false);
      setTimeout(() => {
        terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !terminalRunning) {
      e.preventDefault();
      handleRunTerminalCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, cmdHistory.length - 1);
        setHistoryIndex(nextIdx);
        setTerminalInput(cmdHistory[nextIdx] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setTerminalInput(cmdHistory[nextIdx] ?? "");
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setTerminalInput("");
      }
    }
  };

  return (
    <DashboardShell
      title="GitHub & Live Workspace Explorer"
      subtitle="Import org repositories, create projects, browse folders, edit code, run tests, and push isolated PRs"
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        {actionMsg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {actionMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={handleImportOrg} className="flex items-center gap-2">
            <input
              type="text"
              value={importOwner}
              onChange={(e) => setImportOwner(e.target.value)}
              placeholder="GitHub org/user (e.g. CodynexNepal)"
              className="h-9 w-56 rounded-md border border-surface-border bg-surface px-3 text-xs text-ink"
              required
            />
            <Button type="submit" variant="outline" size="sm" loading={importing}>
              <Download className="h-3.5 w-3.5" />
              Import All Repos
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleProbeGithub}
              loading={busyAction === "probe"}
            >
              Test GitHub Token
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Connect Existing
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New GitHub Project
            </Button>
          </div>
        </div>

        {probeResult && (
          <Card className="border border-surface-border p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-brand-ink" />
                <h3 className="text-sm font-semibold text-ink">
                  GitHub Integration & Permission Diagnostics
                </h3>
              </div>
              <Badge tone={probeResult.pushReadiness ? "green" : "red"}>
                {probeResult.pushReadiness ? "Push Ready" : "Push Blocked"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 text-xs">
              <div className="rounded-md border border-surface-border bg-surface-muted/40 p-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Authentication</span>
                <div className="mt-1 flex items-center gap-1.5 font-semibold text-ink">
                  {probeResult.authenticated ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Authenticated</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-rose-600" />
                      <span>Failed</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-surface-border bg-surface-muted/40 p-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-muted">GitHub Account</span>
                <div className="mt-1 font-semibold text-ink truncate">
                  {probeResult.authenticatedAccount || "None"}
                  {probeResult.tokenType && (
                    <span className="ml-1 text-[10px] text-ink-muted font-normal">
                      ({probeResult.tokenType})
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-surface-border bg-surface-muted/40 p-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Repository Access</span>
                <div className="mt-1 font-semibold text-ink">
                  {probeResult.repositoryAccessStatus}
                </div>
              </div>

              <div className="rounded-md border border-surface-border bg-surface-muted/40 p-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Write Permission</span>
                <div className="mt-1 flex items-center gap-1.5 font-semibold text-ink">
                  {probeResult.repositoryWritePermission ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Authorized</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Missing</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-surface-border bg-surface-muted/40 p-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-muted">Push Readiness</span>
                <div className="mt-1 flex items-center gap-1.5 font-semibold text-ink">
                  {probeResult.pushReadiness ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Push Enabled</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                      <span>Blocked</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {!probeResult.pushReadiness && (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Authorization Required: [{probeResult.diagnosticCode}]
                  </span>
                </div>
                {probeResult.failureReason && (
                  <p className="text-[11px] leading-relaxed">
                    <strong>Exact Reason:</strong> {probeResult.failureReason}
                  </p>
                )}
                {probeResult.recommendedAction && (
                  <div className="text-[11px] leading-relaxed border-t border-amber-200/80 pt-2 font-medium">
                    <strong className="text-amber-900">Recommended Action:</strong>{" "}
                    {probeResult.recommendedAction}
                  </div>
                )}
              </div>
            )}

            {probeResult.testedRepositories && probeResult.testedRepositories.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-surface-border">
                <span className="text-[10px] uppercase font-bold text-ink-muted">
                  Tested Repositories Write Diagnostics
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {probeResult.testedRepositories.map((repoDiag) => (
                    <div
                      key={`${repoDiag.owner}/${repoDiag.name}`}
                      className="rounded border border-surface-border bg-surface p-2.5 text-xs flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-ink truncate">
                          {repoDiag.owner}/{repoDiag.name}
                          {repoDiag.isPrivate && (
                            <span className="ml-1 text-[10px] font-normal text-ink-muted">
                              (private)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-ink-muted">
                          Code: <code>{repoDiag.diagnosticCode}</code>
                        </div>
                      </div>
                      <Badge tone={repoDiag.effectiveWriteAuthorized ? "green" : "red"}>
                        {repoDiag.effectiveWriteAuthorized ? "Push OK" : "Denied 403"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={GitBranch}
            title="No GitHub repositories connected"
            description="Import all repositories under CodynexNepal or create a new GitHub project."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(data ?? []).map((repo) => {
              const selected = activeRepo?.id === repo.id;
              return (
                <Card
                  key={repo.id}
                  className={`cursor-pointer p-4 transition-colors ${
                    selected ? "border-brand-ink ring-1 ring-brand-ink" : "hover:border-ink/40"
                  }`}
                  onClick={() => loadWorkspace(repo, "")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-ink">
                        {repo.owner}/{repo.name}
                      </h3>
                      <p className="text-[11px] text-ink-muted">
                        base: <code>{repo.defaultBranch}</code> · {formatDateTime(repo.lastSyncedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={repo.isWriteAuthorized ? "green" : "gray"}>
                        {repo.isWriteAuthorized ? "Write" : "Read"}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiagnoseRepo(repo.id);
                        }}
                        disabled={busyAction === `diag-${repo.id}`}
                        className="text-[10px] text-brand-ink hover:underline font-medium"
                      >
                        {busyAction === `diag-${repo.id}` ? "Testing..." : "Test Write"}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {activeRepo && workspace && (
          <Card>
            <CardHeader
              title={`Workspace: ${activeRepo.owner}/${activeRepo.name}`}
              subtitle={`Branch: ${workspace.gitState.branch}${currentPath ? ` · /${currentPath}` : ""}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWorkspaceSync}
                    loading={busyAction === "sync"}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {workspace.cloned ? "Pull Latest" : "Clone Workspace"}
                  </Button>
                  {workspace.cloned && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCommitModalOpen(true)}
                        loading={busyAction === "commit"}
                      >
                        <GitCommit className="h-3.5 w-3.5" />
                        Commit Changes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleInstallDeps}
                        loading={busyAction === "install-deps"}
                      >
                        <Package className="h-3.5 w-3.5" />
                        Install Dependencies
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRunChecks}
                        loading={busyAction === "checks"}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Run Tests
                      </Button>
                      <Button
                        variant="dark"
                        size="sm"
                        onClick={handlePushPr}
                        loading={busyAction === "push"}
                      >
                        <UploadCloud className="h-3.5 w-3.5" />
                        Commit, Push &amp; Open PR
                      </Button>
                    </>
                  )}
                </div>
              }
            />

            {!workspace.cloned ? (
              <div className="p-6 text-center text-xs text-ink-muted">
                This repository is not cloned into the CodyNex OS workspace yet. Click{" "}
                <strong>Clone Workspace</strong> above to inspect folders, edit code, run tests, and
                push PRs.
              </div>
            ) : (
              <>
                <div className="grid divide-y divide-surface-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-ink">
                    <span>Project Folder</span>
                    <div className="flex items-center gap-2">
                      {currentPath && (
                        <button
                          type="button"
                          onClick={() => {
                            const parent = currentPath.split("/").slice(0, -1).join("/");
                            loadWorkspace(activeRepo, parent);
                          }}
                          className="text-ink-muted underline hover:text-ink"
                        >
                          .. Up
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNewFileOpen(true)}
                        className="rounded border border-surface-border px-1.5 py-0.5 text-[11px] font-semibold text-ink hover:border-ink"
                      >
                        + File
                      </button>
                    </div>
                  </div>
                  <div className="max-h-96 space-y-1 overflow-y-auto text-xs">
                    {workspace.entries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() =>
                          entry.type === "dir"
                            ? loadWorkspace(activeRepo, entry.path)
                            : handleOpenFile(entry.path)
                        }
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-muted ${
                          selectedFile?.path === entry.path ? "bg-brand/30 font-semibold" : ""
                        }`}
                      >
                        {entry.type === "dir" ? (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                        ) : (
                          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                        )}
                        <span className="truncate text-ink">{entry.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-surface-border pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-ink">Task Branch (Protected base blocked)</span>
                      <button
                        type="button"
                        onClick={() => setBranchName(`codynex/feature-${Date.now().toString(36)}`)}
                        className="text-[11px] text-brand-ink hover:underline font-bold"
                      >
                        + New Branch
                      </button>
                    </div>
                    <Input
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                    />
                    <Input
                      label="PR Title"
                      placeholder="feat: implement module"
                      value={prTitle}
                      onChange={(e) => setPrTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4 p-4 lg:col-span-2">
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-ink">
                          {selectedFile.path}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSaveFile(false)}
                            loading={busyAction === "save"}
                          >
                            <Save className="h-3.5 w-3.5" />
                            Save File
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSaveFile(true)}
                            loading={busyAction === "save"}
                          >
                            <GitCommit className="h-3.5 w-3.5" />
                            Save &amp; Commit
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={`Commit message (e.g. feat: update ${selectedFile.path})`}
                          value={fileCommitMsg}
                          onChange={(e) => setFileCommitMsg(e.target.value)}
                          className="h-8 flex-1 rounded border border-surface-border bg-surface px-2.5 text-xs text-ink placeholder:text-ink-muted/60"
                        />
                      </div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={14}
                        className="w-full rounded-md border border-surface-border bg-surface-muted p-3 font-mono text-xs text-ink"
                      />
                    </div>
                  ) : (
                    <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-surface-border text-xs text-ink-muted">
                      Select any file on the left to inspect or edit live code.
                    </div>
                  )}

                  {checksResult && (
                    <div className="rounded-md border border-surface-border bg-surface-muted/50 p-3 text-xs">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-bold text-ink">Automated Workspace Checks:</span>
                        <Badge tone={statusTone(checksResult.verdict)}>{checksResult.verdict}</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {checksResult.checks.map((c, idx) => (
                          <div key={idx} className="rounded border border-surface-border bg-surface p-2">
                            <span className="font-semibold text-ink">{c.name}: </span>
                            <Badge tone={statusTone(c.status === "PASS" ? "PASSED" : "FAILED")}>
                              {c.status}
                            </Badge>
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">
                              {c.output}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(workspace.gitState.status || workspace.gitState.diff) && (
                    <div className="rounded-md border border-surface-border bg-surface-muted p-3 text-xs">
                      <p className="mb-1 flex items-center gap-1.5 font-bold text-ink">
                        <FolderGit2 className="h-3.5 w-3.5" />
                        Live Git Changes ({workspace.gitState.branch})
                      </p>
                      {workspace.gitState.status && (
                        <pre className="mb-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-ink-muted">
                          {workspace.gitState.status}
                        </pre>
                      )}
                      {workspace.gitState.diff && (
                        <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-ink">
                          {workspace.gitState.diff}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Full-width Interactive Git Terminal Console */}
              <div className="border-t border-surface-border bg-[#0d1117] p-4 text-[#c9d1d9]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-[#58a6ff]" />
                    <span className="font-mono text-xs font-bold text-white">
                      Workspace Git Terminal
                    </span>
                    <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#7ee787]">
                      {activeRepo.owner}/{activeRepo.name} ({workspace.gitState.branch})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                      Quick Git:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("git status")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#58a6ff] hover:bg-[#30363d] transition-colors"
                    >
                      git status
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("git add -A")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#7ee787] hover:bg-[#30363d] transition-colors"
                    >
                      git add -A
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunTerminalCommand(
                          `git commit -m "feat(operator): save workspace updates on ${workspace.gitState.branch}"`
                        )
                      }
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#d2a8ff] hover:bg-[#30363d] transition-colors"
                    >
                      git commit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("git diff")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#ffa657] hover:bg-[#30363d] transition-colors"
                    >
                      git diff
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("git log --oneline -5")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#79c0ff] hover:bg-[#30363d] transition-colors"
                    >
                      git log -5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("git branch -a")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#ff7b72] hover:bg-[#30363d] transition-colors"
                    >
                      git branch -a
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("npm install")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#e3b341] hover:bg-[#30363d] transition-colors"
                    >
                      npm install
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunTerminalCommand("npm test")}
                      disabled={terminalRunning}
                      className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#56d364] hover:bg-[#30363d] transition-colors"
                    >
                      npm test
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalLogs([])}
                      className="flex items-center gap-1 rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#8b949e] hover:bg-[#30363d] hover:text-white transition-colors"
                      title="Clear console output"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                </div>

                {/* Terminal Output Stream */}
                <div className="max-h-64 overflow-y-auto space-y-2.5 font-mono text-xs pr-1">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2 text-[#8b949e]">
                        <span className="text-[#7ee787]">➜</span>
                        <span className="font-bold text-[#58a6ff]">{activeRepo.name}</span>
                        <span className="text-[#8b949e]">git:(</span>
                        <span className="text-[#ff7b72]">{workspace.gitState.branch}</span>
                        <span className="text-[#8b949e]">)</span>
                        <span className="font-semibold text-white">$ {log.command}</span>
                        <span className="ml-auto text-[10px] text-[#484f58]">{log.timestamp}</span>
                      </div>
                      {log.stdout && (
                        <pre className="whitespace-pre-wrap text-[#c9d1d9] pl-4 font-mono text-[11.5px] leading-relaxed">
                          {log.stdout}
                        </pre>
                      )}
                      {log.stderr && (
                        <pre
                          className={`whitespace-pre-wrap pl-4 font-mono text-[11.5px] leading-relaxed ${
                            log.exitCode !== 0 ? "text-[#f85149]" : "text-[#8b949e]"
                          }`}
                        >
                          {log.stderr}
                        </pre>
                      )}
                    </div>
                  ))}
                  <div ref={terminalBottomRef} />
                </div>

                {/* Terminal Input Prompt */}
                <div className="mt-3 flex items-center gap-2 rounded border border-[#30363d] bg-[#161b22] px-3 py-1.5 font-mono text-xs">
                  <span className="font-bold text-[#7ee787]">➜</span>
                  <span className="font-bold text-[#58a6ff]">{activeRepo.name}</span>
                  <span className="text-[#8b949e]">$</span>
                  <input
                    type="text"
                    placeholder="Type git status, git add -A, git commit -m '...', git diff, git branch..."
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={handleTerminalKeyDown}
                    disabled={terminalRunning}
                    className="flex-1 bg-transparent font-mono text-xs text-white placeholder-[#484f58] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRunTerminalCommand()}
                    disabled={terminalRunning || !terminalInput.trim()}
                    className="flex items-center gap-1 rounded bg-[#238636] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2ea043] disabled:opacity-40 transition-colors"
                  >
                    {terminalRunning ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <CornerDownLeft className="h-3 w-3" />
                    )}
                    <span>Run</span>
                  </button>
                </div>
              </div>
            </>
          )}
          </Card>
        )}
      </div>

      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect Existing Repository">
        <form onSubmit={handleSubmit(onConnect)} className="space-y-4">
          <Input label="Owner / Org" placeholder="CodynexNepal" error={errors.owner?.message} {...register("owner")} />
          <Input label="Repository Name" placeholder="HostelGhar" error={errors.name?.message} {...register("name")} />
          <Input label="Protected Default Branch" {...register("defaultBranch")} />
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" {...register("isWriteAuthorized")} />
            Allow task branches &amp; Pull Requests (direct push to default branch blocked)
          </label>
          <Button type="submit" variant="dark" loading={isSubmitting}>
            Connect Repository
          </Button>
        </form>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New GitHub Project">
        <form onSubmit={handleCreateRepo} className="space-y-4">
          <Input
            label="Repository Name"
            placeholder="hostel-analytics"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <Input
            label="Organization / Owner (Optional — defaults to token user)"
            placeholder="CodynexNepal"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={newPrivate}
              onChange={(e) => setNewPrivate(e.target.checked)}
            />
            Private Repository
          </label>
          <Button type="submit" variant="dark" loading={creatingRepo}>
            <GitPullRequest className="h-4 w-4" />
            Create Repo &amp; Clone Workspace
          </Button>
        </form>
      </Modal>

      <Modal open={newFileOpen} onClose={() => setNewFileOpen(false)} title="Create &amp; Add File to Workspace">
        <form onSubmit={handleCreateNewFile} className="space-y-4">
          <Input
            label="Relative File Path"
            placeholder="src/routes/product.routes.ts"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            required
          />
          <Textarea
            label="File Content"
            rows={10}
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            required
          />
          <Input
            label="Commit Message (Optional)"
            placeholder={`feat: add ${newFilePath.trim() || "file"}`}
            value={newFileCommitMsg}
            onChange={(e) => setNewFileCommitMsg(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setNewFileOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" loading={busyAction === "new-file"}>
              <GitCommit className="h-4 w-4" />
              Add File &amp; Commit to {branchName}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={commitModalOpen} onClose={() => setCommitModalOpen(false)} title={`Commit Changes on ${branchName}`}>
        <form onSubmit={handleWorkspaceCommit} className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Stage all modified and newly added files in <strong>{activeRepo?.owner}/{activeRepo?.name}</strong> and create a commit on branch <code>{branchName}</code>.
          </p>
          <Input
            label="Commit Message"
            placeholder="feat: implement product routes and auth middleware"
            value={workspaceCommitMsg}
            onChange={(e) => setWorkspaceCommitMsg(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCommitModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" loading={busyAction === "commit"}>
              <GitCommit className="h-4 w-4" />
              Stage &amp; Commit
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardShell>
  );
}
