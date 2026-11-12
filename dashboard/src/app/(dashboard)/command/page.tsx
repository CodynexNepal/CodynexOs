"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  FolderGit2,
  HelpCircle,
  Megaphone,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge, statusTone } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { LiveCompanyFlowVisualizer } from "@/components/domain/LiveCompanyFlowVisualizer";
import { useApiQuery } from "@/hooks/useApi";
import { commandSchema } from "@/schemas/forms.schema";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { cn, formatDateTime } from "@/lib/utils";
import type { BusinessItem, ProjectItem } from "@/types/os";

interface CommandFormValues {
  title?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  instruction: string;
  clarificationAnswer?: string;
}

type DirectiveCategory = "ALL" | "ENGINEERING" | "GROWTH" | "QA";

interface PlaybookTemplate {
  category: Exclude<DirectiveCategory, "ALL">;
  label: string;
  title: string;
  priority: CommandFormValues["priority"];
  instruction: string;
}

const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    category: "GROWTH",
    label: "Hostel Outreach Campaign",
    title: "Kathmandu Hostel B2B Outreach",
    priority: "HIGH",
    instruction:
      "Find 100 hostel owners in Kathmandu from public listings, deduplicate leads, and prepare an outreach email campaign for CEO approval.",
  },
  {
    category: "ENGINEERING",
    label: "Build Feature & Open PR",
    title: "Analytics Module + PR",
    priority: "HIGH",
    instruction:
      "Build a new analytics module for Hostel Ghar with backend API, unit tests, and dashboard view, then commit on a task branch and open a PR.",
  },
  {
    category: "ENGINEERING",
    label: "Import GitHub Org Repos",
    title: "GitHub Org Inventory Sync",
    priority: "MEDIUM",
    instruction:
      "Inspect and import all repositories under CodynexNepal on GitHub, sync branch metadata, and summarize architecture readiness.",
  },
  {
    category: "QA",
    label: "Performance & Test Audit",
    title: "API & Dashboard Verification Audit",
    priority: "CRITICAL",
    instruction:
      "Investigate API latency and dashboard test failures, run typecheck/lint/unit suites, and produce a verified QA release report.",
  },
];

const PRIORITIES: Array<{
  value: CommandFormValues["priority"];
  label: string;
  hint: string;
}> = [
  { value: "LOW", label: "Low", hint: "Backlog" },
  { value: "MEDIUM", label: "Medium", hint: "Standard" },
  { value: "HIGH", label: "High", hint: "Priority" },
  { value: "CRITICAL", label: "Critical", hint: "Immediate" },
];

