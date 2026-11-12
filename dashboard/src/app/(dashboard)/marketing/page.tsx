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
import { CardListSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { campaignSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { BusinessItem, EmailAccountItem } from "@/types/os";

interface CampaignItem {
  id: string;
  businessId: string | null;
  emailAccountId: string | null;
  name: string;
  channel: string;
  targetAudience: string | null;
  status: string;
  createdAt: string;
}

export default function MarketingPage() {
  const [selectedBizFilter, setSelectedBizFilter] = useState<string>("");
  const { data, loading, error, refetch } = useApiQuery<CampaignItem[]>(
    () => codynexApi.marketing.campaigns(selectedBizFilter || undefined),
    [selectedBizFilter]
  );
  const pagination = usePagination(data ?? [], 10);
  const businessesQuery = useApiQuery<BusinessItem[]>(() => codynexApi.businesses.list());
  const emailAccountsQuery = useApiQuery<EmailAccountItem[]>(() => codynexApi.emailAccounts.list());
  const [open, setOpen] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const businesses = businessesQuery.data ?? [];
  const emailAccounts = emailAccountsQuery.data ?? [];
  const bizNameById = new Map(businesses.map((b) => [b.id, b.name]));
  const emailById = new Map(emailAccounts.map((a) => [a.id, `${a.label} (${a.fromEmail})`]));

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(campaignSchema),
    defaultValues: {
      name: "",
      channel: "EMAIL",
      targetAudience: "",
      businessId: "",
      emailAccountId: "",
    },
  });

  const formBusinessId = watch("businessId");
  const filteredAccounts = emailAccounts.filter(
    (a) => !formBusinessId || !a.businessId || a.businessId === formBusinessId
  );

  const onCreate = async (values: {
    name: string;
    channel: string;
    targetAudience?: string;
    businessId?: string;
    emailAccountId?: string;
  }) => {
    setSubmitErr(null);
    try {
      await codynexApi.marketing.createCampaign({
        ...values,
        businessId: values.businessId || undefined,
        emailAccountId: values.emailAccountId || undefined,
      });
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
      subtitle="Business-scoped campaigns with dedicated Gmail/SMTP senders and CEO approval gates"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            aria-label="Filter by business"
            value={selectedBizFilter}
            onChange={(e) => setSelectedBizFilter(e.target.value)}
            className="h-9 rounded-md border border-surface-border bg-surface px-3 text-xs text-ink"
          >
            <option value="">All Businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </div>

        {loading ? (
          <CardListSkeleton count={4} columns={2} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No marketing campaigns yet"
            description="Create a campaign here or instruct the AI COO to research and draft one."
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {pagination.pageItems.map((c) => (
                <Card key={c.id} className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">{c.name}</h3>
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span>Channel: {c.channel}</span>
                    {c.businessId && (
                      <Badge tone="blue">{bizNameById.get(c.businessId) ?? "Business"}</Badge>
                    )}
                    {c.emailAccountId && (
                      <Badge tone="gray">
                        Sender: {emailById.get(c.emailAccountId) ?? "Configured"}
                      </Badge>
                    )}
                  </div>
                  {c.targetAudience && (
                    <p className="mt-2 text-xs text-ink-muted">{c.targetAudience}</p>
                  )}
                  <p className="mt-3 text-[11px] tabular-nums text-ink-muted">
                    Created {formatDateTime(c.createdAt)}
                  </p>
                </Card>
              ))}
            </div>
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Marketing Campaign">
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {submitErr && <ErrorBanner message={submitErr} />}
          <Input label="Campaign Name" error={errors.name?.message} {...register("name")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Business</label>
              <select
                {...register("businessId")}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">Default / Any Business</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
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
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">
              Sender Gmail / SMTP Account
            </label>
            <select
              {...register("emailAccountId")}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Auto-select Business Default</option>
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label} ({acc.fromEmail})
                </option>
              ))}
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
