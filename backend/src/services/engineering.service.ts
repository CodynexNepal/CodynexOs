import crypto from 'crypto';
import { EngineeringRepository } from '../repository/engineering.repository';
import { TaskRepository } from '../repository/task.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { dotEnvConfig } from '../configs/envConfig';
import { ApiError } from '../utils/api-error.util';
import { QaVerdict, TaskStatus } from '../constant/enum.constant';
import { AuditService } from './audit.service';

export class EngineeringService {
  constructor(
    private readonly engRepo: EngineeringRepository,
    private readonly taskRepo: TaskRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly auditService: AuditService,
  ) {}

  listRepos() {
    return this.engRepo.findAllRepos();
  }

  listPullRequests() {
    return this.engRepo.findAllPullRequests();
  }

  listQaReports() {
    return this.engRepo.findAllQaReports();
  }

  async connectRepo(
    owner: string,
    name: string,
    defaultBranch = 'main',
    isWriteAuthorized = false,
    actorId: string,
  ) {
    const repo = await this.engRepo.saveRepo({
      owner: owner.trim(),
      name: name.trim(),
      defaultBranch: defaultBranch.trim() || 'main',
      isWriteAuthorized,
      lastSyncedAt: new Date(),
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'GITHUB_REPO_CONNECTED',
      resourceType: 'github_repository',
      resourceId: repo.id,
      metadata: { owner: repo.owner, name: repo.name },
    });

    return repo;
  }

  async syncRepoFromGithub(repoId: string, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodyNex-OS',
    };
    if (dotEnvConfig.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${dotEnvConfig.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls?state=open&per_page=15`,
      { headers },
    );

    if (!res.ok) {
      throw ApiError.badRequest(
        `GitHub API returned HTTP ${res.status}. Configure GITHUB_TOKEN for private repos or higher rate limits.`,
      );
    }

    const pulls = (await res.json()) as Array<{
      number: number;
      title: string;
      html_url: string;
      head?: { ref?: string };
    }>;

    const existing = await this.engRepo.findAllPullRequests();
    for (const pr of pulls) {
      const match = existing.find((e) => e.repositoryId === repo.id && e.prNumber === pr.number);
      if (!match) {
        await this.engRepo.savePullRequest({
          repositoryId: repo.id,
          prNumber: pr.number,
          branchName: pr.head?.ref ?? 'unknown',
          title: pr.title.slice(0, 255),
          status: 'OPEN',
          htmlUrl: pr.html_url,
        });
      }
    }

    repo.lastSyncedAt = new Date();
    await this.engRepo.saveRepo(repo);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'GITHUB_REPO_SYNCED',
      resourceType: 'github_repository',
      resourceId: repo.id,
      metadata: { prCount: pulls.length },
    });

    return { syncedPullRequests: pulls.length };
  }

  async recordQaReport(params: {
    taskId: string;
    verdict: QaVerdict;
    checksExecuted: Array<{ name: string; status: string; output?: string }>;
    failedComponent?: string;
    summary: string;
    actorId: string;
  }) {
    const task = await this.taskRepo.findById(params.taskId);
    if (!task) throw ApiError.notFound('Task not found.');

    const qaEmp = await this.orgRepo.findEmployeeBySlug('qa_engineer');
    let correctionTaskId: string | null = null;

    if (params.verdict === QaVerdict.FAILED) {
      const targetDept = task.departmentId;
      const backendLead = await this.orgRepo.findEmployeeBySlug('backend_lead');
      const correction = await this.taskRepo.save({
        projectId: task.projectId,
        parentTaskId: task.id,
        departmentId: targetDept,
        assignedEmployeeId: task.assignedEmployeeId ?? backendLead?.id ?? null,
        title: `Correction: ${task.title}`.slice(0, 200),
        description: `QA failed on component '${params.failedComponent || 'unspecified'}': ${params.summary}`,
        taskType: 'code',
        priority: 95,
        status: TaskStatus.QUEUED,
        idempotencyKey: crypto
          .createHash('sha256')
          .update(`correction:${task.id}:${Date.now()}`)
          .digest('hex')
          .slice(0, 64),
        inputPayload: { failedTaskId: task.id, checks: params.checksExecuted },
      });
      correctionTaskId = correction.id;
      await this.taskRepo.updateById(task.id, { status: TaskStatus.FAILED });
    } else if (params.verdict === QaVerdict.PASSED) {
      await this.taskRepo.updateById(task.id, {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        verificationResult: { verdict: QaVerdict.PASSED, checks: params.checksExecuted },
      });
    }

    const report = await this.engRepo.saveQaReport({
      taskId: task.id,
      reviewerEmployeeId: qaEmp?.id ?? null,
      verdict: params.verdict,
      checksExecuted: params.checksExecuted,
      failedComponent: params.failedComponent ?? null,
      correctionTaskId,
      summary: params.summary,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'QA_REPORT_RECORDED',
      resourceType: 'qa_report',
      resourceId: report.id,
      metadata: { verdict: params.verdict, correctionTaskId },
    });

    return report;
  }
}
