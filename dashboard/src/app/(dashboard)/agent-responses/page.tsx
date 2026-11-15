"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  FileCode,
  FolderKanban,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi } from "@/lib/codynexOs";
import { cn, formatDateTime } from "@/lib/utils";

interface AgentActionStep {
  stepIndex: number;
  thought?: string;
  tool: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  status: "PENDING" | "EXECUTING" | "SUCCESS" | "FAILED";
  durationMs?: number;
  timestamp: string;
}

interface AgentSessionItem {
  sessionId: string;
  taskId: string;
  status: "IDLE" | "PLANNING" | "RUNNING" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  currentStep: number;
  maxSteps: number;
  steps: AgentActionStep[];
  startedAt: string;
  completedAt?: string;
  finalAnswer?: string;
  filesWritten?: string[];
  instruction?: string;
  roleTitle?: string;
  owner?: string;
  repoName?: string;
  effectiveProvider?: string;
  preferredModel?: string;
}

interface CompletedTaskItem {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  assignedEmployee?: { roleTitle?: string; slug?: string } | null;
  department?: { name?: string } | null;
  outputPayload?: Record<string, unknown> | null;
  verificationResult?: Record<string, unknown> | null;
  createdAt: string;
  completedAt?: string | null;
}

type FeedFilterType = "ALL" | "AUTONOMOUS" | "DEPARTMENT";

