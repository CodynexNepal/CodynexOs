import crypto from 'crypto';
import { EngineeringRepository } from '../repository/engineering.repository';
import { TaskRepository } from '../repository/task.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ApiError } from '../utils/api-error.util';
import { ApprovalStatus, QaVerdict, TaskStatus } from '../constant/enum.constant';
import { AuditService } from './audit.service';
import { resolveRuntimeSecret } from './runtime-secrets.service';
import { WorkspaceService } from './workspace.service';

export class EngineeringService {
  private readonly workspaceService: WorkspaceService;

  constructor(
    private readonly engRepo: EngineeringRepository,
    private readonly taskRepo: TaskRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly auditService: AuditService,
    private readonly governanceRepo?: GovernanceRepository,
    workspaceService?: WorkspaceService,
  ) {
    this.workspaceService = workspaceService ?? new WorkspaceService();
  }

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

  async importOwnerRepos(owner: string, actorId: string) {
    const cleanOwner = owner.trim();
    if (!cleanOwner) throw ApiError.badRequest('GitHub owner/organization is required.');

    const headers = await this.buildGithubHeaders();
    // Try authenticated /user/repos first if token belongs to owner, or /orgs/:owner/repos + /users/:owner/repos
    let res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(cleanOwner)}/repos?per_page=100&sort=updated`,
      { headers },
    );
    if (!res.ok) {
      res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(cleanOwner)}/repos?per_page=100&sort=updated`,
        { headers },
      );
    }

    // If authenticated user owns private repos under their own handle, merge /user/repos too
    const remoteRepos: Array<{
      name: string;
      full_name: string;
      default_branch?: string;
      language?: string | null;
      private?: boolean;
      html_url: string;
      owner?: { login?: string };
    }> = [];

    if (res.ok) {
      const publicOrOrg = (await res.json()) as typeof remoteRepos;
      remoteRepos.push(...publicOrOrg);
    }

    if (headers.Authorization) {
      const userRes = await fetch(
        `https://api.github.com/user/repos?per_page=100&affiliation=owner,organization_member&sort=updated`,
        { headers },
      );
      if (userRes.ok) {
        const authed = (await userRes.json()) as typeof remoteRepos;
        for (const r of authed) {
          const rOwner = r.owner?.login?.toLowerCase();
          if (
            rOwner === cleanOwner.toLowerCase() &&
            !remoteRepos.some((x) => x.full_name.toLowerCase() === r.full_name.toLowerCase())
          ) {
            remoteRepos.push(r);
          }
        }
      }
    }

    if (remoteRepos.length === 0 && !res.ok) {
      throw ApiError.badRequest(
        `GitHub API returned HTTP ${res.status} for '${cleanOwner}'. Check GITHUB_TOKEN or owner name.`,
      );
    }

    const imported: Array<{ id: string; owner: string; name: string; defaultBranch: string }> = [];
    for (const r of remoteRepos) {
      const rOwner = r.owner?.login || cleanOwner;
      let existing = await this.engRepo.findRepoByOwnerName(rOwner, r.name);
      if (!existing) {
        existing = await this.engRepo.saveRepo({
          owner: rOwner,
          name: r.name,
          defaultBranch: r.default_branch || 'main',
          isWriteAuthorized: Boolean(headers.Authorization),
          lastSyncedAt: new Date(),
        });
      }
      imported.push({
        id: existing.id,
        owner: existing.owner,
        name: existing.name,
        defaultBranch: existing.defaultBranch,
      });
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'GITHUB_ORG_IMPORTED',
      resourceType: 'github_repository',
      metadata: { owner: cleanOwner, count: imported.length },
    });

    return { owner: cleanOwner, count: imported.length, repositories: imported };
  }

  async createGithubRepo(params: {
    name: string;
    description?: string;
    owner?: string;
    isPrivate?: boolean;
    actorId: string;
  }) {
    const token = await resolveRuntimeSecret('github_token');
    if (!token) {
      throw ApiError.badRequest('GITHUB_TOKEN is required to create a new GitHub repository.');
    }

    const headers = await this.buildGithubHeaders();
    const cleanName = params.name.trim().replace(/\s+/g, '-');
    if (!cleanName) throw ApiError.badRequest('Repository name is required.');

    // Try authenticated user repo first unless an org owner different from user is explicitly provided
    let endpoint = 'https://api.github.com/user/repos';
    if (params.owner && params.owner.trim()) {
      const meRes = await fetch('https://api.github.com/user', { headers });
      const me = meRes.ok ? ((await meRes.json()) as { login?: string }) : {};
      if (me.login && me.login.toLowerCase() !== params.owner.trim().toLowerCase()) {
        endpoint = `https://api.github.com/orgs/${encodeURIComponent(params.owner.trim())}/repos`;
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        description: params.description || 'Created via CodyNex OS',
        private: Boolean(params.isPrivate),
        auto_init: true,
      }),
    });

    const data = (await res.json()) as {
      name?: string;
      default_branch?: string;
      owner?: { login?: string };
      message?: string;
    };

    if (!res.ok) {
      throw ApiError.badRequest(data.message || `GitHub repo creation failed (HTTP ${res.status})`);
    }

    const repoOwner = data.owner?.login || params.owner?.trim() || 'unknown';
    const repoName = data.name || cleanName;
    const defaultBranch = data.default_branch || 'main';

    const saved = await this.engRepo.saveRepo({
      owner: repoOwner,
      name: repoName,
      defaultBranch,
      isWriteAuthorized: true,
      lastSyncedAt: new Date(),
    });

    await this.workspaceService
      .ensureClonedOrPulled({ owner: repoOwner, name: repoName, defaultBranch, token })
      .catch(() => {});

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'GITHUB_REPO_CREATED',
      resourceType: 'github_repository',
      resourceId: saved.id,
      metadata: { owner: repoOwner, name: repoName },
    });

    return saved;
  }

  async cloneOrPullWorkspace(repoId: string, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    const token = await resolveRuntimeSecret('github_token');

    const result = await this.workspaceService.ensureClonedOrPulled({
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      token: token || undefined,
    });

    repo.lastSyncedAt = new Date();
    await this.engRepo.saveRepo(repo);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: `WORKSPACE_${result.action.toUpperCase()}`,
      resourceType: 'github_repository',
      resourceId: repo.id,
    });

    return result;
  }

  async listWorkspaceFiles(repoId: string, subPath = '') {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    const cloned = await this.workspaceService.existsLocally(repo.owner, repo.name);
    const entries = cloned
      ? await this.workspaceService.listTree(repo.owner, repo.name, subPath)
      : [];
    const gitState = cloned
      ? await this.workspaceService.getDiffAndStatus(repo.owner, repo.name)
      : { branch: 'not-cloned', status: '', diff: '' };
    return { cloned, entries, gitState };
  }

  async readWorkspaceFile(repoId: string, filePath: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    const content = await this.workspaceService.readFile(repo.owner, repo.name, filePath);
    return { path: filePath, content };
  }

  async writeWorkspaceFiles(
    repoId: string,
    branchName: string,
    files: Array<{ path: string; content: string }>,
    actorId: string,
  ) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    if (!repo.isWriteAuthorized) throw ApiError.forbidden('Repository is read-only.');

    const token = await resolveRuntimeSecret('github_token');
    await this.workspaceService.ensureClonedOrPulled({
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      token: token || undefined,
    });
    await this.workspaceService.checkoutBranch(
      repo.owner,
      repo.name,
      branchName,
      repo.defaultBranch,
    );
    const written = await this.workspaceService.writeFiles(repo.owner, repo.name, files);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'WORKSPACE_FILES_WRITTEN',
      resourceType: 'github_repository',
      resourceId: repo.id,
      metadata: { branchName, fileCount: written.length },
    });

    return { branchName, written };
  }

  async runWorkspaceChecks(repoId: string, taskId: string | undefined, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const checks = await this.workspaceService.runSafeChecks(repo.owner, repo.name);
    const hasFailure = checks.some((c) => c.status === 'FAIL');
    const verdict = hasFailure ? QaVerdict.FAILED : QaVerdict.PASSED;

    if (taskId) {
      return this.recordQaReport({
        taskId,
        verdict,
        checksExecuted: checks,
        failedComponent: hasFailure ? `${repo.owner}/${repo.name}` : undefined,
        summary: hasFailure
          ? `Automated workspace checks failed for ${repo.owner}/${repo.name}`
          : `Automated workspace checks passed for ${repo.owner}/${repo.name}`,
        actorId,
      });
    }

    return { verdict, checks };
  }

  async commitPushAndOpenPr(params: {
    repoId: string;
    branchName: string;
    title: string;
    body?: string;
    commitMessage?: string;
    taskId?: string;
    actorId: string;
  }) {
    const repo = await this.engRepo.findRepoById(params.repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    if (!repo.isWriteAuthorized) throw ApiError.forbidden('Repository is read-only.');

    const token = await resolveRuntimeSecret('github_token');
    if (!token) {
      throw ApiError.badRequest('GITHUB_TOKEN is required to push branches and open Pull Requests.');
    }

    const pushed = await this.workspaceService.commitAndPushBranch({
      owner: repo.owner,
      name: repo.name,
      branchName: params.branchName,
      defaultBranch: repo.defaultBranch,
      commitMessage: params.commitMessage || `codynex: ${params.title}`,
      token,
    });

    const headers = await this.buildGithubHeaders();
    const prRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          head: pushed.branchName,
          base: repo.defaultBranch,
          body:
            params.body ||
            `Automated Pull Request pushed from CodyNex OS workspace (${pushed.commitSha.slice(0, 7)}).`,
        }),
      },
    );

    const prJson = (await prRes.json()) as {
      number?: number;
      title?: string;
      html_url?: string;
      message?: string;
    };
    if (!prRes.ok || !prJson.number) {
      throw ApiError.badRequest(prJson.message || `GitHub PR creation failed (HTTP ${prRes.status})`);
    }

    const prRecord = await this.engRepo.savePullRequest({
      repositoryId: repo.id,
      taskId: params.taskId ?? null,
      prNumber: prJson.number,
      branchName: pushed.branchName,
      title: (prJson.title || params.title).slice(0, 255),
      status: 'OPEN',
      htmlUrl: prJson.html_url || '',
    });

    if (this.governanceRepo) {
      await this.governanceRepo.saveApproval({
        taskId: params.taskId ?? null,
        actionType: 'MERGE_AND_DEPLOY',
        summary: `Approve PR #${prJson.number} (${repo.owner}/${repo.name}:${pushed.branchName}) -> ${repo.defaultBranch}`,
        riskAssessment:
          'Production branch merge & deployment requires explicit CEO approval after QA verification.',
        payload: { repoId: repo.id, prId: prRecord.id, prNumber: prJson.number, htmlUrl: prRecord.htmlUrl },
        status: ApprovalStatus.PENDING,
      });
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'GITHUB_WORKSPACE_PUSH_PR',
      resourceType: 'github_pull_request',
      resourceId: prRecord.id,
      metadata: { branchName: pushed.branchName, commitSha: pushed.commitSha, prNumber: prJson.number },
    });

    return { commitSha: pushed.commitSha, pullRequest: prRecord };
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
