"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Brain,
  Check,
  Clock,
  Code2,
  Copy,
  CornerDownLeft,
  Cpu,
  FileCode2,
  Globe,
  History,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal as TerminalIcon,
  Wrench,
} from "lucide-react";
import { LiveBrowserViewport } from "@/components/domain/LiveBrowserViewport";
import { LiveInteractiveTerminal } from "@/components/domain/LiveInteractiveTerminal";
import { LiveCodexFileEditor } from "@/components/domain/LiveCodexFileEditor";
import { DeliveryScorecard } from "@/components/domain/DeliveryScorecard";
import { NepaliVoiceIntelligenceConsole } from "@/components/domain/NepaliVoiceIntelligenceConsole";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";

export interface AutonomousComputerConsoleProps {
  initialSessionId?: string;
  repoId?: string;
  className?: string;
}

type WorkspaceViewMode = "SPLIT" | "BROWSER" | "CODE" | "TERMINAL" | "FEED" | "SCORECARD" | "VOICE";

interface AgentStepLog {
  step: number;
  thought?: string;
  tool?: string;
  output?: unknown;
  status: "EXECUTING" | "SUCCESS" | "FAILED";
  timestamp: string;
}

function highlightVsCodeSyntax(line: string) {
  if (/^\s*\/\//.test(line)) {
    return <span className="text-[#6a9955] italic">{line}</span>;
  }

  const tokens: React.ReactNode[] = [];
  const regex = /("[^"]*"|'[^']*'|`[^`]*`|\b(?:import|export|from|const|let|var|function|return|interface|type|class|if|else|switch|case|default|async|await|extends|implements|new|typeof|void|as)\b|\b(?:React|FC|useState|useCallback|useEffect|useMemo|useRef|string|number|boolean|any|Record|Array|Promise|HTMLElement|MouseEvent)\b|<\/?[a-zA-Z0-9_-]+|\b\d+\b|\b(?:className|onClick|onKeyDown|role|aria-label|tabIndex|viewBox|stroke|strokeWidth|fill|strokeLinecap)\b|[^"'\s\w<>]+|\s+|\w+)/g;

  let match;
  let idx = 0;
  while ((match = regex.exec(line)) !== null) {
    const text = match[0];
    const key = `${idx++}-${text}`;

    if (/^["'`]/.test(text)) {
      tokens.push(<span key={key} className="text-[#ce9178]">{text}</span>);
    } else if (/^(import|export|from|const|let|var|function|return|interface|type|class|if|else|switch|case|default|async|await|extends|implements|new|typeof|void|as)$/.test(text)) {
      tokens.push(<span key={key} className="text-[#569cd6] font-semibold">{text}</span>);
    } else if (/^(React|FC|useState|useCallback|useEffect|useMemo|useRef|string|number|boolean|any|Record|Array|Promise|HTMLElement|MouseEvent)$/.test(text)) {
      tokens.push(<span key={key} className="text-[#4ec9b0]">{text}</span>);
    } else if (/^<\/?[a-zA-Z0-9_-]+/.test(text)) {
      tokens.push(<span key={key} className="text-[#4fc1ff]">{text}</span>);
    } else if (/^\d+$/.test(text)) {
      tokens.push(<span key={key} className="text-[#b5cea8]">{text}</span>);
    } else if (/^(className|onClick|onKeyDown|role|aria-label|tabIndex|viewBox|stroke|strokeWidth|fill|strokeLinecap)$/.test(text)) {
      tokens.push(<span key={key} className="text-[#9cdcfe]">{text}</span>);
    } else {
      tokens.push(<span key={key} className="text-[#d4d4d4]">{text}</span>);
    }
  }

  return tokens.length > 0 ? tokens : line;
}

function VsCodeSnippetViewer({ filePath, content }: { filePath: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const lines = (content || "").split("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] shadow-xl overflow-hidden font-mono text-xs">
      {/* VS Code Tab Header */}
      <div className="flex items-center justify-between border-b border-[#2d2d2d] bg-[#252526] px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="h-3.5 w-3.5 text-[#388bfd] shrink-0" />
          <span className="font-semibold text-[#cccccc] truncate">{filePath}</span>
          <span className="rounded bg-[#333333] px-1.5 py-0.5 text-[10px] text-[#858585] shrink-0">
            {lines.length} lines
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded bg-[#333333] hover:bg-[#444444] px-2 py-0.5 text-[10px] text-[#cccccc] transition-colors shrink-0"
        >
          {copied ? <Check className="h-3 w-3 text-[#7ee787]" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Editor Body */}
      <div className="max-h-[360px] overflow-auto p-2.5 selection:bg-[#264f78] leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="hover:bg-[#2a2d2e]/80">
                <td className="w-9 select-none pr-3 text-right text-[10px] text-[#858585] align-top">
                  {i + 1}
                </td>
                <td className="whitespace-pre overflow-x-auto text-[11px] text-[#d4d4d4]">
                  {highlightVsCodeSyntax(l)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructuredToolOutput({ output }: { output: unknown }) {
  if (output === undefined || output === null) return null;

  let parsedObj: { path?: string; content?: string } | null = null;
  if (typeof output === "object" && output !== null) {
    parsedObj = output as { path?: string; content?: string };
  } else if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"content"') && trimmed.includes('"path"')) {
      try {
        parsedObj = JSON.parse(trimmed);
      } catch {
        // fallback
      }
    }
  }

  if (parsedObj && typeof parsedObj.path === "string" && typeof parsedObj.content === "string") {
    return <VsCodeSnippetViewer filePath={parsedObj.path} content={parsedObj.content} />;
  }

  return (
    <div className="rounded bg-[#0d1117] p-2 text-[10px] text-[#8b949e] overflow-x-auto">
      <span className="text-white font-bold">Result: </span>
      {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
    </div>
  );
}

function getToolBadge(toolName?: string) {
  const name = toolName || "unknown";
  if (name.includes("browser")) {
    return {
      label: `tool: ${name}`,
      icon: Globe,
      className: "bg-sky-500/20 text-sky-300 border-sky-400/40",
      toneColor: "#38bdf8",
    };
  }
  if (name.includes("terminal") || name.includes("command") || name.includes("shell") || name.includes("powershell")) {
    return {
      label: `tool: ${name}`,
      icon: TerminalIcon,
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
      toneColor: "#34d399",
    };
  }
  if (name.includes("file") || name.includes("dir") || name.includes("code")) {
    return {
      label: `tool: ${name}`,
      icon: FileCode2,
      className: "bg-purple-500/20 text-purple-300 border-purple-400/40",
      toneColor: "#c084fc",
    };
  }
  if (name.includes("complete") || name.includes("done")) {
    return {
      label: `tool: ${name}`,
      icon: Check,
      className: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      toneColor: "#fbbf24",
    };
  }
  return {
    label: `tool: ${name}`,
    icon: Wrench,
    className: "bg-indigo-500/20 text-indigo-300 border-indigo-400/40",
    toneColor: "#818cf8",
  };
}

function formatStepTime(timestamp?: string) {
  if (!timestamp) return new Date().toLocaleTimeString();
  if (timestamp.includes("T")) {
    return timestamp.slice(11, 19);
  }
  return timestamp;
}

function GeminiLiveActivityIndicator({
  log,
  currentStep,
  maxSteps,
  agentStatus,
}: {
  log?: AgentStepLog;
  currentStep: number;
  maxSteps: number;
  agentStatus: string;
}) {
  const isExecuting = agentStatus === "RUNNING" || agentStatus === "PLANNING";
  const toolInfo = getToolBadge(log?.tool);
  const ToolIcon = toolInfo.icon;
  const timeStr = formatStepTime(log?.timestamp);
  const stepNum = log?.step || currentStep || 1;

  return (
    <div className="relative overflow-hidden rounded-xl border border-purple-500/40 bg-[#0d1117] p-4 shadow-2xl transition-all duration-300 ring-1 ring-purple-500/20">
      {/* Top Gemini Shimmer Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#161b22] overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500",
            isExecuting
              ? "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-pulse w-full"
              : "bg-gradient-to-r from-emerald-500 via-teal-400 to-[#9FE870] w-full"
          )}
        />
      </div>

      {/* Main Header / Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d]/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/30 via-purple-600/30 to-pink-600/30 border border-purple-400/40 text-purple-300 shadow-md">
            <Sparkles className={cn("h-4 w-4 text-purple-300", isExecuting && "animate-spin")} />
            {isExecuting && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-300 to-pink-400">
                Gemini Autonomous Live Activity
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold uppercase border",
                  isExecuting
                    ? "bg-purple-500/20 text-purple-300 border-purple-400/40 animate-pulse"
                    : agentStatus === "PAUSED"
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isExecuting ? "bg-purple-400 animate-ping" : "bg-emerald-400"
                  )}
                />
                {isExecuting ? "Active Thinking & Executing" : agentStatus}
              </span>
            </div>
            <p className="text-[11px] text-[#8b949e]">
              Continuous reasoning stream · Devin Engine 2.0
            </p>
          </div>
        </div>

        {/* Step Counter Badge */}
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-1 text-xs font-mono font-bold text-[#c9d1d9]">
            Step <span className="text-white font-extrabold">{stepNum}</span> / {maxSteps}
          </span>
        </div>
      </div>

      {/* Colorful Activity Shower Line */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-xs font-mono">
        {/* Step Badge */}
        <span className="flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 px-2.5 py-1 font-bold text-blue-300 shadow-sm">
          <span>Step {stepNum}</span>
        </span>

        {/* Tool Badge */}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-bold shadow-sm transition-colors",
            toolInfo.className
          )}
        >
          <ToolIcon className="h-3.5 w-3.5" />
          <span>{toolInfo.label}</span>
        </span>

        {/* Timestamp */}
        <span className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22] px-2 py-1 text-[11px] text-[#8b949e]">
          <Clock className="h-3 w-3 text-[#58a6ff]" />
          <span>{timeStr}</span>
        </span>

        {/* Status Pill */}
        {log && (
          <span
            className={cn(
              "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border",
              log.status === "EXECUTING"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-300 animate-pulse"
                : log.status === "FAILED"
                ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
            )}
          >
            {log.status === "EXECUTING" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />}
            {log.status === "SUCCESS" && <Check className="h-3 w-3" />}
            {log.status}
          </span>
        )}
      </div>

      {/* Gemini Thought Box */}
      <div className="mt-3 rounded-lg border-l-4 border-l-purple-500 border border-[#30363d] bg-[#010409]/90 p-3.5 shadow-inner space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-sky-300">
              Thought:
            </span>
          </div>
          {isExecuting && (
            <span className="flex items-center gap-1 text-[10px] text-purple-400 font-mono">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping" />
              Streaming tokens
            </span>
          )}
        </div>
        <p className="text-xs font-sans text-[#e6edf3] leading-relaxed font-normal whitespace-pre-wrap">
          {log?.thought || "Analyzing prompt instruction, evaluating requirements, and planning next step..."}
        </p>

        {/* Output snippet preview if available */}
        {log?.output !== undefined && log?.output !== null && (
          <div className="mt-2.5 border-t border-[#21262d] pt-2">
            <StructuredToolOutput output={log.output} />
          </div>
        )}
      </div>
    </div>
  );
}

function AgentStepCard({ log }: { log: AgentStepLog }) {
  const toolInfo = getToolBadge(log.tool);
  const ToolIcon = toolInfo.icon;
  const timeStr = formatStepTime(log.timestamp);

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3.5 space-y-2.5 transition-all hover:border-[#58a6ff]/40 shadow-sm">
      {/* Top Activity Shower Bar: Step 1 | tool: browser_navigate | 18:53:24 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Step Pill */}
          <span className="rounded-md border border-blue-400/40 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-300">
            Step {log.step}
          </span>

          {/* Tool Badge */}
          <span
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold",
              toolInfo.className
            )}
          >
            <ToolIcon className="h-3 w-3" />
            <span>{toolInfo.label}</span>
          </span>

          {/* Timestamp */}
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#8b949e]">
            <Clock className="h-3 w-3 text-[#58a6ff]" />
            <span>{timeStr}</span>
          </span>
        </div>

        {/* Status */}
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold uppercase border",
            log.status === "EXECUTING"
              ? "border-amber-400/40 bg-amber-500/10 text-amber-300 animate-pulse"
              : log.status === "FAILED"
              ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
          )}
        >
          {log.status === "EXECUTING" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />}
          {log.status === "SUCCESS" && <Check className="h-3 w-3" />}
          {log.status}
        </span>
      </div>

      {/* Thought Box */}
      {log.thought && (
        <div className="rounded-lg border-l-2 border-l-purple-400 border border-[#30363d]/60 bg-[#0d1117] p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-sky-300">
            <Brain className="h-3 w-3 text-purple-400" />
            <span>Thought:</span>
          </div>
          <p className="font-sans text-xs text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
            {log.thought}
          </p>
        </div>
      )}

      {/* Result Output */}
      {log.output !== undefined && log.output !== null && (
        <div className="mt-1">
          <StructuredToolOutput output={log.output} />
        </div>
      )}
    </div>
  );
}

interface RepoOption {
  id: string;
  owner: string;
  name: string;
  defaultBranch?: string;
}

export function AutonomousComputerConsole({
  initialSessionId = "codynex_main_session",
  repoId: propRepoId,
  className,
}: AutonomousComputerConsoleProps) {
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("codynex_active_session_id");
      if (stored) return stored;
    }
    return initialSessionId;
  });
  const [sessionList, setSessionList] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("SPLIT");
  const [instruction, setInstruction] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("codynex_workspace_draft_prompt") || "";
    }
    return "";
  });
  const [agentStatus, setAgentStatus] = useState<
    "IDLE" | "PLANNING" | "RUNNING" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED"
  >("IDLE");
  const [currentStep, setCurrentStep] = useState(0);
  const [maxSteps, setMaxSteps] = useState(30);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [activeEngine, setActiveEngine] = useState<string | null>(null);
  const [stepLogs, setStepLogs] = useState<AgentStepLog[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finalReport, setFinalReport] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [selectedAgentRole, setSelectedAgentRole] = useState(
    "Autonomous Software & Computer Engineer"
  );
  const [selectedProvider, setSelectedProvider] = useState("");

  // Connected Repositories
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(propRepoId || "");
  const selectedRepo = repos.find((r) => r.id === selectedRepoId) || repos[0];

  // Keep localStorage synced with current active sessionId
  useEffect(() => {
    if (typeof window !== "undefined" && sessionId) {
      localStorage.setItem("codynex_active_session_id", sessionId);
    }
  }, [sessionId]);

  // Load existing session history list
  const refreshSessionList = useCallback(async () => {
    try {
      const res = await codynexApi.autonomousAgent.listSessions();
      if (Array.isArray(res.data?.data)) {
        setSessionList(res.data.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshSessionList();
  }, [refreshSessionList]);

  useEffect(() => {
    const loadRepos = async () => {
      try {
        const res = await codynexApi.github.repos();
        const list = (res.data?.data || []) as RepoOption[];
        setRepos(list);
        if (!selectedRepoId && list.length > 0) {
          const match =
            list.find((r) => r.name.toLowerCase().includes("aliza") || r.name.toLowerCase().includes("hostel")) ||
            list[0];
          setSelectedRepoId(match.id);
        }
      } catch {
        // ignore
      }
    };
    void loadRepos();
  }, [selectedRepoId]);

  // Restore active backend session if user refreshed or returned
  const fetchExistingSession = useCallback(async () => {
    try {
      let resolvedId = sessionId;
      let res = await codynexApi.autonomousAgent.getSession(resolvedId);

      // If requested session has no data yet, check session list to pick the active or most recent session
      if (!res.data?.data) {
        const listRes = await codynexApi.autonomousAgent.listSessions();
        const list = listRes.data?.data;
        if (Array.isArray(list) && list.length > 0) {
          const activeOrRecent =
            list.find((s: any) => s.status === "RUNNING" || s.status === "PLANNING") || list[0];
          if (activeOrRecent?.sessionId) {
            resolvedId = activeOrRecent.sessionId;
            setSessionId(resolvedId);
            if (typeof window !== "undefined") {
              localStorage.setItem("codynex_active_session_id", resolvedId);
            }
            res = await codynexApi.autonomousAgent.getSession(resolvedId);
          }
        }
      }

      if (res.data?.data) {
        const s = res.data.data as Record<string, unknown>;
        if (s.status && typeof s.status === "string") {
          setAgentStatus(
            s.status as
              | "IDLE"
              | "PLANNING"
              | "RUNNING"
              | "WAITING"
              | "PAUSED"
              | "COMPLETED"
              | "FAILED"
              | "CANCELLED"
          );
        }
        if (typeof s.currentStep === "number") setCurrentStep(s.currentStep);
        if (typeof s.maxSteps === "number") setMaxSteps(s.maxSteps);
        if (s.finalAnswer) setFinalReport(String(s.finalAnswer));

        // Restore prompt so instruction is never empty/null on refresh!
        if (s.instruction && typeof s.instruction === "string") {
          setInstruction(s.instruction);
          if (typeof window !== "undefined") {
            localStorage.setItem("codynex_workspace_draft_prompt", s.instruction);
          }
        }

        // Restore agent role and provider
        if (s.roleTitle && typeof s.roleTitle === "string") {
          setSelectedAgentRole(s.roleTitle);
        }
        if (s.effectiveProvider && typeof s.effectiveProvider === "string") {
          setSelectedProvider(s.effectiveProvider);
          setActiveEngine(s.effectiveProvider);
        }

        // Restore remaining countdown timer if session is currently executing
        if (s.startedAt && (s.status === "RUNNING" || s.status === "PLANNING")) {
          const elapsedSec = Math.round((Date.now() - new Date(s.startedAt as string).getTime()) / 1000);
          setRemainingSec(Math.max(0, 240 - elapsedSec));
        }

        // Restore step logs
        if (Array.isArray(s.steps) && s.steps.length > 0) {
          setStepLogs(
            s.steps.map((st: Record<string, unknown>) => ({
              step: typeof st.stepIndex === "number" ? st.stepIndex : 1,
              thought: typeof st.thought === "string" ? st.thought : undefined,
              tool: typeof st.tool === "string" ? st.tool : "unknown",
              output: st.toolOutput,
              status: (st.status as "EXECUTING" | "SUCCESS" | "FAILED") || "SUCCESS",
              timestamp: typeof st.timestamp === "string" ? st.timestamp : new Date().toISOString(),
            }))
          );
        }
      }
    } catch {
      // session not started yet, ignore
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchExistingSession();
  }, [fetchExistingSession]);

  // Live polling while running to recover seamlessly from page refresh or socket disconnects
  useEffect(() => {
    if (agentStatus !== "RUNNING" && agentStatus !== "PLANNING") return;
    const interval = setInterval(() => {
      void fetchExistingSession();
    }, 2500);
    return () => clearInterval(interval);
  }, [agentStatus, fetchExistingSession]);

  // Start a fresh, clean session
  const handleStartNewSession = () => {
    const newId = `codynex_session_${Date.now()}`;
    setSessionId(newId);
    if (typeof window !== "undefined") {
      localStorage.setItem("codynex_active_session_id", newId);
      localStorage.removeItem("codynex_workspace_draft_prompt");
    }
    setInstruction("");
    setAgentStatus("IDLE");
    setCurrentStep(0);
    setMaxSteps(30);
    setRemainingSec(null);
    setActiveEngine(null);
    setStepLogs([]);
    setFinalReport(null);
  };

  // Trigger agent execution loop
  const handleLaunchAgent = async () => {
    const cleanPrompt = instruction.trim();
    if (!cleanPrompt || isSubmitting) return;

    setIsSubmitting(true);
    setFinalReport(null);
    setStepLogs([]);
    setAgentStatus("PLANNING");

    if (typeof window !== "undefined") {
      localStorage.setItem("codynex_workspace_draft_prompt", cleanPrompt);
      localStorage.setItem("codynex_active_session_id", sessionId);
    }

    try {
      await codynexApi.autonomousAgent.run({
        sessionId,
        instruction: cleanPrompt,
        roleTitle: selectedAgentRole,
        preferredProvider: selectedProvider || undefined,
        maxSteps,
      });
      void refreshSessionList();
    } catch {
      setAgentStatus("FAILED");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePause = async () => {
    try {
      await codynexApi.autonomousAgent.pause(sessionId);
      setAgentStatus("PAUSED");
    } catch {
      // ignore
    }
  };

  const handleResume = async () => {
    try {
      await codynexApi.autonomousAgent.resume(sessionId);
      setAgentStatus("RUNNING");
    } catch {
      // ignore
    }
  };

  const handleCancel = async () => {
    try {
      await codynexApi.autonomousAgent.cancel(sessionId);
      setAgentStatus("CANCELLED");
    } catch {
      // ignore
    }
  };

  const handleSendReply = async () => {
    const cleanMsg = replyInput.trim();
    if (!cleanMsg || isReplying) return;

    setIsReplying(true);
    setAgentStatus("PLANNING");
    try {
      await codynexApi.autonomousAgent.reply(sessionId, cleanMsg, 15);
      setReplyInput("");
    } catch {
      setAgentStatus("FAILED");
    } finally {
      setIsReplying(false);
    }
  };

  // WebSocket Live Updates
  useDomainSocket((eventName, payload: unknown) => {
    const data = (payload as Record<string, unknown>) || {};
    if (data.sessionId !== sessionId && data.sessionId !== undefined) return;

    if (eventName === "agent:lifecycle") {
      if (typeof data.status === "string") {
        setAgentStatus(
          data.status as
            | "IDLE"
            | "PLANNING"
            | "RUNNING"
            | "WAITING"
            | "PAUSED"
            | "COMPLETED"
            | "FAILED"
            | "CANCELLED"
        );
      }
      if (typeof data.finalAnswer === "string") setFinalReport(data.finalAnswer);
    } else if (eventName === "agent:thinking") {
      setAgentStatus("RUNNING");
      if (typeof data.step === "number") setCurrentStep(data.step);
      if (typeof data.maxSteps === "number") setMaxSteps(data.maxSteps);
      if (typeof data.remainingSec === "number") setRemainingSec(data.remainingSec);
      if (typeof data.provider === "string") setActiveEngine(data.provider);
      if (typeof data.jumpedToProvider === "string") setActiveEngine(data.jumpedToProvider);
    } else if (eventName === "agent:tool_started") {
      setStepLogs((prev) => [
        ...prev,
        {
          step: typeof data.step === "number" ? data.step : prev.length + 1,
          thought: typeof data.thought === "string" ? data.thought : undefined,
          tool: typeof data.tool === "string" ? data.tool : undefined,
          status: "EXECUTING",
          timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
        },
      ]);
    } else if (eventName === "agent:tool_completed") {
      setStepLogs((prev) =>
        prev.map((log) =>
          log.step === data.step
            ? {
                ...log,
                output: data.output,
                status: (data.status as "EXECUTING" | "SUCCESS" | "FAILED") || "SUCCESS",
              }
            : log
        )
      );
    }
  });

  return (
    <div className={cn("space-y-4 font-sans text-[#c9d1d9]", className)}>
      {/* Top Operating Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#30363d] bg-[#161b22] px-5 py-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#238636] text-white shadow-md">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                CodyNex OS Autonomous Environment
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/30">
                  Devin Engine 2.0
                </span>
              </h2>
              <p className="text-[11px] text-[#8b949e]">
                Autonomous Browser, Terminal, Code Streamer &amp; Real-Time Observation
              </p>
            </div>
          </div>

          {/* Agent Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-2.5 py-1 font-mono text-xs font-bold uppercase border",
                agentStatus === "RUNNING"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse"
                  : agentStatus === "PAUSED"
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : agentStatus === "COMPLETED"
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                  : agentStatus === "FAILED"
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  : "bg-[#21262d] text-[#8b949e] border-[#30363d]"
              )}
            >
              {agentStatus} {currentStep > 0 && `(Step ${currentStep}/${maxSteps})`}
            </span>

            {remainingSec !== null && agentStatus === "RUNNING" && (
              <span className="flex items-center gap-1.5 rounded bg-indigo-500/20 border border-indigo-500/40 px-2.5 py-1 font-mono text-xs font-bold text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
                ⏱️ 4-Min Budget: {Math.floor(remainingSec / 60)}m {remainingSec % 60}s left
              </span>
            )}

            {activeEngine && agentStatus === "RUNNING" && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 font-mono text-[11px] font-bold text-emerald-300">
                ⚡ {activeEngine.toUpperCase()}
              </span>
            )}
          </div>

          {/* Session Switcher & New Session Button */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#0d1117] px-2.5 py-1 text-xs">
              <History className="h-3.5 w-3.5 text-[#58a6ff] shrink-0" />
              <select
                value={sessionId}
                onChange={(e) => {
                  const targetId = e.target.value;
                  setSessionId(targetId);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("codynex_active_session_id", targetId);
                  }
                }}
                className="bg-transparent text-xs text-white focus:outline-none max-w-[160px] sm:max-w-[220px] truncate"
              >
                <option value={sessionId} className="bg-[#161b22] text-white">
                  {sessionId} {agentStatus !== "IDLE" ? `(${agentStatus})` : ""}
                </option>
                {sessionList
                  .filter((s) => s.sessionId !== sessionId)
                  .map((s) => (
                    <option key={s.sessionId} value={s.sessionId} className="bg-[#161b22] text-white">
                      {s.sessionId} ({s.status}) - {s.instruction ? s.instruction.slice(0, 30) : "Session"}
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleStartNewSession}
              className="flex items-center gap-1 rounded-lg border border-[#30363d] bg-[#21262d] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#30363d] transition-colors"
              title="Start a new clean autonomous session"
            >
              <Plus className="h-3.5 w-3.5 text-[#9FE870]" />
              <span className="hidden sm:inline">New Session</span>
            </button>
          </div>
        </div>

        {/* View Layout Switcher & Pause/Cancel Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Buttons */}
          <div className="flex rounded-lg border border-[#30363d] bg-[#0d1117] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("SPLIT")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors",
                viewMode === "SPLIT" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              Split Console
            </button>
            <button
              type="button"
              onClick={() => setViewMode("BROWSER")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                viewMode === "BROWSER" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              <Globe className="h-3 w-3" />
              Live Browser
            </button>
            <button
              type="button"
              onClick={() => setViewMode("CODE")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                viewMode === "CODE" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              <Code2 className="h-3 w-3" />
              Code Stream
            </button>
            <button
              type="button"
              onClick={() => setViewMode("TERMINAL")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                viewMode === "TERMINAL" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              <TerminalIcon className="h-3 w-3" />
              Terminal
            </button>
            <button
              type="button"
              onClick={() => setViewMode("FEED")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                viewMode === "FEED" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              <Activity className="h-3 w-3" />
              Agent Feed
            </button>
            <button
              type="button"
              onClick={() => setViewMode("SCORECARD")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                viewMode === "SCORECARD" ? "bg-[#238636] text-white" : "text-[#8b949e] hover:text-white"
              )}
            >
              <ShieldCheck className="h-3 w-3" />
              Scorecard (7 Gates)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("VOICE")}
              className={cn(
                "rounded px-2.5 py-1 font-semibold transition-colors flex items-center gap-1.5",
                viewMode === "VOICE"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-[#8b949e] hover:text-white"
              )}
            >
              <Mic className="h-3 w-3 text-blue-400" />
              Nepali Voice AI
            </button>
          </div>

          {/* Pause / Resume / Cancel Agent Buttons */}
          {agentStatus === "RUNNING" && (
            <button
              type="button"
              onClick={handlePause}
              className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              <Pause className="h-3 w-3" />
              Pause
            </button>
          )}

          {agentStatus === "PAUSED" && (
            <button
              type="button"
              onClick={handleResume}
              className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
            >
              <Play className="h-3 w-3" />
              Resume
            </button>
          )}

          {(agentStatus === "RUNNING" || agentStatus === "PAUSED") && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Autonomous Instruction Composer */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 shadow-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLaunchAgent();
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] pb-2 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#9FE870]" />
              Assign Task to Autonomous Computer Agent
            </span>
            <span className="text-[11px] text-[#8b949e] font-mono">
              Direct Natural Language Prompting
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#8b949e]">
                Autonomous Specialist Agent
              </label>
              <select
                value={selectedAgentRole}
                onChange={(e) => setSelectedAgentRole(e.target.value)}
                disabled={agentStatus === "RUNNING"}
                className="h-8 w-full rounded border border-[#30363d] bg-[#0d1117] px-2.5 text-xs text-white focus:border-[#58a6ff] focus:outline-none disabled:opacity-50"
              >
                <option value="Autonomous Software & Computer Engineer">
                  Autonomous Software & Computer Engineer (Generalist)
                </option>
                <option value="Senior Full-Stack & Architecture Lead">
                  Senior Full-Stack & Architecture Lead
                </option>
                <option value="Frontend UI/UX Specialist">
                  Frontend UI/UX Specialist
                </option>
                <option value="Backend Lead & Database Engineer">
                  Backend Lead & Database Engineer
                </option>
                <option value="QA, Testing & Verification Specialist">
                  QA, Testing & Verification Specialist
                </option>
                <option value="DevOps & Deployment Engineer">
                  DevOps & Deployment Engineer
                </option>
                <option value="Autonomous Web Researcher & Analyst">
                  Autonomous Web Researcher & Analyst
                </option>
                <option value="Growth Marketing & Social Media Lead">
                  Growth Marketing & Social Media Lead
                </option>
                <option value="Product Manager & Technical Writer">
                  Product Manager & Technical Writer
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#8b949e]">
                AI Model Engine & Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                disabled={agentStatus === "RUNNING"}
                className="h-8 w-full rounded border border-[#30363d] bg-[#0d1117] px-2.5 text-xs text-white focus:border-[#58a6ff] focus:outline-none disabled:opacity-50"
              >
                <option value="">Auto ($0 Free Intelligent Routing)</option>
                <option value="groq">Groq LPUs (Ultra-Fast 70B)</option>
                <option value="gemini">Google Gemini (1M Long-Context)</option>
                <option value="opencode">OpenCode API (Open Source Coding)</option>
                <option value="openrouter">OpenRouter (18+ Free Models)</option>
                <option value="cloudflare">Cloudflare Workers AI (10k Neurons)</option>
                <option value="huggingface">Hugging Face Serverless</option>
                <option value="ollama">Ollama (100% Offline Hardware)</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => {
                const val = e.target.value;
                setInstruction(val);
                if (typeof window !== "undefined") {
                  localStorage.setItem("codynex_workspace_draft_prompt", val);
                }
              }}
              placeholder="e.g. Inspect the Aliza Wears frontend, run tests in the terminal, add the product carousel component, and verify browser navigation..."
              className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] p-3 text-xs text-white placeholder:text-[#8b949e] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8b949e]">
              <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[#7ee787]">
                ✓ Microsoft Playwright Active
              </span>
              <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[#58a6ff]">
                ✓ PowerShell Isolated Shell
              </span>
              <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[#d2a8ff]">
                ✓ Codex Real-Time Streamer
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !instruction.trim() || agentStatus === "RUNNING"}
              className="flex items-center gap-1.5 rounded-md bg-[#238636] px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#2ea043] disabled:opacity-40 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitting || agentStatus === "RUNNING" ? "Agent Running..." : "Execute on Autonomous Computer"}
            </button>
          </div>
        </form>

        {/* Gemini-Style Colorful Live Activity Shower */}
        {(agentStatus === "RUNNING" ||
          agentStatus === "PLANNING" ||
          agentStatus === "PAUSED" ||
          stepLogs.length > 0) && (
          <div className="mt-4">
            <GeminiLiveActivityIndicator
              log={stepLogs[stepLogs.length - 1]}
              currentStep={currentStep}
              maxSteps={maxSteps}
              agentStatus={agentStatus}
            />
          </div>
        )}

        {/* Prominent Executive Deliverables & Execution Outcome Card */}
        {finalReport && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold">
                  ✓
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Executive Deliverables Report & Execution Outcome
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300 uppercase">
                      {agentStatus === "COMPLETED" ? "TASK COMPLETED" : "EXECUTION SUMMARY"}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#8b949e]">
                    Steps Executed: <span className="font-mono text-white">{currentStep}/{maxSteps}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("CODE")}
                  className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#30363d] transition-colors flex items-center gap-1.5"
                >
                  <Code2 className="h-3.5 w-3.5 text-[#9FE870]" />
                  Inspect Code Diffs
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("SCORECARD")}
                  className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#30363d] transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  View 7-Gate Scorecard
                </button>
              </div>
            </div>

            <div className="text-xs text-[#c9d1d9] leading-relaxed whitespace-pre-wrap font-sans space-y-2">
              {finalReport}
            </div>

            {/* Interactive Human Reply & Continuation Component */}
            <div className="mt-4 border-t border-[#30363d]/80 pt-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-300 to-pink-400">
                  <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
                  Reply to Agent &amp; Continue Autonomous Task
                </span>
                <span className="rounded bg-[#21262d] px-2 py-0.5 text-[10px] font-mono text-[#8b949e]">
                  Active Context Retained · Browser &amp; Terminal Live
                </span>
              </div>

              <div className="relative">
                <textarea
                  rows={2}
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void handleSendReply();
                    }
                  }}
                  placeholder="Provide requested info, phone number, credentials, or your next instruction (e.g. My phone number is +977 9800000000, link with phone number and message Bishan)..."
                  className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] p-2.5 text-xs text-white placeholder:text-[#8b949e] focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#8b949e] flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3 text-[#58a6ff]" />
                  Press <kbd className="rounded border border-[#30363d] bg-[#161b22] px-1 py-0.5 text-[10px] text-white">Ctrl+Enter</kbd> to submit
                </span>

                <button
                  type="button"
                  onClick={() => handleSendReply()}
                  disabled={isReplying || !replyInput.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-all disabled:opacity-40"
                >
                  <Send className={cn("h-3.5 w-3.5", isReplying && "animate-spin")} />
                  {isReplying ? "Resuming Agent..." : "Send Reply & Continue Task"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Display based on View Mode */}
      {viewMode === "SPLIT" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Top Left: Live Browser Screencast */}
          <div className="h-[560px] xl:h-[660px] flex flex-col">
            <LiveBrowserViewport sessionId={sessionId} className="w-full h-full flex-1" />
          </div>

          {/* Top Right: Code Streamer */}
          <LiveCodexFileEditor repoId={selectedRepo?.id} />

          {/* Bottom Left: Real Interactive Terminal */}
          <LiveInteractiveTerminal sessionId={sessionId} />

          {/* Bottom Right: Agent Activity & Tool Execution Feed */}
          <div className="flex flex-col rounded-xl border border-[#30363d] bg-[#0d1117] overflow-hidden min-h-[380px] max-h-[520px]">
            <div className="border-b border-[#30363d] bg-[#161b22] px-4 py-2.5 text-xs font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-[#58a6ff]" />
                Observable Agent Execution Feed ({stepLogs.length} events)
              </span>
              <span className="text-[11px] font-mono text-[#8b949e]">
                Live Real-Time Telemetry
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
              {stepLogs.length === 0 ? (
                <div className="p-8 text-center text-[#8b949e] font-sans">
                  No actions executed yet. Assign a task above to watch the agent reason and invoke tools.
                </div>
              ) : (
                stepLogs.map((log, idx) => (
                  <AgentStepCard key={idx} log={log} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === "BROWSER" && (
        <div className="w-full h-[calc(100vh-220px)] min-h-[750px] flex flex-col">
          <LiveBrowserViewport sessionId={sessionId} className="w-full h-full flex-1" />
        </div>
      )}

      {viewMode === "CODE" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8">
            <LiveCodexFileEditor repoId={selectedRepo?.id} />
          </div>
          <div className="xl:col-span-4">
            <LiveInteractiveTerminal sessionId={sessionId} />
          </div>
        </div>
      )}

      {viewMode === "TERMINAL" && (
        <div className="space-y-4">
          <LiveInteractiveTerminal sessionId={sessionId} className="min-h-[580px]" />
        </div>
      )}

      {viewMode === "FEED" && (
        <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#58a6ff]" />
            Complete Autonomous Execution Transcript ({stepLogs.length} actions)
          </h3>
          <div className="space-y-3 font-mono text-xs">
            {stepLogs.map((log, idx) => (
              <AgentStepCard key={idx} log={log} />
            ))}
          </div>
        </div>
      )}

      {viewMode === "SCORECARD" && (
        <DeliveryScorecard
          taskId={sessionId}
        />
      )}

      {viewMode === "VOICE" && (
        <div className="w-full h-[calc(100vh-230px)] min-h-[680px]">
          <NepaliVoiceIntelligenceConsole
            activeSessionId={sessionId}
            activeWorkspace={selectedRepo?.name || "HostelGhar"}
            onExecutionStarted={(newSessionId) => {
              setSessionId(newSessionId);
              setViewMode("SPLIT");
            }}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}
