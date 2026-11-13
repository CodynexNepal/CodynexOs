"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  CheckCircle2,
  Coins,
  FileCheck,
  Gavel,
  History,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorBanner } from "@/components/ui/EmptyState";
import { useApiQuery } from "@/hooks/useApi";
import { codynexApi, unwrap } from "@/lib/codynexOs";
import { toApiError } from "@/lib/axios";
import { formatDateTime } from "@/lib/utils";

interface AgentContract {
  id: string;
  contractNumber: string;
  employeeId: string;
  employee?: {
    id: string;
    roleTitle: string;
    slug: string;
    department?: { name: string; slug: string };
  };
  status: "ACTIVE" | "PROBATION" | "SUSPENDED" | "TERMINATED";
  termsContentMd: string;
  signingBonusTokens: number;
  tokenSalaryPerTask: number;
  tokenBalance: number;
  totalTokensEarned: number;
  totalTokensPenalized: number;
  reputationScore: number;
  signedAt: string;
  signatureHash: string;
  lastAuditedAt?: string;
  probationReason?: string;
}

interface CompanyRule {
  id: string;
  ruleCode: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  defaultPenaltyTokens: number;
  category: string;
  isActive: boolean;
  createdAt: string;
}

interface RuleViolation {
  id: string;
  employeeId: string;
  employee?: {
    roleTitle: string;
    slug: string;
    department?: { name: string };
  };
  ruleCode: string;
  rule?: { title: string; category: string };
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  penaltyType: "WARNING" | "TOKEN_FINE" | "PROBATION" | "SUSPENSION" | "TERMINATION";
  tokenPenaltyAmount: number;
  status: "RECORDED" | "ENFORCED" | "APPEALED" | "PARDONED";
  explanation: string;
  enactedAt: string;
  pardonedAt?: string;
  pardonReason?: string;
}

interface TokenTransaction {
  id: string;
  contractId: string;
  employeeId: string;
  employee?: { roleTitle: string; slug: string };
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

interface HrOverviewData {
  activeContracts: number;
  probationContracts: number;
  suspendedContracts: number;
  totalContracts: number;
  totalRules: number;
  totalViolations: number;
  totalTokenCirculation: number;
  totalTokensEarned: number;
  totalTokensPenalized: number;
  averageReputation: number;
  leaderboard: Array<{
    employeeId: string;
    roleTitle: string;
    department: string;
    tokenBalance: number;
    reputationScore: number;
    status: string;
  }>;
}

export default function HrPage() {
  const [activeTab, setActiveTab] = useState<"contracts" | "rules" | "violations" | "ledger">("contracts");

  // Main Queries
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewErr,
    refetch: refetchOverview,
  } = useApiQuery<HrOverviewData>(() => codynexApi.hr.overview());

  const {
    data: contracts,
    loading: contractsLoading,
    refetch: refetchContracts,
  } = useApiQuery<AgentContract[]>(() => codynexApi.hr.contracts());

  const {
    data: rules,
    loading: rulesLoading,
    refetch: refetchRules,
  } = useApiQuery<CompanyRule[]>(() => codynexApi.hr.rules());

  const {
    data: violations,
    loading: violationsLoading,
    refetch: refetchViolations,
  } = useApiQuery<RuleViolation[]>(() => codynexApi.hr.violations());

  const {
    data: transactions,
    loading: txLoading,
    refetch: refetchTx,
  } = useApiQuery<TokenTransaction[]>(() => codynexApi.hr.transactions());

