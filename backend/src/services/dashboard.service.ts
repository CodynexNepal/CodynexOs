import { OrganizationRepository } from '../repository/organization.repository';
import { ProjectRepository } from '../repository/project.repository';
import { TaskRepository } from '../repository/task.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { ApprovalStatus, ProjectStatus, TaskStatus } from '../constant/enum.constant';
import { encryptSecret, maskSecret } from '../utils/encryption.util';
import { AuditService } from './audit.service';

export class DashboardService {
  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly taskRepo: TaskRepository,
    private readonly governanceRepo: GovernanceRepository,
    private readonly modelRouter: ModelRouterService,
    private readonly auditService: AuditService,
  ) {}

  async getOverview() {
    const [employees, departments, taskCounts, projectCounts, pendingApprovals, usageSummary, budget, recentLogs] =
      await Promise.all([
        this.orgRepo.findAllEmployees(),
        this.orgRepo.findAllDepartments(),
        this.taskRepo.countByStatus(),
        this.projectRepo.countByStatus(),
        this.governanceRepo.findApprovals(ApprovalStatus.PENDING),
        this.governanceRepo.getUsageSummary(),
        this.governanceRepo.findGlobalBudget(),
        this.governanceRepo.findAuditLogs(15),
      ]);

    const tasksAll = await this.taskRepo.findAll();
    const deptPerf = departments.map((dept) => {
      const deptTasks = tasksAll.filter((t) => t.departmentId === dept.id);
      const completed = deptTasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
      const failed = deptTasks.filter((t) => t.status === TaskStatus.FAILED).length;
      const running = deptTasks.filter((t) => t.status === TaskStatus.RUNNING).length;
      return {
        id: dept.id,
        slug: dept.slug,
        name: dept.name,
        totalTasks: deptTasks.length,
        completed,
        failed,
        running,
      };
    });

    const activeAgents = new Set(
      tasksAll
        .filter((t) => t.status === TaskStatus.RUNNING && t.assignedEmployeeId)
        .map((t) => t.assignedEmployeeId),
    ).size;

    return {
      totalAiEmployees: employees.length,
      activeAgents,
      tasks: {
        completed: taskCounts[TaskStatus.COMPLETED] ?? 0,
        pending:
          (taskCounts[TaskStatus.DRAFT] ?? 0) +
          (taskCounts[TaskStatus.PENDING_APPROVAL] ?? 0) +
          (taskCounts[TaskStatus.QUEUED] ?? 0) +
          (taskCounts[TaskStatus.BLOCKED] ?? 0) +
          (taskCounts[TaskStatus.UNDER_REVIEW] ?? 0),
        running: taskCounts[TaskStatus.RUNNING] ?? 0,
        failed: taskCounts[TaskStatus.FAILED] ?? 0,
      },
      projects: {
        running: projectCounts[ProjectStatus.ACTIVE] ?? 0,
        requiringApproval:
          (projectCounts[ProjectStatus.PENDING_APPROVAL] ?? 0) + pendingApprovals.length,
        total: Object.values(projectCounts).reduce((a, b) => a + b, 0),
      },
      aiUsage: {
        totalTokens: usageSummary.inputTokens + usageSummary.outputTokens,
        inputTokens: usageSummary.inputTokens,
        outputTokens: usageSummary.outputTokens,
        requestCount: usageSummary.requestCount,
        estimatedCostUsd: usageSummary.estimatedCostUsd,
        dailyTokenLimit: budget?.dailyTokenLimit ?? 500000,
        allowPaidProviders: budget?.allowPaidProviders ?? false,
      },
      providers: this.modelRouter.getProviderStatus(),
      systemHealth: {
        database: 'CONNECTED',
        paidProvidersEnabled: budget?.allowPaidProviders ?? false,
        status: 'HEALTHY',
      },
      departmentPerformance: deptPerf,
      recentActivity: recentLogs,
    };
  }

  async getSettings() {
    const rows = await this.governanceRepo.findAllSettings();
    return rows.map((row) => ({
      key: row.key,
      isSecret: row.isSecret,
      updatedAt: row.updatedAt,
      value: row.isSecret
        ? { masked: maskSecret(String(row.value?.encrypted ?? '')) }
        : row.value,
    }));
  }

  async upsertSetting(
    key: string,
    value: Record<string, unknown>,
    isSecret: boolean,
    actorId: string,
  ) {
    const storedValue = isSecret
      ? { encrypted: encryptSecret(String(value.secret ?? JSON.stringify(value))) }
      : value;

    const saved = await this.governanceRepo.saveSetting({
      key,
      value: storedValue,
      isSecret,
      updatedBy: actorId,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'SETTING_UPDATED',
      resourceType: 'system_setting',
      resourceId: key,
      metadata: { isSecret },
    });

    return {
      key: saved.key,
      isSecret: saved.isSecret,
      updatedAt: saved.updatedAt,
      value: isSecret ? { masked: '********' } : saved.value,
    };
  }
}
