import api from "./axios";
import type {
  AgentLiveActivityResponse,
  AiEmployeeItem,
  ApprovalItem,
  AuthUser,
  DepartmentItem,
  OverviewResponse,
  ProjectItem,
  TaskItem,
  TaskLogItem,
} from "@/types/os";

export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const codynexApi = {
  auth: {
    login: (body: { email: string; password: string }) =>
      api.post<{ success: boolean; data: { user: AuthUser; accessToken: string } }>(
        "/auth/login",
        body
      ),
    me: () => api.get<{ success: boolean; data: AuthUser }>("/auth/me"),
    logout: (logoutAll = false) => api.post("/auth/logout", { logoutAll }),
  },
  overview: () => api.get<{ success: boolean; data: OverviewResponse }>("/overview"),
  departments: () => api.get<{ success: boolean; data: DepartmentItem[] }>("/departments"),
  employees: () => api.get<{ success: boolean; data: AiEmployeeItem[] }>("/employees"),
  updateEmployee: (
    id: string,
    body: {
      isActive?: boolean;
      dailyTokenBudget?: number;
      preferredProvider?: string;
      preferredModel?: string;
    }
  ) => api.patch<{ success: boolean; data: AiEmployeeItem }>(`/employees/${id}`, body),
  command: {
    issue: (body: {
      instruction: string;
      title?: string;
      priority?: string;
      clarificationAnswer?: string;
    }) => api.post("/command", body),
  },
  projects: () => api.get<{ success: boolean; data: ProjectItem[] }>("/projects"),
  agents: {
    liveActivity: () =>
      api.get<{ success: boolean; data: AgentLiveActivityResponse }>("/agents/live-activity"),
  },
  tasks: {
    list: (params?: { projectId?: string; status?: string }) =>
      api.get<{ success: boolean; data: TaskItem[] }>("/tasks", { params }),
    create: (body: {
      projectId: string;
      departmentId: string;
      assignedEmployeeId?: string;
      title: string;
      description: string;
      taskType: string;
      priority?: number;
    }) => api.post<{ success: boolean; data: TaskItem }>("/tasks", body),
    logs: (id: string) => api.get<{ success: boolean; data: TaskLogItem[] }>(`/tasks/${id}/logs`),
    retry: (id: string) => api.post(`/tasks/${id}/retry`),
    cancel: (id: string) => api.post(`/tasks/${id}/cancel`),
  },
  approvals: {
    list: (status?: string) =>
      api.get<{ success: boolean; data: ApprovalItem[] }>("/approvals", { params: { status } }),
    review: (id: string, body: { decision: "APPROVED" | "REJECTED"; note?: string }) =>
      api.post(`/approvals/${id}/review`, body),
  },
  memory: {
    list: (params?: { q?: string; category?: string }) => api.get("/memory", { params }),
    create: (body: { category: string; title: string; content: string; tags?: string[] }) =>
      api.post("/memory", body),
  },
  knowledge: {
    list: () => api.get("/knowledge"),
    create: (body: { title: string; contentMd: string; departmentId?: string }) =>
      api.post("/knowledge", body),
  },
  github: {
    repos: () => api.get("/github/repos"),
    probe: (params?: { owner?: string; repo?: string }) =>
      api.get("/github/probe", { params }),
    diagnoseRepo: (id: string) => api.get(`/github/repos/${id}/diagnostic`),
    connectRepo: (body: {
      owner: string;
      name: string;
      defaultBranch?: string;
      isWriteAuthorized?: boolean;
    }) => api.post("/github/repos", body),
    importOrg: (owner: string) => api.post(`/github/orgs/${encodeURIComponent(owner)}/import`),
    createRepo: (body: {
      name: string;
      description?: string;
      owner?: string;
      isPrivate?: boolean;
    }) => api.post("/github/repos/create", body),
    syncRepo: (id: string) => api.post(`/github/repos/${id}/sync`),
    analyzeRepo: (id: string) => api.get(`/github/repos/${id}/analyze`),
    createBranchPr: (
      id: string,
      body: { branchName: string; title: string; body?: string }
    ) => api.post(`/github/repos/${id}/branch-pr`, body),
    workspaceSync: (id: string) => api.post(`/github/repos/${id}/workspace/sync`),
    workspaceFiles: (id: string, path = "") =>
      api.get(`/github/repos/${id}/workspace/files`, { params: { path } }),
    workspaceReadFile: (id: string, path: string) =>
      api.get(`/github/repos/${id}/workspace/file`, { params: { path } }),
    workspaceWriteFiles: (
      id: string,
      body: { branchName: string; files: Array<{ path: string; content: string }> }
    ) => api.post(`/github/repos/${id}/workspace/files`, body),
    workspaceCommit: (
      id: string,
      body: { branchName: string; commitMessage?: string }
    ) => api.post(`/github/repos/${id}/workspace/commit`, body),
    workspaceTerminal: (
      id: string,
      body: { command: string }
    ) =>
      api.post<{ stdout: string; stderr: string; exitCode: number; branch: string }>(
        `/github/repos/${id}/workspace/terminal`,
        body
      ),
    workspaceInstallDeps: (id: string) => api.post(`/github/repos/${id}/workspace/install-deps`, {}),
    workspaceRunChecks: (id: string) => api.post(`/github/repos/${id}/workspace/checks`, {}),
    workspacePushPr: (
      id: string,
      body: { branchName: string; title: string; commitMessage?: string; body?: string }
    ) => api.post(`/github/repos/${id}/workspace/push-pr`, body),
    workspacePreview: (id: string) => api.get(`/github/repos/${id}/workspace/preview`),
    pullRequests: () => api.get("/github/pull-requests"),
    syncAllPullRequests: () => api.post("/github/pull-requests/sync"),
  },
  frontends: {
    list: () => api.get("/frontends"),
  },
  qa: {
    reports: () => api.get("/qa/reports"),
    createReport: (body: {
      taskId: string;
      verdict: "PASSED" | "FAILED" | "BLOCKED";
      failedComponent?: string;
      summary: string;
      checksExecuted: Array<{ name: string; status: string; output?: string }>;
    }) => api.post("/qa/reports", body),
  },
  marketing: {
    campaigns: (businessId?: string) =>
      api.get("/marketing/campaigns", { params: businessId ? { businessId } : undefined }),
    createCampaign: (body: {
      name: string;
      channel: string;
      targetAudience?: string;
      businessId?: string;
      emailAccountId?: string;
    }) => api.post("/marketing/campaigns", body),
    occasions: () => api.get("/marketing/occasions"),
    generateContent: (body: {
      occasionKey?: string;
      businessId?: string;
      businessName?: string;
      customPrompt?: string;
      channels: string[];
      brandVoice?: string;
      discountCode?: string;
      targetAudience?: string;
    }) => api.post("/marketing/generate-content", body),
    publishSocial: (body: {
      campaignId?: string;
      occasion?: string;
      channels: string[];
      content: Record<string, unknown>;
      businessId?: string;
    }) => api.post("/marketing/publish", body),
    ceoInstantPost: (body: {
      commandText: string;
      occasionKey?: string;
      channels?: string[];
      businessId?: string;
    }) => api.post("/marketing/ceo-instant-post", body),
    socialAccounts: (businessId?: string) =>
      api.get("/marketing/social-accounts", { params: businessId ? { businessId } : undefined }),
    upsertSocialAccount: (body: Record<string, unknown>) => api.post("/marketing/social-accounts", body),
    testSocialAccount: (id: string) => api.post(`/marketing/social-accounts/${id}/test`),
  },
  crm: {
    leads: (stage?: string, businessId?: string) =>
      api.get("/crm/leads", {
        params: { ...(stage ? { stage } : {}), ...(businessId ? { businessId } : {}) },
      }),
    upsertLead: (body: {
      businessName: string;
      contactName?: string;
      email?: string;
      phone?: string;
      city?: string;
      website?: string;
      businessId?: string;
    }) => api.post("/crm/leads", body),
    optOut: (id: string) => api.post(`/crm/leads/${id}/opt-out`),
    draftOutreach: (
      id: string,
      body: {
        subject: string;
        body: string;
        channel?: string;
        businessId?: string;
        emailAccountId?: string;
      }
    ) => api.post(`/crm/leads/${id}/outreach`, body),
    approveInteraction: (id: string) => api.post(`/crm/interactions/${id}/approve`),
    sendInteraction: (id: string, body?: { emailAccountId?: string }) =>
      api.post(`/crm/interactions/${id}/send`, body ?? {}),
    updateStage: (id: string, body: { stage: string; nextFollowUpAt?: string }) =>
      api.patch(`/crm/leads/${id}/stage`, body),
    interactions: () => api.get("/crm/interactions"),
    classifyReply: (
      interactionId: string,
      classification: "INTERESTED" | "NOT_INTERESTED" | "OPT_OUT" | "QUESTION" | "DEMO_REQUEST"
    ) => api.post(`/crm/interactions/${interactionId}/classify`, { classification }),
  },
  businesses: {
    list: () => api.get("/businesses"),
    create: (body: {
      name: string;
      slug?: string;
      domain?: string;
      industry?: string;
      description?: string;
      defaultGithubOwner?: string;
    }) => api.post("/businesses", body),
    update: (
      id: string,
      body: {
        name?: string;
        domain?: string;
        industry?: string;
        description?: string;
        defaultGithubOwner?: string;
        isActive?: boolean;
      }
    ) => api.patch(`/businesses/${id}`, body),
  },
  emailAccounts: {
    list: (businessId?: string) =>
      api.get("/email-accounts", { params: businessId ? { businessId } : undefined }),
    create: (body: {
      businessId?: string;
      label: string;
      provider?: "GMAIL" | "SMTP";
      fromName: string;
      fromEmail: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser?: string;
      smtpPass: string;
      dailySendLimit?: number;
      isDefault?: boolean;
    }) => api.post("/email-accounts", body),
    update: (
      id: string,
      body: {
        businessId?: string | null;
        label?: string;
        fromName?: string;
        fromEmail?: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpSecure?: boolean;
        smtpUser?: string;
        smtpPass?: string;
        dailySendLimit?: number;
        isDefault?: boolean;
        isActive?: boolean;
      }
    ) => api.patch(`/email-accounts/${id}`, body),
    delete: (id: string) => api.delete(`/email-accounts/${id}`),
    verify: (id: string, testRecipientEmail?: string) =>
      api.post(`/email-accounts/${id}/verify`, testRecipientEmail ? { testRecipientEmail } : {}),
  },
  aiUsage: {
    summary: () => api.get("/ai-usage"),
    probe: () => api.get("/ai-usage/probe"),
    updateBudget: (body: {
      dailyTokenLimit: number;
      maxConcurrentRequests: number;
      allowPaidProviders: boolean;
    }) => api.put("/ai-usage/budget", body),
  },
  notifications: {
    list: () => api.get("/notifications"),
    markRead: (id: string) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.post("/notifications/read-all"),
    sendTest: (body?: Record<string, unknown>) => api.post("/notifications/test", body || {}),
  },
  auditLogs: () => api.get("/audit-logs"),
  settings: {
    list: () => api.get("/settings"),
    upsert: (body: { key: string; value: Record<string, unknown>; isSecret?: boolean }) =>
      api.put("/settings", body),
  },
  hr: {
    overview: () => api.get("/hr/overview"),
    contracts: () => api.get("/hr/contracts"),
    getContract: (employeeId: string) => api.get(`/hr/contracts/${employeeId}`),
    rules: () => api.get("/hr/rules"),
    createRule: (body: {
      ruleCode: string;
      title: string;
      description: string;
      severity: string;
      defaultPenaltyTokens?: number;
      category?: string;
    }) => api.post("/hr/rules", body),
    updateRule: (
      id: string,
      body: {
        title?: string;
        description?: string;
        severity?: string;
        defaultPenaltyTokens?: number;
        isActive?: boolean;
      }
    ) => api.patch(`/hr/rules/${id}`, body),
    violations: () => api.get("/hr/violations"),
    discipline: (body: {
      employeeId: string;
      ruleCode: string;
      penaltyType: string;
      tokenPenaltyAmount?: number;
      explanation: string;
      taskId?: string;
    }) => api.post("/hr/violations/discipline", body),
    pardon: (id: string, body?: { reason?: string }) =>
      api.post(`/hr/violations/${id}/pardon`, body || {}),
    transactions: () => api.get("/hr/tokens/transactions"),
    grantTokens: (body: {
      employeeId: string;
      amount: number;
      reason: string;
      metadata?: Record<string, unknown>;
    }) => api.post("/hr/tokens/grant", body),
  },
};
