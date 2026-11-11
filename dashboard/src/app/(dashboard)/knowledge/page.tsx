"use client";

import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
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

interface KnowledgeDoc {
  id: string;
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
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveErr(null);
    try {
      await codynexApi.knowledge.create({ title, contentMd });
      setTitle("");
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
      subtitle="Trusted internal SOPs, playbooks, and engineering standards"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New Document
          </Button>
        </div>

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
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">{doc.title}</h3>
                  <Badge tone={doc.isTrusted ? "green" : "amber"}>
                    {doc.isTrusted ? "Trusted SOP" : "Untrusted"}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-ink-muted">{doc.contentMd}</p>
                <p className="mt-3 text-[11px] text-ink-muted tabular-nums">
                  Updated {formatDateTime(doc.updatedAt)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Knowledge Document">
        <form onSubmit={handleSave} className="space-y-4">
          {saveErr && <ErrorBanner message={saveErr} />}
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Textarea
            label="Markdown Content"
            rows={6}
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            required
          />
          <Button type="submit" variant="dark" loading={saving}>
            Publish Document
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
