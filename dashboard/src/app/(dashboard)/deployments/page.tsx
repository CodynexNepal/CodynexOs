"use client";

import { useState } from "react";
import { Check, Rocket, X } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { ApprovalItem } from "@/types/os";

export default function DeploymentCenterPage() {
  const { data, loading, error, refetch } = useApiQuery<ApprovalItem[]>(() =>
    codynexApi.approvals.list()
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const review = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setBusyId(id);
    setActionErr(null);
    try {
      await codynexApi.approvals.review(id, { decision });
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell
      title="Deployment & Approval Center"
      subtitle="Human CEO authority gate for production deployments, merges, and outbound campaigns"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No pending approvals"
            description="Sensitive operations requested by AI departments appear here for your explicit sign-off."
          />
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <Badge tone="gray">{item.actionType}</Badge>
                    </div>
                    <h3 className="text-sm font-bold text-ink">{item.summary}</h3>
                    {item.riskAssessment && (
                      <p className="text-xs text-ink-muted">{item.riskAssessment}</p>
                    )}
                    <p className="text-[11px] tabular-nums text-ink-muted">
                      Requested {formatDateTime(item.createdAt)}
                    </p>
                  </div>

                  {item.status === "PENDING" && (
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={busyId === item.id}
                        onClick={() => review(item.id, "APPROVED")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busyId === item.id}
                        onClick={() => review(item.id, "REJECTED")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
