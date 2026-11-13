export type UserRole = "CEO" | "ADMIN" | "OPERATOR" | "VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  lastLoginAt?: string | null;
}

export interface DepartmentItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  dailyTokenBudget: number;
  isActive: boolean;
}

export interface AiEmployeeItem {
  id: string;
  departmentId: string;
  department?: DepartmentItem;
  slug: string;
  roleTitle: string;
  systemInstruction: string;
  allowedTools: string[];
  knowledgeScopes: string[];
  preferredProvider: string;
  preferredModel: string;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  dailyTokenBudget: number;
  executionBudgetMs: number;
  isActive: boolean;
}

export interface ProjectItem {
  id: string;
  title: string;
  ceoInstruction: string;
  clarificationQuestions: string[];
  structuredPlan: Record<string, unknown> | null;
  status: string;
  priority: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface TaskCurrentStep {
  stepNumber: number;
  totalSteps: number;
  phase: string;
  action: string;
  detail: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  departmentId: string;
  department?: DepartmentItem;
  assignedEmployeeId: string | null;
  assignedEmployee?: AiEmployeeItem | null;
  title: string;
  description: string;
  taskType: string;
  priority: number;
  status: string;
  retryCount: number;
  maxRetries: number;
  inputPayload?: Record<string, unknown> & { _currentStep?: TaskCurrentStep };
  outputPayload: Record<string, unknown> | null;
  verificationResult: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentActivityEvent {
  stepNumber: number;
  totalSteps: number;
  phase: string;
  action: string;
  detail: string;
  employeeId?: string | null;
  employeeRole?: string;
  employeeSlug?: string;
  departmentSlug?: string;
  departmentName?: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface AgentLiveActivityResponse {
  runningTasks: TaskItem[];
  recentLogs: TaskLogItem[];
  recentTasks: TaskItem[];
}

export interface TaskLogItem {
  id: string;
  taskId: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId?: string;
  category: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  linkUrl?: string | null;
  channelSent?: string[];
  isRead: boolean;
  createdAt: string;
}

export interface ApprovalItem {
  id: string;
  projectId: string | null;
  taskId: string | null;
  actionType: string;
  summary: string;
  riskAssessment: string | null;
  payload?: Record<string, unknown> | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface OverviewResponse {
  totalAiEmployees: number;
  activeAgents: number;
  tasks: {
    completed: number;
    pending: number;
    running: number;
    failed: number;
  };
  projects: {
    running: number;
    requiringApproval: number;
    total: number;
  };
  aiUsage: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    estimatedCostUsd: number;
    dailyTokenLimit: number;
    allowPaidProviders: boolean;
  };
  providers: Array<{ provider: string; isPaid: boolean; configured: boolean }>;
  systemHealth: {
    database: string;
    paidProvidersEnabled: boolean;
    status: string;
  };
  departmentPerformance: Array<{
    id: string;
    slug: string;
    name: string;
    totalTasks: number;
    completed: number;
    failed: number;
    running: number;
  }>;
  recentActivity: Array<{
    id: string;
    actorType: string;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    createdAt: string;
  }>;
}

export interface BusinessItem {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  industry: string | null;
  description: string | null;
  defaultGithubOwner: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccountItem {
  id: string;
  businessId: string | null;
  label: string;
  provider: "GMAIL" | "SMTP";
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasPassword: boolean;
  dailySendLimit: number;
  sentToday: number;
  lastResetDate: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
