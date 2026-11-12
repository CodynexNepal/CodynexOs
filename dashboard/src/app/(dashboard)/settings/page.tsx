"use client";

import { useState } from "react";
import { Building2, CheckCircle2, Download, Mail, Plus, Save, Send, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";
import type { BusinessItem, EmailAccountItem } from "@/types/os";

interface SettingRow {
  key: string;
  isSecret: boolean;
  value: Record<string, unknown>;
  updatedAt: string;
}

export default function SettingsPage() {
  const { data, error, refetch } = useApiQuery<SettingRow[]>(() => codynexApi.settings.list());
  const businessesQuery = useApiQuery<BusinessItem[]>(() => codynexApi.businesses.list());
  const emailAccountsQuery = useApiQuery<EmailAccountItem[]>(() => codynexApi.emailAccounts.list());

  const [secretKey, setSecretKey] = useState("telegram_bot_token");
  const [secretVal, setSecretVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Business form state
  const [bizOpen, setBizOpen] = useState(false);
  const [bizName, setBizName] = useState("");
  const [bizDomain, setBizDomain] = useState("");
  const [bizIndustry, setBizIndustry] = useState("");
  const [bizGithubOwner, setBizGithubOwner] = useState("CodynexNepal");
  const [savingBiz, setSavingBiz] = useState(false);

  // Email account form state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBizId, setEmailBizId] = useState("");
  const [emailLabel, setEmailLabel] = useState("");
  const [emailProvider, setEmailProvider] = useState<"GMAIL" | "SMTP">("GMAIL");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [dailyLimit, setDailyLimit] = useState(100);
  const [isDefaultEmail, setIsDefaultEmail] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);

  // Verify / Test Email modal state
  const [verifyAccount, setVerifyAccount] = useState<EmailAccountItem | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const businesses = businessesQuery.data ?? [];
  const emailAccounts = emailAccountsQuery.data ?? [];
  const businessNameById = new Map(businesses.map((b) => [b.id, b.name]));

  const saveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await codynexApi.settings.upsert({
        key: secretKey,
        value: { secret: secretVal },
        isSecret: true,
      });
      setSecretVal("");
      setMsg(`Encrypted and stored '${secretKey}' with AES-256-GCM.`);
      refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBiz(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await codynexApi.businesses.create({
        name: bizName,
        domain: bizDomain || undefined,
        industry: bizIndustry || undefined,
        defaultGithubOwner: bizGithubOwner || undefined,
      });
      setBizName("");
      setBizDomain("");
      setBizIndustry("");
      setBizOpen(false);
      setMsg("Business registered. You can now attach dedicated Gmail/SMTP sender accounts to it.");
      businessesQuery.refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    } finally {
      setSavingBiz(false);
    }
  };

  const handleCreateEmailAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await codynexApi.emailAccounts.create({
        businessId: emailBizId || undefined,
        label: emailLabel,
        provider: emailProvider,
        fromName,
        fromEmail,
        smtpHost: emailProvider === "GMAIL" ? "smtp.gmail.com" : smtpHost,
        smtpPort,
        smtpSecure: smtpPort === 465,
        smtpUser: smtpUser || fromEmail,
        smtpPass,
        dailySendLimit: dailyLimit,
        isDefault: isDefaultEmail,
      });
      setEmailLabel("");
      setFromName("");
      setFromEmail("");
      setSmtpUser("");
      setSmtpPass("");
      setEmailOpen(false);
      setMsg("Sender Gmail/SMTP account encrypted and added.");
      emailAccountsQuery.refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSetDefault = async (accountId: string) => {
    setMsg(null);
    setErrMsg(null);
    try {
      await codynexApi.emailAccounts.update(accountId, { isDefault: true });
      setMsg("Updated default sender email for this business.");
      emailAccountsQuery.refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    }
  };

  const handleDeleteEmail = async (accountId: string) => {
    setMsg(null);
    setErrMsg(null);
    try {
      await codynexApi.emailAccounts.delete(accountId);
      setMsg("Sender email account removed.");
      emailAccountsQuery.refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyAccount) return;
    setVerifyingId(verifyAccount.id);
    setMsg(null);
    setErrMsg(null);
    try {
      const res = await codynexApi.emailAccounts.verify(
        verifyAccount.id,
        testRecipient.trim() || undefined
      );
      const sentTest = res.data?.data?.testEmailSent;
      setMsg(
        sentTest
          ? `Verified SMTP connection and delivered test email to ${testRecipient}.`
          : `Verified SMTP connection for ${verifyAccount.fromEmail}.`
      );
      setVerifyAccount(null);
      setTestRecipient("");
      emailAccountsQuery.refetch();
    } catch (err) {
      setErrMsg(toApiError(err).message);
    } finally {
      setVerifyingId(null);
    }
  };

  const exportSnapshot = () => {
    const blob = new Blob([JSON.stringify(data ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codynex-os-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell
      title="Settings"
      subtitle="Multi-business Gmail/SMTP sender accounts, encrypted secrets, and policy backups"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {businessesQuery.error && (
          <ErrorBanner message={businessesQuery.error} onRetry={businessesQuery.refetch} />
        )}
        {emailAccountsQuery.error && (
          <ErrorBanner message={emailAccountsQuery.error} onRetry={emailAccountsQuery.refetch} />
        )}
        {errMsg && <ErrorBanner message={errMsg} />}
        {msg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {msg}
          </div>
        )}

        {/* Businesses & Multi-Gmail Senders */}
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader
              title="Operating Businesses"
              subtitle="Ventures run inside CodyNex OS (e.g., Hostel Ghar, CodyNex)"
              action={
                <Button variant="primary" size="sm" onClick={() => setBizOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Business
                </Button>
              }
            />
            <div className="divide-y divide-surface-border">
              {businesses.length === 0 ? (
                <p className="px-5 py-6 text-xs text-ink-muted">
                  No businesses registered yet. Add one like Hostel Ghar to scope email senders and campaigns.
                </p>
              ) : (
                businesses.map((b) => {
                  const accountCount = emailAccounts.filter((a) => a.businessId === b.id).length;
                  return (
                    <div key={b.id} className="flex items-start justify-between gap-3 px-5 py-3.5 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-ink-muted" />
                          <span className="font-bold text-ink">{b.name}</span>
                          <Badge tone={b.isActive ? "green" : "gray"}>
                            {b.isActive ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {b.domain || b.slug} {b.industry ? `· ${b.industry}` : ""}
                        </p>
                        {b.defaultGithubOwner && (
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            GitHub Org: {b.defaultGithubOwner}
                          </p>
                        )}
                      </div>
                      <Badge tone={accountCount > 0 ? "blue" : "amber"}>
                        {accountCount} {accountCount === 1 ? "Email" : "Emails"}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader
              title="Business Gmail & SMTP Sender Accounts"
              subtitle="Add unlimited Gmail App Passwords or custom SMTP mailboxes per business"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!emailBizId && businesses[0]) setEmailBizId(businesses[0].id);
                    setEmailOpen(true);
                  }}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Add Gmail / SMTP
                </Button>
              }
            />
            <div className="divide-y divide-surface-border">
              {emailAccounts.length === 0 ? (
                <p className="px-5 py-6 text-xs text-ink-muted">
                  No sender accounts configured in database yet (falling back to global .env SMTP if set).
                </p>
              ) : (
                emailAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-ink">{acc.label}</span>
                        <Badge tone="gray">{acc.provider}</Badge>
                        {acc.businessId ? (
                          <Badge tone="blue">
                            {businessNameById.get(acc.businessId) ?? "Business"}
                          </Badge>
                        ) : (
                          <Badge tone="gray">Global Fallback</Badge>
                        )}
                        {acc.isDefault && <Badge tone="green">Default Sender</Badge>}
                        {acc.lastVerifiedAt && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#14532D]">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-ink-muted">
                        From: <span className="font-medium text-ink">{acc.fromName}</span> &lt;{acc.fromEmail}&gt; ·{" "}
                        {acc.smtpHost}:{acc.smtpPort}
                      </p>
                      <p className="tabular-nums text-[11px] text-ink-muted">
                        Sent today: {acc.sentToday} / {acc.dailySendLimit}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setVerifyAccount(acc);
                          setTestRecipient("");
                        }}
                      >
                        <Send className="h-3 w-3" />
                        Verify / Test
                      </Button>
                      {!acc.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(acc.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteEmail(acc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Secrets & System Settings */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Store Encrypted Secret"
              subtitle="Encrypted at rest using AES-256-GCM; plaintext is never returned"
            />
            <form onSubmit={saveSecret} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Secret Key</label>
                <select
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
                >
                  <option value="gemini_api_key">gemini_api_key</option>
                  <option value="groq_api_key">groq_api_key</option>
                  <option value="github_token">github_token</option>
                  <option value="telegram_bot_token">telegram_bot_token</option>
                </select>
              </div>
              <Input
                label="Secret Value"
                type="password"
                value={secretVal}
                onChange={(e) => setSecretVal(e.target.value)}
                required
              />
              <Button type="submit" variant="dark" loading={saving}>
                <Save className="h-4 w-4" />
                Encrypt & Save
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Stored System Settings"
              subtitle="Non-secret policies & masked secret entries"
              action={
                <Button variant="outline" size="sm" onClick={exportSnapshot}>
                  <Download className="h-3.5 w-3.5" />
                  Export Snapshot
                </Button>
              }
            />
            <div className="divide-y divide-surface-border">
              {(data ?? []).map((row) => (
                <div key={row.key} className="px-5 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">{row.key}</span>
                    <Badge tone={row.isSecret ? "amber" : "gray"}>
                      {row.isSecret ? "Encrypted Secret" : "Policy"}
                    </Badge>
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-ink-muted">
                    {JSON.stringify(row.value)}
                  </pre>
                  <p className="mt-1 text-[10px] tabular-nums text-ink-muted">
                    Updated {formatDateTime(row.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Add Business Modal */}
      <Modal open={bizOpen} onClose={() => setBizOpen(false)} title="Add Business to CodyNex OS">
        <form onSubmit={handleCreateBusiness} className="space-y-4">
          <Input
            label="Business Name"
            placeholder="Hostel Ghar"
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
            required
          />
          <Input
            label="Domain (optional)"
            placeholder="hostelghar.com"
            value={bizDomain}
            onChange={(e) => setBizDomain(e.target.value)}
          />
          <Input
            label="Industry (optional)"
            placeholder="Hospitality / PropTech"
            value={bizIndustry}
            onChange={(e) => setBizIndustry(e.target.value)}
          />
          <Input
            label="Default GitHub Org / Owner"
            placeholder="CodynexNepal"
            value={bizGithubOwner}
            onChange={(e) => setBizGithubOwner(e.target.value)}
          />
          <Button type="submit" variant="dark" loading={savingBiz}>
            Register Business
          </Button>
        </form>
      </Modal>

      {/* Add Email Account Modal */}
      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Add Business Gmail / SMTP Sender"
      >
        <form onSubmit={handleCreateEmailAccount} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink">Business</label>
            <select
              value={emailBizId}
              onChange={(e) => setEmailBizId(e.target.value)}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="">Global (Any Business Fallback)</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink">Provider</label>
              <select
                value={emailProvider}
                onChange={(e) => {
                  const p = e.target.value as "GMAIL" | "SMTP";
                  setEmailProvider(p);
                  if (p === "GMAIL") {
                    setSmtpHost("smtp.gmail.com");
                    setSmtpPort(587);
                  }
                }}
                className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
              >
                <option value="GMAIL">Gmail / Google Workspace</option>
                <option value="SMTP">Custom SMTP</option>
              </select>
            </div>
            <Input
              label="Account Label"
              placeholder="Hostel Ghar Sales Gmail"
              value={emailLabel}
              onChange={(e) => setEmailLabel(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Sender Display Name"
              placeholder="Hostel Ghar Partnerships"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
            />
            <Input
              label="Sender Email Address"
              type="email"
              placeholder="partnerships@hostelghar.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
            />
          </div>
          {emailProvider === "SMTP" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="SMTP Host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                required
              />
              <Input
                label="SMTP Port"
                type="number"
                value={String(smtpPort)}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                required
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="SMTP Login User (optional if same as From Email)"
              placeholder="you@gmail.com"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
            />
            <Input
              label={emailProvider === "GMAIL" ? "Gmail 16-char App Password" : "SMTP Password"}
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Daily Send Limit"
              type="number"
              value={String(dailyLimit)}
              onChange={(e) => setDailyLimit(Number(e.target.value) || 100)}
            />
            <label className="flex items-center gap-2 pt-6 text-xs font-medium text-ink">
              <input
                type="checkbox"
                checked={isDefaultEmail}
                onChange={(e) => setIsDefaultEmail(e.target.checked)}
                className="h-4 w-4 rounded border-surface-border"
              />
              Set as default sender for this business
            </label>
          </div>
          <Button type="submit" variant="dark" loading={savingEmail}>
            Encrypt & Save Sender Account
          </Button>
        </form>
      </Modal>

      {/* Verify / Send Test Email Modal */}
      <Modal
        open={Boolean(verifyAccount)}
        onClose={() => setVerifyAccount(null)}
        title={verifyAccount ? `Verify SMTP — ${verifyAccount.label}` : "Verify SMTP"}
      >
        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <p className="text-xs text-ink-muted">
            Tests SMTP authentication for <span className="font-semibold text-ink">{verifyAccount?.fromEmail}</span>.
            Optionally provide a recipient email below to send a real verification message.
          </p>
          <Input
            label="Test Recipient Email (optional)"
            type="email"
            placeholder="founder@example.com"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
          />
          <Button
            type="submit"
            variant="dark"
            loading={Boolean(verifyingId)}
          >
            <Send className="h-4 w-4" />
            {testRecipient.trim() ? "Verify & Send Test Email" : "Verify SMTP Connection"}
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
