"use client";

import { useEffect, useState, useRef } from "react";
import {
  CornerDownLeft,
  Maximize2,
  Minimize2,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";

export interface LiveInteractiveTerminalProps {
  sessionId?: string;
  cwd?: string;
  className?: string;
}

export function LiveInteractiveTerminal({
  sessionId = "default_terminal_session",
  cwd = "workspace",
  className,
}: LiveInteractiveTerminalProps) {
  const [inputCmd, setInputCmd] = useState("");
  const [outputLines, setOutputLines] = useState<
    Array<{ type: "cmd" | "stdout" | "stderr" | "system"; text: string; timestamp: string }>
  >([
    {
      type: "system",
      text: "CodyNex OS Interactive Terminal Shell [Version 2.0.0]\nReady for autonomous agent execution and human supervision.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isExpanded, setIsExpanded] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [outputLines]);

  // Execute terminal command
  const runCommand = async (commandToRun?: string) => {
    const cmd = (commandToRun || inputCmd).trim();
    if (!cmd || isRunning) return;

    setInputCmd("");
    setIsRunning(true);
    setHistory((prev) => [cmd, ...prev.filter((h) => h !== cmd)].slice(0, 50));
    setHistoryIdx(-1);

    setOutputLines((prev) => [
      ...prev,
      {
        type: "cmd",
        text: `$ ${cmd}`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const res = await codynexApi.terminal.execute(sessionId, cmd, cwd);
      const record = unwrap<{ id: string; status: string; exitCode: number | null }>(res.data);
      if (record?.id) {
        setActiveExecutionId(record.id);
      }
    } catch (err: unknown) {
      setIsRunning(false);
      const msg = err instanceof Error ? err.message : "Execution error";
      setOutputLines((prev) => [
        ...prev,
        {
          type: "stderr",
          text: `[EXECUTION FAILED]: ${msg}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  // Cancel running command
  const cancelProcess = async () => {
    if (!activeExecutionId) return;
    try {
      await codynexApi.terminal.cancel(activeExecutionId);
      setOutputLines((prev) => [
        ...prev,
        {
          type: "system",
          text: "[PROCESS TERMINATED]: Sent SIGTERM to active process.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setIsRunning(false);
      setActiveExecutionId(null);
    } catch {
      // ignore
    }
  };

  // Clear output buffer
  const clearTerminal = () => {
    setOutputLines([
      {
        type: "system",
        text: "Terminal buffer cleared.",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  // WebSocket Live Output Streaming
  useDomainSocket((eventName, payload: unknown) => {
    const data = (payload as Record<string, unknown>) || {};
    if (data.sessionId !== sessionId && data.sessionId !== undefined) return;

    if (eventName === "terminal:start") {
      setIsRunning(true);
      if (typeof data.executionId === "string") setActiveExecutionId(data.executionId);
    } else if (eventName === "terminal:output") {
      const stream = data.stream === "stderr" ? "stderr" : "stdout";
      setOutputLines((prev) => [
        ...prev,
        {
          type: stream,
          text: String(data.chunk || ""),
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } else if (eventName === "terminal:exit") {
      setIsRunning(false);
      setActiveExecutionId(null);
      const code = data.exitCode;
      setOutputLines((prev) => [
        ...prev,
        {
          type: "system",
          text: `[Process exited with code ${code ?? 0}]`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  });

  // History navigation with Arrow Up / Arrow Down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0 && historyIdx + 1 < history.length) {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInputCmd(history[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputCmd(history[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputCmd("");
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden font-mono",
        isExpanded ? "fixed inset-4 z-50 rounded-xl" : "w-full",
        className
      )}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-[#7ee787]" />
          <span className="text-xs font-bold text-white font-sans tracking-wide">
            Autonomous Shell
          </span>
          <span className="rounded bg-[#21262d] px-2 py-0.5 text-[10px] text-[#58a6ff]">
            {cwd}
          </span>
          {isRunning && (
            <span className="flex items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400 font-bold border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              RUNNING
            </span>
          )}
        </div>

        {/* Quick Commands & Actions */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-sans">
          <button
            type="button"
            onClick={() => runCommand("git status")}
            disabled={isRunning}
            className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 text-[11px] font-mono text-[#58a6ff] hover:bg-[#30363d] transition-colors"
          >
            git status
          </button>
          <button
            type="button"
            onClick={() => runCommand("npm test")}
            disabled={isRunning}
            className="rounded border border-[#30363d] bg-[#21262d] px-2 py-0.5 text-[11px] font-mono text-[#7ee787] hover:bg-[#30363d] transition-colors"
          >
            npm test
          </button>

          {isRunning ? (
            <button
              type="button"
              onClick={cancelProcess}
              className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              Kill
            </button>
          ) : (
            <button
              type="button"
              onClick={clearTerminal}
              title="Clear terminal buffer"
              className="flex h-6 w-6 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? "Collapse" : "Expand"}
            className="flex h-6 w-6 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white"
          >
            {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-auto p-3 text-xs leading-relaxed min-h-[320px] max-h-[520px] space-y-0.5 bg-[#0d1117]">
        {outputLines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              "whitespace-pre-wrap break-all",
              line.type === "cmd" && "text-[#58a6ff] font-bold",
              line.type === "stderr" && "text-rose-400 font-semibold",
              line.type === "system" && "text-[#8b949e] italic",
              line.type === "stdout" && "text-[#e6edf3]"
            )}
          >
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Prompt */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCommand();
        }}
        className="flex items-center gap-2 border-t border-[#30363d] bg-[#161b22] px-3 py-2 text-xs"
      >
        <span className="text-[#7ee787] font-bold select-none">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? "Command is running..." : "Type shell command or shortcut..."}
          disabled={isRunning}
          className="flex-1 bg-transparent font-mono text-xs text-white focus:outline-none placeholder:text-[#8b949e]"
        />
        <button
          type="submit"
          disabled={isRunning || !inputCmd.trim()}
          className="rounded bg-[#238636] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#2ea043] disabled:opacity-40 transition-colors"
        >
          <CornerDownLeft className="h-3 w-3" />
        </button>
      </form>
    </div>
  );
}
