import api from "./axios";
import type {
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
  command: {
    issue: (body: {
      instruction: string;
      title?: string;
      priority?: string;
      clarificationAnswer?: string;
    }) => api.post("/command", body),
  },
  projects: () => api.get<{ success: boolean; data: ProjectItem[] }>("/projects"),
  tasks: {
    list: (params?: { projectId?: string; status?: string }) =>
      api.get<{ success: boolean; data: TaskItem[] }>("/tasks", { params }),
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
    create: (body: { title: string; contentMd: string }) => api.post("/knowledge", body),
  },
  github: {
    repos: () => api.get("/github/repos"),
    connectRepo: (body: {
      owner: string;
      name: string;
      defaultBranch?: string;
      isWriteAuthorized?: boolean;
    }) => api.post("/github/repos", body),
    syncRepo: (id: string) => api.post(`/github/repos/${id}/sync`),
    pullRequests: () => api.get("/github/pull-requests"),
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
    campaigns: () => api.get("/marketing/campaigns"),
    createCampaign: (body: { name: string; channel: string; targetAudience?: string }) =>
      api.post("/marketing/campaigns", body),
  },
  crm: {
    leads: (stage?: string) => api.get("/crm/leads", { params: { stage } }),
    upsertLead: (body: {
      businessName: string;
      contactName?: string;
      email?: string;
      phone?: string;
      city?: string;
      website?: string;
    }) => api.post("/crm/leads", body),
    optOut: (id: string) => api.post(`/crm/leads/${id}/opt-out`),
    interactions: () => api.get("/crm/interactions"),
  },
  aiUsage: {
    summary: () => api.get("/ai-usage"),
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
  },
  auditLogs: () => api.get("/audit-logs"),
  settings: {
    list: () => api.get("/settings"),
    upsert: (body: { key: string; value: Record<string, unknown>; isSecret?: boolean }) =>
      api.put("/settings", body),
  },
};
