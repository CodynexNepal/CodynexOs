"use client";

import { useState } from "react";
import { Download, Save } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";

interface SettingRow {
  key: string;
  isSecret: boolean;
  value: Record<string, unknown>;
  updatedAt: string;
}

export default function SettingsPage() {
  const { data, error, refetch } = useApiQuery<SettingRow[]>(() => codynexApi.settings.list());
  const [secretKey, setSecretKey] = useState("telegram_bot_token");
  const [secretVal, setSecretVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

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
      subtitle="Encrypted integration secrets, worker policies, and configuration backups"
    >
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {errMsg && <ErrorBanner message={errMsg} />}
        {msg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {msg}
          </div>
        )}

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
    </DashboardShell>
  );
}
