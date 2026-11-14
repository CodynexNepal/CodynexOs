"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";
import type {
  FileEditCompleteEvent,
  FileStreamEvent,
  GitFileStatusCode,
  WorkspaceFileEntry,
  WorkspaceGitState,
} from "@/types/os";

export interface LiveCodexFileEditorProps {
  repoId?: string;
  projectId?: string;
  initialFilePath?: string;
  className?: string;
  autoExpand?: boolean;
}

interface RepoOption {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
}

interface FileContentState {
  path: string;
  content: string;
  originalContent: string;
  status: GitFileStatusCode;
  isNew: boolean;
}

export function LiveCodexFileEditor({
  repoId: propRepoId,
  projectId: _projectId,
  initialFilePath,
  className,
  autoExpand = false,
}: LiveCodexFileEditorProps) {
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>(propRepoId || "");

  const [gitState, setGitState] = useState<WorkspaceGitState | null>(null);
  const [fileEntries, setFileEntries] = useState<WorkspaceFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [selectedFilePath, setSelectedFilePath] = useState<string>(initialFilePath || "");
  const [fileData, setFileData] = useState<FileContentState | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  // Codex live typing & streaming state
  const [displayedContent, setDisplayedContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState(0);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);
  const [activeAgentRole, setActiveAgentRole] = useState<string | null>(null);
  const [activeStreamLine, setActiveStreamLine] = useState<number>(0);
  const [totalStreamLines, setTotalStreamLines] = useState<number>(0);

  // Playback & Replay state
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"CODEX" | "DIFF">("CODEX");
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const [filterQuery, setFilterQuery] = useState("");

  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync prop repoId
  useEffect(() => {
    if (propRepoId && propRepoId !== selectedRepoId) {
      setSelectedRepoId(propRepoId);
    }
  }, [propRepoId, selectedRepoId]);

  // Fetch available repositories
  const fetchRepos = useCallback(async () => {
    try {
      const res = await codynexApi.github.repos();
      const list = unwrap<RepoOption[]>(res.data) ?? [];
      setRepos(list);
      if (!selectedRepoId && list.length > 0) {
        setSelectedRepoId(list[0].id);
      }
    } catch {
      // ignore
    }
  }, [selectedRepoId]);

  useEffect(() => {
    void fetchRepos();
  }, [fetchRepos]);

  // Fetch workspace files and git status
  const fetchWorkspace = useCallback(
    async (repoId: string) => {
      if (!repoId) return;
      try {
        setLoadingFiles(true);
        const res = await codynexApi.github.workspaceFiles(repoId, "");
        const payload = unwrap<{
          cloned: boolean;
          entries: WorkspaceFileEntry[];
          gitState: WorkspaceGitState;
        }>(res.data);

        setGitState(payload.gitState);
        setFileEntries(payload.entries || []);

        // If no file selected yet, auto-select first modified/added file, or first file
        if (!selectedFilePath && payload.gitState?.fileStatuses?.length) {
          const firstChanged = payload.gitState.fileStatuses[0].path;
          setSelectedFilePath(firstChanged);
        } else if (!selectedFilePath && payload.entries?.length) {
          const firstFile = payload.entries.find((e) => e.type === "file");
          if (firstFile) setSelectedFilePath(firstFile.path);
        }
      } catch {
        // ignore
      } finally {
        setLoadingFiles(false);
      }
    },
    [selectedFilePath]
  );

  useEffect(() => {
    if (selectedRepoId) {
      void fetchWorkspace(selectedRepoId);
    }
  }, [selectedRepoId, fetchWorkspace]);

  // Codex Replay animation
  const startCodexReplay = useCallback(
    (targetContent: string) => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      setIsPlayingReplay(true);
      setIsStreaming(true);
      setActiveAgentName(activeAgentName || "Codex Agent");
      setActiveAgentRole(activeAgentRole || "Code Synthesizer");

      const lines = targetContent.split("\n");
      const total = lines.length;
      setTotalStreamLines(total);
      setDisplayedContent("");
      setActiveStreamLine(0);
      setStreamingProgress(0);

      let currentLineIdx = 0;
      const stepInterval = Math.max(15, Math.floor(60 / replaySpeed));

      replayTimerRef.current = setInterval(() => {
        currentLineIdx += Math.max(1, Math.floor(replaySpeed * 2));
        if (currentLineIdx >= total) {
          setDisplayedContent(targetContent);
          setActiveStreamLine(total);
          setStreamingProgress(100);
          setIsStreaming(false);
          setIsPlayingReplay(false);
          if (replayTimerRef.current) clearInterval(replayTimerRef.current);
        } else {
          setDisplayedContent(lines.slice(0, currentLineIdx).join("\n"));
          setActiveStreamLine(currentLineIdx);
          setStreamingProgress(Math.min(100, Math.round((currentLineIdx / total) * 100)));
        }

        // Auto-scroll to bottom of live stream
        if (editorScrollRef.current) {
          editorScrollRef.current.scrollTop = editorScrollRef.current.scrollHeight;
        }
      }, stepInterval);
    },
    [activeAgentName, activeAgentRole, replaySpeed]
  );

  const stopReplay = useCallback(() => {
    if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    setIsPlayingReplay(false);
    setIsStreaming(false);
    if (fileData) {
      setDisplayedContent(fileData.content);
    }
  }, [fileData]);

  // Fetch active file content
  const loadFileContent = useCallback(
    async (repoId: string, path: string, triggerAnimation = false) => {
      if (!repoId || !path) return;
      try {
        setLoadingFile(true);
        const res = await codynexApi.github.workspaceReadFile(repoId, path);
        const data = unwrap<{
          path: string;
          content: string;
          originalContent?: string;
          status?: GitFileStatusCode;
          isNew?: boolean;
        }>(res.data);

        const content = data.content || "";
        const original = data.originalContent ?? "";
        const isNew = data.isNew ?? !original;
        const status: GitFileStatusCode = data.status || (isNew ? "A" : content !== original ? "M" : "U");

        setFileData({
          path: data.path,
          content,
          originalContent: original,
          status,
          isNew,
        });

        if (triggerAnimation) {
          startCodexReplay(content);
        } else {
          setDisplayedContent(content);
        }
      } catch {
        // ignore
      } finally {
        setLoadingFile(false);
      }
    },
    [startCodexReplay]
  );

  useEffect(() => {
    if (selectedRepoId && selectedFilePath) {
      void loadFileContent(selectedRepoId, selectedFilePath, false);
    }
  }, [selectedRepoId, selectedFilePath, loadFileContent]);

  // WebSocket Live Stream Listeners
  useDomainSocket((eventName, payload: unknown) => {
    if (eventName === "file:edit:start") {
      const ev = payload as FileStreamEvent;
      if (!selectedRepoId || ev.repoId === selectedRepoId) {
        setSelectedFilePath(ev.filePath);
        setIsStreaming(true);
        setActiveAgentName(ev.agentName || "AI Engineer");
        setActiveAgentRole(ev.agentRole || "Full-Stack Lead");
        setDisplayedContent("");
        setTotalStreamLines(ev.totalLines || 0);
        setActiveStreamLine(0);
        setStreamingProgress(0);
      }
    } else if (eventName === "file:stream") {
      const ev = payload as FileStreamEvent;
      if (!selectedRepoId || ev.repoId === selectedRepoId) {
        if (ev.filePath && ev.filePath !== selectedFilePath) {
          setSelectedFilePath(ev.filePath);
        }
        setIsStreaming(true);
        setActiveAgentName(ev.agentName || "AI Engineer");
        setActiveAgentRole(ev.agentRole || "Full-Stack Lead");
        if (typeof ev.currentContent === "string") {
          setDisplayedContent(ev.currentContent);
        }
        if (typeof ev.currentLine === "number") setActiveStreamLine(ev.currentLine);
        if (typeof ev.totalLines === "number") setTotalStreamLines(ev.totalLines);
        if (typeof ev.progress === "number") setStreamingProgress(ev.progress);

        if (editorScrollRef.current) {
          editorScrollRef.current.scrollTop = editorScrollRef.current.scrollHeight;
        }
      }
    } else if (eventName === "file:edit:complete") {
      const ev = payload as FileEditCompleteEvent;
      if (!selectedRepoId || ev.repoId === selectedRepoId) {
        setIsStreaming(false);
        setIsPlayingReplay(false);
        setDisplayedContent(ev.content || "");
        setStreamingProgress(100);
        setFileData({
          path: ev.filePath,
          content: ev.content,
          originalContent: "",
          status: ev.status || "A",
          isNew: ev.status === "A",
        });
        if (selectedRepoId) void fetchWorkspace(selectedRepoId);
      }
    } else if (eventName === "workspace:status") {
      if (selectedRepoId) void fetchWorkspace(selectedRepoId);
    }
  });

  const handleCopy = async () => {
    if (!displayedContent) return;
    try {
      await navigator.clipboard.writeText(displayedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const currentRepo = repos.find((r) => r.id === selectedRepoId) ?? repos[0] ?? null;

  // Status badge styling helper
  const renderStatusBadge = (code?: GitFileStatusCode) => {
    switch (code) {
      case "A":
        return (
          <span
            title="Added (New file created by agent)"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
          >
            A
          </span>
        );
      case "M":
        return (
          <span
            title="Modified (Existing file edited by agent)"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40"
          >
            M
          </span>
        );
      case "U":
      case "?":
        return (
          <span
            title="Untracked (New file in working tree)"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/40"
          >
            U
          </span>
        );
      case "D":
        return (
          <span
            title="Deleted"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40"
          >
            D
          </span>
        );
      case "R":
        return (
          <span
            title="Renamed"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/40"
          >
            R
          </span>
        );
      case "C":
        return (
          <span
            title="Conflict / Unmerged"
            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/40"
          >
            C
          </span>
        );
      default:
        return null;
    }
  };

  // Compute unified diff lines between original and current
  const diffLines = useMemo(() => {
    if (!fileData) return [];
    const orig = fileData.originalContent ? fileData.originalContent.split("\n") : [];
    const curr = displayedContent ? displayedContent.split("\n") : [];

    if (orig.length === 0) {
      return curr.map((line, idx) => ({
        type: "ADD" as const,
        lineNumOrig: null,
        lineNumCurr: idx + 1,
        text: line,
      }));
    }

    // Simple line diff visualization
    const max = Math.max(orig.length, curr.length);
    const result: Array<{
      type: "ADD" | "DEL" | "SAME";
      lineNumOrig: number | null;
      lineNumCurr: number | null;
      text: string;
    }> = [];

    let oIdx = 0;
    let cIdx = 0;

    while (oIdx < orig.length || cIdx < curr.length) {
      const oLine = orig[oIdx];
      const cLine = curr[cIdx];

      if (oLine === cLine) {
        result.push({
          type: "SAME",
          lineNumOrig: oIdx + 1,
          lineNumCurr: cIdx + 1,
          text: oLine ?? "",
        });
        oIdx++;
        cIdx++;
      } else if (cLine !== undefined && (oLine === undefined || !orig.slice(oIdx).includes(cLine))) {
        result.push({
          type: "ADD",
          lineNumOrig: null,
          lineNumCurr: cIdx + 1,
          text: cLine,
        });
        cIdx++;
      } else if (oLine !== undefined) {
        result.push({
          type: "DEL",
          lineNumOrig: oIdx + 1,
          lineNumCurr: null,
          text: oLine,
        });
        oIdx++;
      } else {
        cIdx++;
      }
      if (result.length > 2000) break; // safety cutoff
    }

    return result;
  }, [fileData, displayedContent]);

  // Changed files from git status
  const changedFiles = useMemo(() => {
    return gitState?.fileStatuses || [];
  }, [gitState]);

  // Filtered files for drawer
  const visibleChangedFiles = useMemo(() => {
    if (!filterQuery) return changedFiles;
    return changedFiles.filter((f) => f.path.toLowerCase().includes(filterQuery.toLowerCase()));
  }, [changedFiles, filterQuery]);

  const displayedLines = useMemo(() => {
    return displayedContent.split("\n");
  }, [displayedContent]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden font-sans",
        isExpanded ? "fixed inset-4 z-50 rounded-xl" : "w-full",
        className
      )}
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#238636] text-white">
              <Code2 className="h-4 w-4" />
            </span>
            <span className="font-bold text-white text-xs tracking-wide">
              Codex Live File Stream
            </span>
          </div>

          {/* Repository Selector */}
          <div className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1">
            <FolderGit2 className="h-3.5 w-3.5 text-[#58a6ff]" />
            <select
              value={selectedRepoId}
              onChange={(e) => {
                setSelectedRepoId(e.target.value);
                setSelectedFilePath("");
              }}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#161b22] text-white">
                  {r.owner}/{r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Active Branch */}
          {gitState?.branch && (
            <div className="flex items-center gap-1 text-[11px] text-[#8b949e]">
              <GitBranch className="h-3.5 w-3.5 text-[#7ee787]" />
              <span className="font-mono text-[#7ee787] font-semibold">{gitState.branch}</span>
            </div>
          )}

          {/* Git Status Counts */}
          {gitState?.counts && (
            <div className="flex items-center gap-1 text-[10px]">
              {gitState.counts.added > 0 && (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold font-mono text-emerald-400 border border-emerald-500/30">
                  +{gitState.counts.added} A
                </span>
              )}
              {gitState.counts.modified > 0 && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold font-mono text-amber-400 border border-amber-500/30">
                  ~{gitState.counts.modified} M
                </span>
              )}
              {gitState.counts.untracked > 0 && (
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-bold font-mono text-sky-400 border border-sky-500/30">
                  ?{gitState.counts.untracked} U
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded-md border border-[#30363d] bg-[#0d1117] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("CODEX")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors",
                viewMode === "CODEX"
                  ? "bg-[#238636] text-white"
                  : "text-[#8b949e] hover:text-white"
              )}
            >
              <Zap className="h-3 w-3" />
              Codex Stream
            </button>
            <button
              type="button"
              onClick={() => setViewMode("DIFF")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors",
                viewMode === "DIFF"
                  ? "bg-[#238636] text-white"
                  : "text-[#8b949e] hover:text-white"
              )}
            >
              <Layers className="h-3 w-3" />
              Diff View
            </button>
          </div>

          {/* Replay Controls */}
          {fileData?.content && (
            <div className="flex items-center gap-1 rounded-md border border-[#30363d] bg-[#0d1117] px-1 py-0.5">
              {isPlayingReplay ? (
                <button
                  type="button"
                  onClick={stopReplay}
                  title="Pause stream replay"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-amber-400 hover:bg-[#21262d]"
                >
                  <Pause className="h-3 w-3" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startCodexReplay(fileData.content)}
                  title="Replay Codex live typing animation"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#58a6ff] hover:bg-[#21262d]"
                >
                  <Play className="h-3 w-3" />
                  Replay AI Edit
                </button>
              )}

              {/* Speed Toggle */}
              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(Number(e.target.value))}
                className="bg-transparent text-[11px] text-[#8b949e] focus:outline-none cursor-pointer px-1"
                title="Animation Speed"
              >
                <option value={1} className="bg-[#161b22] text-white">1x</option>
                <option value={2} className="bg-[#161b22] text-white">2x</option>
                <option value={4} className="bg-[#161b22] text-white">4x</option>
              </select>
            </div>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy file code"
            className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => {
              if (selectedRepoId) void fetchWorkspace(selectedRepoId);
              if (selectedRepoId && selectedFilePath) void loadFileContent(selectedRepoId, selectedFilePath, false);
            }}
            title="Refresh repository files"
            className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingFiles && "animate-spin")} />
          </button>

          {/* Fullscreen Expand */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? "Collapse" : "Expand to fullscreen"}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-white transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Workspace Grid: Left File Explorer & Right Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px] max-h-[640px] divide-y lg:divide-y-0 lg:divide-x divide-[#30363d]">
        {/* Left Changes & Files Drawer */}
        <div className="lg:col-span-4 flex flex-col bg-[#161b22] overflow-hidden">
          {/* Drawer Header & Search */}
          <div className="p-3 border-b border-[#30363d] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5 text-[#58a6ff]" />
                Changed Repository Files
              </span>
              <span className="rounded bg-[#21262d] px-2 py-0.5 font-mono text-[11px] text-[#8b949e]">
                {changedFiles.length} file{changedFiles.length === 1 ? "" : "s"}
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter files by path..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded border border-[#30363d] bg-[#0d1117] px-2.5 py-1 text-xs text-white placeholder:text-[#8b949e] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>

          {/* Changed Files List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {visibleChangedFiles.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[#8b949e]">
                {changedFiles.length === 0
                  ? "Working tree clean. All files committed."
                  : "No files match the search filter."}
              </div>
            ) : (
              visibleChangedFiles.map((f) => {
                const active = f.path === selectedFilePath;
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setSelectedFilePath(f.path)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors group",
                      active
                        ? "bg-[#21262d] text-white border-l-2 border-[#58a6ff]"
                        : "text-[#c9d1d9] hover:bg-[#21262d]/60 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className={cn("h-3.5 w-3.5 shrink-0", active ? "text-[#58a6ff]" : "text-[#8b949e]")} />
                      <span className="truncate font-mono text-[11px]" title={f.path}>
                        {f.path}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {renderStatusBadge(f.code)}
                    </div>
                  </button>
                );
              })
            )}

            {/* Other Repository Files Section */}
            {fileEntries.length > 0 && (
              <div className="pt-3 border-t border-[#30363d]/60 mt-3">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                  Workspace Tree ({fileEntries.length} items)
                </div>
                {fileEntries.map((fe) => {
                  if (fe.type === "dir") return null;
                  const active = fe.path === selectedFilePath;
                  return (
                    <button
                      key={fe.path}
                      type="button"
                      onClick={() => setSelectedFilePath(fe.path)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded px-2.5 py-1 text-left text-xs transition-colors",
                        active
                          ? "bg-[#21262d] text-white font-semibold"
                          : "text-[#8b949e] hover:bg-[#21262d]/40 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="h-3 w-3 shrink-0 text-[#8b949e]" />
                        <span className="truncate font-mono text-[11px]">{fe.path}</span>
                      </div>
                      {fe.gitStatus && renderStatusBadge(fe.gitStatus)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Code Streamer & Visualizer */}
        <div className="lg:col-span-8 flex flex-col bg-[#0d1117] overflow-hidden">
          {/* File Breadcrumb & Agent Status Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] bg-[#161b22] px-4 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[#58a6ff] font-semibold truncate">
                {currentRepo ? `${currentRepo.name}/` : ""}
                <span className="text-white">{selectedFilePath || "No file selected"}</span>
              </span>
              {fileData?.status && renderStatusBadge(fileData.status)}
            </div>

            {/* Live Streaming Indicator */}
            {isStreaming ? (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9FE870] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9FE870]"></span>
                </span>
                <span className="font-mono text-[11px] text-[#9FE870] font-bold">
                  {activeAgentName ? `${activeAgentName} streaming code...` : "Live Codex Stream"}
                </span>
                <span className="rounded bg-[#21262d] px-1.5 py-0.5 font-mono text-[10px] text-white">
                  Line {activeStreamLine}/{totalStreamLines || displayedLines.length} ({streamingProgress}%)
                </span>
              </div>
            ) : fileData ? (
              <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#7ee787]" />
                <span className="font-mono">
                  {displayedLines.length} lines • {displayedContent.length} bytes
                </span>
              </div>
            ) : null}
          </div>

          {/* Editor Body */}
          <div
            ref={editorScrollRef}
            className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed selection:bg-[#264f78]"
          >
            {loadingFile ? (
              <div className="flex h-64 items-center justify-center text-xs text-[#8b949e]">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#58a6ff]" />
                Loading file from repository workspace...
              </div>
            ) : !selectedFilePath ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-[#8b949e] p-6 space-y-2">
                <Terminal className="h-8 w-8 text-[#58a6ff]" />
                <p className="font-semibold text-white">Select a file from the repository drawer</p>
                <p className="max-w-md text-[11px]">
                  Files modified or created by your AI agents appear in the left sidebar with status tags like
                  [A] Added, [M] Modified, [U] Untracked.
                </p>
              </div>
            ) : viewMode === "DIFF" ? (
              /* Unified Diff View */
              <div className="space-y-0.5 divide-y divide-[#21262d]/40">
                {diffLines.length === 0 ? (
                  <div className="p-4 text-center text-[#8b949e]">No diff recorded for this file.</div>
                ) : (
                  diffLines.map((dl, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-3 py-0.5 px-2 rounded-sm",
                        dl.type === "ADD" && "bg-emerald-950/40 text-[#7ee787] border-l-2 border-emerald-500",
                        dl.type === "DEL" && "bg-rose-950/40 text-[#f85149] border-l-2 border-rose-500 line-through opacity-70",
                        dl.type === "SAME" && "text-[#8b949e]"
                      )}
                    >
                      <span className="w-8 shrink-0 select-none text-right font-mono text-[10px] text-[#484f58]">
                        {dl.lineNumCurr ?? dl.lineNumOrig ?? ""}
                      </span>
                      <span className="w-3 shrink-0 select-none font-bold">
                        {dl.type === "ADD" ? "+" : dl.type === "DEL" ? "-" : " "}
                      </span>
                      <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-[11px]">
                        {dl.text}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Codex Live Stream / Code View */
              <div className="relative">
                <table className="w-full border-collapse">
                  <tbody>
                    {displayedLines.map((line, idx) => {
                      const isHead = isStreaming && idx === displayedLines.length - 1;
                      return (
                        <tr
                          key={idx}
                          className={cn(
                            "hover:bg-[#161b22]/70 group",
                            isHead && "bg-[#238636]/15"
                          )}
                        >
                          <td className="w-10 select-none pr-3 text-right text-[10px] text-[#484f58] align-top">
                            {idx + 1}
                          </td>
                          <td className="whitespace-pre overflow-x-auto text-[11px] text-[#e6edf3]">
                            <span>{line}</span>
                            {/* Glowing animated cursor at the streaming position */}
                            {isHead && (
                              <span className="inline-block w-2 h-4 bg-[#9FE870] shadow-[0_0_8px_#9FE870] ml-0.5 align-middle animate-pulse" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom Status Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#30363d] bg-[#161b22] px-4 py-2 text-[11px] text-[#8b949e]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#9FE870]" />
                Codex AI Stream Engine
              </span>
              <span>•</span>
              <span>Status: {fileData?.isNew ? "Newly Created (A)" : fileData?.status === "M" ? "Modified (M)" : "Synchronized"}</span>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/github"
                className="inline-flex items-center gap-1 font-semibold text-[#58a6ff] hover:underline"
              >
                Open in GitHub Workspace
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
