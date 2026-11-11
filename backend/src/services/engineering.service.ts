import crypto from 'crypto';
import { EngineeringRepository } from '../repository/engineering.repository';
import { TaskRepository } from '../repository/task.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { ApiError } from '../utils/api-error.util';
import { QaVerdict, TaskStatus } from '../constant/enum.constant';
import { AuditService } from './audit.service';
import { resolveRuntimeSecret } from './runtime-secrets.service';

export class EngineeringService {
  constructor(
    private readonly engRepo: EngineeringRepository,
    private readonly taskRepo: TaskRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly auditService: AuditService,
  ) {}

  private async buildGithubHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodyNex-OS',
    };
    const token = await resolveRuntimeSecret('github_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

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

    const headers = await this.buildGithubHeaders();

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

  async analyzeRepo(repoId: string, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const headers = await this.buildGithubHeaders();
    const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;

    const [metaRes, treeRes] = await Promise.all([
      fetch(base, { headers }),
      fetch(`${base}/contents`, { headers }),
    ]);

    if (!metaRes.ok) {
      throw ApiError.badRequest(`Failed to inspect repository on GitHub (HTTP ${metaRes.status}).`);
    }

    const meta = (await metaRes.json()) as {
      full_name?: string;
      language?: string;
      default_branch?: string;
      open_issues_count?: number;
      private?: boolean;
    };

    const contents = treeRes.ok
      ? ((await treeRes.json()) as Array<{ name: string; type: string; path: string }>)
      : [];

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'GITHUB_REPO_ANALYZED',
      resourceType: 'github_repository',
      resourceId: repo.id,
    });

    return {
      fullName: meta.full_name ?? `${repo.owner}/${repo.name}`,
      language: meta.language ?? 'Unknown',
      defaultBranch: meta.default_branch ?? repo.defaultBranch,
      openIssuesCount: meta.open_issues_count ?? 0,
      isPrivate: Boolean(meta.private),
      rootEntries: contents.slice(0, 40).map((c) => ({
        name: c.name,
        type: c.type,
        path: c.path,
      })),
    };
  }

  async createTaskBranchAndPr(params: {
    repoId: string;
    branchName: string;
    title: string;
    body?: string;
    taskId?: string;
    filePath?: string;
    fileContent?: string;
    actorId: string;
  }) {
    const repo = await this.engRepo.findRepoById(params.repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    if (!repo.isWriteAuthorized) {
      throw ApiError.forbidden('Repository is configured as read-only.');
    }

    const cleanBranch = params.branchName.trim();
    if (
      !cleanBranch ||
      cleanBranch === repo.defaultBranch ||
      cleanBranch === 'main' ||
      cleanBranch === 'master'
    ) {
      throw ApiError.forbidden(
        'Direct commits or pushes to the production/default branch are strictly prohibited.',
      );
    }

    const headers = await this.buildGithubHeaders();
    if (!headers.Authorization) {
      throw ApiError.badRequest('GITHUB_TOKEN is required to create branches and Pull Requests.');
    }

    const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
    const refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(repo.defaultBranch)}`, {
      headers,
    });
    if (!refRes.ok) {
      throw ApiError.badRequest(`Unable to read base branch '${repo.defaultBranch}' from GitHub.`);
    }
    const refData = (await refRes.json()) as { object?: { sha?: string } };
    const baseSha = refData.object?.sha;
    if (!baseSha) {
      throw ApiError.badRequest('Base branch SHA unavailable.');
    }

    const createRefRes = await fetch(`${base}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${cleanBranch}`,
        sha: baseSha,
      }),
    });
    if (!createRefRes.ok && createRefRes.status !== 422) {
      throw ApiError.badRequest(`Failed to create branch '${cleanBranch}' on GitHub.`);
    }

    if (params.filePath && params.fileContent !== undefined) {
      const encodedPath = params.filePath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      const putRes = await fetch(`${base}/contents/${encodedPath}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `codynex: ${params.title}`,
          content: Buffer.from(params.fileContent, 'utf8').toString('base64'),
          branch: cleanBranch,
        }),
      });
      if (!putRes.ok) {
        throw ApiError.badRequest(`Failed to commit '${params.filePath}' on branch '${cleanBranch}'.`);
      }
    }

    const prRes = await fetch(`${base}/pulls`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: params.title,
        head: cleanBranch,
        base: repo.defaultBranch,
        body: params.body || 'Automated Pull Request created by CodyNex OS Engineering.',
      }),
    });

    if (!prRes.ok) {
      throw ApiError.badRequest(`Failed to open Pull Request on GitHub (HTTP ${prRes.status}).`);
    }

    const prJson = (await prRes.json()) as {
      number: number;
      title: string;
      html_url: string;
    };

    const saved = await this.engRepo.savePullRequest({
      repositoryId: repo.id,
      taskId: params.taskId ?? null,
      prNumber: prJson.number,
      branchName: cleanBranch,
      title: prJson.title.slice(0, 255),
      status: 'OPEN',
      htmlUrl: prJson.html_url,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'GITHUB_PR_CREATED',
      resourceType: 'github_pull_request',
      resourceId: saved.id,
      metadata: { branchName: cleanBranch, prNumber: prJson.number },
    });

    return saved;
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
