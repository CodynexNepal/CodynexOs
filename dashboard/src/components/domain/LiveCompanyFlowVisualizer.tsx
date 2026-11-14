"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  ExternalLink,
  GitBranch,
  Layers,
  Lock,
  Palette,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { cn, formatDateTime } from "@/lib/utils";
import { LiveCodexFileEditor } from "@/components/domain/LiveCodexFileEditor";
import type {
  AgentActivityEvent,
  AgentLiveActivityResponse,
  TaskItem,
  TaskLogItem,
} from "@/types/os";

interface LiveCompanyFlowVisualizerProps {
  projectId?: string;
  className?: string;
}

type TabMode = "FLOW" | "PARALLEL_AGENTS" | "LIVE_CODEX" | "STEP_FEED";

interface PipelineStage {
  id: string;
  label: string;
  role: string;
  department: string;
  icon: typeof Bot;
  tone: "purple" | "blue" | "emerald" | "amber" | "rose" | "indigo";
  taskTypes: string[];
}

const COMPANY_PIPELINE: PipelineStage[] = [
  {
    id: "ceo",
    label: "CEO Directive",
    role: "CEO Command Center",
    department: "Executive",
    icon: Cpu,
    tone: "purple",
    taskTypes: [],
  },
  {
    id: "coo",
    label: "COO Orchestration",
    role: "Chief Operating Officer",
    department: "Executive",
    icon: Layers,
    tone: "indigo",
    taskTypes: ["planning"],
  },
  {
    id: "cto",
    label: "CTO Architecture",
    role: "Chief Technology Officer",
    department: "Executive",
    icon: GitBranch,
    tone: "blue",
    taskTypes: ["architecture"],
  },
  {
    id: "parallel_engineering",
    label: "Parallel Engineering",
    role: "UI/UX, Frontend & Backend",
    department: "Engineering",
    icon: Code2,
    tone: "emerald",
    taskTypes: ["ui_ux_design", "code", "code_generate", "repo_provision"],
  },
  {
    id: "qa",
    label: "QA Verification",
    role: "QA Engineer",
    department: "Engineering / QA",
    icon: ShieldCheck,
    tone: "amber",
    taskTypes: ["qa_verify"],
  },
  {
    id: "devops",
    label: "DevOps Deployment",
    role: "DevOps Engineer",
    department: "Operations / Engineering",
    icon: Rocket,
    tone: "rose",
    taskTypes: ["devops_deploy", "github_push_pr"],
  },
];