export default function AgentResponsesPage() {
  const [sessions, setSessions] = useState<AgentSessionItem[]>([]);
  const [departmentTasks, setDepartmentTasks] = useState<CompletedTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"REPORT" | "STEPS" | "FILES">("REPORT");

  const [searchQuery, setSearchQuery] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilterType>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch all sessions and completed tasks
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, tasksRes] = await Promise.all([
        codynexApi.autonomousAgent.listSessions().catch(() => ({ data: { data: [] } })),
        codynexApi.tasks.list({ status: "COMPLETED" }).catch(() => ({ data: { data: [] } })),
      ]);

      const loadedSessions = (sessionsRes.data?.data || []) as AgentSessionItem[];
      const loadedTasks = (tasksRes.data?.data || []) as CompletedTaskItem[];

      setSessions(loadedSessions);
      setDepartmentTasks(loadedTasks);

      // Auto-select latest session or task if none selected
      if (!selectedSessionId && !selectedTaskId) {
        if (loadedSessions.length > 0) {
          setSelectedSessionId(loadedSessions[0].sessionId);
        } else if (loadedTasks.length > 0) {
          setSelectedTaskId(loadedTasks[0].id);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load agent responses");
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, selectedTaskId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time WebSocket updates for live sessions
  useDomainSocket(
    useCallback((eventName: string, payload?: unknown) => {
      const data = payload as any;
      if (!data) return;

      if (eventName === "agent:lifecycle" && data.sessionId) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === data.sessionId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              status: data.status || updated[idx].status,
              finalAnswer: data.finalAnswer || updated[idx].finalAnswer,
              completedAt: data.completedAt || updated[idx].completedAt,
              filesWritten: data.filesWritten || updated[idx].filesWritten,
            };
            return updated;
          }
          return prev;
        });
      } else if (eventName === "agent:tool_completed" && data.sessionId) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === data.sessionId);
          if (idx >= 0) {
            const session = prev[idx];
            const steps = session.steps || [];
            const stepIndex = data.step || steps.length + 1;
            const newSteps: AgentActionStep[] = [
              ...steps.filter((st) => st.stepIndex !== stepIndex),
              {
                stepIndex,
                tool: data.tool || "tool",
                toolOutput: data.output,
                status: (data.status as any) || "SUCCESS",
                durationMs: data.durationMs,
                timestamp: data.timestamp || new Date().toISOString(),
              },
            ].sort((a, b) => a.stepIndex - b.stepIndex);

            const updated = [...prev];
            updated[idx] = { ...session, steps: newSteps, currentStep: stepIndex };
            return updated;
          }
          return prev;
        });
      }
    }, [])
  );

  // Active selected item resolution
  const activeSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const activeTask = useMemo(
    () => departmentTasks.find((t) => t.id === selectedTaskId) || null,
    [departmentTasks, selectedTaskId]
  );

  // Filtered lists
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (feedFilter === "DEPARTMENT") return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inst = (s.instruction || "").toLowerCase();
        const ans = (s.finalAnswer || "").toLowerCase();
        const role = (s.roleTitle || "").toLowerCase();
        return inst.includes(q) || ans.includes(q) || role.includes(q);
      }
      return true;
    });
  }, [sessions, feedFilter, statusFilter, searchQuery]);

  const filteredTasks = useMemo(() => {
    return departmentTasks.filter((t) => {
      if (feedFilter === "AUTONOMOUS") return false;
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (t.title || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        return title.includes(q) || desc.includes(q);
      }
      return true;
    });
  }, [departmentTasks, feedFilter, statusFilter, searchQuery]);

  const handleCopyReport = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeSession) return;

    setIsReplying(true);
    setReplySuccess(null);
    try {
      await codynexApi.autonomousAgent.reply(activeSession.sessionId, replyText.trim(), 15);
      setReplyText("");
      setReplySuccess("Follow-up instruction delivered! The AI Agent has resumed execution.");
      setTimeout(() => setReplySuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Failed to submit follow-up instruction");
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <DashboardShell
      title="AI Agent Responses & Deliverables"
      subtitle="Executive intelligence reports, code modifications, verified outputs, and full execution trails"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {/* Top Control Bar: Filters, Search & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-surface-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {/* Feed Filter Buttons */}
            <div className="flex rounded-lg border border-surface-border bg-surface-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFeedFilter("ALL")}
                className={cn(
                  "px-3 py-1.5 rounded-md font-semibold transition-colors",
                  feedFilter === "ALL" ? "bg-brand text-brand-ink shadow-sm" : "text-ink-muted hover:text-ink"
                )}
              >
                All Responses ({sessions.length + departmentTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("AUTONOMOUS")}
                className={cn(
                  "px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5",
                  feedFilter === "AUTONOMOUS" ? "bg-brand text-brand-ink shadow-sm" : "text-ink-muted hover:text-ink"
                )}
              >
                <Cpu className="h-3.5 w-3.5" />
                Autonomous Runs ({sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter("DEPARTMENT")}
                className={cn(
                  "px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5",
                  feedFilter === "DEPARTMENT" ? "bg-brand text-brand-ink shadow-sm" : "text-ink-muted hover:text-ink"
                )}
              >
                <Bot className="h-3.5 w-3.5" />
                Department Tasks ({departmentTasks.length})
              </button>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-surface-border bg-surface px-2.5 text-xs text-ink focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="RUNNING">Running / Active</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-ink-muted" />
              <input
                type="text"
                placeholder="Search instructions or reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-56 pl-8 pr-3 rounded-lg border border-surface-border bg-surface text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-brand"
              />
            </div>

            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Master-Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[650px]">
          {/* Left Column: Response Feed List */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-2.5 max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
            {loading && sessions.length === 0 && departmentTasks.length === 0 ? (
              <TableSkeleton rows={6} cols={1} />
            ) : filteredSessions.length === 0 && filteredTasks.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No agent responses found"
                description="Responses generated by autonomous runs or completed department tasks will appear here."
              />
            ) : (
              <>
                {/* Autonomous Agent Sessions */}
                {filteredSessions.map((session) => {
                  const isSelected = selectedSessionId === session.sessionId;
                  return (
                    <div
                      key={session.sessionId}
                      onClick={() => {
                        setSelectedSessionId(session.sessionId);
                        setSelectedTaskId(null);
                        setActiveTab("REPORT");
                      }}
                      className={cn(
                        "p-3.5 rounded-xl border transition-all cursor-pointer text-left select-none",
                        isSelected
                          ? "border-blue-500/80 bg-blue-500/10 shadow-md ring-1 ring-blue-500/30"
                          : "border-surface-border bg-surface hover:bg-surface-muted hover:border-surface-border/80"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink truncate">
                          <Cpu className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{session.roleTitle || "Autonomous AI Engineer"}</span>
                        </span>
                        <Badge
                          tone={
                            session.status === "COMPLETED"
                              ? "green"
                              : session.status === "RUNNING"
                              ? "blue"
                              : session.status === "FAILED"
                              ? "red"
                              : "amber"
                          }
                        >
                          {session.status}
                        </Badge>
                      </div>

                      <p className="text-xs font-medium text-ink line-clamp-2 leading-relaxed">
                        {session.instruction || "Workspace inspection and health review."}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-ink-muted mt-2.5 pt-2 border-t border-surface-border/60">
                        <span className="font-mono">
                          {session.repoName ? `Repo: ${session.repoName}` : `Session: ${session.sessionId.slice(0, 10)}`}
                        </span>
                        <span className="tabular-nums">
                          {session.steps?.length || session.currentStep} steps · {formatDateTime(session.startedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Department Tasks */}
                {filteredTasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setSelectedSessionId(null);
                        setActiveTab("REPORT");
                      }}
                      className={cn(
                        "p-3.5 rounded-xl border transition-all cursor-pointer text-left select-none",
                        isSelected
                          ? "border-emerald-500/80 bg-emerald-500/10 shadow-md ring-1 ring-emerald-500/30"
                          : "border-surface-border bg-surface hover:bg-surface-muted hover:border-surface-border/80"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink truncate">
                          <Bot className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{task.assignedEmployee?.roleTitle || "Department Agent"}</span>
                        </span>
                        <Badge tone="green">COMPLETED</Badge>
                      </div>

                      <p className="text-xs font-medium text-ink line-clamp-2 leading-relaxed">
                        {task.title}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-ink-muted mt-2.5 pt-2 border-t border-surface-border/60">
                        <span className="font-mono">{task.department?.name || "Engineering"}</span>
                        <span className="tabular-nums">{formatDateTime(task.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Right Column: Detailed AI Response & Execution Trail */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col rounded-2xl border border-surface-border bg-surface shadow-sm overflow-hidden">
            {activeSession ? (
              <div className="flex flex-col h-full">
                {/* Header Section */}
                <div className="p-5 border-b border-surface-border bg-surface-muted/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-ink">
                          {activeSession.roleTitle || "Autonomous AI Engineer"}
                        </h2>
                        <Badge
                          tone={
                            activeSession.status === "COMPLETED"
                              ? "green"
                              : activeSession.status === "RUNNING"
                              ? "blue"
                              : activeSession.status === "FAILED"
                              ? "red"
                              : "amber"
                          }
                        >
                          {activeSession.status}
                        </Badge>
                        {activeSession.effectiveProvider && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            {activeSession.effectiveProvider.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-1">
                        Task Instruction: &ldquo;{activeSession.instruction}&rdquo;
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyReport(activeSession.finalAnswer || activeSession.instruction || "")}
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copied ? "Copied!" : "Copy Report"}</span>
                      </Button>
                      <Link href="/workspace">
                        <Button variant="primary" size="sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open in Workspace</span>
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted mt-4 pt-3 border-t border-surface-border">
                    <span className="flex items-center gap-1 font-mono">
                      <FolderKanban className="h-3.5 w-3.5 text-ink" />
                      Workspace: {activeSession.owner || "Codynex"}/{activeSession.repoName || "HostelGhar"}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Wrench className="h-3.5 w-3.5 text-ink" />
                      Steps: {activeSession.steps?.length || activeSession.currentStep} of {activeSession.maxSteps}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <FileCode className="h-3.5 w-3.5 text-ink" />
                      Files Written: {activeSession.filesWritten?.length || 0}
                    </span>
                  </div>

                  {/* View Tabs */}
                  <div className="flex gap-2 mt-4 pt-2 border-t border-surface-border">
                    <button
                      onClick={() => setActiveTab("REPORT")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                        activeTab === "REPORT"
                          ? "bg-brand text-brand-ink shadow-sm"
                          : "text-ink-muted hover:text-ink hover:bg-surface-muted"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Executive Deliverables Report
                    </button>
                    <button
                      onClick={() => setActiveTab("STEPS")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                        activeTab === "STEPS"
                          ? "bg-brand text-brand-ink shadow-sm"
                          : "text-ink-muted hover:text-ink hover:bg-surface-muted"
                      )}
                    >
                      <Activity className="h-3.5 w-3.5" />
                      Action &amp; Tool Steps ({activeSession.steps?.length || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab("FILES")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5",
                        activeTab === "FILES"
                          ? "bg-brand text-brand-ink shadow-sm"
                          : "text-ink-muted hover:text-ink hover:bg-surface-muted"
                      )}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Files Modified ({activeSession.filesWritten?.length || 0})
                    </button>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-5">
                  {activeTab === "REPORT" && (
                    <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed">
                      {activeSession.finalAnswer ? (
                        <div className="whitespace-pre-wrap font-sans text-ink bg-surface-muted/30 p-4 rounded-xl border border-surface-border">
                          {activeSession.finalAnswer}
                        </div>
                      ) : activeSession.status === "RUNNING" ? (
                        <div className="p-8 text-center text-ink-muted space-y-2">
                          <Activity className="h-8 w-8 text-blue-500 animate-pulse mx-auto" />
                          <p className="font-semibold text-sm text-ink">AI Agent is actively reasoning and executing tools...</p>
                          <p className="text-xs">Step {activeSession.currentStep} of {activeSession.maxSteps} in progress. Final deliverables report will synthesize upon completion.</p>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-ink-muted">
                          No deliverables report recorded for this session.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "STEPS" && (
                    <div className="space-y-3 font-mono text-xs">
                      {(!activeSession.steps || activeSession.steps.length === 0) ? (
                        <div className="p-6 text-center text-ink-muted font-sans">
                          No tool steps recorded for this session.
                        </div>
                      ) : (
                        activeSession.steps.map((st, i) => (
                          <div
                            key={i}
                            className="p-3.5 rounded-xl border border-surface-border bg-surface-muted/40 space-y-2"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-2 font-bold text-ink">
                                <span className="h-5 w-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-[10px]">
                                  {st.stepIndex}
                                </span>
                                Tool: [{st.tool}]
                              </span>
                              <Badge tone={st.status === "SUCCESS" ? "green" : "red"}>{st.status}</Badge>
                            </div>

                            {st.thought && (
                              <p className="text-xs font-sans text-ink italic bg-surface/60 p-2 rounded-lg border border-surface-border/50">
                                Thought: &ldquo;{st.thought}&rdquo;
                              </p>
                            )}

                            {st.toolOutput != null && (
                              <pre className="p-2.5 rounded-lg bg-black/60 text-emerald-400 overflow-x-auto text-[11px] max-h-48 leading-tight">
                                {typeof st.toolOutput === "string" ? st.toolOutput : JSON.stringify(st.toolOutput, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "FILES" && (
                    <div className="space-y-2">
                      {(!activeSession.filesWritten || activeSession.filesWritten.length === 0) ? (
                        <div className="p-6 text-center text-ink-muted">
                          Zero files modified during this session.
                        </div>
                      ) : (
                        activeSession.filesWritten.map((file, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 rounded-xl border border-surface-border bg-surface-muted/30 font-mono text-xs"
                          >
                            <span className="flex items-center gap-2 text-ink font-semibold">
                              <FileCode className="h-4 w-4 text-blue-500" />
                              {file}
                            </span>
                            <span className="text-[11px] text-ink-muted">Saved in Workspace</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Follow-up Reply Input */}
                <div className="p-4 border-t border-surface-border bg-surface-muted/30">
                  {replySuccess && (
                    <div className="mb-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{replySuccess}</span>
                    </div>
                  )}
                  <form onSubmit={handleReplySubmit} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Direct follow-up instructions to ${activeSession.roleTitle || "Agent"}...`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={isReplying}
                      className="flex-1 px-3.5 py-2 rounded-xl border border-surface-border bg-surface text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-brand"
                    />
                    <Button type="submit" variant="primary" size="sm" loading={isReplying} disabled={!replyText.trim()}>
                      <Send className="h-3.5 w-3.5" />
                      <span>Send Instruction</span>
                    </Button>
                  </form>
                </div>
              </div>
            ) : activeTask ? (
              <div className="flex flex-col h-full">
                {/* Department Task Reader */}
                <div className="p-5 border-b border-surface-border bg-surface-muted/50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-ink">{activeTask.title}</h2>
                        <Badge tone="green">COMPLETED</Badge>
                      </div>
                      <p className="text-xs text-ink-muted mt-1">{activeTask.description}</p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopyReport(
                          JSON.stringify(activeTask.outputPayload || activeTask.description, null, 2)
                        )
                      }
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied ? "Copied!" : "Copy Report"}</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-ink-muted mt-3 pt-3 border-t border-surface-border">
                    <span>Department: {activeTask.department?.name || "Engineering"}</span>
                    <span>Role: {activeTask.assignedEmployee?.roleTitle || "Specialist Agent"}</span>
                    <span>Completed: {formatDateTime(activeTask.completedAt || activeTask.createdAt)}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
                    Deliverable Payload &amp; Report
                  </h3>
                  <pre className="p-4 rounded-xl bg-surface-muted/40 border border-surface-border text-ink font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {activeTask.outputPayload
                      ? JSON.stringify(activeTask.outputPayload, null, 2)
                      : "Task finished successfully with zero manual intervention required."}
                  </pre>

                  {activeTask.verificationResult && (
                    <div className="mt-4 pt-4 border-t border-surface-border">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
                        Verification Sign-off
                      </h3>
                      <pre className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 font-mono text-xs overflow-x-auto">
                        {JSON.stringify(activeTask.verificationResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-12 text-center text-ink-muted">
                <div>
                  <Bot className="h-10 w-10 text-ink-muted mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Select an AI agent response on the left to inspect its deliverables.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
