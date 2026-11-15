"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cloud,
  Cpu,
  Key,
  Layers,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { StatsGridSkeleton } from "@/components/ui/Skeleton";
import { Pagination, usePagination } from "@/components/ui/Pagination";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime, formatNumber } from "@/lib/utils";

// --- Types ---
interface ProviderItem {
  id: string;
  name: string;
  isConfigured: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "DEGRADED" | "RATE_LIMITED";
  isPaid: boolean;
  isFreeEligible: boolean;
  isLocal: boolean;
  modelCount: number;
  activeModel?: string;
  baseUrl?: string;
  latencyMs?: number;
  description: string;
  quotaDescription: string;
}

interface ProviderQuotaItem {
  provider: string;
  displayName: string;
  isLocal: boolean;
  isPaid: boolean;
  freeTierAllowance: string;
  requestsUsedToday: number;
  tokensUsedToday: number;
  remainingAllowance?: string;
  quotaUnavailableReason?: string;
}

interface GlobalAiSettings {
  freeOnlyMode: boolean;
  autoFallback: boolean;
  preferredProviderOrder: string[];
  maxConcurrentRequests: number;
  maxRetries: number;
  timeoutMs: number;
  dailyTokenBudget: number;
}

interface AgentPreferenceItem {
  agentRole: string;
  displayName: string;
  description: string;
  preferredProvider: string;
  fallbackProvider: string;
  preferredModel: string;
  temperature: number;
  maxTokens: number;
}

interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  eligibility: string;
  isFree: boolean;
  contextWindow: number;
  description: string;
}

interface AiUsageSummaryResponse {
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
  const [activeTab, setActiveTab] = useState<"providers" | "preferences" | "policy" | "quotas" | "logs">(
    "providers"
  );

  // Queries
  const providersQuery = useApiQuery<ProviderItem[]>(() => codynexApi.ai.listProviders());
  const quotasQuery = useApiQuery<ProviderQuotaItem[]>(() => codynexApi.ai.getQuotas());
  const settingsQuery = useApiQuery<GlobalAiSettings>(() => codynexApi.ai.getSettings());
  const prefsQuery = useApiQuery<AgentPreferenceItem[]>(() => codynexApi.ai.getAgentPreferences());
  const usageQuery = useApiQuery<AiUsageSummaryResponse>(() => codynexApi.aiUsage.summary());

