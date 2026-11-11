"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Send, Terminal } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { commandSchema } from "@/schemas/forms.schema";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";

interface CommandFormValues {
  title?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  instruction: string;
  clarificationAnswer?: string;
}

const EXAMPLE_COMMANDS = [
  "Find 100 hostel owners in Kathmandu and prepare a marketing campaign.",
  "Build a new analytics module for Hostel Ghar with backend API, unit tests, and dashboard view.",
  "Investigate the API performance problem and produce a verification report.",
  "Fix all failing tests in the dashboard and submit a verified pull request.",
];

export default function CommandCenterPage() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    project: { id: string; title: string; status: string };
    plannerSource: string;
    clarificationQuestions: string[];
    createdTaskCount: number;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CommandFormValues>({
    resolver: yupResolver(commandSchema),
    defaultValues: { priority: "HIGH", instruction: "", title: "" },
  });

  const onSubmit = async (values: CommandFormValues) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await codynexApi.command.issue(values);
      setResult(unwrap(res.data));
    } catch (err) {
      setErrorMsg(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell
      title="AI Command Center"
      subtitle="Issue natural-language CEO directives to the AI COO & department orchestrator"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader
              title="CEO Instruction"
              subtitle="Converted into a dependency-tracked PostgreSQL project plan"
            />
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-5" noValidate>
              {errorMsg && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                  {errorMsg}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Input
                    label="Project Title (Optional)"
                    placeholder="Auto-derived if blank"
                    error={errors.title?.message}
                    {...register("title")}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Priority</label>
                  <select
                    {...register("priority")}
                    className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              <Textarea
                label="Natural-Language Directive"
                rows={5}
                placeholder="Describe what CodyNex should research, build, verify, or prepare..."
                error={errors.instruction?.message}
                {...register("instruction")}
              />

              {result && result.clarificationQuestions.length > 0 && (
                <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
                    Clarification Required by AI COO
                  </p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-amber-950 dark:text-amber-100">
                    {result.clarificationQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <Textarea
                    label="Your Clarification"
                    rows={2}
                    placeholder="Provide scope/constraint details and resubmit..."
                    {...register("clarificationAnswer")}
                  />
                </div>
              )}

              <Button type="submit" variant="primary" loading={submitting}>
                <Send className="h-4 w-4" />
                Dispatch to AI COO
              </Button>
            </form>
          </Card>

          {result && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">Execution Plan Created</h3>
                <div className="flex gap-2">
                  <Badge tone="green">{result.project.status}</Badge>
                  <Badge tone="blue">Planner: {result.plannerSource}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink">
                <strong>{result.project.title}</strong> — {result.createdTaskCount} task(s)
                persisted to PostgreSQL.
              </p>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Terminal className="h-4 w-4" />
            <span>Quick CEO Directives</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Click an example to populate the instruction box.
          </p>
          <div className="mt-3 space-y-2">
            {EXAMPLE_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => setValue("instruction", cmd)}
                className="w-full rounded-md border border-surface-border bg-surface-muted p-3 text-left text-xs text-ink transition-colors hover:border-ink"
              >
                {cmd}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
