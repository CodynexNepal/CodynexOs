"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Coins, Save } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { budgetSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface AiUsageResponse {
  summary: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    requestCount: number;
    byProvider: Array<{ provider: string; requests: string; tokens: string; quotaHits: string }>;
  };
  budget: {
    dailyTokenLimit: number;
    maxConcurrentRequests: number;
    allowPaidProviders: boolean;
  } | null;
  logs: Array<{
    id: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: string;
    status: string;
    latencyMs: number | null;
    createdAt: string;
  }>;
}

export default function AiUsagePage() {
  const { data, error, refetch } = useApiQuery<AiUsageResponse>(() => codynexApi.aiUsage.summary());
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(budgetSchema),
    defaultValues: {
      dailyTokenLimit: 500000,
      maxConcurrentRequests: 3,
      allowPaidProviders: false,
    },
  });

  useEffect(() => {
    if (data?.budget) {
      reset({
        dailyTokenLimit: data.budget.dailyTokenLimit,
        maxConcurrentRequests: data.budget.maxConcurrentRequests,
        allowPaidProviders: data.budget.allowPaidProviders,
      });
    }
  }, [data?.budget, reset]);

  const onSave = async (values: {
    dailyTokenLimit: number;
    maxConcurrentRequests: number;
    allowPaidProviders: boolean;
  }) => {
    setSaveMsg(null);
    setSaveErr(null);
    try {
      await codynexApi.aiUsage.updateBudget(values);
      setSaveMsg("Global AI budget policy updated.");
      refetch();
    } catch (err) {
      setSaveErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="AI Usage & Cost Management"
      subtitle="NPR 0 cost guardrails: free-tier tracking, rate-limit alerts, and paid provider lock"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {saveErr && <ErrorBanner message={saveErr} />}
        {saveMsg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {saveMsg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Global Budget Policy" subtitle="Enforced before every AI request" />
            <form onSubmit={handleSubmit(onSave)} className="space-y-4 p-5">
              <Input
                label="Daily Token Limit"
                type="number"
                error={errors.dailyTokenLimit?.message}
                {...register("dailyTokenLimit")}
              />
              <Input
                label="Max Concurrent Requests"
                type="number"
                error={errors.maxConcurrentRequests?.message}
                {...register("maxConcurrentRequests")}
              />
              <label className="flex items-center gap-2 text-xs font-medium text-ink">
                <input type="checkbox" {...register("allowPaidProviders")} />
                Allow Paid AI Providers (Disabled by default for NPR 0 target)
              </label>
              <Button type="submit" variant="dark" loading={isSubmitting}>
                <Save className="h-4 w-4" />
                Save Budget Policy
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Provider Quota Summary" subtitle="Actual logged usage & quota hits" />
            <div className="divide-y divide-surface-border">
              {!data || data.summary.byProvider.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={Coins}
                    title="No AI requests logged yet"
                    description="Token usage and rate-limit events appear here when agents run AI tasks."
                  />
                </div>
              ) : (
                data.summary.byProvider.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between px-5 py-3.5 text-xs">
                    <div>
                      <p className="font-bold uppercase text-ink">{p.provider}</p>
                      <p className="text-ink-muted tabular-nums">{p.requests} requests</p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="font-semibold text-ink">{formatNumber(Number(p.tokens))} tokens</p>
                      {Number(p.quotaHits) > 0 && (
                        <Badge tone="amber">{p.quotaHits} quota hits</Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className="overflow-x-auto">
          <CardHeader title="Recent AI Call Ledger" subtitle="Latest 100 provider calls" />
          <table className="w-full text-left text-xs">
            <thead className="border-b border-surface-border bg-surface-muted uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3">Provider / Model</th>
                <th className="px-4 py-3">Tokens (In / Out)</th>
                <th className="px-4 py-3">Cost (USD)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {(data?.logs ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    {log.provider} / {log.model}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {formatNumber(log.inputTokens)} / {formatNumber(log.outputTokens)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink">${log.estimatedCostUsd}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(log.status)}>{log.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">
                    {formatDateTime(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </DashboardShell>
  );
}
