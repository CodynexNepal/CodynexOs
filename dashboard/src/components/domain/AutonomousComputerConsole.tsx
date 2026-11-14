"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Code2,
  Cpu,
  Globe,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal as TerminalIcon,
} from "lucide-react";
import { LiveBrowserViewport } from "@/components/domain/LiveBrowserViewport";
import { LiveInteractiveTerminal } from "@/components/domain/LiveInteractiveTerminal";
import { LiveCodexFileEditor } from "@/components/domain/LiveCodexFileEditor";
import { DeliveryScorecard } from "@/components/domain/DeliveryScorecard";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";

export interface AutonomousComputerConsoleProps {
  initialSessionId?: string;
  repoId?: string;
  className?: string;
}

type WorkspaceViewMode = "SPLIT" | "BROWSER" | "CODE" | "TERMINAL" | "FEED" | "SCORECARD";

interface AgentStepLog {
  step: number;
  thought?: string;
  tool?: string;
  output?: unknown;
  status: "EXECUTING" | "SUCCESS" | "FAILED";
  timestamp: string;
}

export function AutonomousComputerConsole({
  initialSessionId = "codynex_main_session",
  repoId,
  className,
}: AutonomousComputerConsoleProps) {
  const [sessionId] = useState(initialSessionId);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("SPLIT");
  const [instruction, setInstruction] = useState("");
  const [agentStatus, setAgentStatus] = useState<
    "IDLE" | "PLANNING" | "RUNNING" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED"
  >("IDLE");
  const [currentStep, setCurrentStep] = useState(0);
  const [maxSteps, setMaxSteps] = useState(15);
  const [stepLogs, setStepLogs] = useState<AgentStepLog[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finalReport, setFinalReport] = useState<string | null>(null);

  // Restore active backend session if user navigated away and returned
  useEffect(() => {
    let isMounted = true;
    const fetchExistingSession = async () => {
      try {
        const res = await codynexApi.autonomousAgent.getSession(sessionId);
        if (res.data?.data && isMounted) {
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
    };
    void fetchExistingSession();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  // Trigger agent execution loop
  const handleLaunchAgent = async () => {
    const cleanPrompt = instruction.trim();
    if (!cleanPrompt || isSubmitting) return;

    setIsSubmitting(true);
    setFinalReport(null);
    setStepLogs([]);
    setAgentStatus("PLANNING");

    try {
      await codynexApi.autonomousAgent.run({
        sessionId,
        instruction: cleanPrompt,
        roleTitle: "Autonomous Software & Computer Engineer",
        maxSteps,
      });
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
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#9FE870]" />
              Assign Task to Autonomous Computer Agent
            </span>
            <span className="text-[11px] text-[#8b949e]">
              Agent plans actions, launches browser, runs commands &amp; writes code
            </span>
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
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

        {/* Final Report Deliverable */}
        {finalReport && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 text-xs">
            <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-4 w-4" />
              Autonomous Deliverable Verified
            </h4>
            <p className="whitespace-pre-wrap leading-relaxed text-[#e6edf3] font-mono">
              {finalReport}
            </p>
          </div>
        )}
      </div>

      {/* Main Workspace Display based on View Mode */}
      {viewMode === "SPLIT" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Top Left: Live Browser Screencast */}
          <LiveBrowserViewport sessionId={sessionId} />

          {/* Top Right: Code Streamer */}
          <LiveCodexFileEditor repoId={repoId} />

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
                  <div
                    key={idx}
                    className="rounded-lg border border-[#30363d] bg-[#161b22] p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#21262d] px-1.5 py-0.5 font-bold text-[#58a6ff]">
                          Step {log.step}
                        </span>
                        <span className="font-bold text-[#7ee787]">
                          tool: {log.tool}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#8b949e]">
                        {log.timestamp.slice(11, 19)}
                      </span>
                    </div>

                    {log.thought && (
                      <p className="text-[#c9d1d9] italic text-[11px]">
                        Thought: {log.thought}
                      </p>
                    )}

                    {log.output !== undefined && (
                      <div className="rounded bg-[#0d1117] p-2 text-[10px] text-[#8b949e] overflow-x-auto">
                        <span className="text-white font-bold">Result: </span>
                        {typeof log.output === "string"
                          ? log.output
                          : JSON.stringify(log.output, null, 2)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === "BROWSER" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8">
            <LiveBrowserViewport sessionId={sessionId} />
          </div>
          <div className="xl:col-span-4">
            <LiveInteractiveTerminal sessionId={sessionId} />
          </div>
        </div>
      )}

      {viewMode === "CODE" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8">
            <LiveCodexFileEditor repoId={repoId} />
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
          <div className="space-y-2 font-mono text-xs">
            {stepLogs.map((log, idx) => (
              <div key={idx} className="rounded border border-[#30363d] bg-[#161b22] p-3 space-y-1">
                <div className="flex items-center justify-between font-bold text-[#58a6ff]">
                  <span>Action #{log.step}: {log.tool}</span>
                  <span className="text-[#8b949e] font-normal text-[10px]">{log.timestamp}</span>
                </div>
                {log.thought && <p className="text-white">{log.thought}</p>}
                {log.output !== undefined && log.output !== null && (
                  <pre className="mt-1 rounded bg-[#0d1117] p-2 text-[11px] text-[#7ee787] overflow-x-auto whitespace-pre-wrap">
                    {typeof log.output === "string" ? log.output : JSON.stringify(log.output, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "SCORECARD" && (
        <DeliveryScorecard repoName="workspace" taskId={initialSessionId} />
      )}
    </div>
  );
}
