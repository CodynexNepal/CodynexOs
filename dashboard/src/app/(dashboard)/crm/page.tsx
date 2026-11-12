"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Ban, MailPlus, Plus, Send, Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { leadSchema } from "@/schemas/forms.schema";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { BusinessItem, EmailAccountItem } from "@/types/os";

interface LeadItem {
  id: string;
  businessId: string | null;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  stage: string;
  leadScore: number;
  isOptedOut: boolean;
}

interface InteractionItem {
  id: string;
  leadId: string;
  businessId: string | null;
  emailAccountId: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  body: string;
  replyClassification: string | null;
  approvalStatus: string;
  sentAt: string | null;
  createdAt: string;
}

const LEAD_STAGES = [
  "NEW",
  "QUALIFIED",
  "OUTREACH_DRAFTED",
  "CONTACTED",
  "REPLIED",
  "DEMO_SCHEDULED",
  "WON",
  "LOST",
];

export default function SalesCrmPage() {
  const [selectedBizId, setSelectedBizId] = useState<string>("");
  const { data, loading, error, refetch } = useApiQuery<LeadItem[]>(
    () => codynexApi.crm.leads(undefined, selectedBizId || undefined),
    [selectedBizId]
  );
  const interactionsQuery = useApiQuery<InteractionItem[]>(() => codynexApi.crm.interactions());
  const businessesQuery = useApiQuery<BusinessItem[]>(() => codynexApi.businesses.list());
  const emailAccountsQuery = useApiQuery<EmailAccountItem[]>(() => codynexApi.emailAccounts.list());
  const leadsPagination = usePagination(data ?? [], 10);
  const interactionsPagination = usePagination(interactionsQuery.data ?? [], 10);

  const businesses = businessesQuery.data ?? [];
  const emailAccounts = emailAccountsQuery.data ?? [];
  const bizNameById = new Map(businesses.map((b) => [b.id, b.name]));
  const emailById = new Map(emailAccounts.map((a) => [a.id, `${a.label} (${a.fromEmail})`]));

  const [open, setOpen] = useState(false);
  const [outreachLead, setOutreachLead] = useState<LeadItem | null>(null);
  const [outreachAccountId, setOutreachAccountId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(leadSchema),
    defaultValues: {
      businessName: "",
      contactName: "",
      email: "",
      phone: "",
      city: "",
      website: "",
      businessId: "",
    },
  });

  const onSave = async (values: {
    businessName: string;
    contactName?: string;
    email?: string;
    phone?: string;
    city?: string;
    website?: string;
    businessId?: string;
  }) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await codynexApi.crm.upsertLead({
        ...values,
        businessId: values.businessId || undefined,
      });
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

  const handleStageChange = async (id: string, stage: string) => {
    setActionErr(null);
    try {
      await codynexApi.crm.updateStage(id, { stage });
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  const handleDraftOutreach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outreachLead) return;
    setSavingOutreach(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      await codynexApi.crm.draftOutreach(outreachLead.id, {
        subject,
        body,
        channel: "EMAIL",
        businessId: outreachLead.businessId ?? undefined,
        emailAccountId: outreachAccountId || undefined,
      });
      setOutreachLead(null);
      setOutreachAccountId("");
      setSubject("");
      setBody("");
      setActionMsg("Outreach draft saved and submitted for CEO approval.");
      interactionsQuery.refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setSavingOutreach(false);
    }
  };

  const handleApproveAndSend = async (item: InteractionItem) => {
    setSendingId(item.id);
    setActionErr(null);
    setActionMsg(null);
    try {
      if (item.approvalStatus !== "APPROVED") {
        await codynexApi.crm.approveInteraction(item.id);
      }
      const res = await codynexApi.crm.sendInteraction(item.id, {
        emailAccountId: item.emailAccountId || undefined,
      });
      const fromEmail = res.data?.data?.dispatch?.fromEmail;
      setActionMsg(`Sent email${fromEmail ? ` from ${fromEmail}` : ""}.`);
      interactionsQuery.refetch();
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setSendingId(null);
    }
  };

  const handleClassify = async (
    interactionId: string,
    classification: "INTERESTED" | "NOT_INTERESTED" | "OPT_OUT" | "QUESTION" | "DEMO_REQUEST"
  ) => {
    setActionErr(null);
    try {
      await codynexApi.crm.classifyReply(interactionId, classification);
      interactionsQuery.refetch();
      refetch();
    } catch (err) {
      setActionErr(toApiError(err).message);
    }
  };

  return (
    <DashboardShell
      title="Sales CRM"
      subtitle="Deduplicated public leads, deterministic fit scoring, outreach drafts, and strict opt-out enforcement"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        {actionMsg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {actionMsg}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            aria-label="Filter leads by business"
            value={selectedBizId}
            onChange={(e) => setSelectedBizId(e.target.value)}
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
            Add Verified Lead
          </Button>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="CRM pipeline is empty"
            description="Add verified prospects or run a public market research task to populate leads."
          />
        ) : (
          <>
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-surface-border bg-surface-muted text-xs uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {leadsPagination.pageItems.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-3 font-semibold text-ink">
                      <div>{lead.businessName}</div>
                      {lead.businessId && (
                        <Badge tone="blue">{bizNameById.get(lead.businessId) ?? "Business"}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      <p>{lead.contactName || "—"}</p>
                      <p>{lead.email || lead.phone || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{lead.city || "—"}</td>
                    <td className="px-4 py-3 text-xs font-bold tabular-nums text-ink">
                      {lead.leadScore}/100
                    </td>
                    <td className="px-4 py-3">
                      {lead.isOptedOut ? (
                        <Badge tone="red">OPTED_OUT</Badge>
                      ) : (
                        <select
                          aria-label={`Stage for ${lead.businessName}`}
                          value={lead.stage}
                          onChange={(e) => handleStageChange(lead.id, e.target.value)}
                          className="h-8 rounded border border-surface-border bg-surface px-2 text-xs text-ink"
                        >
                          {LEAD_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!lead.isOptedOut && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOutreachLead(lead)}
                          >
                            <MailPlus className="h-3.5 w-3.5" />
                            Draft
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleOptOut(lead.id)}>
                            <Ban className="h-3.5 w-3.5" />
                            Opt-out
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            page={leadsPagination.page}
            pageSize={leadsPagination.pageSize}
            totalItems={leadsPagination.totalItems}
            onPageChange={leadsPagination.setPage}
            onPageSizeChange={leadsPagination.setPageSize}
          />
          </>
        )}

        <Card>
          <CardHeader
            title="Outreach Drafts & Reply Classification"
            subtitle="All drafts require approval; OPT_OUT classifications automatically lock the lead"
          />
          <div className="divide-y divide-surface-border">
            {(interactionsQuery.data ?? []).length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-ink-muted">
                No outreach drafts or inbound interactions recorded yet.
              </p>
            ) : (
              interactionsPagination.pageItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 text-xs">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(item.approvalStatus)}>{item.approvalStatus}</Badge>
                      <Badge tone="gray">{item.channel}</Badge>
                      {item.businessId && (
                        <Badge tone="blue">{bizNameById.get(item.businessId) ?? "Business"}</Badge>
                      )}
                      {item.emailAccountId && (
                        <Badge tone="gray">{emailById.get(item.emailAccountId) ?? "Sender"}</Badge>
                      )}
                      {item.replyClassification && (
                        <Badge tone="blue">{item.replyClassification}</Badge>
                      )}
                      <span className="font-bold text-ink">{item.subject || "(No subject)"}</span>
                    </div>
                    <p className="text-ink-muted">{item.body}</p>
                    <p className="tabular-nums text-[11px] text-ink-muted">
                      {item.sentAt
                        ? `Sent ${formatDateTime(item.sentAt)}`
                        : formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.direction === "OUTBOUND" &&
                      item.approvalStatus !== "SENT" &&
                      item.approvalStatus !== "BLOCKED" && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={sendingId === item.id}
                          onClick={() => handleApproveAndSend(item)}
                        >
                          <Send className="h-3 w-3" />
                          {item.approvalStatus === "APPROVED" ? "Send Email" : "Approve & Send"}
                        </Button>
                      )}
                    {(["INTERESTED", "DEMO_REQUEST", "OPT_OUT"] as const).map((cls) => (
                      <Button
                        key={cls}
                        variant="outline"
                        size="sm"
                        onClick={() => handleClassify(item.id, cls)}
                      >
                        {cls}
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <Pagination
          page={interactionsPagination.page}
          pageSize={interactionsPagination.pageSize}
          totalItems={interactionsPagination.totalItems}
          onPageChange={interactionsPagination.setPage}
          onPageSizeChange={interactionsPagination.setPageSize}
        />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Public Business Lead">
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">CodyNex Business</label>
            <select
              {...register("businessId")}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Default / Unassigned</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
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

      <Modal
        open={Boolean(outreachLead)}
        onClose={() => setOutreachLead(null)}
        title={outreachLead ? `Draft Personalized Outreach — ${outreachLead.businessName}` : "Draft Outreach"}
      >
        <form onSubmit={handleDraftOutreach} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">
              Sender Gmail / SMTP Account
            </label>
            <select
              value={outreachAccountId}
              onChange={(e) => setOutreachAccountId(e.target.value)}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Auto-select Business Default</option>
              {emailAccounts
                .filter(
                  (a) =>
                    !outreachLead?.businessId ||
                    !a.businessId ||
                    a.businessId === outreachLead.businessId
                )
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label} ({acc.fromEmail})
                  </option>
                ))}
            </select>
          </div>
          <Input
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <Textarea
            label="Message Body"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <Button type="submit" variant="dark" loading={savingOutreach}>
            Save Draft for Approval
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
