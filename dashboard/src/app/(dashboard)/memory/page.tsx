"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Brain, Plus, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { memorySchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";

interface MemoryEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery<MemoryEntry[]>(
    () => codynexApi.memory.list({ q: query || undefined }),
    [query]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(memorySchema),
    defaultValues: { category: "TECH_DECISION", title: "", content: "", tags: "" },
  });

  const onCreate = async (values: {
    category: string;
    title: string;
    content: string;
    tags?: string;
  }) => {
    setSubmitErr(null);
    try {
      await codynexApi.memory.create({
        category: values.category,
        title: values.title,
        content: values.content,
        tags: values.tags
          ? values.tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });
      reset();
      setModalOpen(false);
      refetch();
    } catch (err) {
      setSubmitErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Company Memory"
      subtitle="Persistent organizational decisions, architecture notes, and lessons learned"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory entries..."
              className="h-10 w-full rounded-md border border-surface-border bg-surface pl-9 pr-3 text-sm text-ink"
            />
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Record Memory
          </Button>
        </div>

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={Brain}
            title="No memory entries found"
            description="Agents automatically persist instructions and lessons learned here."
          />
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">{item.category}</Badge>
                    <h3 className="text-sm font-bold text-ink">{item.title}</h3>
                  </div>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{item.content}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Company Memory">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {submitErr && <ErrorBanner message={submitErr} />}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Category</label>
            <select
              {...register("category")}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="INSTRUCTION">INSTRUCTION</option>
              <option value="REQUIREMENT">REQUIREMENT</option>
              <option value="TECH_DECISION">TECH_DECISION</option>
              <option value="ARCHITECTURE">ARCHITECTURE</option>
              <option value="LESSON_LEARNED">LESSON_LEARNED</option>
              <option value="FEEDBACK">FEEDBACK</option>
              <option value="STRATEGY">STRATEGY</option>
            </select>
          </div>
          <Input label="Title" error={errors.title?.message} {...register("title")} />
          <Textarea label="Content" rows={4} error={errors.content?.message} {...register("content")} />
          <Input label="Tags (comma-separated)" placeholder="security, architecture" {...register("tags")} />
          <Button type="submit" variant="dark" loading={isSubmitting}>
            Save to Memory
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
