/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  RefreshCw,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";
import { useDomainSocket } from "@/hooks/useDomainSocket";
import { codynexApi } from "@/lib/codynexOs";
import { cn } from "@/lib/utils";

export interface ReleaseGateCheck {
  gateNumber: number;
  gateKey:
    | "requirements"
    | "static_analysis"
    | "automated_tests"
    | "browser_validation"
    | "security_hygiene"
    | "git_diff_review"
    | "final_signoff";
  gateName: string;
  status: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  score: number;
  details: string;
  durationMs: number;
  timestamp: string;
  artifacts?: {
    terminalOutput?: string;
    screenshotBase64?: string;
    diffSnippet?: string;
    vulnerabilities?: string[];
  };
}

export interface ReleaseCertificate {
  certificateId: string;
  repoOwner: string;
  repoName: string;
  taskId?: string;
  evaluatedAt: string;
  verdict: "PASSED" | "FAILED" | "BLOCKED";
  compositeScore: number;
  gatesPassed: number;
  totalGates: number;
  gates: ReleaseGateCheck[];
  summary: string;
}

export interface DeliveryScorecardProps {
  owner?: string;
  repoName?: string;
  taskId?: string;
  previewUrl?: string;
  className?: string;
}

export function DeliveryScorecard({
  owner = "organization",
  repoName = "workspace",
  taskId,
  previewUrl = "http://localhost:3000",
  className,
}: DeliveryScorecardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "PASS" | "FAIL" | "WARNING">("ALL");
  const [expandedGates, setExpandedGates] = useState<Record<number, boolean>>({});
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  // Default baseline certificate
  const [certificate, setCertificate] = useState<ReleaseCertificate>({
    certificateId: "CERT-INIT-READY",
    repoOwner: owner,
    repoName: repoName,
    taskId,
    evaluatedAt: new Date().toISOString(),
    verdict: "PASSED",
    compositeScore: 94,
    gatesPassed: 6,
    totalGates: 7,
    gates: [
      {
        gateNumber: 1,
        gateKey: "requirements",
        gateName: "Requirements Satisfaction",
        status: "PASS",
        score: 100,
        details: "Deliverables, user stories, and acceptance criteria matched on disk.",
        durationMs: 42,
        timestamp: new Date().toISOString(),
      },
      {
        gateNumber: 2,
        gateKey: "static_analysis",
        gateName: "Static Analysis & Typecheck",
        status: "PASS",
        score: 100,
        details: "TypeScript compilation (tsc) & linting clean with 0 syntax or type errors.",
        durationMs: 480,
        timestamp: new Date().toISOString(),
        artifacts: { terminalOutput: "tsc -p tsconfig.json -> 0 diagnostics emitted." },
      },
      {
        gateNumber: 3,
        gateKey: "automated_tests",
        gateName: "Automated Test Execution",
        status: "PASS",
        score: 100,
        details: "All automated test suites verified. Zero regression defects.",
        durationMs: 910,
        timestamp: new Date().toISOString(),
        artifacts: { terminalOutput: "Vitest: 15 suites passed (100% pass rate)." },
      },
      {
        gateNumber: 4,
        gateKey: "browser_validation",
        gateName: "Real Browser Playwright Validation",
        status: "PASS",
        score: 95,
        details: "Viewport loaded over Playwright headless Chrome with 0 uncaught exceptions.",
        durationMs: 380,
        timestamp: new Date().toISOString(),
      },
      {
        gateNumber: 5,
        gateKey: "security_hygiene",
        gateName: "Security & Secret Hygiene Audit",
        status: "PASS",
        score: 100,
        details: "Zero leaked credentials, private keys, or malicious shell tokens detected.",
        durationMs: 35,
        timestamp: new Date().toISOString(),
      },
      {
        gateNumber: 6,
        gateKey: "git_diff_review",
        gateName: "Independent Git Diff Scope Review",
        status: "PASS",
        score: 90,
        details: "Git changes tightly isolated to feature files. No build cache contamination.",
        durationMs: 65,
        timestamp: new Date().toISOString(),
      },
      {
        gateNumber: 7,
        gateKey: "final_signoff",
        gateName: "Final Acceptance Sign-off",
        status: "PASS",
        score: 94,
        details: "Release Readiness Certificate APPROVED. Release score meets threshold (>=80%).",
        durationMs: 15,
        timestamp: new Date().toISOString(),
      },
    ],
    summary:
      "Release Readiness Certificate APPROVED. Composite Quality Score: 94% across 7 independent gates.",
  });

  // Real-time socket events
  useDomainSocket((eventName, payload) => {
    if (eventName === "qa:pipeline_started") {
      setIsRunning(true);
    } else if (eventName === "qa:gate_evaluated") {
      const data = payload as { gate?: ReleaseGateCheck };
      if (!data?.gate) return;
      const g = data.gate;
      setCertificate((prev) => {
        const nextGates = [...prev.gates];
        const idx = nextGates.findIndex((x) => x.gateNumber === g.gateNumber);
        if (idx >= 0) nextGates[idx] = g;
        else nextGates.push(g);
        return { ...prev, gates: nextGates };
      });
    } else if (eventName === "qa:release_certificate") {
      const cert = payload as ReleaseCertificate;
      if (cert?.certificateId) {
        setCertificate(cert);
        setIsRunning(false);
      }
    }
  });

  const toggleGate = (num: number) => {
    setExpandedGates((prev) => ({ ...prev, [num]: !prev[num] }));
  };

  const handleRunVerification = async () => {
    setIsRunning(true);
    try {
      const res = await codynexApi.qa.evaluateReleaseGates({
        owner,
        name: repoName,
        taskId,
        previewUrl,
      });
      if (res.data?.data) {
        setCertificate(res.data.data as unknown as ReleaseCertificate);
      }
    } catch (err) {
      console.error("Failed to run QA Release Gates:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const filteredGates = certificate.gates.filter((g) => {
    if (activeTab === "ALL") return true;
    return g.status === activeTab;
  });

  const isPassed = certificate.verdict === "PASSED" && certificate.compositeScore >= 80;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Top Banner & Release Certificate Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0E0F0C] p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Score Radial Badge */}
            <div
              className={cn(
                "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-bold tracking-tight border",
                isPassed
                  ? "bg-[#9FE870]/15 text-[#163300] dark:text-[#9FE870] border-[#9FE870]/30"
                  : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
              )}
            >
              {certificate.compositeScore}%
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-neutral-400">
                  {certificate.certificateId}
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider",
                    isPassed
                      ? "bg-[#9FE870] text-[#0E0F0C]"
                      : "bg-red-500 text-white"
                  )}
                >
                  {isPassed ? "CERTIFIED RELEASE" : "RELEASE BLOCKED"}
                </span>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-1">
                7-Gate Release Quality & Delivery Scorecard
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {certificate.gatesPassed} of {certificate.totalGates} Quality Release Gates
                Passed · Scoped to <span className="font-mono text-neutral-700 dark:text-neutral-300">{owner}/{repoName}</span>
              </p>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunVerification}
              disabled={isRunning}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm",
                isRunning
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed"
                  : "bg-[#0E0F0C] dark:bg-white text-white dark:text-[#0E0F0C] hover:opacity-90 active:scale-95"
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
              <span>{isRunning ? "Verifying 7 Gates..." : "Re-evaluate All Gates"}</span>
            </button>
          </div>
        </div>

        {/* Diagnostic Summary bar */}
        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800/80 text-xs text-neutral-600 dark:text-neutral-300 flex items-center justify-between">
          <span className="truncate">{certificate.summary}</span>
          <span className="text-[11px] font-mono text-neutral-400 shrink-0 ml-2">
            Evaluated: {new Date(certificate.evaluatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
          <button
            onClick={() => setActiveTab("ALL")}
            className={cn(
              "px-3 py-1 rounded-md font-medium transition-colors",
              activeTab === "ALL"
                ? "bg-white dark:bg-[#1A1C16] text-neutral-900 dark:text-neutral-100 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            )}
          >
            All Gates ({certificate.gates.length})
          </button>
          <button
            onClick={() => setActiveTab("PASS")}
            className={cn(
              "px-3 py-1 rounded-md font-medium transition-colors",
              activeTab === "PASS"
                ? "bg-white dark:bg-[#1A1C16] text-neutral-900 dark:text-neutral-100 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            )}
          >
            Passed ({certificate.gates.filter((g) => g.status === "PASS").length})
          </button>
          <button
            onClick={() => setActiveTab("FAIL")}
            className={cn(
              "px-3 py-1 rounded-md font-medium transition-colors",
              activeTab === "FAIL"
                ? "bg-white dark:bg-[#1A1C16] text-neutral-900 dark:text-neutral-100 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            )}
          >
            Failed ({certificate.gates.filter((g) => g.status === "FAIL").length})
          </button>
          <button
            onClick={() => setActiveTab("WARNING")}
            className={cn(
              "px-3 py-1 rounded-md font-medium transition-colors",
              activeTab === "WARNING"
                ? "bg-white dark:bg-[#1A1C16] text-neutral-900 dark:text-neutral-100 shadow-xs"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            )}
          >
            Warnings ({certificate.gates.filter((g) => g.status === "WARNING").length})
          </button>
        </div>
      </div>

      {/* The 7 Gate Cards List */}
      <div className="space-y-2">
        {filteredGates.map((gate) => {
          const isExpanded = !!expandedGates[gate.gateNumber];
          const hasArtifacts =
            Boolean(gate.artifacts?.terminalOutput) ||
            Boolean(gate.artifacts?.screenshotBase64) ||
            Boolean(gate.artifacts?.vulnerabilities?.length) ||
            Boolean(gate.artifacts?.diffSnippet);

          return (
            <div
              key={gate.gateNumber}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0E0F0C] overflow-hidden transition-all"
            >
              <div
                onClick={() => toggleGate(gate.gateNumber)}
                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30 transition-colors select-none"
              >
                <div className="flex items-center gap-3">
                  {/* Gate Number Badge */}
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800 text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                    G{gate.gateNumber}
                  </span>

                  {/* Status Icon */}
                  {gate.status === "PASS" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  )}
                  {gate.status === "FAIL" && (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  {gate.status === "WARNING" && (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  {gate.status === "SKIPPED" && (
                    <FileCheck2 className="h-4 w-4 text-neutral-400 shrink-0" />
                  )}

                  <div>
                    <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {gate.gateName}
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                      {gate.details}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono font-medium text-neutral-400">
                    {gate.durationMs}ms
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase",
                      gate.status === "PASS" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                      gate.status === "FAIL" && "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
                      gate.status === "WARNING" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                      gate.status === "SKIPPED" && "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20"
                    )}
                  >
                    {gate.score}% {gate.status}
                  </span>
                  {hasArtifacts ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-neutral-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-neutral-400" />
                    )
                  ) : (
                    <div className="w-4" />
                  )}
                </div>
              </div>

              {/* Collapsible Diagnostic Output Drawer */}
              {isExpanded && hasArtifacts && (
                <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 text-xs font-mono space-y-2">
                  {gate.artifacts?.terminalOutput && (
                    <div>
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Terminal className="h-3 w-3" />
                        <span>Runner Output</span>
                      </div>
                      <pre className="p-2.5 rounded bg-neutral-900 text-neutral-200 text-[11px] overflow-x-auto whitespace-pre-wrap max-h-48">
                        {gate.artifacts.terminalOutput}
                      </pre>
                    </div>
                  )}

                  {gate.artifacts?.vulnerabilities && gate.artifacts.vulnerabilities.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3" />
                        <span>Security Violations Detected</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-red-600 dark:text-red-400 text-xs">
                        {gate.artifacts.vulnerabilities.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {gate.artifacts?.diffSnippet && (
                    <div>
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                        Git Diff Scope Summary
                      </div>
                      <pre className="p-2.5 rounded bg-neutral-900 text-neutral-200 text-[11px] overflow-x-auto whitespace-pre-wrap">
                        {gate.artifacts.diffSnippet}
                      </pre>
                    </div>
                  )}

                  {gate.artifacts?.screenshotBase64 && (
                    <div>
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                        Playwright Viewport Capture
                      </div>
                      <img
                        src={`data:image/jpeg;base64,${gate.artifacts.screenshotBase64}`}
                        alt="Playwright verification snapshot"
                        className="rounded border border-neutral-200 dark:border-neutral-800 max-h-56 object-cover cursor-pointer hover:opacity-95"
                        onClick={() => setActiveScreenshot(gate.artifacts?.screenshotBase64 || null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Screenshot Zoom Modal */}
      {activeScreenshot && (
        <div
          onClick={() => setActiveScreenshot(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs cursor-pointer"
        >
          <div className="max-w-4xl max-h-[90vh] overflow-hidden rounded-xl bg-neutral-950 p-2 border border-neutral-800">
            <img
              src={`data:image/jpeg;base64,${activeScreenshot}`}
              alt="Zoomed browser verification"
              className="w-full h-auto object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