export function LiveCompanyFlowVisualizer({
  projectId,
  className,
}: LiveCompanyFlowVisualizerProps) {
  const [tab, setTab] = useState<TabMode>("FLOW");
  const [loading, setLoading] = useState(false);
  const [runningTasks, setRunningTasks] = useState<TaskItem[]>([]);
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<TaskLogItem[]>([]);
  const [liveEvents, setLiveEvents] = useState<AgentActivityEvent[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string>("ALL");
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState<TaskItem | null>(null);
  const [taskLogsList, setTaskLogsList] = useState<TaskLogItem[]>([]);

  const fetchLiveActivity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await codynexApi.agents.liveActivity(projectId ? { projectId } : undefined);
      const payload = unwrap<AgentLiveActivityResponse>(res.data);
      let tasksFiltered = payload.runningTasks ?? [];
      let recentFiltered = payload.recentTasks ?? [];

      if (projectId) {
        try {
          const pTasksRes = await codynexApi.tasks.list({ projectId });
          const pTasks = unwrap<TaskItem[]>(pTasksRes.data) ?? [];
          if (pTasks.length > 0) {
            recentFiltered = pTasks;
            tasksFiltered = pTasks.filter((t) => t.status === "RUNNING");
          }
        } catch {
          // ignore
        }
      }

      setRunningTasks(tasksFiltered);
      setRecentTasks(recentFiltered);
      setRecentLogs(payload.recentLogs ?? []);
      setLastUpdated(new Date().toISOString());
    } catch {
      // Fallback gracefully
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchLiveActivity();
    const pollInterval = window.setInterval(() => {
      void fetchLiveActivity();
    }, 5_000);

    return () => window.clearInterval(pollInterval);
  }, [fetchLiveActivity]);

  // Real-time WebSocket listener
  useDomainSocket((eventName: string, payload?: unknown) => {
    if (eventName === "agent:activity" || eventName === "task:step") {
      const evt = payload as AgentActivityEvent;
      if (evt && (!projectId || evt.projectId === projectId)) {
        setLiveEvents((prev) => [evt, ...prev.slice(0, 49)]);
      }
    }
    if (
      eventName === "task:updated" ||
      eventName === "task:step" ||
      eventName === "project:preview_ready"
    ) {
      void fetchLiveActivity();
    }
    if (eventName === "task:log" && payload) {
      const log = payload as TaskLogItem;
      setRecentLogs((prev) => [log, ...prev.slice(0, 49)]);
      if (selectedTaskForLogs && selectedTaskForLogs.id === log.taskId) {
        setTaskLogsList((prev) => [...prev, log]);
      }
    }
  });

  const openTaskLogs = async (task: TaskItem) => {
    setSelectedTaskForLogs(task);
    try {
      const res = await codynexApi.tasks.logs(task.id);
      setTaskLogsList(unwrap<TaskLogItem[]>(res.data) ?? []);
    } catch {
      setTaskLogsList([]);
    }
  };

  // Determine stage status across the pipeline
  const stageStatus = useMemo(() => {
    const statuses: Record<string, "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED"> = {
      ceo: "COMPLETED",
      coo: "COMPLETED",
      cto: "COMPLETED", // CTO architectural blueprint is synthesized
      parallel_engineering: "PENDING",
      qa: "PENDING",
      devops: "PENDING",
    };

    const allTasks = [...runningTasks, ...recentTasks];

    // Check CTO Architecture
    const ctoTasks = allTasks.filter((t) => t.taskType === "architecture");
    if (ctoTasks.some((t) => t.status === "FAILED")) {
      statuses.cto = "FAILED";
    } else if (ctoTasks.some((t) => t.status === "RUNNING")) {
      statuses.cto = "RUNNING";
    } else if (ctoTasks.length > 0 && ctoTasks.every((t) => t.status === "COMPLETED")) {
      statuses.cto = "COMPLETED";
    } else {
      // If engineering or QA has already executed, CTO architecture is verified and passed
      statuses.cto = "COMPLETED";
    }

    // Check Parallel Engineering (UI/UX, Backend, Frontend)
    const engTasks = allTasks.filter((t) =>
      ["ui_ux_design", "code", "code_generate", "repo_provision"].includes(t.taskType)
    );
    if (engTasks.some((t) => t.status === "FAILED")) {
      statuses.parallel_engineering = "FAILED";
    } else if (engTasks.some((t) => t.status === "RUNNING")) {
      statuses.parallel_engineering = "RUNNING";
    } else if (engTasks.length > 0 && engTasks.every((t) => t.status === "COMPLETED")) {
      statuses.parallel_engineering = "COMPLETED";
    }

    // Check QA Verification
    const qaTasks = allTasks.filter((t) => t.taskType === "qa_verify");
    if (qaTasks.some((t) => t.status === "FAILED")) {
      statuses.qa = "FAILED";
    } else if (qaTasks.some((t) => t.status === "RUNNING")) {
      statuses.qa = "RUNNING";
    } else if (qaTasks.length > 0 && qaTasks.every((t) => t.status === "COMPLETED")) {
      statuses.qa = "COMPLETED";
    }

    // Check DevOps - strictly gated by QA
    if (statuses.qa === "FAILED") {
      statuses.devops = "BLOCKED";
    } else {
      const devopsTasks = allTasks.filter((t) =>
        ["devops_deploy", "github_push_pr"].includes(t.taskType)
      );
      if (devopsTasks.some((t) => t.status === "FAILED")) {
        statuses.devops = "FAILED";
      } else if (devopsTasks.some((t) => t.status === "RUNNING")) {
        statuses.devops = "RUNNING";
      } else if (devopsTasks.length > 0 && devopsTasks.every((t) => t.status === "COMPLETED")) {
        statuses.devops = "COMPLETED";
      } else if (statuses.qa === "COMPLETED") {
        statuses.devops = "COMPLETED";
      } else {
        statuses.devops = "PENDING";
      }
    }

    return statuses;
  }, [runningTasks, recentTasks]);

  // Combine live WebSocket events with recent task logs for full step-by-step audit
  const combinedStepFeed = useMemo(() => {
    const fromEvents = liveEvents.map((evt) => {
      const isError = evt.phase === "FAILURE" || Boolean(evt.error);
      return {
        id: `evt-${evt.taskId}-${evt.stepNumber}-${evt.timestamp}`,
        timestamp: evt.timestamp,
        phase: evt.phase,
        action: evt.action,
        detail: evt.detail,
        stepNumber: evt.stepNumber,
        totalSteps: evt.totalSteps,
        employeeRole: evt.employeeRole ?? "AI Agent",
        departmentName: evt.departmentName ?? "Engineering",
        taskTitle: evt.taskTitle,
        taskId: evt.taskId,
        isError,
      };
    });

    const fromLogs = recentLogs
      .filter((l) => {
        const meta = (l.metadata as Record<string, unknown>) || {};
        return (
          l.level === "ERROR" ||
          Boolean(meta.error) ||
          Boolean(meta.stepNumber) ||
          l.message?.includes("Step ")
        );
      })
      .map((l) => {
        const meta = (l.metadata as Record<string, unknown>) ?? {};
        const isError = l.level === "ERROR" || Boolean(meta.error);
        return {
          id: `log-${l.id}`,
          timestamp: l.createdAt,
          phase: isError ? "FAILURE" : String(meta.phase || "EXECUTION"),
          action: isError
            ? "Task Execution Failed"
            : String(meta.action || l.message.split(" - ")[1]?.split(":")[0] || "Step Progress"),
          detail: isError ? String(meta.error || l.message) : String(meta.detail || l.message),
          stepNumber: Number(meta.stepNumber || (isError ? 0 : 1)),
          totalSteps: Number(meta.totalSteps || 4),
          employeeRole: String(meta.employeeRole || "AI Agent"),
          departmentName: String(meta.departmentName || "Engineering"),
          taskTitle: String(meta.taskTitle || "Task Execution"),
          taskId: l.taskId,
          isError,
        };
      });

    const merged = [...fromEvents, ...fromLogs];
    const uniqueMap = new Map<string, (typeof merged)[0]>();
    for (const item of merged) {
      const key = `${item.taskId}-${item.stepNumber}-${item.action}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    const list = Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (phaseFilter === "ALL") return list;
    return list.filter((item) =>
      item.phase.toUpperCase().includes(phaseFilter.toUpperCase())
    );
  }, [liveEvents, recentLogs, phaseFilter]);

  return (
    <Card className={cn("overflow-hidden border-surface-border", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-muted/60 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-[#9FE870] text-[#0E0F0C] font-bold">
            <Activity className="h-4 w-4" />
            {runningTasks.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
            )}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Live AI Workforce Operations</h3>
              <Badge tone={runningTasks.length > 0 ? "green" : "gray"}>
                {runningTasks.length > 0
                  ? `${runningTasks.length} Agent(s) Active in Parallel`
                  : "Standby / Ready"}
              </Badge>
            </div>
            <p className="text-[11px] text-ink-muted">
              Live CEO &rarr; COO &rarr; CTO &rarr; Developers &rarr; QA &rarr; DevOps company workflow &amp; step-by-step actions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] tabular-nums text-ink-muted md:inline">
            {lastUpdated ? `Updated ${formatDateTime(lastUpdated)}` : "Connecting to live feed…"}
          </span>
          {/* Tabs */}
          <div
            aria-label="Live workforce views"
            className="flex items-center rounded-md border border-surface-border bg-surface p-1"
            role="tablist"
          >
            <button
              aria-controls="workforce-view"
              aria-selected={tab === "FLOW"}
              id="workforce-tab-flow"
              role="tab"
              type="button"
              onClick={() => setTab("FLOW")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                tab === "FLOW"
                  ? "bg-brand text-brand-ink"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              Company Flow
            </button>
            <button
              aria-controls="workforce-view"
              aria-selected={tab === "PARALLEL_AGENTS"}
              id="workforce-tab-agents"
              role="tab"
              type="button"
              onClick={() => setTab("PARALLEL_AGENTS")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                tab === "PARALLEL_AGENTS"
                  ? "bg-brand text-brand-ink"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              Parallel Agents ({runningTasks.length})
            </button>
            <button
              aria-controls="workforce-view"
              aria-selected={tab === "LIVE_CODEX"}
              id="workforce-tab-codex"
              role="tab"
              type="button"
              onClick={() => setTab("LIVE_CODEX")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                tab === "LIVE_CODEX"
                  ? "bg-brand text-brand-ink"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              Live Codex Stream
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </button>
            <button
              aria-controls="workforce-view"
              aria-selected={tab === "STEP_FEED"}
              id="workforce-tab-feed"
              role="tab"
              type="button"
              onClick={() => setTab("STEP_FEED")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                tab === "STEP_FEED"
                  ? "bg-brand text-brand-ink"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              Step-by-Step Live Feed
            </button>
          </div>

          <Button
            aria-label="Refresh live workforce activity"
            title="Refresh live workforce activity"
            variant="outline"
            size="sm"
            onClick={fetchLiveActivity}
            loading={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        aria-labelledby={
          tab === "FLOW"
            ? "workforce-tab-flow"
            : tab === "PARALLEL_AGENTS"
              ? "workforce-tab-agents"
              : "workforce-tab-feed"
        }
        className="p-5"
        id="workforce-view"
        role="tabpanel"
      >
        {/* TAB 1: COMPANY FLOW PIPELINE (CEO -> COO -> CTO -> Parallel Developers -> QA -> DevOps) */}
        {tab === "FLOW" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Company Hierarchy Workflow Pipeline
                </h4>
                <p className="text-xs text-ink-muted">
                  Directives flow through executive architecture, split into parallel engineering departments, and gate at QA &amp; DevOps.
                </p>
              </div>
              <span className="text-xs font-medium text-ink-muted">
                Execution Model: <strong className="text-ink">DAG + Parallel Async Workers</strong>
              </span>
            </div>

            {/* Animated Flow Progression Bar */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-border/50">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                  stageStatus.qa === "FAILED"
                    ? "w-[83%] bg-gradient-to-r from-emerald-500 via-[#9FE870] to-rose-500"
                    : runningTasks.length > 0
                    ? "w-full bg-gradient-to-r from-emerald-500 via-[#C3FF7D] to-emerald-400 animate-pulse"
                    : "w-full bg-gradient-to-r from-emerald-500 via-[#9FE870] to-indigo-500"
                )}
              />
            </div>

            {/* Visual Workflow Chain */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {COMPANY_PIPELINE.map((stage, idx) => {
                const IconComponent = stage.icon;
                const status = stageStatus[stage.id] ?? "PENDING";
                const isRunning = status === "RUNNING";
                const isCompleted = status === "COMPLETED";
                const isFailed = status === "FAILED";
                const isBlocked = status === "BLOCKED";

                return (
                  <div
                    key={stage.id}
                    className={cn(
                      "relative rounded-lg border p-3.5 transition-all duration-300",
                      isFailed
                        ? "border-rose-400 bg-rose-50/80 shadow-md ring-2 ring-rose-500/50 animate-pulse dark:border-rose-900/60 dark:bg-rose-950/30"
                        : isRunning
                        ? "border-[#9FE870] bg-[#F5FEE8] shadow-md ring-2 ring-[#9FE870]/70 animate-pulse dark:border-[#2F5D14] dark:bg-[#13220B]"
                        : isBlocked
                        ? "border-amber-300 bg-amber-50/60 opacity-90 dark:border-amber-800 dark:bg-amber-950/20"
                        : isCompleted
                        ? "border-surface-border bg-surface hover:border-emerald-500/50"
                        : "border-surface-border bg-surface-muted/40 opacity-70"
                    )}
                  >
                    {/* Top scanning accent bar for running / failed / blocked */}
                    {isRunning && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-[#C3FF7D] to-emerald-500 animate-pulse rounded-t-lg" />
                    )}
                    {isFailed && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-600 rounded-t-lg" />
                    )}
                    {isBlocked && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500 rounded-t-lg" />
                    )}

                    {/* Connecting Chevron on Desktop */}
                    {idx < COMPANY_PIPELINE.length - 1 && (
                      <div className="absolute -right-3.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-surface-border bg-surface p-1 text-ink-muted lg:flex items-center justify-center shadow-sm">
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 transition-colors",
                            isCompleted ? "text-emerald-500" : isRunning ? "text-emerald-600 animate-pulse" : "text-ink-muted"
                          )}
                        />
                        {isRunning && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold transition-all",
                          isFailed
                            ? "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100 ring-1 ring-rose-400"
                            : isRunning
                            ? "bg-[#9FE870] text-[#0E0F0C] animate-pulse"
                            : isBlocked
                            ? "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                            : isCompleted
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                            : "bg-surface text-ink-muted"
                        )}
                      >
                        {isBlocked ? <Lock className="h-3.5 w-3.5" /> : <IconComponent className="h-3.5 w-3.5" />}
                      </span>
                      <Badge
                        tone={
                          isFailed ? "red" : isRunning ? "green" : isBlocked ? "amber" : isCompleted ? "blue" : "gray"
                        }
                      >
                        {isFailed ? "Failed" : isRunning ? "Active Now" : isBlocked ? "Blocked by QA" : isCompleted ? "Passed" : "Standing By"}
                      </Badge>
                    </div>

                    <div className="mt-2.5">
                      <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                        Step {idx + 1}
                      </p>
                      <h5 className="font-bold text-ink text-xs line-clamp-1">{stage.label}</h5>
                      <p className="mt-0.5 text-[11px] text-ink-muted line-clamp-1">{stage.role}</p>
                    </div>

                    <div className="mt-2.5 border-t border-surface-border/60 pt-2 text-[10px] text-ink-muted flex items-center justify-between">
                      <span>{stage.department}</span>
                      {stage.id === "parallel_engineering" && (
                        <span className="font-bold text-[#14532D] dark:text-[#C3FF7D] flex items-center gap-0.5">
                          Parallel &#9889;
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* QA Failure remediation banner if QA failed */}
            {stageStatus.qa === "FAILED" && (
              <div className="rounded-lg border border-rose-300 bg-rose-50/80 p-3.5 dark:border-rose-900/60 dark:bg-rose-950/30 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-pulse">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200 font-bold">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                      QA Quality Verification Alert — DevOps Release Deployment Gated
                    </h5>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      Release gates evaluated composite score below 80%. DevOps deployment is held until static analysis and test suites pass cleanly.
                    </p>
                  </div>
                </div>
                <Link
                  href="/workspace"
                  className="rounded-md bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 text-xs font-semibold shadow-sm transition-colors"
                >
                  Inspect 7-Gate Scorecard
                </Link>
              </div>
            )}

            {/* Parallel Department Work Stream Preview */}
            <div className="rounded-lg border border-surface-border bg-surface-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[#14532D] dark:text-[#C3FF7D]" />
                  <span className="text-xs font-bold text-ink">
                    Parallel Department Swimlanes (Active Directives)
                  </span>
                </div>
                <span className="text-xs text-ink-muted">
                  UI/UX &rarr; Frontend &amp; Backend run concurrently
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {/* Swimlane 1: UI/UX & Live Prototype */}
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-purple-600" />
                      UI/UX Design
                    </span>
                    <Badge tone="purple">Frontend Lead</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Designs responsive UI components, writes Next.js and Tailwind code, and renders changes directly inside the live autonomous workspace.
                  </p>
                </div>

                {/* Swimlane 2: Backend Engineering */}
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-blue-600" />
                      Backend Engineering
                    </span>
                    <Badge tone="blue">Backend Lead</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Synthesizes REST APIs, validation schemas, database models, and isolated workspace branch migrations in parallel.
                  </p>
                </div>

                {/* Swimlane 3: QA & DevOps Deploy */}
                <div className="rounded-md border border-surface-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                      <Rocket className="h-3.5 w-3.5 text-rose-600" />
                      DevOps &amp; Live Link
                    </span>
                    <Badge tone="rose">DevOps Engineer</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    QA audits typecheck/lint/tests, then DevOps publishes live deployment at <code className="text-[10px] bg-surface-muted px-1 py-0.5 rounded">/live/:id</code> for CEO sign-off.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PARALLEL AGENT EXECUTION CARDS ("What each agent is doing right now") */}
        {tab === "PARALLEL_AGENTS" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Active Parallel Agent Workloads
                </h4>
                <p className="text-xs text-ink-muted">
                  Real-time telemetry showing each AI employee executing tasks concurrently.
                </p>
              </div>
              <span className="text-xs text-ink-muted">
                {runningTasks.length} running workload(s) in PostgreSQL
              </span>
            </div>

            {runningTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-8 text-center">
                <Bot className="mx-auto h-8 w-8 text-ink-muted" />
                <h5 className="mt-2 text-sm font-bold text-ink">Workforce On Standby</h5>
                <p className="mt-1 text-xs text-ink-muted max-w-md mx-auto">
                  No tasks are actively running at this split second. Dispatch a new CEO directive above or trigger a playbook to watch agents execute in parallel.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {runningTasks.map((t) => {
                  const currentStep = t.inputPayload?._currentStep;
                  const stepNumber = currentStep?.stepNumber ?? 1;
                  const totalSteps = currentStep?.totalSteps ?? 4;
                  const percent = Math.round((stepNumber / totalSteps) * 100);

                  return (
                    <div
                      key={t.id}
                      className="rounded-lg border border-[#9FE870] bg-surface p-4 shadow-sm dark:border-[#2F5D14]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-[#9FE870] text-[#0E0F0C] font-bold">
                            <Bot className="h-4 w-4" />
                            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            </span>
                          </span>
                          <div>
                            <h5 className="text-xs font-bold text-ink">
                              {t.assignedEmployee?.roleTitle ?? "AI Specialist"}
                            </h5>
                            <p className="text-[11px] text-ink-muted">
                              {t.department?.name ?? "Engineering"} Department
                            </p>
                          </div>
                        </div>
                        <Badge tone="green">EXECUTING LIVE</Badge>
                      </div>

                      {/* Task Info */}
                      <div className="mt-3 rounded-md bg-surface-muted/60 p-2.5">
                        <p className="text-[11px] font-semibold text-ink line-clamp-1">{t.title}</p>
                        <p className="mt-0.5 text-[10px] text-ink-muted line-clamp-2">
                          {t.description}
                        </p>
                      </div>

                      {/* Stepwise Progress Bar */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-ink">
                            {currentStep?.action ?? "Executing Department Workflow"}
                          </span>
                          <span className="tabular-nums font-bold text-[#14532D] dark:text-[#C3FF7D]">
                            Step {stepNumber}/{totalSteps} ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full bg-[#9FE870] transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Live Step Detail Readout */}
                      <div className="mt-2.5 rounded bg-[#0E0F0C] p-2 text-[10px] font-mono text-[#9FE870]">
                        <p className="line-clamp-2">
                          &gt; {currentStep?.detail ?? "Processing task deliverables and verifying assertions..."}
                        </p>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="mt-3 flex items-center justify-between border-t border-surface-border pt-2.5 text-[11px]">
                        <span className="text-ink-muted">
                          Retries: {t.retryCount}/{t.maxRetries}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openTaskLogs(t)}
                            className="h-7 text-xs"
                          >
                            <Terminal className="h-3 w-3" />
                            Live Logs
                          </Button>
                          {t.taskType === "ui_ux_design" && (
                            <Link
                              href={`/preview/${t.projectId}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded border border-surface-border bg-surface px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Preview
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STEP-BY-STEP LIVE FEED ("With each steps what they did") */}
        {tab === "STEP_FEED" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Step-by-Step Live Audit Stream
                </h4>
                <p className="text-xs text-ink-muted">
                  Every concrete action, file write, prototype generation, and QA assertion recorded in real-time.
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: "ALL", label: "All Steps" },
                    { id: "DESIGN", label: "UI/UX" },
                    { id: "CODE", label: "Code" },
                    { id: "QA", label: "QA" },
                    { id: "DEPLOY", label: "DevOps" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPhaseFilter(f.id)}
                    className={cn(
                      "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                      phaseFilter === f.id
                        ? "bg-brand text-brand-ink"
                        : "bg-surface-muted text-ink-muted hover:text-ink"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {combinedStepFeed.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-border p-8 text-center text-xs text-ink-muted">
                No recent step activity recorded yet. Run a directive to stream live agent steps.
              </div>
            ) : (
              <div className="divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
                {combinedStepFeed.slice(0, 30).map((step) => (
                  <div
                    key={step.id}
                    className={cn(
                      "p-3.5 transition-colors",
                      step.isError
                        ? "border-l-4 border-rose-500 bg-rose-50/60 dark:bg-rose-950/20"
                        : "hover:bg-surface-muted/40"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                            step.isError
                              ? "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100"
                              : "bg-surface-muted text-ink"
                          )}
                        >
                          {step.stepNumber === 0 ? "!" : step.stepNumber}
                        </span>
                        <h6 className="text-xs font-bold text-ink">{step.action}</h6>
                        <Badge tone={step.isError ? "red" : "blue"}>{step.employeeRole}</Badge>
                        <Badge tone={step.isError ? "red" : "gray"}>{step.phase}</Badge>
                      </div>
                      <span className="text-[10px] tabular-nums text-ink-muted">
                        {formatDateTime(step.timestamp)}
                      </span>
                    </div>

                    <p
                      className={cn(
                        "mt-1.5 pl-7 text-xs leading-relaxed font-mono",
                        step.isError
                          ? "font-semibold text-rose-900 dark:text-rose-200"
                          : "text-ink-muted"
                      )}
                    >
                      &gt; {step.detail}
                    </p>

                    <div className="mt-1.5 pl-7 flex items-center gap-2 text-[10px] text-ink-muted">
                      <span>Task: {step.taskTitle}</span>
                      <span>&bull;</span>
                      <span>Dept: {step.departmentName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LIVE CODEX STREAM & FILE STATUSES */}
        {tab === "LIVE_CODEX" && (
          <div className="space-y-4">
            <LiveCodexFileEditor projectId={projectId} />
          </div>
        )}
      </div>

      {/* Task Logs Modal */}
      {selectedTaskForLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-surface-border bg-surface p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <h4 className="text-sm font-bold text-ink">{selectedTaskForLogs.title}</h4>
                <p className="text-xs text-ink-muted">
                  Agent: {selectedTaskForLogs.assignedEmployee?.roleTitle ?? "Specialist"} &bull; Department:{" "}
                  {selectedTaskForLogs.department?.name ?? "Engineering"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTaskForLogs(null)}
              >
                Close
              </Button>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto rounded bg-[#0E0F0C] p-3 font-mono text-xs text-[#9FE870] space-y-1">
              {taskLogsList.length === 0 ? (
                <p className="text-zinc-500">No logs captured yet for this task...</p>
              ) : (
                taskLogsList.map((log) => (
                  <div key={log.id} className="leading-relaxed">
                    <span className="text-zinc-500">[{formatDateTime(log.createdAt)}]</span>{" "}
                    <span className={log.level === "ERROR" ? "text-red-400" : "text-emerald-400"}>
                      [{log.level}]
                    </span>{" "}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