export default function CommandCenterPage() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [templateTab, setTemplateTab] = useState<DirectiveCategory>("ALL");
  const [result, setResult] = useState<{
    project: { id: string; title: string; status: string };
    plannerSource: string;
    clarificationQuestions: string[];
    createdTaskCount: number;
  } | null>(null);

  const businessesQuery = useApiQuery<BusinessItem[]>(() => codynexApi.businesses.list());
  const projectsQuery = useApiQuery<ProjectItem[]>(() => codynexApi.projects());
  const projectsPagination = usePagination(projectsQuery.data ?? [], 6);

  const businesses = businessesQuery.data ?? [];
  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId) ?? null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CommandFormValues>({
    resolver: yupResolver(commandSchema),
    defaultValues: { priority: "HIGH", instruction: "", title: "", clarificationAnswer: "" },
  });

  const currentPriority = watch("priority");
  const currentInstruction = watch("instruction") ?? "";

  const onSubmit = async (values: CommandFormValues) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const scopedInstruction =
        selectedBusiness && !values.instruction.toLowerCase().includes(selectedBusiness.name.toLowerCase())
          ? `[Business: ${selectedBusiness.name}${selectedBusiness.defaultGithubOwner ? ` · GitHub: ${selectedBusiness.defaultGithubOwner}` : ""}] ${values.instruction.trim()}`
          : values.instruction.trim();

      const res = await codynexApi.command.issue({
        ...values,
        instruction: scopedInstruction,
      });
      const created = unwrap<{
        project: { id: string; title: string; status: string };
        plannerSource: string;
        clarificationQuestions: string[];
        createdTaskCount: number;
      }>(res.data);
      setResult(created);
      projectsQuery.refetch();
    } catch (err) {
      setErrorMsg(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const applyTemplate = (tpl: PlaybookTemplate) => {
    setValue("title", tpl.title, { shouldValidate: true });
    setValue("priority", tpl.priority, { shouldValidate: true });
    setValue("instruction", tpl.instruction, { shouldValidate: true });
    setShowTitleInput(true);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit(onSubmit)();
    }
  };

  const filteredTemplates = PLAYBOOK_TEMPLATES.filter(
    (t) => templateTab === "ALL" || t.category === templateTab
  );

  return (
    <DashboardShell
      title="AI Command Center"
      subtitle="Issue natural-language CEO directives — decomposed into dependency-tracked tasks for your AI workforce"
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Primary CEO Command Composer */}
          <div className="space-y-5 lg:col-span-8">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-muted/60 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-ink">
                    <Cpu className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-ink">CEO Directive Composer</h2>
                    <p className="text-[11px] text-ink-muted">
                      AI COO plans tasks, assigns departments &amp; enforces approval gates
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="green">AI COO Ready</Badge>
                  <Badge tone="gray">Free-Tier Lock</Badge>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-5" noValidate>
                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-md border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                  >
                    {errorMsg}
                  </div>
                )}

                {/* Business Context + Priority Bar */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="command-business-select"
                      className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Target Business
                    </label>
                    <select
                      id="command-business-select"
                      value={selectedBusinessId}
                      onChange={(e) => setSelectedBusinessId(e.target.value)}
                      className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
                    >
                      <option value="">All / CodyNex Global</option>
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} {b.domain ? `(${b.domain})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                      Execution Priority
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 rounded-md border border-surface-border bg-surface-muted p-1">
                      {PRIORITIES.map((p) => {
                        const active = currentPriority === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setValue("priority", p.value, { shouldValidate: true })}
                            className={cn(
                              "rounded px-2 py-1.5 text-center text-xs font-semibold transition-colors",
                              active
                                ? p.value === "CRITICAL"
                                  ? "bg-red-600 text-white"
                                  : "bg-brand-ink text-white dark:bg-brand dark:text-brand-ink"
                                : "text-ink-muted hover:text-ink"
                            )}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Optional Project Title */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-[13px] font-semibold text-ink">
                      Natural-Language Directive
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTitleInput((prev) => !prev)}
                      className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      {showTitleInput ? "Hide custom title" : "+ Custom project title"}
                    </button>
                  </div>

                  {showTitleInput && (
                    <div className="mb-3">
                      <Input
                        placeholder="Project title (optional — auto-derived by AI COO if left blank)"
                        error={errors.title?.message}
                        {...register("title")}
                      />
                    </div>
                  )}

                  <Textarea
                    rows={5}
                    placeholder="Example: Build a tenant billing export endpoint for Hostel Ghar, run unit tests, and open a verified pull request..."
                    onKeyDown={handleComposerKeyDown}
                    error={errors.instruction?.message}
                    {...register("instruction")}
                  />

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
                    <span>
                      Press <kbd className="rounded border border-surface-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd> +{" "}
                      <kbd className="rounded border border-surface-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> to dispatch
                    </span>
                    <span className="tabular-nums">{currentInstruction.length} / 4000 chars</span>
                  </div>
                </div>

                {/* Clarification Gate */}
                {result && result.clarificationQuestions.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                      <HelpCircle className="h-4 w-4" />
                      Clarification Required by AI COO
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-amber-950 dark:text-amber-100">
                      {result.clarificationQuestions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                    <Textarea
                      label="Your Clarification"
                      rows={2}
                      placeholder="Provide scope, target repo, or constraint details and resubmit..."
                      {...register("clarificationAnswer")}
                    />
                  </div>
                )}

                {/* Safety Pipeline & Submit */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-surface-border pt-4">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-[#14532D] dark:text-brand" />
                      DAG Task Plan
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FolderGit2 className="h-3.5 w-3.5" />
                      Branch-Protected
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      CEO Approval Gate
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentInstruction.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          reset({ priority: "HIGH", instruction: "", title: "", clarificationAnswer: "" });
                          setResult(null);
                          setErrorMsg(null);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                    <Button type="submit" variant="primary" loading={submitting}>
                      <Send className="h-4 w-4" />
                      Dispatch to AI COO
                    </Button>
                  </div>
                </div>
              </form>
            </Card>

            {/* Execution Confirmation Banner */}
            {result && (
              <Card className="border-[#9FE870] bg-[#F5FEE8] p-5 dark:border-[#2F5D14] dark:bg-[#13220B]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#14532D] dark:text-[#C3FF7D]" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">{result.project.title}</h3>
                        <Badge tone={statusTone(result.project.status)}>{result.project.status}</Badge>
                        <Badge tone="blue">Planner: {result.plannerSource}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        Decomposed into{" "}
                        <strong className="tabular-nums text-ink">{result.createdTaskCount}</strong>{" "}
                        dependency-tracked task(s) in PostgreSQL. Workers claim queued tasks automatically.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/tasks"
                      className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      Track Tasks
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href="/deployments"
                      className="inline-flex items-center gap-1 rounded-md bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 dark:bg-brand dark:text-brand-ink"
                    >
                      Approvals Queue
                    </Link>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right: Playbook Directives */}
          <Card className="h-fit lg:col-span-4">
            <CardHeader
              title="Directive Playbooks"
              subtitle="One-click executive templates"
              action={<Terminal className="h-4 w-4 text-ink-muted" />}
            />
            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-1">
                {(
                  [
                    { id: "ALL", label: "All" },
                    { id: "ENGINEERING", label: "Engineering" },
                    { id: "GROWTH", label: "Growth" },
                    { id: "QA", label: "QA" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTemplateTab(tab.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      templateTab === tab.id
                        ? "bg-brand text-brand-ink"
                        : "bg-surface-muted text-ink-muted hover:text-ink"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                {filteredTemplates.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="group w-full rounded-md border border-surface-border bg-surface-muted/50 p-3 text-left transition-colors hover:border-ink hover:bg-surface"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
                        {tpl.category === "GROWTH" ? (
                          <Megaphone className="h-3.5 w-3.5 text-ink-muted" />
                        ) : tpl.category === "QA" ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" />
                        ) : (
                          <FolderGit2 className="h-3.5 w-3.5 text-ink-muted" />
                        )}
                        {tpl.label}
                      </span>
                      <Badge tone={tpl.priority === "CRITICAL" ? "red" : "gray"}>
                        {tpl.priority}
                      </Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">
                      {tpl.instruction}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Live Parallel AI Workforce & Company Flow DAG */}
        <LiveCompanyFlowVisualizer projectId={result?.project.id} />

        {/* Recent CEO Directives & Projects */}
        <div className="space-y-3">
          {projectsQuery.loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <>
              <Card className="overflow-x-auto">
                <CardHeader
                  title="Recent CEO Directives"
                  subtitle="Live project plans created from Command Center"
                  action={
                    <Link
                      href="/tasks"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                    >
                      Open Task Board
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  }
                />
                {(projectsQuery.data ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-xs text-ink-muted">
                    <Clock className="h-4 w-4" />
                    <span>No directives dispatched yet. Use the composer above to launch your first project.</span>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-surface-border bg-surface-muted uppercase text-ink-muted">
                      <tr>
                        <th className="px-4 py-3">Project / Directive</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {projectsPagination.pageItems.map((proj) => (
                        <tr key={proj.id} className="hover:bg-surface-muted/40">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-ink">{proj.title}</p>
                            <p className="line-clamp-1 text-[11px] text-ink-muted">
                              {proj.ceoInstruction}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={proj.priority === "CRITICAL" ? "red" : "gray"}>
                              {proj.priority}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={statusTone(proj.status)}>{proj.status}</Badge>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-ink-muted">
                            {formatDateTime(proj.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
              <Pagination
                page={projectsPagination.page}
                pageSize={projectsPagination.pageSize}
                totalItems={projectsPagination.totalItems}
                onPageChange={projectsPagination.setPage}
                onPageSizeChange={projectsPagination.setPageSize}
                pageSizeOptions={[6, 12, 24]}
              />
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
