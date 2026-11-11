"use client";

import { useState } from "react";
import { BookOpen, Info, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { DepartmentItem } from "@/types/os";

interface KnowledgeDoc {
  id: string;
  departmentId: string | null;
  title: string;
  slug: string;
  contentMd: string;
  isTrusted: boolean;
  updatedAt: string;
}

export default function KnowledgePage() {
  const { data, loading, error, refetch } = useApiQuery<KnowledgeDoc[]>(() =>
    codynexApi.knowledge.list()
  );
  const deptsQuery = useApiQuery<DepartmentItem[]>(() => codynexApi.departments());

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const deptName = (id: string | null) => {
    if (!id) return "Company-Wide (All Agents)";
    return deptsQuery.data?.find((d) => d.id === id)?.name ?? "Department SOP";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveErr(null);
    try {
      await codynexApi.knowledge.create({
        title,
        contentMd,
        ...(departmentId ? { departmentId } : {}),
      });
      setTitle("");
      setDepartmentId("");
      setContentMd("");
      setOpen(false);
      refetch();
    } catch (err) {
      setSaveErr(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell
      title="Knowledge Base"
      subtitle="Trusted SOPs, coding standards, and playbooks injected into AI employee prompts"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}

        <Card className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4">
          <div className="flex items-start gap-2.5 text-xs text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
            <p>
              <strong className="text-ink">How Knowledge Base works:</strong> Unlike{" "}
              <em>Company Memory</em> (which records past tasks and events), documents here are
              trusted rules &amp; playbooks. Specialist agents automatically load matching
              department &amp; company-wide SOPs before executing any task.
            </p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New SOP / Playbook
          </Button>
        </Card>

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={BookOpen}
            title="Knowledge Base is empty"
            description="Create trusted SOPs and technical playbooks that specialist agents reference."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data ?? []).map((doc) => (
              <Card key={doc.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-ink">{doc.title}</h3>
                    <p className="mt-0.5 text-[11px] font-medium text-ink-muted">
                      Scope: {deptName(doc.departmentId)}
                    </p>
                  </div>
                  <Badge tone={doc.isTrusted ? "green" : "amber"}>
                    {doc.isTrusted ? "Trusted SOP" : "Untrusted"}
                  </Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
                  {doc.contentMd}
                </p>
                <p className="mt-3 border-t border-surface-border pt-2.5 text-[11px] text-ink-muted tabular-nums">
                  Updated {formatDateTime(doc.updatedAt)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Knowledge Base SOP">
        <form onSubmit={handleSave} className="space-y-4">
          {saveErr && <ErrorBanner message={saveErr} />}
          <Input
            label="SOP / Playbook Title"
            placeholder="e.g., Backend Code Review Checklist"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">
              Target Department Scope
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Company-Wide (All AI Employees)</option>
              {(deptsQuery.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            label="Playbook Rules & Instructions"
            rows={6}
            placeholder="Write exact rules, coding standards, or outreach guidelines agents must follow..."
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            required
          />
          <Button type="submit" variant="dark" loading={saving}>
            Publish Trusted SOP
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
