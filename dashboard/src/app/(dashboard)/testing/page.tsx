"use client";

import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { TaskItem } from "@/types/os";

interface QaReportItem {
  id: string;
  taskId: string;
  verdict: string;
  failedComponent: string | null;
  correctionTaskId: string | null;
  summary: string;
  checksExecuted: Array<{ name: string; status: string; output?: string }>;
  createdAt: string;
}

export default function TestingCenterPage() {
  const { data, loading, error, refetch } = useApiQuery<QaReportItem[]>(() =>
    codynexApi.qa.reports()
  );
  const tasksQuery = useApiQuery<TaskItem[]>(() => codynexApi.tasks.list());

  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [verdict, setVerdict] = useState<"PASSED" | "FAILED" | "BLOCKED">("PASSED");
  const [failedComponent, setFailedComponent] = useState("");
  const [summary, setSummary] = useState("");
  const [tscStatus, setTscStatus] = useState("PASS");
  const [lintStatus, setLintStatus] = useState("PASS");
  const [testStatus, setTestStatus] = useState("PASS");
  const [saving, setSaving] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setActionErr(null);
    try {
      await codynexApi.qa.createReport({
        taskId,
        verdict,
        ...(verdict === "FAILED" && failedComponent ? { failedComponent } : {}),
        summary,
        checksExecuted: [
          { name: "tsc_noEmit", status: tscStatus },
          { name: "eslint", status: lintStatus },
          { name: "vitest", status: testStatus },
        ],
      });
      setOpen(false);
      setSummary("");
      setFailedComponent("");
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell
      title="Testing Center"
      subtitle="Independent QA verification evidence and automatic correction-task links"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Record QA Report
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No QA verification reports yet"
            description="QA Engineer verification runs record TypeScript, ESLint, unit, and integration test evidence here."
          />
        ) : (
          <div className="space-y-3">
            {data.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(r.verdict)}>{r.verdict}</Badge>
                    <span className="text-sm font-bold text-ink">{r.summary}</span>
                  </div>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatDateTime(r.createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.checksExecuted.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded border border-surface-border bg-surface-muted px-2.5 py-1 text-xs text-ink"
                    >
                      {c.name}: <strong>{c.status}</strong>
                    </span>
                  ))}
                </div>
                {r.correctionTaskId && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                    Spawned correction task: <code>{r.correctionTaskId}</code>
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Independent QA Verification">
        <form onSubmit={handleRecord} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Target Task</label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Select task...</option>
              {(tasksQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Verdict</label>
              <select
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as "PASSED" | "FAILED" | "BLOCKED")}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="PASSED">PASSED</option>
                <option value="FAILED">FAILED (Spawns Correction Task)</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>
            <Input
              label="Failed Component (if FAILED)"
              placeholder="auth.middleware.ts"
              value={failedComponent}
              onChange={(e) => setFailedComponent(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="mb-1 block font-medium text-ink">tsc</label>
              <select
                value={tscStatus}
                onChange={(e) => setTscStatus(e.target.value)}
                className="h-9 w-full rounded border border-surface-border bg-surface px-2 text-ink"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-ink">eslint</label>
              <select
                value={lintStatus}
                onChange={(e) => setLintStatus(e.target.value)}
                className="h-9 w-full rounded border border-surface-border bg-surface px-2 text-ink"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-ink">tests</label>
              <select
                value={testStatus}
                onChange={(e) => setTestStatus(e.target.value)}
                className="h-9 w-full rounded border border-surface-border bg-surface px-2 text-ink"
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
          </div>
          <Textarea
            label="Verification Summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
          />
          <Button type="submit" variant="dark" loading={saving}>
            Save QA Report
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
