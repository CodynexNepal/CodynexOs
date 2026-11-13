"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Smartphone,
  Tablet,
  Laptop,
  RotateCw,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Code2,
  Globe,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { env } from "@/lib/env";

interface DiscoveredRoute {
  path: string;
  label: string;
  type: "page" | "dynamic" | "api";
  filePath: string;
}

interface FrontendWorkspace {
  owner: string;
  name: string;
  framework: string;
  defaultBranch: string;
  routes: DiscoveredRoute[];
  livePreviewUrl: string;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

export default function FrontendPreviewPage() {
  const { data: frontends } = useApiQuery<FrontendWorkspace[]>(
    () => codynexApi.frontends.list()
  );

  const availableWorkspaces = useMemo(() => frontends ?? [], [frontends]);

  // Selected state
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState<string>("aliza-wears");
  const [activeRoute, setActiveRoute] = useState<string>("/");
  const [inputRoute, setInputRoute] = useState<string>("/");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [isLandscape, setIsLandscape] = useState(false);
  const [showCodeSplit, setShowCodeSplit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeCodeContent, setActiveCodeContent] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Auto-select active workspace
  const activeWorkspace = useMemo(() => {
    return (
      availableWorkspaces.find((w) => w.name.toLowerCase() === selectedWorkspaceName.toLowerCase()) ||
      availableWorkspaces[0] || {
        owner: "CodynexNepal",
        name: "aliza-wears",
        framework: "Next.js 15 App Router (Tailwind CSS)",
        defaultBranch: "main",
        routes: [
          { path: "/", label: "Home (Featured Drops)", type: "page", filePath: "src/app/page.tsx" },
          { path: "/products", label: "Product Catalog & Filters", type: "page", filePath: "src/app/products/page.tsx" },
          { path: "/products/1", label: "Product Detail (Silk Saree)", type: "dynamic", filePath: "src/app/products/[id]/page.tsx" },
          { path: "/cart", label: "Cart & Checkout (eSewa/Khalti)", type: "page", filePath: "src/app/cart/page.tsx" },
        ],
        livePreviewUrl: "/preview/workspace/CodynexNepal/aliza-wears",
      }
    );
  }, [availableWorkspaces, selectedWorkspaceName]);

  // Base preview iframe URL
  const backendBase = env.apiUrl.replace(/\/api\/v1\/codynex\/?$/, "");
  const iframeSrc = `${backendBase}${activeWorkspace.livePreviewUrl}?route=${encodeURIComponent(activeRoute)}`;

  const handleNavigate = (route: string) => {
    setActiveRoute(route);
    setInputRoute(route);
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(iframeSrc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Load route source code if split view is enabled
  useEffect(() => {
    if (!showCodeSplit) return;
    const currentRouteObj = activeWorkspace.routes.find((r) => r.path === activeRoute);
    if (!currentRouteObj) return;

    setLoadingCode(true);
    // Attempt to load code
    fetch(`${backendBase}/api/v1/codynex/github/repos/workspace-file?path=${encodeURIComponent(currentRouteObj.filePath)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.content) {
          setActiveCodeContent(data.data.content);
        } else {
          setActiveCodeContent(
            `// ${currentRouteObj.filePath}\n// Live route component rendered by CodyNex OS\nexport default function Page() {\n  return <div>${currentRouteObj.label}</div>;\n}`
          );
        }
      })
      .catch(() => {
        setActiveCodeContent(
          `// ${currentRouteObj.filePath}\n// Active Next.js route: ${activeRoute}\n// Serving live layout & components`
        );
      })
      .finally(() => setLoadingCode(false));
  }, [showCodeSplit, activeRoute, activeWorkspace, backendBase]);

  // Viewport dimensions
  const viewportStyles = useMemo(() => {
    if (deviceMode === "mobile") {
      return isLandscape ? "w-[667px] h-[375px]" : "w-[375px] h-[720px]";
    }
    if (deviceMode === "tablet") {
      return isLandscape ? "w-[1024px] h-[700px]" : "w-[768px] h-[820px]";
    }
    return "w-full h-[780px]";
  }, [deviceMode, isLandscape]);

