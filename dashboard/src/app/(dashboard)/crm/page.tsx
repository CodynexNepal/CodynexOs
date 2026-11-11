"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Ban, Plus, Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { leadSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";

interface LeadItem {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  stage: string;
  leadScore: number;
  isOptedOut: boolean;
}

export default function SalesCrmPage() {
  const { data, loading, error, refetch } = useApiQuery<LeadItem[]>(() => codynexApi.crm.leads());
  const [open, setOpen] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(leadSchema),
    defaultValues: { businessName: "", contactName: "", email: "", phone: "", city: "", website: "" },
  });

  const onSave = async (values: {
    businessName: string;
    contactName?: string;
    email?: string;
    phone?: string;
    city?: string;
    website?: string;
  }) => {
    setActionErr(null);
    try {
      await codynexApi.crm.upsertLead(values);
      reset();
      setOpen(false);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleOptOut = async (id: string) => {
    setActionErr(null);
    try {
      await codynexApi.crm.optOut(id);
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Sales CRM"
      subtitle="Deduplicated public leads, deterministic fit scoring, and strict opt-out enforcement"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Verified Lead
          </Button>
        </div>

        {!loading && (!data || data.length === 0) ? (
          <EmptyState
            icon={Users}
            title="CRM pipeline is empty"
            description="Add verified prospects or run a public market research task to populate leads."
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {(data ?? []).map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-3 font-semibold text-ink">{lead.businessName}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      <p>{lead.contactName || "—"}</p>
                      <p>{lead.email || lead.phone || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{lead.city || "—"}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-ink">
                      {lead.leadScore}/100
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(lead.stage)}>{lead.stage}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!lead.isOptedOut && (
                        <Button variant="outline" size="sm" onClick={() => handleOptOut(lead.id)}>
                          <Ban className="h-3.5 w-3.5" />
                          Opt-out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Public Business Lead">
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <Input label="Business Name" error={errors.businessName?.message} {...register("businessName")} />
          <Input label="Contact Name" {...register("contactName")} />
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Input label="Phone" {...register("phone")} />
          <Input label="City" placeholder="Kathmandu" {...register("city")} />
          <Input label="Website" {...register("website")} />
          <Button type="submit" variant="dark" loading={isSubmitting}>
            Save & Deduplicate
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
