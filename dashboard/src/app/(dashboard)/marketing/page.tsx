"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Megaphone, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { campaignSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";

interface CampaignItem {
  id: string;
  name: string;
  channel: string;
  targetAudience: string | null;
  status: string;
  createdAt: string;
}

export default function MarketingPage() {
  const { data, loading, error, refetch } = useApiQuery<CampaignItem[]>(() =>
    codynexApi.marketing.campaigns()
  );
  const [open, setOpen] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(campaignSchema),
    defaultValues: { name: "", channel: "EMAIL", targetAudience: "" },
  });

  const onCreate = async (values: { name: string; channel: string; targetAudience?: string }) => {
    setSubmitErr(null);
    try {
      await codynexApi.marketing.createCampaign(values);
      reset();
      setOpen(false);
      refetch();
    } catch (err) {
      setSubmitErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Marketing"
      subtitle="Campaigns require explicit CEO approval prior to outbound dispatch"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </div>

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={Megaphone}
            title="No marketing campaigns yet"
            description="Create a campaign here or instruct the AI COO to research and draft one."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data ?? []).map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink">{c.name}</h3>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Channel: {c.channel}</p>
                {c.targetAudience && (
                  <p className="mt-2 text-xs text-ink-muted">{c.targetAudience}</p>
                )}
                <p className="mt-3 text-[11px] tabular-nums text-ink-muted">
                  Created {formatDateTime(c.createdAt)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Marketing Campaign">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {submitErr && <ErrorBanner message={submitErr} />}
          <Input label="Campaign Name" error={errors.name?.message} {...register("name")} />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Channel</label>
            <select
              {...register("channel")}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="EMAIL">EMAIL</option>
              <option value="SEO">SEO</option>
              <option value="CONTENT">CONTENT</option>
              <option value="SOCIAL">SOCIAL</option>
            </select>
          </div>
          <Textarea label="Target Audience" rows={3} {...register("targetAudience")} />
          <Button type="submit" variant="dark" loading={isSubmitting}>
            Submit for CEO Approval
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