  return (
    <DashboardShell
      title="Live Frontend Preview Studio"
      subtitle="Interactive, real-time responsive browser preview for your AI-generated frontends, pages, and components."
    >
      <div className="space-y-4">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface p-3.5 shadow-sm">
          {/* Workspace / Repo Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-ink font-black text-xs">
                AW
              </span>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Active Frontend Workspace
                </label>
                <select
                  value={selectedWorkspaceName}
                  onChange={(e) => {
                    setSelectedWorkspaceName(e.target.value);
                    setActiveRoute("/");
                    setInputRoute("/");
                  }}
                  className="block h-7 rounded border border-surface-border bg-surface px-2 text-xs font-bold text-ink focus:border-brand focus:outline-none"
                >
                  {availableWorkspaces.map((ws) => (
                    <option key={ws.name} value={ws.name}>
                      {ws.owner}/{ws.name} ({ws.framework})
                    </option>
                  ))}
                  {availableWorkspaces.length === 0 && (
                    <option value="aliza-wears">CodynexNepal/aliza-wears (Next.js 15)</option>
                  )}
                </select>
              </div>
            </div>

            <Badge tone="green">{activeWorkspace.framework}</Badge>
          </div>

          {/* Viewport & Device Toggles */}
          <div className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-muted/40 p-1">
            <button
              onClick={() => {
                setDeviceMode("desktop");
                setIsLandscape(false);
              }}
              title="Desktop View (100%)"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceMode === "desktop"
                  ? "bg-brand text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              onClick={() => setDeviceMode("tablet")}
              title="Tablet View (768px)"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceMode === "tablet"
                  ? "bg-brand text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <Tablet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tablet</span>
            </button>
            <button
              onClick={() => setDeviceMode("mobile")}
              title="Mobile View (375px)"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                deviceMode === "mobile"
                  ? "bg-brand text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mobile</span>
            </button>

            {deviceMode !== "desktop" && (
              <button
                onClick={() => setIsLandscape(!isLandscape)}
                title="Rotate Orientation"
                className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant={showCodeSplit ? "dark" : "outline"}
              size="sm"
              onClick={() => setShowCodeSplit(!showCodeSplit)}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{showCodeSplit ? "Hide Code" : "Split Code"}</span>
            </Button>

            <Button variant="outline" size="sm" onClick={handleRefresh} title="Reload Preview Frame">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            <Button variant="outline" size="sm" onClick={handleCopyLink} title="Copy Live URL">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>

            <a
              href={iframeSrc}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-surface-border bg-surface px-3 text-[13px] font-medium text-ink hover:border-ink transition-colors"
            >
              <span>Open Tab</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Browser Chrome & Route Navigator */}
        <div className="rounded-xl border border-surface-border bg-surface shadow-sm overflow-hidden">
          {/* Simulated Browser URL bar */}
          <div className="flex items-center gap-2 border-b border-surface-border bg-[#F6F8FA] px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></span>
              <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]"></span>
            </div>

            {/* Address Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNavigate(inputRoute);
              }}
              className="flex-1 max-w-xl mx-auto flex items-center gap-2 rounded-md border border-surface-border bg-white px-3 py-1 text-xs shadow-inner"
            >
              <Globe className="h-3.5 w-3.5 text-ink-muted" />
              <span className="font-mono text-ink-muted select-none">alizawears.local</span>
              <input
                type="text"
                value={inputRoute}
                onChange={(e) => setInputRoute(e.target.value)}
                placeholder="/"
                className="flex-1 font-mono text-xs text-ink outline-none bg-transparent"
              />
              <span className="rounded bg-surface-muted px-1.5 py-0.2 text-[10px] font-bold text-ink-muted uppercase">
                ENTER
              </span>
            </form>

            <span className="text-[11px] font-medium text-ink-muted hidden md:inline">
              ⚡ Hot Reloading Active
            </span>
          </div>

          {/* Route Quick Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-surface-border bg-white px-3.5 py-2 text-xs">
            <span className="font-bold text-[11px] uppercase tracking-wider text-ink-muted mr-1">
              Discovered Routes:
            </span>
            {activeWorkspace.routes.map((r) => {
              const isCurrent = activeRoute === r.path;
              return (
                <button
                  key={r.path}
                  onClick={() => handleNavigate(r.path)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    isCurrent
                      ? "bg-ink text-white shadow-sm"
                      : "bg-surface-muted/60 text-ink hover:bg-surface-muted border border-surface-border/60"
                  }`}
                >
                  <span>{r.label}</span>
                  <span className="text-[10px] opacity-70 font-mono">({r.path})</span>
                </button>
              );
            })}
          </div>

          {/* Preview Viewport Canvas */}
          <div
            className={`p-4 transition-all duration-300 flex justify-center items-start ${
              deviceMode === "desktop" ? "bg-white" : "bg-[#0E0F0C]/5 min-h-[820px]"
            }`}
          >
            <div className="w-full flex gap-4 justify-center items-start">
              {/* Responsive Frame */}
              <div
                className={`transition-all duration-300 ${viewportStyles} ${
                  deviceMode !== "desktop"
                    ? "rounded-[36px] border-[10px] border-[#1E1E1E] shadow-2xl overflow-hidden bg-white ring-1 ring-black/10"
                    : "rounded-lg border border-surface-border/50 shadow-sm overflow-hidden"
                }`}
              >
                {deviceMode !== "desktop" && (
                  <div className="bg-[#1E1E1E] h-5 flex items-center justify-center">
                    <div className="h-3 w-28 rounded-full bg-black"></div>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={iframeSrc}
                  title="CodyNex OS Live Frontend Preview"
                  className="w-full h-full border-none bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>

              {/* Code Split Drawer */}
              {showCodeSplit && (
                <div className="w-[420px] shrink-0 rounded-xl border border-surface-border bg-[#0E0F0C] text-neutral-200 shadow-xl overflow-hidden flex flex-col h-[780px]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 bg-neutral-900">
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-lime" />
                      <span className="text-xs font-mono font-bold text-white">
                        {activeWorkspace.routes.find((r) => r.path === activeRoute)?.filePath || "src/app/page.tsx"}
                      </span>
                    </div>
                    <Badge tone="yellow">Live Source</Badge>
                  </div>
                  <div className="p-3.5 flex-1 overflow-auto font-mono text-[11px] leading-relaxed text-neutral-300">
                    {loadingCode ? (
                      <div className="py-10 text-center text-xs text-neutral-400">Loading route source...</div>
                    ) : (
                      <pre className="whitespace-pre-wrap">{activeCodeContent}</pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
