import crypto from 'crypto';
import { EngineeringRepository } from '../repository/engineering.repository';
import { TaskRepository } from '../repository/task.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ApiError } from '../utils/api-error.util';
import { ApprovalStatus, QaVerdict, TaskStatus } from '../constant/enum.constant';
import {
  GithubDiagnosticCode,
  GithubConnectionDiagnostic,
  RepositoryDiagnosticResult,
  GithubTokenType,
} from '../constant/github-diagnostic.constant';
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

  async diagnoseRepository(
    owner: string,
    name: string,
    explicitToken?: string,
  ): Promise<RepositoryDiagnosticResult> {
    const token = explicitToken || (await resolveRuntimeSecret('github_token'));
    const cleanOwner = owner.trim();
    const cleanName = name.trim();

    if (!token) {
      return {
        owner: cleanOwner,
        name: cleanName,
        exists: false,
        isPrivate: false,
        defaultBranch: 'main',
        hasAccess: false,
        hasPushPermission: false,
        effectiveWriteAuthorized: false,
        diagnosticCode: GithubDiagnosticCode.TOKEN_NOT_CONFIGURED,
        failureReason: 'GitHub token is not configured in environment or settings.',
        correctiveAction: 'Configure GITHUB_TOKEN in backend/.env or via Settings page.',
      };
    }

    const tokenType: GithubTokenType = token.startsWith('github_pat_')
      ? 'fine-grained'
      : token.startsWith('ghp_')
        ? 'classic'
        : 'none';

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodyNex-OS',
      Authorization: `Bearer ${token}`,
    };

    const repoRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanName)}`,
      { headers },
    );

    if (repoRes.status === 404) {
      return {
        owner: cleanOwner,
        name: cleanName,
        exists: false,
        isPrivate: false,
        defaultBranch: 'main',
        hasAccess: false,
        hasPushPermission: false,
        effectiveWriteAuthorized: false,
        diagnosticCode: GithubDiagnosticCode.REPOSITORY_NOT_FOUND,
        failureReason: `Repository '${cleanOwner}/${cleanName}' not found or token has no read access to it.`,
        correctiveAction:
          'Verify repository name and ensure the Personal Access Token includes this repository under "Repository access".',
      };
    }

    if (repoRes.status === 401) {
      return {
        owner: cleanOwner,
        name: cleanName,
        exists: false,
        isPrivate: false,
        defaultBranch: 'main',
        hasAccess: false,
        hasPushPermission: false,
        effectiveWriteAuthorized: false,
        diagnosticCode: GithubDiagnosticCode.TOKEN_INVALID,
        failureReason: 'GitHub token rejected (HTTP 401 Unauthorized). Token may be invalid or expired.',
        correctiveAction: 'Generate a fresh GitHub Personal Access Token and update GITHUB_TOKEN.',
      };
    }

    if (repoRes.status === 403) {
      const errBody = (await repoRes.json().catch(() => ({}))) as { message?: string };
      const msg = errBody.message || '';
      const isOrgApproval = /organization|saml|sso|approval/i.test(msg);
      return {
        owner: cleanOwner,
        name: cleanName,
        exists: false,
        isPrivate: false,
        defaultBranch: 'main',
        hasAccess: false,
        hasPushPermission: false,
        effectiveWriteAuthorized: false,
        diagnosticCode: isOrgApproval
          ? GithubDiagnosticCode.ORGANIZATION_APPROVAL_REQUIRED
          : GithubDiagnosticCode.REPOSITORY_ACCESS_DENIED,
        failureReason: msg || 'Access to repository is forbidden (HTTP 403).',
        correctiveAction: isOrgApproval
          ? 'Authorize the PAT for SAML SSO or obtain organization owner approval.'
          : 'Grant repository permissions to your token in GitHub Developer settings.',
      };
    }

    if (!repoRes.ok) {
      return {
        owner: cleanOwner,
        name: cleanName,
        exists: false,
        isPrivate: false,
        defaultBranch: 'main',
        hasAccess: false,
        hasPushPermission: false,
        effectiveWriteAuthorized: false,
        diagnosticCode: GithubDiagnosticCode.REPOSITORY_ACCESS_DENIED,
        failureReason: `GitHub returned HTTP ${repoRes.status} when accessing repository.`,
        correctiveAction: 'Verify GitHub repository permissions.',
      };
    }

    const repoData = (await repoRes.json()) as {
      private?: boolean;
      default_branch?: string;
      permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    };

    const isPrivate = Boolean(repoData.private);
    const defaultBranch = repoData.default_branch || 'main';
    const accountPushAllowed = Boolean(repoData.permissions?.push);

    let effectiveWrite: boolean;
    let code = GithubDiagnosticCode.READY_FOR_PUSH;
    let failureReason: string | null = null;
    let correctiveAction: string | null = null;

    if (tokenType === 'classic') {
      const scopes = repoRes.headers.get('x-oauth-scopes') || '';
      const hasRepoScope = /\brepo\b/.test(scopes) || (!isPrivate && /\bpublic_repo\b/.test(scopes));
      if (!hasRepoScope || !accountPushAllowed) {
        effectiveWrite = false;
        code = GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING;
        failureReason = `Classic PAT is missing 'repo' write scope (current scopes: '${scopes || 'none'}') or account lacks push permission.`;
        correctiveAction =
          "Generate a Classic PAT with the 'repo' (Full control of private repositories) scope enabled.";
      } else {
        effectiveWrite = true;
      }
    } else {
      // Fine-grained PAT: Probe write capability via non-destructive ref probe
      const probeRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanName)}/git/refs`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: 'refs/heads/codynex-probe-dryrun',
            sha: '0000000000000000000000000000000000000000',
          }),
        },
      );

      if (probeRes.status === 403) {
        const probeBody = (await probeRes.json().catch(() => ({}))) as { message?: string };
        const probeMsg = probeBody.message || '';
        effectiveWrite = false;
        if (/organization|saml|sso|approval/i.test(probeMsg)) {
          code = GithubDiagnosticCode.ORGANIZATION_APPROVAL_REQUIRED;
          failureReason = probeMsg;
          correctiveAction = 'Authorize the PAT for SSO or request Organization Owner approval.';
        } else {
          code = GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING;
          failureReason =
            'Fine-grained PAT lacks "Contents: Read & write" permission for this repository.';
          correctiveAction =
            'In GitHub Developer Settings -> Personal access tokens (Fine-grained) -> Select Token -> Repository permissions -> Set "Contents" to "Read and write" and "Pull requests" to "Read and write".';
        }
      } else if (probeRes.status === 422) {
        // HTTP 422 Unprocessable Entity means the token has contents:write permission and GitHub reached SHA validation
        effectiveWrite = true;
        code = GithubDiagnosticCode.READY_FOR_PUSH;
      } else if (probeRes.status === 201) {
        effectiveWrite = true;
        code = GithubDiagnosticCode.READY_FOR_PUSH;
        await fetch(
          `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanName)}/git/refs/heads/codynex-probe-dryrun`,
          { method: 'DELETE', headers },
        ).catch(() => {});
      } else {
        effectiveWrite = false;
        code = GithubDiagnosticCode.REPOSITORY_ACCESS_DENIED;
        failureReason = `Unexpected response HTTP ${probeRes.status} during write probe.`;
        correctiveAction = 'Verify Fine-Grained PAT permissions in GitHub Settings.';
      }
    }

    return {
      owner: cleanOwner,
      name: cleanName,
      exists: true,
      isPrivate,
      defaultBranch,
      hasAccess: true,
      hasPushPermission: effectiveWrite,
      effectiveWriteAuthorized: effectiveWrite,
      diagnosticCode: code,
      failureReason,
      correctiveAction,
    };
  }

  async diagnoseRepositoryById(repoId: string): Promise<RepositoryDiagnosticResult> {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');
    const result = await this.diagnoseRepository(repo.owner, repo.name);
    if (repo.isWriteAuthorized !== result.effectiveWriteAuthorized) {
      repo.isWriteAuthorized = result.effectiveWriteAuthorized;
      await this.engRepo.saveRepo(repo);
    }
    return result;
  }


  async probeGithubToken(target?: {
    owner?: string;
    repo?: string;
  }): Promise<GithubConnectionDiagnostic> {
    const token = await resolveRuntimeSecret('github_token');
    if (!token) {
      return {
        configured: false,
        authenticated: false,
        authenticatedAccount: null,
        tokenType: 'none',
        repositoryAccessStatus: 'NOT_TESTED',
        repositoryWritePermission: false,
        pushReadiness: false,
        diagnosticCode: GithubDiagnosticCode.TOKEN_NOT_CONFIGURED,
        failureReason: 'GITHUB_TOKEN is not configured in .env or Settings.',
        recommendedAction: 'Add GITHUB_TOKEN to backend/.env or configure it via the Settings page.',
        testedRepositories: [],
        detail: 'GITHUB_TOKEN is not configured.',
      };
    }

    const tokenType: GithubTokenType = token.startsWith('github_pat_')
      ? 'fine-grained'
      : token.startsWith('ghp_')
        ? 'classic'
        : 'none';

    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CodyNex-OS',
        Authorization: `Bearer ${token}`,
      },
    });

    const scopes = res.headers.get('x-oauth-scopes') || '';
    const body = (await res.json().catch(() => ({}))) as {
      login?: string;
      type?: 'User' | 'Organization';
      message?: string;
    };

    if (!res.ok) {
      return {
        configured: true,
        authenticated: false,
        authenticatedAccount: body.login ?? null,
        tokenType,
        tokenScopes: scopes,
        repositoryAccessStatus: 'DENIED',
        repositoryWritePermission: false,
        pushReadiness: false,
        diagnosticCode: GithubDiagnosticCode.TOKEN_INVALID,
        failureReason: body.message
          ? `${body.message} (HTTP ${res.status})`
          : `GitHub returned HTTP ${res.status}. Token is invalid or expired.`,
        recommendedAction:
          tokenType === 'fine-grained'
            ? 'Ensure Fine-Grained PAT is valid and active in GitHub Developer Settings.'
            : "Ensure Classic PAT is valid and has 'repo' scope.",
        testedRepositories: [],
        detail: body.message || `GitHub returned HTTP ${res.status} Unauthorized.`,
      };
    }

    const authenticatedAccount = body.login || 'unknown';

    const reposToTest: Array<{ owner: string; name: string }> = [];
    if (target?.owner && target?.repo) {
      reposToTest.push({ owner: target.owner, name: target.repo });
    } else {
      const connected = await this.engRepo.findAllRepos();
      if (connected.length > 0) {
        for (const c of connected.slice(0, 5)) {
          reposToTest.push({ owner: c.owner, name: c.name });
        }
      }
    }

    const testedRepositories: RepositoryDiagnosticResult[] = [];
    for (const r of reposToTest) {
      const diag = await this.diagnoseRepository(r.owner, r.name, token);
      testedRepositories.push(diag);

      const dbRepo = await this.engRepo.findRepoByOwnerName(r.owner, r.name);
      if (dbRepo && dbRepo.isWriteAuthorized !== diag.effectiveWriteAuthorized) {
        dbRepo.isWriteAuthorized = diag.effectiveWriteAuthorized;
        await this.engRepo.saveRepo(dbRepo);
      }
    }

    let repoAccessStatus: 'FULL' | 'PARTIAL' | 'DENIED' | 'NOT_TESTED';
    let repoWritePermission: boolean;
    let pushReadiness: boolean;
    let overallCode = GithubDiagnosticCode.READY_FOR_PUSH;
    let failureReason: string | null = null;
    let recommendedAction: string | null = null;

    if (testedRepositories.length > 0) {
      const hasAnyAccess = testedRepositories.some((r) => r.hasAccess);
      const allAccess = testedRepositories.every((r) => r.hasAccess);
      const allWrite = testedRepositories.every((r) => r.effectiveWriteAuthorized);
      const hasAnyWrite = testedRepositories.some((r) => r.effectiveWriteAuthorized);

      repoAccessStatus = allAccess ? 'FULL' : hasAnyAccess ? 'PARTIAL' : 'DENIED';
      repoWritePermission = hasAnyWrite;
      pushReadiness = allWrite;

      if (!pushReadiness) {
        const failing = testedRepositories.find((r) => !r.effectiveWriteAuthorized) ?? testedRepositories[0];
        if (failing) {
          overallCode = failing.diagnosticCode;
          failureReason = failing.failureReason;
          recommendedAction = failing.correctiveAction;
        }
      }
    } else {
      repoAccessStatus = 'NOT_TESTED';
      if (tokenType === 'classic') {
        const hasRepo = /\brepo\b/.test(scopes);
        repoWritePermission = hasRepo;
        pushReadiness = hasRepo;
        if (!hasRepo) {
          overallCode = GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING;
          failureReason = "Classic PAT is missing 'repo' write scope.";
          recommendedAction = "Regenerate Classic PAT with 'repo' scope.";
        }
      } else {
        repoWritePermission = false;
        pushReadiness = false;
        overallCode = GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING;
        failureReason =
          'Fine-Grained PAT authenticated, but repository write permission is unverified or missing "Contents: Read & write".';
        recommendedAction =
          'Ensure Fine-Grained PAT has "Contents: Read and write" and "Pull requests: Read and write" in GitHub Developer Settings.';
      }
    }

    const detail = pushReadiness
      ? `Authenticated as ${authenticatedAccount} (${tokenType}). Write permission verified.`
      : `Authenticated as ${authenticatedAccount} (${tokenType}), but push/write authorization failed: ${failureReason || overallCode}`;

    return {
      configured: true,
      authenticated: true,
      authenticatedAccount,
      accountType: body.type,
      tokenType,
      tokenScopes: scopes,
      repositoryAccessStatus: repoAccessStatus,
      repositoryWritePermission: repoWritePermission,
      pushReadiness,
      diagnosticCode: overallCode,
      failureReason,
      recommendedAction,
      testedRepositories,
      detail,
    };
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
      const hasPush = Boolean((r as any).permissions?.push);
      let existing = await this.engRepo.findRepoByOwnerName(rOwner, r.name);
      if (!existing) {
        existing = await this.engRepo.saveRepo({
          owner: rOwner,
          name: r.name,
          defaultBranch: r.default_branch || 'main',
          isWriteAuthorized: hasPush,
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

    let endpoint = 'https://api.github.com/user/repos';
    if (params.owner && params.owner.trim()) {
      const ownerRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(params.owner.trim())}`,
        { headers },
      );
      const ownerInfo = ownerRes.ok
        ? ((await ownerRes.json()) as { type?: string })
        : {};
      if (ownerInfo.type === 'Organization') {
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
      if (res.status === 403 || /not accessible by personal access token/i.test(data.message || '')) {
        throw ApiError.forbidden(
          `GitHub denied repository creation (${data.message || '403'}). Use a Classic PAT with 'repo' scope, or grant your Fine-Grained PAT: All repositories + Administration (Read & Write) + Contents (Read & Write) + Pull requests (Read & Write).`,
        );
      }
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

    // Auto-commit written files immediately on the isolated feature branch to ensure changes are persisted
    if (written.length > 0) {
      await this.workspaceService.stageAndCommit(
        repo.owner,
        repo.name,
        branchName,
        `feat(agent): write ${written.length} implementation file(s) on ${branchName}`,
      );
    }

    // Auto-install dependencies if package.json was written or updated by the agent
    const hasPkgInFiles = files.some(
      (f) => f.path.trim() === 'package.json' || f.path.trim().endsWith('/package.json'),
    );
    if (hasPkgInFiles) {
      await this.workspaceService.installDependencies(repo.owner, repo.name).catch(() => {});
    }

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

  async commitWorkspaceFiles(params: {
    repoId: string;
    branchName: string;
    commitMessage: string;
    actorId: string;
  }) {
    const repo = await this.engRepo.findRepoById(params.repoId);
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
      params.branchName,
      repo.defaultBranch,
    );

    const result = await this.workspaceService.stageAndCommit(
      repo.owner,
      repo.name,
      params.branchName,
      params.commitMessage || `chore: commit workspace changes on ${params.branchName}`,
    );

    if (result.committed) {
      await this.auditService.log({
        actorType: 'USER',
        actorId: params.actorId,
        action: 'WORKSPACE_COMMITTED',
        resourceType: 'github_repository',
        resourceId: repo.id,
        metadata: { branchName: params.branchName, commitSha: result.commitSha },
      });
    }

    return {
      committed: result.committed,
      commitSha: result.commitSha,
      branchName: params.branchName,
    };
  }

  async executeWorkspaceTerminal(params: {
    repoId: string;
    command: string;
    actorId: string;
  }) {
    const repo = await this.engRepo.findRepoById(params.repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const token = await resolveRuntimeSecret('github_token');
    await this.workspaceService.ensureClonedOrPulled({
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      token: token || undefined,
    });

    const result = await this.workspaceService.executeTerminalCommand({
      owner: repo.owner,
      name: repo.name,
      command: params.command,
      token: token || undefined,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'WORKSPACE_TERMINAL_EXECUTED',
      resourceType: 'github_repository',
      resourceId: repo.id,
      metadata: {
        command: params.command.slice(0, 100),
        exitCode: result.exitCode,
      },
    });

    return result;
  }

  async installWorkspaceDependencies(repoId: string, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const result = await this.workspaceService.installDependencies(repo.owner, repo.name);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'WORKSPACE_DEPS_INSTALLED',
      resourceType: 'github_repository',
      resourceId: repo.id,
      metadata: { success: result.success },
    });

    return result;
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

    // Remote PR Pre-flight Check: verify unique commits exist between base and head on GitHub
    const compareUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/compare/${encodeURIComponent(repo.defaultBranch)}...${encodeURIComponent(pushed.branchName)}`;
    const compareRes = await fetch(compareUrl, { headers }).catch(() => null);

    if (compareRes && compareRes.ok) {
      const compareData = (await compareRes.json()) as {
        status?: string;
        ahead_by?: number;
        total_commits?: number;
      };

      if (
        compareData.total_commits === 0 ||
        compareData.ahead_by === 0 ||
        compareData.status === 'identical'
      ) {
        // Check whether an open or already-merged PR exists for this branch
        const existingPrsRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls?head=${encodeURIComponent(repo.owner)}:${encodeURIComponent(pushed.branchName)}&state=all`,
          { headers },
        ).catch(() => null);

        let existingNote = '';
        if (existingPrsRes && existingPrsRes.ok) {
          const list = (await existingPrsRes.json()) as Array<{
            number: number;
            state: string;
            merged_at?: string | null;
            html_url: string;
            title: string;
          }>;
          if (list[0]) {
            const p = list[0];
            if (p.state === 'open') {
              // Reuse existing open PR
              const existingRecord = await this.engRepo.savePullRequest({
                repositoryId: repo.id,
                taskId: params.taskId ?? null,
                prNumber: p.number,
                branchName: pushed.branchName,
                title: p.title || params.title,
                status: 'OPEN',
                htmlUrl: p.html_url,
              });
              return { commitSha: pushed.commitSha, pullRequest: existingRecord };
            }
            existingNote = ` Previous Pull Request #${p.number} for branch '${pushed.branchName}' was already ${p.merged_at ? 'MERGED' : 'CLOSED'}. Use a fresh feature branch name (e.g. 'codynex/${pushed.branchName.replace(/^codynex\//, '')}-${Date.now().toString(36)}').`;
          }
        }

        throw ApiError.badRequest(
          `[PR_NO_COMMITS_BETWEEN_BRANCHES] Cannot create Pull Request: GitHub remote reports 0 unique commits between '${repo.defaultBranch}' and '${pushed.branchName}' (status: ${compareData.status || 'identical'}).${existingNote || ' Ensure actual changes are committed before pushing.'}`,
        );
      }
    }

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
            `Automated Pull Request pushed from CodyNex OS workspace (${pushed.commitSha.slice(0, 7)}). Contains ${pushed.commitsCount} commit(s) across ${pushed.changedFiles.length} file(s).`,
        }),
      },
    );

    const prJson = (await prRes.json()) as {
      number?: number;
      title?: string;
      html_url?: string;
      message?: string;
      errors?: Array<{ message?: string; field?: string; code?: string }>;
    };

    if (!prRes.ok || !prJson.number) {
      // Check if PR already exists for this branch:
      const alreadyExistsError = prJson.errors?.find((e) =>
        /already exists/i.test(e.message || ''),
      );
      if (alreadyExistsError) {
        const existingPrsRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls?head=${encodeURIComponent(repo.owner)}:${encodeURIComponent(pushed.branchName)}&state=open`,
          { headers },
        );
        if (existingPrsRes.ok) {
          const list = (await existingPrsRes.json()) as Array<{
            number: number;
            title: string;
            html_url: string;
          }>;
          if (list[0]) {
            prJson.number = list[0].number;
            prJson.title = list[0].title;
            prJson.html_url = list[0].html_url;
          }
        }
      }

      if (!prJson.number) {
        const errorDetails = prJson.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join('; ');
        const friendlyMessage = errorDetails
          ? `GitHub PR creation rejected (${prJson.message || 'Validation Failed'}): ${errorDetails}`
          : prJson.message || `GitHub PR creation failed (HTTP ${prRes.status})`;
        throw ApiError.badRequest(friendlyMessage);
      }
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

  async mergeApprovedPullRequest(params: {
    repoId: string;
    prId?: string;
    prNumber: number;
    actorId: string;
  }) {
    const repo = await this.engRepo.findRepoById(params.repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const headers = await this.buildGithubHeaders();
    if (!headers.Authorization) {
      throw ApiError.badRequest('GITHUB_TOKEN is required to merge Pull Requests.');
    }

    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls/${params.prNumber}/merge`,
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merge_method: 'squash',
          commit_title: `Merge PR #${params.prNumber} (CEO Approved via CodyNex OS)`,
        }),
      },
    );

    const body = (await res.json()) as { merged?: boolean; sha?: string; message?: string };
    if (!res.ok || !body.merged) {
      throw ApiError.badRequest(
        body.message || `GitHub merge failed for PR #${params.prNumber} (HTTP ${res.status}).`,
      );
    }

    if (params.prId) {
      const pr = await this.engRepo.findPullRequestById(params.prId);
      if (pr) {
        pr.status = 'MERGED';
        await this.engRepo.savePullRequest(pr);
      }
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'GITHUB_PR_MERGED',
      resourceType: 'github_pull_request',
      resourceId: params.prId ?? String(params.prNumber),
      metadata: { repo: `${repo.owner}/${repo.name}`, prNumber: params.prNumber, sha: body.sha },
    });

    return { merged: true, sha: body.sha };
  }

  async syncRepoFromGithub(repoId: string, actorId: string) {
    const repo = await this.engRepo.findRepoById(repoId);
    if (!repo) throw ApiError.notFound('Repository not found.');

    const headers = await this.buildGithubHeaders();

    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls?state=all&per_page=20`,
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
      state?: string;
      merged_at?: string | null;
      html_url: string;
      head?: { ref?: string };
    }>;

    const existing = await this.engRepo.findAllPullRequests();
    for (const pr of pulls) {
      const mappedStatus: 'OPEN' | 'MERGED' | 'CLOSED' = pr.merged_at
        ? 'MERGED'
        : pr.state === 'open'
          ? 'OPEN'
          : 'CLOSED';

      const match = existing.find((e) => e.repositoryId === repo.id && e.prNumber === pr.number);
      if (!match) {
        await this.engRepo.savePullRequest({
          repositoryId: repo.id,
          prNumber: pr.number,
          branchName: pr.head?.ref ?? 'unknown',
          title: pr.title.slice(0, 255),
          status: mappedStatus,
          htmlUrl: pr.html_url,
        });
      } else if (match.status !== mappedStatus || match.title !== pr.title.slice(0, 255)) {
        match.status = mappedStatus;
        match.title = pr.title.slice(0, 255);
        await this.engRepo.savePullRequest(match);
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

  async syncAllPullRequests(actorId: string) {
    const repos = await this.engRepo.findAllRepos();
    let syncedRepositories = 0;
    let syncedPullRequests = 0;

    const batchSize = 5;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((repo) => this.syncRepoFromGithub(repo.id, actorId)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          syncedRepositories += 1;
          syncedPullRequests += result.value.syncedPullRequests;
        }
      }
    }

    return { syncedRepositories, totalRepositories: repos.length, syncedPullRequests };
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
      const err = (await createRefRes.json().catch(() => ({}))) as { message?: string };
      if (createRefRes.status === 403) {
        throw ApiError.forbidden(
          `[CONTENTS_WRITE_PERMISSION_MISSING] GitHub denied branch creation (HTTP 403: ${err.message || 'Resource not accessible by personal access token'}). Fine-Grained PAT requires 'Contents: Read & write' permission for ${repo.owner}/${repo.name}.`,
        );
      }
      throw ApiError.badRequest(
        `Failed to create branch '${cleanBranch}' on GitHub (${err.message || `HTTP ${createRefRes.status}`}).`,
      );
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
        const err = (await putRes.json().catch(() => ({}))) as { message?: string };
        if (putRes.status === 403) {
          throw ApiError.forbidden(
            `[CONTENTS_WRITE_PERMISSION_MISSING] GitHub denied file commit (HTTP 403: ${err.message || 'Resource not accessible by personal access token'}). Fine-Grained PAT requires 'Contents: Read & write' permission for ${repo.owner}/${repo.name}.`,
          );
        }
        throw ApiError.badRequest(
          `Failed to commit '${params.filePath}' on branch '${cleanBranch}' (${err.message || `HTTP ${putRes.status}`}).`,
        );
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
      const err = (await prRes.json().catch(() => ({}))) as { message?: string };
      if (prRes.status === 403) {
        throw ApiError.forbidden(
          `[PULL_REQUESTS_WRITE_PERMISSION_MISSING] GitHub denied PR creation (HTTP 403: ${err.message || 'Resource not accessible by personal access token'}). Fine-Grained PAT requires 'Pull requests: Read & write' permission.`,
        );
      }
      throw ApiError.badRequest(
        `Failed to open Pull Request on GitHub (HTTP ${prRes.status}: ${err.message || ''}).`,
      );
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
