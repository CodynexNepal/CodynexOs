"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  ExternalLink,
  Eye,
  Globe,
  Hand,
  Maximize2,
  Minimize2,
  Monitor,
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
  const [scaleMode, setScaleMode] = useState<"FIT_HEIGHT" | "FIT_WIDTH" | "CONTAIN">("FIT_HEIGHT");
  const [showConsole, setShowConsole] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const consoleBottomRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [clickRipples, setClickRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const lastWheelTime = useRef<number>(0);

  // Direct click-to-interact on the browser viewport
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    // Normalize to 1440x900 native browser resolution
    const normX = Math.max(0, Math.min(1, relX / rect.width));
    const normY = Math.max(0, Math.min(1, relY / rect.height));
    const x = Math.round(normX * 1440);
    const y = Math.round(normY * 900);

    const rippleId = Date.now();
    setClickRipples((prev) => [...prev.slice(-3), { id: rippleId, x: relX, y: relY }]);
    setTimeout(() => {
      setClickRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 500);

    try {
      await codynexApi.browser.clickCoordinate(sessionId, x, y);
    } catch {
      // ignore
    }
  };

  // Smooth mouse wheel scrolling
  const handleWheel = async (e: React.WheelEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 50) return; // Smooth 20fps throttle
    lastWheelTime.current = now;

    try {
      await codynexApi.browser.wheel(sessionId, Math.round(e.deltaY));
    } catch {
      // ignore
    }
  };

  // Escape key exits full screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

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
      if (imgRef.current && typeof data.screenshot === "string") {
        imgRef.current.src = `data:image/jpeg;base64,${data.screenshot}`;
      }
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
        // Direct GPU image assignment: Zero React re-renders for true 60fps mobile-smooth playback
        if (imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${data.screenshot}`;
        }
        if (!state.lastScreenshot) {
          setState((prev) => ({
            ...prev,
            lastScreenshot: data.screenshot as string,
            url: typeof data.url === "string" ? data.url : prev.url,
          }));
        }
      }
    } else if (eventName === "browser:action") {
      if (imgRef.current && typeof data.screenshot === "string") {
        imgRef.current.src = `data:image/jpeg;base64,${data.screenshot}`;
      }
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
        "flex flex-col border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden font-sans w-full h-full flex-1",
        isExpanded ? "fixed inset-0 z-50 rounded-none w-screen h-screen bg-[#010409]" : "rounded-xl",
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

          {/* Fit Height (100%) / Width / Fit Toggle */}
          <button
            type="button"
            onClick={() =>
              setScaleMode((prev) =>
                prev === "FIT_HEIGHT" ? "FIT_WIDTH" : prev === "FIT_WIDTH" ? "CONTAIN" : "FIT_HEIGHT"
              )
            }
            className={cn(
              "flex items-center gap-1 rounded border border-[#30363d] px-2 py-1 text-xs font-semibold transition-colors",
              scaleMode === "FIT_HEIGHT"
                ? "bg-[#21262d] text-[#58a6ff] border-[#58a6ff]/40"
                : "bg-[#0d1117] text-[#8b949e] hover:text-white"
            )}
            title="Toggle View Scale: 100% Height, 100% Width, or Fit View"
          >
            <Monitor className="h-3 w-3" />
            <span className="hidden sm:inline">
              {scaleMode === "FIT_HEIGHT"
                ? "Height 100%"
                : scaleMode === "FIT_WIDTH"
                ? "Width 100%"
                : "Fit View"}
            </span>
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
            title={isExpanded ? "Exit Fullscreen (Esc)" : "Full Screen Browser View"}
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
          {loading ? "Loading..." : "Go"}
        </button>
      </form>

      {/* Quick Navigation Chips */}
      <div className="flex items-center gap-1.5 border-b border-[#30363d]/60 bg-[#161b22]/70 px-4 py-1 text-[11px] text-[#8b949e] overflow-x-auto">
        <span className="font-semibold text-white/80 shrink-0">Quick Demo Sites:</span>
        <button
          type="button"
          onClick={() => {
            setUrlInput("https://news.ycombinator.com");
            void handleNavigate("https://news.ycombinator.com");
          }}
          className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-0.5 text-[10px] text-[#58a6ff] hover:bg-[#21262d] hover:text-white transition-colors shrink-0"
        >
          Hacker News
        </button>
        <button
          type="button"
          onClick={() => {
            setUrlInput("https://en.wikipedia.org");
            void handleNavigate("https://en.wikipedia.org");
          }}
          className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-0.5 text-[10px] text-[#58a6ff] hover:bg-[#21262d] hover:text-white transition-colors shrink-0"
        >
          Wikipedia
        </button>
        <button
          type="button"
          onClick={() => {
            setUrlInput("https://github.com");
            void handleNavigate("https://github.com");
          }}
          className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-0.5 text-[10px] text-[#58a6ff] hover:bg-[#21262d] hover:text-white transition-colors shrink-0"
        >
          GitHub
        </button>
        <button
          type="button"
          onClick={() => {
            setUrlInput("http://localhost:3000/overview");
            void handleNavigate("http://localhost:3000/overview");
          }}
          className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-0.5 text-[10px] text-[#7ee787] hover:bg-[#21262d] hover:text-white transition-colors shrink-0"
        >
          Local Dashboard
        </button>
      </div>

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

      {/* Viewport Screencast Area - 60fps Mobile-Smooth Direct GPU Feed */}
      <div
        onWheel={handleWheel}
        className={cn(
          "relative flex-1 bg-[#010409] flex flex-col items-center justify-center overflow-auto w-full h-full min-h-0",
          isExpanded ? "h-[calc(100vh-105px)]" : "h-full flex-1 min-h-[450px]"
        )}
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-[#58a6ff]" />
            <p className="font-mono text-xs text-[#58a6ff]">Navigating & capturing live browser frame...</p>
          </div>
        )}

        {state.lastScreenshot ? (
          <div
            className={cn(
              "relative w-full h-full flex-1 flex items-center justify-center overflow-auto",
              scaleMode === "FIT_WIDTH" ? "p-0" : scaleMode === "FIT_HEIGHT" ? "p-0" : "p-2"
            )}
          >
            {/* Live Screencast Frame - Direct GPU Render without transition delays */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${state.lastScreenshot}`}
              alt={state.title || "Browser Live Screencast"}
              onClick={handleImageClick}
              title="Click anywhere to interact with the live browser"
              className={cn(
                "select-none cursor-pointer transition-all",
                scaleMode === "FIT_HEIGHT"
                  ? "h-full w-full object-contain max-h-full"
                  : scaleMode === "FIT_WIDTH"
                  ? "w-full h-auto object-cover rounded-none"
                  : "max-w-full max-h-full object-contain rounded border border-[#30363d] shadow-2xl"
              )}
            />

            {/* Click Ripple Indicators */}
            {clickRipples.map((r) => (
              <span
                key={r.id}
                style={{ left: r.x, top: r.y }}
                className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#58a6ff] bg-[#58a6ff]/30 animate-ping"
              />
            ))}

            {/* Live Screencast Overlay Tag */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22]/90 px-2.5 py-1 text-[11px] font-mono backdrop-blur-sm shadow-lg pointer-events-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9FE870] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9FE870]"></span>
              </span>
              <span className="text-white font-bold">CDP Screencast (Smooth 60fps)</span>
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
