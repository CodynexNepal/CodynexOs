"use client";

import { useState } from "react";
import { Bot, SlidersHorizontal } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatNumber } from "@/lib/utils";
import type { AiEmployeeItem } from "@/types/os";

export default function EmployeesPage() {
  const { data, loading, error, refetch } = useApiQuery<AiEmployeeItem[]>(() =>
    codynexApi.employees()
  );

  const [editing, setEditing] = useState<AiEmployeeItem | null>(null);
  const [dailyTokenBudget, setDailyTokenBudget] = useState(50000);
  const [preferredProvider, setPreferredProvider] = useState("gemini");
  const [preferredModel, setPreferredModel] = useState("gemini-3.8-flash");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const openConfig = (emp: AiEmployeeItem) => {
    setEditing(emp);
    setDailyTokenBudget(emp.dailyTokenBudget);
    setPreferredProvider(emp.preferredProvider);
    setPreferredModel(emp.preferredModel);
    setIsActive(emp.isActive);
    setSaveErr(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await codynexApi.updateEmployee(editing.id, {
        dailyTokenBudget: Number(dailyTokenBudget),
        preferredProvider,
        preferredModel,
        isActive,
      });
      setEditing(null);
      refetch();
    } catch (err) {
      setSaveErr(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell
      title="AI Employees"
      subtitle="20 logical specialist roles instantiated on demand with scoped tool permissions"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onRetry={refetch} />}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No AI employees seeded"
            description="Run the initial database seed to populate the 20 organizational roles."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((emp) => (
              <Card key={emp.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-ink">{emp.roleTitle}</h3>
                    <p className="text-xs text-ink-muted">
                      {emp.department?.name ?? "Department"} · slug: <code>{emp.slug}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={emp.isActive ? "green" : "gray"}>
                      {emp.isActive ? "Active" : "Paused"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => openConfig(emp)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Configure
                    </Button>
                  </div>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                  {emp.systemInstruction}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {emp.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded border border-surface-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink"
                    >
                      {tool}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-3 text-xs text-ink-muted tabular-nums">
                  <span>
                    Model: <strong className="text-ink">{emp.preferredProvider}/{emp.preferredModel}</strong>
                  </span>
                  <span>Budget: {formatNumber(emp.dailyTokenBudget)} tok/day</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Configure ${editing.roleTitle}` : "Configure Employee"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {saveErr && <ErrorBanner message={saveErr} />}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">
              Preferred Free Provider
            </label>
            <select
              value={preferredProvider}
              onChange={(e) => setPreferredProvider(e.target.value)}
              className="h-10 w-full rounded-md border border-surface-border bg-surface px-3 text-sm text-ink"
            >
              <option value="gemini">gemini (Free Tier)</option>
              <option value="groq">groq (Free Tier)</option>
            </select>
          </div>
          <Input
            label="Preferred Model"
            value={preferredModel}
            onChange={(e) => setPreferredModel(e.target.value)}
            required
          />
          <Input
            label="Daily Token Budget"
            type="number"
            min={1000}
            value={dailyTokenBudget}
            onChange={(e) => setDailyTokenBudget(Number(e.target.value))}
            required
          />
          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Employee Active (allow task dispatch)
          </label>
          <Button type="submit" variant="dark" loading={saving}>
            Save Configuration
          </Button>
        </form>
      </Modal>
    </DashboardShell>
  );
}