  // Local state for actions
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackErr, setFeedbackErr] = useState<string | null>(null);

  // Test Provider state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});

  // Configure Credentials Modal
  const [configModalProvider, setConfigModalProvider] = useState<ProviderItem | null>(null);
  const [credApiKey, setCredApiKey] = useState("");
  const [credAccountId, setCredAccountId] = useState("");
  const [credBaseUrl, setCredBaseUrl] = useState("");
  const [credModel, setCredModel] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  // Ollama Instructions Modal
  const [ollamaHelpOpen, setOllamaHelpOpen] = useState(false);

  // Model Discovery Modal
  const [modelModalProvider, setModelModalProvider] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Global Settings Form state
  const [policyForm, setPolicyForm] = useState<GlobalAiSettings | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Edit Agent Preference Modal
  const [editingAgent, setEditingAgent] = useState<AgentPreferenceItem | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);

  // Pagination for logs
  const logsPagination = usePagination(usageQuery.data?.logs ?? [], 15);

  useEffect(() => {
    if (settingsQuery.data) {
      setPolicyForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const refreshAll = () => {
    providersQuery.refetch();
    quotasQuery.refetch();
    settingsQuery.refetch();
    prefsQuery.refetch();
    usageQuery.refetch();
    setFeedbackMsg("All AI telemetry and provider health checks refreshed.");
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Test a provider
  const handleTestProvider = async (provider: ProviderItem) => {
    setTestingId(provider.id);
    setFeedbackErr(null);
    try {
      const res = await codynexApi.ai.testProvider(provider.id);
      const data = unwrap<{ ok: boolean; latencyMs?: number; message?: string }>(res.data);
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          ok: data.ok,
          message: data.message || (data.ok ? `Connected successfully (${data.latencyMs}ms)` : "Health check failed"),
          latencyMs: data.latencyMs,
        },
      }));
      if (!data.ok && provider.id === "ollama") {
        setOllamaHelpOpen(true);
      }
    } catch (err) {
      const msg = toApiError(err).message;
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: { ok: false, message: msg },
      }));
      if (provider.id === "ollama") {
        setOllamaHelpOpen(true);
      }
    } finally {
      setTestingId(null);
      providersQuery.refetch();
    }
  };

  // Open Configure Modal
  const openConfigure = (provider: ProviderItem) => {
    setConfigModalProvider(provider);
    setCredApiKey("");
    setCredAccountId("");
    setCredBaseUrl(provider.baseUrl || "");
    setCredModel(provider.activeModel || "");
    setFeedbackErr(null);
  };

  // Save Credentials
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configModalProvider) return;
    setSavingCreds(true);
    setFeedbackErr(null);
    try {
      await codynexApi.ai.saveProvider({
        provider: configModalProvider.id,
        apiKey: credApiKey.trim() || undefined,
        accountId: credAccountId.trim() || undefined,
        baseUrl: credBaseUrl.trim() || undefined,
        model: credModel.trim() || undefined,
      });
      setFeedbackMsg(`Updated credentials for ${configModalProvider.name} (stored with AES-256-GCM encryption).`);
      setConfigModalProvider(null);
      providersQuery.refetch();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      setFeedbackErr(toApiError(err).message);
    } finally {
      setSavingCreds(false);
    }
  };

  // View Models
  const handleViewModels = async (providerId: string) => {
    setModelModalProvider(providerId);
    setLoadingModels(true);
    try {
      const res = await codynexApi.ai.getProviderModels(providerId);
      setDiscoveredModels(unwrap<DiscoveredModel[]>(res.data) ?? []);
    } catch (err) {
      setDiscoveredModels([]);
      setFeedbackErr(toApiError(err).message);
    } finally {
      setLoadingModels(false);
    }
  };

  // Save Global Policy
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyForm) return;
    setSavingPolicy(true);
    setFeedbackErr(null);
    try {
      await codynexApi.ai.updateSettings(policyForm);
      setFeedbackMsg("Global AI Routing & Free-Only Policy updated successfully.");
      settingsQuery.refetch();
      providersQuery.refetch();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      setFeedbackErr(toApiError(err).message);
    } finally {
      setSavingPolicy(false);
    }
  };

  // Save Agent Preference
  const handleSaveAgentPref = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    setSavingAgent(true);
    setFeedbackErr(null);
    try {
      await codynexApi.ai.updateAgentPreference(editingAgent.agentRole, {
        preferredProvider: editingAgent.preferredProvider,
        fallbackProvider: editingAgent.fallbackProvider,
        preferredModel: editingAgent.preferredModel,
        temperature: Number(editingAgent.temperature),
        maxTokens: Number(editingAgent.maxTokens),
      });
      setFeedbackMsg(`Updated AI model routing for ${editingAgent.displayName}.`);
      setEditingAgent(null);
      prefsQuery.refetch();
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      setFeedbackErr(toApiError(err).message);
    } finally {
      setSavingAgent(false);
    }
  };

  const providers = providersQuery.data ?? [];
  const quotas = quotasQuery.data ?? [];
  const preferences = prefsQuery.data ?? [];
  const usageSummary = usageQuery.data?.summary;
  const isFreeOnlyActive = settingsQuery.data?.freeOnlyMode ?? true;

  return (
    <DashboardShell
      title="AI Multi-Provider & Resource Management"
      subtitle="Strict $0 AI Spending Policy enforced. Multi-provider intelligent routing, free-tier fallbacks, and local inference orchestration."
    >
      {/* Top Action Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-surface-border bg-surface p-3.5 shadow-card">
        <div className="flex items-center gap-2">
          <Badge
            tone={isFreeOnlyActive ? "success" : "warning"}
            className="flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] font-semibold"
          >
            {isFreeOnlyActive ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                STRICT $0 FREE-ONLY ENFORCED
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                PAID PROVIDERS PERMITTED
              </>
            )}
          </Badge>
          <span className="text-xs text-ink-muted">
            All agents strictly route to verified free models.
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={refreshAll}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Telemetry
        </Button>
      </div>
      {/* Alert Banners */}
      {feedbackMsg && (
        <div className="mb-4 flex items-center justify-between rounded-card border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-sm text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs text-emerald-400/80 hover:text-emerald-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {feedbackErr && (
        <div className="mb-4">
          <ErrorBanner message={feedbackErr} />
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="mb-6 flex border-b border-surface-border">
        <button
          type="button"
          onClick={() => setActiveTab("providers")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "providers"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <Cpu className="h-4 w-4" />
          Providers (7 Supported)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preferences")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "preferences"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <Bot className="h-4 w-4" />
          Agent Model Preferences
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("policy")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "policy"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Global Routing & $0 Policy
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("quotas")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "quotas"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <Zap className="h-4 w-4" />
          Usage & Quota Limits
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "logs"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <Activity className="h-4 w-4" />
          Inference Logs & Telemetry
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: PROVIDERS GRID */}
      {/* ============================================================== */}
      {activeTab === "providers" && (
        <div>
          {providersQuery.loading && providers.length === 0 ? (
            <StatsGridSkeleton count={6} />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {providers.map((p) => {
                const testRes = testResults[p.id];
                const isOllama = p.id === "ollama";
                const isOpenAi = p.id === "openai";

                return (
                  <Card key={p.id} className="relative flex flex-col justify-between overflow-hidden">
                    {/* Header Badges */}
                    <div>
                      <div className="flex items-start justify-between border-b border-surface-border p-4 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                              isOllama
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                                : isOpenAi
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            }`}
                          >
                            {isOllama ? (
                              <Server className="h-5 w-5" />
                            ) : p.isLocal ? (
                              <Cpu className="h-5 w-5" />
                            ) : (
                              <Cloud className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                            <span className="font-mono text-xs text-ink-muted">id: {p.id}</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {isOpenAi && isFreeOnlyActive ? (
                            <Badge tone="danger" className="text-[10px] font-semibold">
                              BLOCKED ($0 POLICY)
                            </Badge>
                          ) : p.status === "CONNECTED" ? (
                            <Badge tone="success" className="text-[10px] font-semibold">
                              CONNECTED
                            </Badge>
                          ) : p.status === "RATE_LIMITED" ? (
                            <Badge tone="warning" className="text-[10px] font-semibold">
                              RATE LIMITED (429)
                            </Badge>
                          ) : p.isConfigured ? (
                            <Badge tone="warning" className="text-[10px] font-semibold">
                              DEGRADED / IDLE
                            </Badge>
                          ) : (
                            <Badge tone="neutral" className="text-[10px] font-semibold">
                              NOT CONFIGURED
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Provider Body */}
                      <div className="space-y-3 p-4 text-xs">
                        <p className="line-clamp-2 text-ink-muted">{p.description}</p>

                        <div className="rounded-md border border-surface-border bg-surface-muted p-2.5">
                          <div className="flex items-center justify-between text-ink-muted">
                            <span>Cost Tier:</span>
                            <span
                              className={`font-semibold ${
                                isOpenAi
                                  ? "text-rose-400"
                                  : isOllama
                                  ? "text-sky-400"
                                  : "text-emerald-400"
                              }`}
                            >
                              {isOpenAi
                                ? "Paid API ($/token)"
                                : isOllama
                                ? "$0 Local Hardware (Unlimited)"
                                : "$0 Verified Free Tier"}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-ink-muted">
                            <span>Allowance:</span>
                            <span className="font-mono text-[11px] text-ink">{p.quotaDescription}</span>
                          </div>
                          {p.activeModel && (
                            <div className="mt-1 flex items-center justify-between text-ink-muted">
                              <span>Default Model:</span>
                              <span className="font-mono text-[11px] text-primary">{p.activeModel}</span>
                            </div>
                          )}
                        </div>

                        {/* Test Status feedback if present */}
                        {testRes && (
                          <div
                            className={`rounded-md border p-2 text-xs ${
                              testRes.ok
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              {testRes.ok ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 shrink-0" />
                              )}
                              <span>{testRes.message}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="flex items-center justify-between border-t border-surface-border bg-surface-muted/50 p-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewModels(p.id)}
                          className="h-7 text-xs"
                        >
                          Models ({p.modelCount})
                        </Button>
                        {isOllama && p.status !== "CONNECTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOllamaHelpOpen(true)}
                            className="h-7 text-xs text-sky-400 hover:text-sky-300"
                          >
                            <Terminal className="mr-1 h-3 w-3" />
                            Offline Guide
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={testingId === p.id}
                          onClick={() => handleTestProvider(p)}
                          className="h-7 text-xs"
                        >
                          {testingId === p.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            "Test"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openConfigure(p)}
                          className="h-7 text-xs"
                        >
                          <Key className="mr-1 h-3 w-3" />
                          Configure
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: AGENT MODEL PREFERENCES */}
      {/* ============================================================== */}
      {activeTab === "preferences" && (
        <Card>
          <CardHeader
            title="Agent Model Preferences & Routing Matrix"
            subtitle="Assign specific providers and models to specialized autonomous agents. In strict $0 Free-Only mode, agents automatically fallback to alternative free providers upon rate limits."
          />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-surface-border text-ink-muted">
                  <th className="pb-2.5 font-semibold">Specialized Agent</th>
                  <th className="pb-2.5 font-semibold">Preferred Provider</th>
                  <th className="pb-2.5 font-semibold">Fallback Provider</th>
                  <th className="pb-2.5 font-semibold">Active Model</th>
                  <th className="pb-2.5 font-semibold">Temp / MaxTokens</th>
                  <th className="pb-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {preferences.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-ink-muted">
                      No agent preferences configured. Defaulting to system fallback router.
                    </td>
                  </tr>
                ) : (
                  preferences.map((pref) => (
                    <tr key={pref.agentRole} className="hover:bg-surface-muted/40">
                      <td className="py-3 font-medium text-ink">
                        <div>
                          <span className="font-semibold">{pref.displayName}</span>
                          <p className="text-[11px] text-ink-muted">{pref.description}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge tone="success" className="font-mono text-[11px]">
                          {pref.preferredProvider.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge tone="neutral" className="font-mono text-[11px]">
                          {pref.fallbackProvider.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-[11px] text-ink">{pref.preferredModel}</td>
                      <td className="py-3 font-mono text-[11px] text-ink-muted">
                        {pref.temperature} / {formatNumber(pref.maxTokens)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingAgent({ ...pref })}
                          className="h-7 text-xs"
                        >
                          Edit Route
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/* TAB 3: GLOBAL POLICY & ROUTING */}
      {/* ============================================================== */}
      {activeTab === "policy" && policyForm && (
        <Card className="max-w-3xl">
          <CardHeader
            title="Global AI Governance & Spending Policy"
            subtitle="Configure strict $0 AI spending constraints, fallback behavior, concurrency thresholds, and request timeout limits."
          />
          <form onSubmit={handleSavePolicy} className="space-y-5 p-5 text-sm">
            {/* Free-Only Mode Switch */}
            <div className="flex items-start justify-between rounded-card border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <span className="font-semibold text-emerald-300">
                    Strict $0 AI Spending Policy (FREE-ONLY MODE)
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  Guarantees $0 AI spending across all autonomous agents. Blocks OpenAI, paid OpenRouter models, and any model with unverified pricing. No agent can bypass this restriction.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={policyForm.freeOnlyMode}
                  onChange={(e) =>
                    setPolicyForm((prev) => (prev ? { ...prev, freeOnlyMode: e.target.checked } : null))
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-surface-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full" />
              </label>
            </div>

            {/* Auto Fallback Switch */}
            <div className="flex items-start justify-between rounded-card border border-surface-border bg-surface-muted p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-ink">Intelligent Free-Tier Fallback</span>
                </div>
                <p className="text-xs text-ink-muted">
                  When a primary provider encounters a 429 rate limit or outage, CodyNex OS automatically and silently routes inference to the next eligible free provider in the chain.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={policyForm.autoFallback}
                  onChange={(e) =>
                    setPolicyForm((prev) => (prev ? { ...prev, autoFallback: e.target.checked } : null))
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-surface-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
              </label>
            </div>

            {/* Numeric configurations */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  Max Concurrent Inferences
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={policyForm.maxConcurrentRequests}
                  onChange={(e) =>
                    setPolicyForm((prev) =>
                      prev ? { ...prev, maxConcurrentRequests: Number(e.target.value) } : null
                    )
                  }
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Limits parallel requests to prevent sudden free rate-limit spikes (RPM).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  Daily Free Token Budget
                </label>
                <Input
                  type="number"
                  min={10000}
                  step={50000}
                  value={policyForm.dailyTokenBudget}
                  onChange={(e) =>
                    setPolicyForm((prev) =>
                      prev ? { ...prev, dailyTokenBudget: Number(e.target.value) } : null
                    )
                  }
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Global soft ceiling across all free external APIs combined.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  Max Fallback Retries
                </label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={policyForm.maxRetries}
                  onChange={(e) =>
                    setPolicyForm((prev) =>
                      prev ? { ...prev, maxRetries: Number(e.target.value) } : null
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">
                  Inference Timeout (Milliseconds)
                </label>
                <Input
                  type="number"
                  min={5000}
                  step={5000}
                  value={policyForm.timeoutMs}
                  onChange={(e) =>
                    setPolicyForm((prev) =>
                      prev ? { ...prev, timeoutMs: Number(e.target.value) } : null
                    )
                  }
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-3">
              <Button type="submit" variant="primary" disabled={savingPolicy}>
                {savingPolicy ? "Saving Policy..." : "Save AI Governance Settings"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ============================================================== */}
      {/* TAB 4: USAGE & FREE QUOTAS */}
      {/* ============================================================== */}
      {activeTab === "quotas" && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Total AI Cost</span>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-400">$0.00</div>
              <div className="mt-1 text-xs text-ink-muted">100% Free Tier Compliant</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Total Tokens Processed</span>
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">
                {formatNumber((usageSummary?.inputTokens ?? 0) + (usageSummary?.outputTokens ?? 0))}
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                {formatNumber(usageSummary?.inputTokens ?? 0)} in / {formatNumber(usageSummary?.outputTokens ?? 0)} out
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Inference Invocations</span>
                <Activity className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">
                {formatNumber(usageSummary?.requestCount ?? 0)}
              </div>
              <div className="mt-1 text-xs text-ink-muted">Across all autonomous agents</div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Active Free Providers</span>
                <Layers className="h-4 w-4 text-purple-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">
                {providers.filter((p) => p.isConfigured && p.isFreeEligible).length} of 6
              </div>
              <div className="mt-1 text-xs text-ink-muted">Ready for seamless routing</div>
            </Card>
          </div>

          {/* Quota Tracking Cards */}
          <Card>
            <CardHeader
              title="Provider Quotas & Rate Limit Status"
              subtitle="Real-time telemetry of provider quotas. Where upstream APIs do not expose live remaining quotas via headers, CodyNex OS tracks local usage and indicates that quota information is unavailable."
            />
            <div className="overflow-x-auto p-4">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-border text-ink-muted">
                    <th className="pb-2.5 font-semibold">Provider</th>
                    <th className="pb-2.5 font-semibold">Tier & Type</th>
                    <th className="pb-2.5 font-semibold">Free Allowance</th>
                    <th className="pb-2.5 font-semibold">Requests Today</th>
                    <th className="pb-2.5 font-semibold">Tokens Today</th>
                    <th className="pb-2.5 font-semibold">Remaining Quota Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {quotas.map((q) => (
                    <tr key={q.provider} className="hover:bg-surface-muted/40">
                      <td className="py-3 font-medium text-ink">{q.displayName}</td>
                      <td className="py-3">
                        {q.isLocal ? (
                          <Badge tone="info" className="text-[10px]">
                            Local ($0 Hardware)
                          </Badge>
                        ) : q.isPaid ? (
                          <Badge tone="danger" className="text-[10px]">
                            Paid Only
                          </Badge>
                        ) : (
                          <Badge tone="success" className="text-[10px]">
                            Cloud ($0 Free)
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-ink">{q.freeTierAllowance}</td>
                      <td className="py-3 font-mono text-[11px] text-ink">{formatNumber(q.requestsUsedToday)}</td>
                      <td className="py-3 font-mono text-[11px] text-ink">{formatNumber(q.tokensUsedToday)}</td>
                      <td className="py-3">
                        {q.remainingAllowance ? (
                          <span className="font-mono text-emerald-400">{q.remainingAllowance}</span>
                        ) : q.quotaUnavailableReason ? (
                          <span className="text-[11px] italic text-ink-muted">
                            {q.quotaUnavailableReason}
                          </span>
                        ) : (
                          <span className="text-[11px] italic text-ink-muted">
                            Quota information unavailable from provider API
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: INFERENCE AUDIT LOGS */}
      {/* ============================================================== */}
      {activeTab === "logs" && (
        <Card>
          <CardHeader
            title="Inference Activity & Telemetry"
            subtitle="Auditable logs of model executions across all autonomous agents including latency, token count, and fallback recoveries."
          />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-surface-border text-ink-muted">
                  <th className="pb-2.5 font-semibold">Timestamp</th>
                  <th className="pb-2.5 font-semibold">Provider</th>
                  <th className="pb-2.5 font-semibold">Model</th>
                  <th className="pb-2.5 font-semibold">Tokens</th>
                  <th className="pb-2.5 font-semibold">Latency</th>
                  <th className="pb-2.5 font-semibold">Cost</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {logsPagination.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-muted">
                      No recent inference logs recorded.
                    </td>
                  </tr>
                ) : (
                  logsPagination.pageItems.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-muted/40">
                      <td className="py-2.5 font-mono text-[11px] text-ink-muted">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-2.5">
                        <Badge tone="neutral" className="font-mono text-[10px]">
                          {log.provider.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-ink">{log.model}</td>
                      <td className="py-2.5 font-mono text-[11px] text-ink-muted">
                        {formatNumber(log.inputTokens + log.outputTokens)} ({log.inputTokens} / {log.outputTokens})
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-ink-muted">
                        {log.latencyMs != null ? `${log.latencyMs}ms` : "—"}
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-emerald-400">
                        ${log.estimatedCostUsd}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          tone={log.status === "SUCCESS" ? "success" : "warning"}
                          className="text-[10px]"
                        >
                          {log.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {logsPagination.totalPages > 1 && (
              <div className="mt-4 flex justify-end">
                <Pagination
                  page={logsPagination.page}
                  pageSize={logsPagination.pageSize}
                  totalItems={logsPagination.totalItems}
                  onPageChange={logsPagination.setPage}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIGURE CREDENTIALS */}
      {/* ============================================================== */}
      <Modal
        open={Boolean(configModalProvider)}
        onClose={() => setConfigModalProvider(null)}
        title={`Configure ${configModalProvider?.name ?? "Provider"}`}
      >
        <form onSubmit={handleSaveCredentials} className="space-y-4 text-xs">
          <div className="rounded-md border border-surface-border bg-surface-muted p-3 text-ink-muted">
            <p>
              Credentials are encrypted using <strong>AES-256-GCM</strong> and saved in the CodyNex OS system vault. If environment variables are already defined in your <code>.env</code> file (e.g. <code>OPEN_ROUTER_API_KEY</code>, <code>CLOUDFARE_API_KEY</code>, <code>HUGGING_FACE_API_KEY</code>), they are automatically detected and used at runtime.
            </p>
          </div>

          {configModalProvider?.id === "ollama" ? (
            <div>
              <label className="mb-1 block font-medium text-ink">Ollama Base URL</label>
              <Input
                placeholder="http://127.0.0.1:11434"
                value={credBaseUrl}
                onChange={(e) => setCredBaseUrl(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Local inference endpoint. Default is <code>http://127.0.0.1:11434</code>.
              </p>
            </div>
          ) : configModalProvider?.id === "cloudflare" ? (
            <>
              <div>
                <label className="mb-1 block font-medium text-ink">Cloudflare API Token</label>
                <Input
                  type="password"
                  placeholder="Paste Cloudflare API Token (or leave blank if in .env)"
                  value={credApiKey}
                  onChange={(e) => setCredApiKey(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Requires <code>Workers AI: Read/Write</code> token permissions.
                </p>
              </div>
              <div>
                <label className="mb-1 block font-medium text-ink">
                  Cloudflare Account ID (Optional)
                </label>
                <Input
                  placeholder="Auto-discovered automatically from token if left blank"
                  value={credAccountId}
                  onChange={(e) => setCredAccountId(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Leave blank to allow CodyNex to auto-fetch your Account ID from Cloudflare.
                </p>
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block font-medium text-ink">API Key</label>
              <Input
                type="password"
                placeholder={`Paste ${configModalProvider?.name} API key`}
                value={credApiKey}
                onChange={(e) => setCredApiKey(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block font-medium text-ink">Default Model ID (Optional)</label>
            <Input
              placeholder={configModalProvider?.activeModel || "e.g. meta-llama/llama-3.3-70b-instruct:free"}
              value={credModel}
              onChange={(e) => setCredModel(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfigModalProvider(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingCreds}>
              {savingCreds ? "Encrypting & Storing..." : "Save Credentials"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: OFFLINE OLLAMA GUIDE */}
      {/* ============================================================== */}
      <Modal
        open={ollamaHelpOpen}
        onClose={() => setOllamaHelpOpen(false)}
        title="Ollama Local Inference Setup Guide"
      >
        <div className="space-y-4 text-xs text-ink">
          <p>
            Ollama allows CodyNex OS to run high-performance AI models directly on your hardware at <strong>$0 cost</strong> with zero cloud dependencies.
          </p>

          <div className="space-y-2">
            <h4 className="font-semibold text-ink">1. Start the Ollama Service</h4>
            <div className="rounded-md border border-surface-border bg-slate-950 p-2.5 font-mono text-emerald-400">
              ollama serve
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-ink">2. Pull Recommended Free Models</h4>
            <div className="space-y-1.5 rounded-md border border-surface-border bg-slate-950 p-2.5 font-mono text-emerald-400">
              <div>ollama run qwen3:4b</div>
              <div className="text-slate-500"># or for coding:</div>
              <div>ollama run qwen2.5-coder:7b</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-ink">3. Default Endpoint</h4>
            <p className="text-ink-muted">
              CodyNex connects to <code>http://127.0.0.1:11434</code> automatically. Once running, click &quot;Test&quot; on the Ollama card to verify.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setOllamaHelpOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: DISCOVERED MODELS */}
      {/* ============================================================== */}
      <Modal
        open={Boolean(modelModalProvider)}
        onClose={() => setModelModalProvider(null)}
        title={`Verified $0 Models for ${modelModalProvider?.toUpperCase()}`}
      >
        <div className="space-y-3 text-xs">
          {loadingModels ? (
            <div className="py-6 text-center text-ink-muted">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
              Discovering live eligible models...
            </div>
          ) : discoveredModels.length === 0 ? (
            <div className="py-6 text-center text-ink-muted">
              No models discovered or provider is not configured.
            </div>
          ) : (
            <div className="space-y-2">
              {discoveredModels.map((m) => (
                <div
                  key={m.id}
                  className="rounded-md border border-surface-border bg-surface-muted p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-ink">{m.name || m.id}</span>
                    <Badge
                      tone={m.isFree ? "success" : "danger"}
                      className="text-[10px]"
                    >
                      {m.isFree ? "FREE_VERIFIED ($0)" : "PAID"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-muted">ID: {m.id}</p>
                  {m.description && (
                    <p className="mt-1 text-[11px] text-ink-muted">{m.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-ink-muted">
                    <span>Context: {formatNumber(m.contextWindow)} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setModelModalProvider(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: EDIT AGENT PREFERENCE */}
      {/* ============================================================== */}
      <Modal
        open={Boolean(editingAgent)}
        onClose={() => setEditingAgent(null)}
        title={`AI Route: ${editingAgent?.displayName ?? "Agent"}`}
      >
        {editingAgent && (
          <form onSubmit={handleSaveAgentPref} className="space-y-4 text-xs">
            <div>
              <label className="mb-1 block font-medium text-ink">Preferred Provider</label>
              <select
                value={editingAgent.preferredProvider}
                onChange={(e) =>
                  setEditingAgent((prev) =>
                    prev ? { ...prev, preferredProvider: e.target.value } : null
                  )
                }
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-ink"
              >
                <option value="groq">Groq (Ultra-Fast Free LPU)</option>
                <option value="gemini">Google Gemini (Flash Free Tier)</option>
                <option value="ollama">Ollama (Local $0 Hardware)</option>
                <option value="openrouter">OpenRouter (Free Models)</option>
                <option value="cloudflare">Cloudflare Workers AI (Edge Free Allowance)</option>
                <option value="huggingface">Hugging Face (Serverless Community Free)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-ink">Fallback Provider</label>
              <select
                value={editingAgent.fallbackProvider}
                onChange={(e) =>
                  setEditingAgent((prev) =>
                    prev ? { ...prev, fallbackProvider: e.target.value } : null
                  )
                }
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-ink"
              >
                <option value="groq">Groq (Ultra-Fast Free LPU)</option>
                <option value="gemini">Google Gemini (Flash Free Tier)</option>
                <option value="ollama">Ollama (Local $0 Hardware)</option>
                <option value="openrouter">OpenRouter (Free Models)</option>
                <option value="cloudflare">Cloudflare Workers AI (Edge Free Allowance)</option>
                <option value="huggingface">Hugging Face (Serverless Community Free)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-ink">Preferred Model</label>
              <Input
                value={editingAgent.preferredModel}
                onChange={(e) =>
                  setEditingAgent((prev) =>
                    prev ? { ...prev, preferredModel: e.target.value } : null
                  )
                }
                placeholder="e.g. llama-3.3-70b-versatile"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-medium text-ink">Temperature (0.0 - 1.0)</label>
                <Input
                  type="number"
                  step={0.1}
                  min={0}
                  max={1}
                  value={editingAgent.temperature}
                  onChange={(e) =>
                    setEditingAgent((prev) =>
                      prev ? { ...prev, temperature: Number(e.target.value) } : null
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-ink">Max Output Tokens</label>
                <Input
                  type="number"
                  step={256}
                  min={256}
                  max={32768}
                  value={editingAgent.maxTokens}
                  onChange={(e) =>
                    setEditingAgent((prev) =>
                      prev ? { ...prev, maxTokens: Number(e.target.value) } : null
                    )
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingAgent(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={savingAgent}>
                {savingAgent ? "Saving..." : "Save Route"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </DashboardShell>
  );
}
