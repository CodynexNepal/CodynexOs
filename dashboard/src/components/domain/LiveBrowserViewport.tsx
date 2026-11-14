"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  ExternalLink,
  Globe,
  Hand,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";

export interface LiveBrowserViewportProps {
  sessionId?: string;
  initialUrl?: string;
  className?: string;
  autoRefresh?: boolean;
}

interface BrowserState {
  sessionId: string;
  url: string;
  title: string;
  status: "IDLE" | "NAVIGATING" | "INTERACTING" | "PAUSED" | "CLOSED";
  humanTakeover: boolean;
  lastScreenshot?: string;
  consoleLogs: Array<{ type: string; text: string; timestamp: string }>;
  actionHistory: Array<{ action: string; target?: string; timestamp: string }>;
}

export function LiveBrowserViewport({
  sessionId = "default_browser_session",
  initialUrl = "https://example.com",
  className,
}: LiveBrowserViewportProps) {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [state, setState] = useState<BrowserState>({
    sessionId,
    url: initialUrl,
    title: "Playwright Headless Browser",
    status: "IDLE",
    humanTakeover: false,
    consoleLogs: [],
    actionHistory: [],
  });

  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const consoleBottomRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial browser state
  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await codynexApi.browser.getState(sessionId);
      const data = unwrap<BrowserState | null>(res.data);
      if (data) {
        setState(data);
        if (data.url && data.url !== "about:blank") {
          setUrlInput(data.url);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  // Navigate to URL
  const handleNavigate = async (targetUrl?: string) => {
    const dest = targetUrl || urlInput.trim();
    if (!dest) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await codynexApi.browser.navigate(sessionId, dest);
      const updated = unwrap<BrowserState>(res.data);
      setState(updated);
      setUrlInput(updated.url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to navigate to target URL";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Human Takeover
  const toggleTakeover = async () => {
    const nextState = !state.humanTakeover;
    try {
      const res = await codynexApi.browser.takeover(sessionId, nextState);
      const updated = unwrap<BrowserState>(res.data);
      setState(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle human takeover";
      setErrorMsg(msg);
    }
  };

  // WebSocket Live Stream Listener
  useDomainSocket((eventName, payload: unknown) => {
    const data = (payload as Record<string, unknown>) || {};
    if (data.sessionId !== sessionId && data.sessionId !== undefined) return;

    if (eventName === "browser:navigation") {
      setState((prev) => ({
        ...prev,
        url: typeof data.url === "string" ? data.url : prev.url,
        title: typeof data.title === "string" ? data.title : prev.title,
        lastScreenshot: typeof data.screenshot === "string" ? data.screenshot : prev.lastScreenshot,
        status: "IDLE",
      }));
      if (typeof data.url === "string") setUrlInput(data.url);
    } else if (eventName === "browser:screenshot") {
      if (typeof data.screenshot === "string") {
        setState((prev) => ({
          ...prev,
          lastScreenshot: data.screenshot as string,
          url: typeof data.url === "string" ? data.url : prev.url,
        }));
      }
    } else if (eventName === "browser:action") {
      setState((prev) => ({
        ...prev,
        url: typeof data.url === "string" ? data.url : prev.url,
        lastScreenshot: typeof data.screenshot === "string" ? data.screenshot : prev.lastScreenshot,
        status: "IDLE",
        actionHistory: [
          ...prev.actionHistory,
          {
            action: typeof data.action === "string" ? data.action : "ACTION",
            target: typeof data.selector === "string" ? data.selector : undefined,
            timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
          },
        ].slice(-50),
      }));
    } else if (eventName === "browser:error") {
      setErrorMsg(typeof data.error === "string" ? data.error : "Browser automation error");
    }
  });

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden font-sans",
        isExpanded ? "fixed inset-4 z-50 rounded-xl" : "w-full",
        className
      )}
    >
      {/* Top Browser Header / Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-3 w-3 rounded-full bg-[#f85149]/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-[#d29922]/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-[#2ea043]/80 inline-block" />
          </div>

          <Globe className="h-4 w-4 text-[#58a6ff]" />
          <span className="text-xs font-bold text-white tracking-wide">
            Autonomous Browser
          </span>

          {/* Status Badge */}
          <span
            title={
              state.humanTakeover
                ? "Browser session is currently driven manually by human operator"
                : state.status === "NAVIGATING"
                ? "Playwright is actively loading and rendering target webpage"
                : "Playwright browser instance is active, warm, and ready for agent commands"
            }
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
              state.humanTakeover
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : state.status === "NAVIGATING"
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 animate-pulse"
                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                state.humanTakeover
                  ? "bg-amber-400 animate-pulse"
                  : state.status === "NAVIGATING"
                  ? "bg-sky-400 animate-ping"
                  : "bg-emerald-400"
              )}
            />
            {state.humanTakeover ? "Human Control" : state.status === "IDLE" ? "Active • Ready" : state.status}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Human Takeover Toggle */}
          <button
            type="button"
            onClick={toggleTakeover}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors border",
              state.humanTakeover
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                : "border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
            )}
          >
            {state.humanTakeover ? (
              <>
                <Play className="h-3 w-3" />
                Resume Agent
              </>
            ) : (
              <>
                <Hand className="h-3 w-3" />
                Take Control
              </>
            )}
          </button>

          {/* Console Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowConsole((prev) => !prev)}
            className={cn(
              "flex items-center gap-1 rounded border border-[#30363d] px-2 py-1 text-xs font-semibold transition-colors",
              showConsole ? "bg-[#238636] text-white" : "bg-[#0d1117] text-[#8b949e] hover:text-white"
            )}
          >
            <Terminal className="h-3 w-3" />
            Console ({state.consoleLogs.length})
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => handleNavigate()}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* URL Address Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleNavigate();
        }}
        className="flex items-center gap-2 border-b border-[#30363d] bg-[#0d1117] px-4 py-2"
      >
        <button
          type="button"
          onClick={() => handleNavigate()}
          className="text-[#8b949e] hover:text-white transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter target URL (e.g. localhost:3000, google.com, alizawears.com)..."
          className="h-7 flex-1 rounded border border-[#30363d] bg-[#161b22] px-3 font-mono text-xs text-white focus:border-[#58a6ff] focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-[#238636] px-3 py-1 font-sans text-xs font-semibold text-white hover:bg-[#2ea043] transition-colors"
        >
          Go
        </button>
      </form>

      {/* Error Notice */}
      {errorMsg && (
        <div className="flex items-center justify-between border-b border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Viewport Screencast Area */}
      <div className="relative flex-1 bg-[#010409] flex flex-col items-center justify-center min-h-[420px] max-h-[640px] overflow-hidden">
        {state.lastScreenshot ? (
          <div className="relative w-full h-full flex items-center justify-center overflow-auto p-2">
            {/* Live Screencast Frame */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/jpeg;base64,${state.lastScreenshot}`}
              alt={state.title || "Browser Live Screencast"}
              className="max-w-full max-h-full rounded border border-[#30363d] object-contain shadow-2xl"
            />

            {/* Live Screencast Overlay Tag */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22]/90 px-2.5 py-1 text-[11px] font-mono backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9FE870] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9FE870]"></span>
              </span>
              <span className="text-white font-bold">Live Stream (60fps Screencast)</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#161b22] border border-[#30363d] text-[#58a6ff]">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Browser Ready for Navigation</p>
              <p className="text-xs text-[#8b949e] max-w-sm mt-1">
                Enter any URL above or issue directives to your autonomous agent to observe live browsing, clicks, and page interactions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate("https://news.ycombinator.com")}
              className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#30363d] transition-colors"
            >
              Demo: Open Hacker News
            </button>
          </div>
        )}

        {/* Console Drawer (collapsible) */}
        {showConsole && (
          <div className="absolute inset-x-0 bottom-0 max-h-48 border-t border-[#30363d] bg-[#0d1117]/95 p-3 font-mono text-[11px] backdrop-blur-md overflow-y-auto z-10 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-[#8b949e] border-b border-[#21262d] pb-1.5 mb-2">
              <span>Browser Console &amp; Automation Log</span>
              <button
                type="button"
                onClick={() => setShowConsole(false)}
                className="text-[#8b949e] hover:text-white"
              >
                Close
              </button>
            </div>
            {state.consoleLogs.length === 0 ? (
              <p className="text-[#8b949e]">No console messages captured yet.</p>
            ) : (
              state.consoleLogs.map((c, idx) => (
                <div key={idx} className="leading-relaxed">
                  <span className="text-[#8b949e]">[{c.timestamp.slice(11, 19)}]</span>{" "}
                  <span className={c.type === "error" ? "text-rose-400 font-bold" : "text-[#7ee787]"}>
                    [{c.type.toUpperCase()}]
                  </span>{" "}
                  <span className="text-white">{c.text}</span>
                </div>
              ))
            )}
            <div ref={consoleBottomRef} />
          </div>
        )}
      </div>

      {/* Bottom Status Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#30363d] bg-[#161b22] px-4 py-2 text-[11px] text-[#8b949e]">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-white truncate">{state.title || "Untitled Page"}</span>
          <span>•</span>
          <span className="truncate">{state.url}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span>Engine: Microsoft Playwright (Chrome)</span>
          <span>•</span>
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-semibold text-[#58a6ff] hover:underline"
          >
            Open in Tab
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