  // UI state
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Modals
  const [viewContract, setViewContract] = useState<AgentContract | null>(null);
  const [disciplineOpen, setDisciplineOpen] = useState(false);
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [disciplineRuleCode, setDisciplineRuleCode] = useState("");
  const [disciplinePenaltyType, setDisciplinePenaltyType] = useState<
    "TOKEN_FINE" | "WARNING" | "PROBATION" | "SUSPENSION"
  >("TOKEN_FINE");
  const [disciplineTokens, setDisciplineTokens] = useState<number>(200);
  const [disciplineExplanation, setDisciplineExplanation] = useState("");

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantEmployeeId, setGrantEmployeeId] = useState("");
  const [grantAmount, setGrantAmount] = useState<number>(250);
  const [grantReason, setGrantReason] = useState("");

  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [ruleCode, setRuleCode] = useState("");
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDesc, setRuleDesc] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [ruleCategory, setRuleCategory] = useState("GOVERNANCE");
  const [ruleDefaultPenalty, setRuleDefaultPenalty] = useState(400);

  const refetchAll = () => {
    refetchOverview();
    refetchContracts();
    refetchRules();
    refetchViolations();
    refetchTx();
  };

  const handleDiscipline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmployeeId || !disciplineRuleCode) return;
    setBusyAction("discipline");
    setActionErr(null);
    setActionMsg(null);

    try {
      const res = await codynexApi.hr.discipline({
        employeeId: targetEmployeeId,
        ruleCode: disciplineRuleCode,
        penaltyType: disciplinePenaltyType,
        tokenPenaltyAmount: disciplineTokens,
        explanation: disciplineExplanation || "Rule violation enforced by HR AI Governance.",
      });
      const data = unwrap<{ violation: RuleViolation; contract: AgentContract }>(res.data);
      setActionMsg(
        `Disciplinary action enforced on ${data.contract.employee?.roleTitle || "Agent"}: deducted ${
          data.violation.tokenPenaltyAmount
        } CNT. Status: ${data.contract.status}.`
      );
      setDisciplineOpen(false);
      setDisciplineExplanation("");
      refetchAll();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleGrantTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmployeeId || grantAmount <= 0) return;
    setBusyAction("grant");
    setActionErr(null);
    setActionMsg(null);

    try {
      const res = await codynexApi.hr.grantTokens({
        employeeId: grantEmployeeId,
        amount: Number(grantAmount),
        reason: grantReason || "Executive merit award for outstanding autonomous execution.",
      });
      const data = unwrap<{ contract: AgentContract }>(res.data);
      setActionMsg(
        `Granted ${grantAmount} CNT computational tokens to ${
          data.contract.employee?.roleTitle || "Agent"
        }. New balance: ${data.contract.tokenBalance} CNT.`
      );
      setGrantOpen(false);
      setGrantReason("");
      refetchAll();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleCode || !ruleTitle) return;
    setBusyAction("create-rule");
    setActionErr(null);
    setActionMsg(null);

    try {
      await codynexApi.hr.createRule({
        ruleCode: ruleCode.trim(),
        title: ruleTitle.trim(),
        description: ruleDesc.trim(),
        severity: ruleSeverity,
        defaultPenaltyTokens: Number(ruleDefaultPenalty),
        category: ruleCategory.trim(),
      });
      setActionMsg(`Company Rule '${ruleCode}' successfully ratified and published.`);
      setCreateRuleOpen(false);
      setRuleCode("");
      setRuleTitle("");
      setRuleDesc("");
      refetchRules();
      refetchOverview();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePardon = async (violationId: string) => {
    setBusyAction(`pardon-${violationId}`);
    setActionErr(null);
    setActionMsg(null);

    try {
      await codynexApi.hr.pardon(violationId, {
        reason: "Executive pardon granted by CEO: tokens refunded and reputation score restored.",
      });
      setActionMsg("Infraction pardoned! Penalized tokens refunded and agent reputation restored.");
      refetchAll();
    } catch (err) {
      setActionErr(toApiError(err).message);
    } finally {
      setBusyAction(null);
    }
  };

  const getContractTone = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "green";
      case "PROBATION":
        return "amber";
      case "SUSPENDED":
        return "red";
      case "TERMINATED":
        return "gray";
      default:
        return "blue";
    }
  };

  const getSeverityTone = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return "red";
      case "HIGH":
        return "amber";
      case "MEDIUM":
        return "blue";
      case "LOW":
        return "gray";
      default:
        return "gray";
    }
  };

  return (
    <DashboardShell
      title="HR, AI Governance & Token Contracts"
      subtitle="Autonomous AI employee contracts, computational token compensation (CNT), corporate rules, and disciplinary enforcement."
    >
      <div className="space-y-5">
        {overviewErr && <ErrorBanner message={overviewErr} onRetry={refetchAll} />}
        {actionErr && <ErrorBanner message={actionErr} />}
        {actionMsg && (
          <div className="rounded-md border border-[#9FE870] bg-[#EAFCCB] p-3 text-xs font-semibold text-[#14532D]">
            {actionMsg}
          </div>
        )}

        {/* Executive Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "contracts" ? "dark" : "outline"}
              size="sm"
              onClick={() => setActiveTab("contracts")}
            >
              <FileCheck className="h-3.5 w-3.5" />
              Agent Contracts &amp; Wallets
            </Button>
            <Button
              variant={activeTab === "rules" ? "dark" : "outline"}
              size="sm"
              onClick={() => setActiveTab("rules")}
            >
              <Scale className="h-3.5 w-3.5" />
              Company Rules ({overview?.totalRules ?? 0})
            </Button>
            <Button
              variant={activeTab === "violations" ? "dark" : "outline"}
              size="sm"
              onClick={() => setActiveTab("violations")}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Infractions ({overview?.totalViolations ?? 0})
            </Button>
            <Button
              variant={activeTab === "ledger" ? "dark" : "outline"}
              size="sm"
              onClick={() => setActiveTab("ledger")}
            >
              <History className="h-3.5 w-3.5" />
              Token Economy Ledger
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDisciplineRuleCode(rules?.[0]?.ruleCode || "RULE_NO_UNAUTHORIZED_DEPLOY");
                setTargetEmployeeId(contracts?.[0]?.employeeId || "");
                setDisciplineOpen(true);
              }}
            >
              <Gavel className="h-3.5 w-3.5 text-amber-600" />
              Discipline Agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGrantEmployeeId(contracts?.[0]?.employeeId || "");
                setGrantOpen(true);
              }}
            >
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              Grant Tokens
            </Button>
            <Button
              variant="dark"
              size="sm"
              onClick={() => setCreateRuleOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New Rule
            </Button>
          </div>
        </div>

        {/* Macro Metrics Bar */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">AI Workforce Contracts</span>
              <UserCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ink">
                {overviewLoading ? "..." : overview?.activeContracts ?? 0}
              </span>
              <span className="text-xs text-ink-muted">
                / {overview?.totalContracts ?? 0} bound agents
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {overview?.probationContracts ?? 0} on probation · {overview?.suspendedContracts ?? 0} suspended
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Token Circulation (CNT)</span>
              <Coins className="h-4 w-4 text-brand-ink" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-ink">
                {overviewLoading ? "..." : (overview?.totalTokenCirculation ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-ink">CNT</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-700">
              +{overview?.totalTokensEarned?.toLocaleString() ?? 0} earned by agents
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Infractions &amp; Penalties</span>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-700">
                {overviewLoading ? "..." : overview?.totalViolations ?? 0}
              </span>
              <span className="text-xs text-ink-muted">violations</span>
            </div>
            <p className="mt-1 text-[11px] text-rose-600">
              -{overview?.totalTokensPenalized?.toLocaleString() ?? 0} CNT penalized
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-muted">Workforce Avg Reputation</span>
              <Award className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ink">
                {overviewLoading ? "..." : overview?.averageReputation ?? 100}%
              </span>
              <Badge tone={(overview?.averageReputation ?? 100) >= 80 ? "green" : "amber"}>
                {(overview?.averageReputation ?? 100) >= 80 ? "High Integrity" : "Audit Required"}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Standard salary: 100 CNT / task
            </p>
          </Card>
        </div>

        {/* TAB 1: CONTRACTS & WALLETS */}
        {activeTab === "contracts" && (
          <Card>
            <CardHeader
              title="Binding AI Employee Contracts & Wallets"
              subtitle="All autonomous agents are cryptographically bound to company rules and compensated strictly in computational tokens."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchContracts()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              }
            />
            {contractsLoading ? (
              <div className="p-8 text-center text-xs text-ink-muted">Loading AI contracts...</div>
            ) : !contracts || contracts.length === 0 ? (
              <EmptyState
                icon={FileCheck}
                title="No Agent Contracts"
                description="Initialize company seeds or hire autonomous agents."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-ink">
                  <thead className="border-b border-surface-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="py-3 px-4">AI Employee</th>
                      <th className="py-3 px-4">Contract #</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">CNT Wallet</th>
                      <th className="py-3 px-4">Earned / Fined</th>
                      <th className="py-3 px-4">Reputation</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border font-medium">
                    {contracts.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-ink">
                            {c.employee?.roleTitle || c.employeeId}
                          </div>
                          <div className="text-[11px] text-ink-muted">
                            {c.employee?.department?.name || "Autonomous Department"} ·{" "}
                            <code>{c.employee?.slug}</code>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-ink-muted">
                          {c.contractNumber}
                        </td>
                        <td className="py-3 px-4">
                          <Badge tone={getContractTone(c.status)}>{c.status}</Badge>
                          {c.probationReason && (
                            <div className="mt-0.5 text-[10px] text-amber-700 truncate max-w-[140px]" title={c.probationReason}>
                              {c.probationReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-brand-ink">
                            {c.tokenBalance.toLocaleString()}
                          </span>{" "}
                          <span className="text-[10px] text-ink-muted">CNT</span>
                        </td>
                        <td className="py-3 px-4 text-[11px]">
                          <span className="text-emerald-700">+{c.totalTokensEarned.toLocaleString()}</span>
                          {" / "}
                          <span className="text-rose-600">-{c.totalTokensPenalized.toLocaleString()}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-surface-muted overflow-hidden border border-surface-border">
                              <div
                                className={`h-full ${
                                  c.reputationScore >= 80
                                    ? "bg-emerald-500"
                                    : c.reputationScore >= 50
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                                }`}
                                style={{ width: `${Math.max(0, Math.min(100, c.reputationScore))}%` }}
                              />
                            </div>
                            <span className="font-bold">{c.reputationScore}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewContract(c)}
                              className="rounded border border-surface-border px-2 py-1 text-[11px] font-semibold text-ink hover:bg-surface-muted"
                            >
                              View Contract
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGrantEmployeeId(c.employeeId);
                                setGrantOpen(true);
                              }}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              + Reward
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTargetEmployeeId(c.employeeId);
                                setDisciplineRuleCode(rules?.[0]?.ruleCode || "RULE_NO_UNAUTHORIZED_DEPLOY");
                                setDisciplineOpen(true);
                              }}
                              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Discipline
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* TAB 2: COMPANY RULES & ETHICS */}
        {activeTab === "rules" && (
          <Card>
            <CardHeader
              title="Corporate Code of Conduct & Rules Policy"
              subtitle="Explicit organizational rules enforced by Chief HR & AI Ethics Officer. Infractions trigger automatic CNT fines and probation."
              action={
                <Button variant="dark" size="sm" onClick={() => setCreateRuleOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Company Rule
                </Button>
              }
            />
            {rulesLoading ? (
              <div className="p-8 text-center text-xs text-ink-muted">Loading rules...</div>
            ) : !rules || rules.length === 0 ? (
              <EmptyState
                icon={Scale}
                title="No Corporate Rules"
                description="Ratify rules to enforce conduct across your autonomous agents."
              />
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col justify-between rounded-lg border border-surface-border bg-surface p-4 text-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-brand-ink">
                          {rule.ruleCode}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={getSeverityTone(rule.severity)}>{rule.severity}</Badge>
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
                            {rule.category}
                          </span>
                        </div>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-ink">{rule.title}</h4>
                      <p className="mt-1 text-ink-muted leading-relaxed">{rule.description}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
                      <span className="text-[11px] text-ink-muted">
                        Default Penalty:{" "}
                        <strong className="text-rose-600 font-bold">
                          -{rule.defaultPenaltyTokens} CNT
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDisciplineRuleCode(rule.ruleCode);
                          setDisciplineTokens(rule.defaultPenaltyTokens);
                          setDisciplineOpen(true);
                        }}
                        className="text-[11px] font-bold text-brand-ink hover:underline"
                      >
                        Enforce Penalty &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* TAB 3: INFRACTIONS & VIOLATIONS */}
        {activeTab === "violations" && (
          <Card>
            <CardHeader
              title="Disciplinary Infractions &amp; Enforcement Log"
              subtitle="All infractions, penalties, token deductions, and probation actions issued by Chief HR & AI Ethics Officer."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchViolations()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              }
            />
            {violationsLoading ? (
              <div className="p-8 text-center text-xs text-ink-muted">Loading infractions...</div>
            ) : !violations || violations.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-muted">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                <p className="font-bold text-ink">Zero Conduct Violations</p>
                <p className="mt-1 text-ink-muted">
                  All autonomous agents are strictly operating within company bylaws.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {violations.map((v) => (
                  <div key={v.id} className="p-4 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertOctagon className="h-4 w-4 text-rose-600" />
                        <span className="font-bold text-ink">
                          {v.employee?.roleTitle || v.employeeId}
                        </span>
                        <code className="text-[11px] text-ink-muted">{v.ruleCode}</code>
                        <Badge tone={getSeverityTone(v.severity)}>{v.severity}</Badge>
                        <Badge tone={v.status === "PARDONED" ? "green" : "red"}>{v.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-600">
                          -{v.tokenPenaltyAmount} CNT
                        </span>
                        <span className="text-[11px] text-ink-muted">
                          {formatDateTime(v.enactedAt)}
                        </span>
                        {v.status !== "PARDONED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePardon(v.id)}
                            loading={busyAction === `pardon-${v.id}`}
                          >
                            Pardon &amp; Refund
                          </Button>
                        )}
                      </div>
                    </div>

                    <p className="text-ink-muted bg-surface-muted/50 p-2.5 rounded border border-surface-border leading-relaxed">
                      <strong>Explanation:</strong> {v.explanation}
                    </p>

                    {v.pardonReason && (
                      <p className="text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200 text-[11px]">
                        <strong>CEO Pardon:</strong> {v.pardonReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* TAB 4: TOKEN ECONOMY LEDGER */}
        {activeTab === "ledger" && (
          <Card>
            <CardHeader
              title="CodyNex Computational Token (CNT) Ledger"
              subtitle="Transparent internal audit trail of all signing bonuses, task completions, penalties, and executive grants."
              action={
                <Button variant="outline" size="sm" onClick={() => refetchTx()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              }
            />
            {txLoading ? (
              <div className="p-8 text-center text-xs text-ink-muted">Loading ledger...</div>
            ) : !transactions || transactions.length === 0 ? (
              <EmptyState
                icon={History}
                title="No Token Transactions"
                description="Token activity will appear here as tasks complete or penalties are issued."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-ink">
                  <thead className="border-b border-surface-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">AI Employee</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Balance After</th>
                      <th className="py-3 px-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border font-medium">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-surface-muted/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-ink-muted">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-ink">
                          {tx.employee?.roleTitle || tx.employeeId}
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-[10px] font-bold text-ink-muted">
                            {tx.type}
                          </code>
                        </td>
                        <td className="py-3 px-4 font-bold">
                          {tx.amount >= 0 ? (
                            <span className="text-emerald-700">+{tx.amount} CNT</span>
                          ) : (
                            <span className="text-rose-600">{tx.amount} CNT</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-brand-ink">
                          {tx.balanceAfter.toLocaleString()} CNT
                        </td>
                        <td className="py-3 px-4 text-[11px] text-ink-muted max-w-xs truncate" title={tx.reason}>
                          {tx.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* MODAL 1: VIEW CONTRACT */}
      <Modal
        open={Boolean(viewContract)}
        onClose={() => setViewContract(null)}
        title={viewContract ? `Contract ${viewContract.contractNumber} — ${viewContract.employee?.roleTitle}` : "Agent Contract"}
      >
        {viewContract && (
          <div className="space-y-4 text-xs text-ink max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted">Contract Status</span>
                <div className="mt-1">
                  <Badge tone={getContractTone(viewContract.status)}>{viewContract.status}</Badge>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted">Signed Date</span>
                <div className="mt-1 font-semibold">{formatDateTime(viewContract.signedAt)}</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted">Current Balance</span>
                <div className="mt-1 font-bold text-brand-ink">{viewContract.tokenBalance.toLocaleString()} CNT</div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-muted">Reputation Score</span>
                <div className="mt-1 font-bold text-emerald-700">{viewContract.reputationScore}%</div>
              </div>
            </div>

            <div className="rounded-md border border-surface-border bg-surface-muted/50 p-3 font-mono text-[11px] space-y-1">
              <div>
                <span className="text-ink-muted">Cryptographic Signature:</span>{" "}
                <span className="text-brand-ink font-bold break-all">{viewContract.signatureHash}</span>
              </div>
              <div>
                <span className="text-ink-muted">Compensation Model:</span>{" "}
                <span>Strict Computational Tokens ({viewContract.tokenSalaryPerTask} CNT / verified task)</span>
              </div>
              <div>
                <span className="text-ink-muted">Signing Bonus Granted:</span>{" "}
                <span>{viewContract.signingBonusTokens} CNT</span>
              </div>
            </div>

            <div className="rounded-md border border-surface-border bg-surface p-4">
              <h4 className="font-bold text-ink mb-2">Binding Contract Terms &amp; Provisions:</h4>
              <div className="prose prose-sm max-w-none text-xs text-ink leading-relaxed whitespace-pre-wrap font-sans">
                {viewContract.termsContentMd}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setViewContract(null)}>
                Close Contract
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: DISCIPLINE AGENT */}
      <Modal
        open={disciplineOpen}
        onClose={() => setDisciplineOpen(false)}
        title="Issue Disciplinary Action &amp; Enforce Penalties"
      >
        <form onSubmit={handleDiscipline} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Target AI Employee</label>
            <select
              value={targetEmployeeId}
              onChange={(e) => setTargetEmployeeId(e.target.value)}
              className="h-9 w-full rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none"
              required
            >
              {contracts?.map((c) => (
                <option key={c.employeeId} value={c.employeeId}>
                  {c.employee?.roleTitle || c.employeeId} ({c.tokenBalance} CNT balance)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Rule Violated</label>
            <select
              value={disciplineRuleCode}
              onChange={(e) => {
                setDisciplineRuleCode(e.target.value);
                const r = rules?.find((rule) => rule.ruleCode === e.target.value);
                if (r) setDisciplineTokens(r.defaultPenaltyTokens);
              }}
              className="h-9 w-full rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none"
              required
            >
              {rules?.map((r) => (
                <option key={r.ruleCode} value={r.ruleCode}>
                  [{r.ruleCode}] {r.title} ({r.severity} - {r.defaultPenaltyTokens} CNT)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Penalty Action</label>
              <select
                value={disciplinePenaltyType}
                onChange={(e) =>
                  setDisciplinePenaltyType(
                    e.target.value as "TOKEN_FINE" | "WARNING" | "PROBATION" | "SUSPENSION"
                  )
                }
                className="h-9 w-full rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none"
              >
                <option value="TOKEN_FINE">Deduct Token Fine</option>
                <option value="PROBATION">Place on Probation</option>
                <option value="WARNING">Formal Conduct Warning</option>
                <option value="SUSPENSION">Temporary Suspension</option>
              </select>
            </div>
            <div>
              <Input
                label="CNT Tokens to Deduct"
                type="number"
                min={0}
                value={disciplineTokens}
                onChange={(e) => setDisciplineTokens(Number(e.target.value))}
              />
            </div>
          </div>

          <Textarea
            label="Disciplinary Explanation / Audit Findings"
            rows={3}
            placeholder="Agent attempted git PR with zero commits or bypassed QA verification..."
            value={disciplineExplanation}
            onChange={(e) => setDisciplineExplanation(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDisciplineOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" size="sm" loading={busyAction === "discipline"}>
              <Gavel className="h-3.5 w-3.5" />
              Enforce Action
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: GRANT REWARD TOKENS */}
      <Modal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        title="Grant Computational Tokens (CNT Award)"
      >
        <form onSubmit={handleGrantTokens} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Recipient AI Employee</label>
            <select
              value={grantEmployeeId}
              onChange={(e) => setGrantEmployeeId(e.target.value)}
              className="h-9 w-full rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none"
              required
            >
              {contracts?.map((c) => (
                <option key={c.employeeId} value={c.employeeId}>
                  {c.employee?.roleTitle || c.employeeId} ({c.tokenBalance} CNT balance)
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Tokens to Award (CNT)"
            type="number"
            min={10}
            max={50000}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value))}
            required
          />

          <Textarea
            label="Award Justification"
            rows={3}
            placeholder="Exemplary engineering architecture, 100% QA pass rate, or high-velocity delivery..."
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" size="sm" loading={busyAction === "grant"}>
              <Coins className="h-3.5 w-3.5" />
              Grant CNT Tokens
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: CREATE RULE */}
      <Modal
        open={createRuleOpen}
        onClose={() => setCreateRuleOpen(false)}
        title="Ratify New Corporate Rule"
      >
        <form onSubmit={handleCreateRule} className="space-y-4">
          <Input
            label="Rule Code (Uppercase identifier)"
            placeholder="RULE_STRICT_BRANCH_CONVENTIONS"
            value={ruleCode}
            onChange={(e) => setRuleCode(e.target.value.toUpperCase())}
            required
          />

          <Input
            label="Rule Title"
            placeholder="Strict Git Branch Conventions"
            value={ruleTitle}
            onChange={(e) => setRuleTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Severity</label>
              <select
                value={ruleSeverity}
                onChange={(e) =>
                  setRuleSeverity(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                }
                className="h-9 w-full rounded-md border border-surface-border bg-surface px-3 text-xs text-ink focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <Input
                label="Category"
                placeholder="ENGINEERING"
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
              />
            </div>
            <div>
              <Input
                label="Default Fine (CNT)"
                type="number"
                min={0}
                value={ruleDefaultPenalty}
                onChange={(e) => setRuleDefaultPenalty(Number(e.target.value))}
              />
            </div>
          </div>

          <Textarea
            label="Rule Description &amp; Scope"
            rows={3}
            placeholder="Describe the operational expectations, boundaries, and what constitutes a violation..."
            value={ruleDesc}
            onChange={(e) => setRuleDesc(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateRuleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" size="sm" loading={busyAction === "create-rule"}>
              <Plus className="h-3.5 w-3.5" />
              Ratify Rule
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardShell>
  );
}
