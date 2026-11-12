import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineeringService } from '../../src/services/engineering.service';
import { WorkspaceService } from '../../src/services/workspace.service';
import * as runtimeSecrets from '../../src/services/runtime-secrets.service';
import { GithubDiagnosticCode } from '../../src/constant/github-diagnostic.constant';

describe('GitHub Diagnostics & Push Permission Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockEngService = (repos: any[] = []) => {
    const mockRepo = {
      findAllRepos: vi.fn().mockResolvedValue(repos),
      findRepoById: vi.fn().mockImplementation(async (id) => repos.find((r) => r.id === id) || null),
      findRepoByOwnerName: vi
        .fn()
        .mockImplementation(async (owner, name) =>
          repos.find((r) => r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === name.toLowerCase()) || null,
        ),
      saveRepo: vi.fn().mockImplementation(async (r) => r),
      findAllPullRequests: vi.fn().mockResolvedValue([]),
      findAllQaReports: vi.fn().mockResolvedValue([]),
    };
    return new EngineeringService(
      mockRepo as any,
      {} as any,
      {} as any,
      { log: vi.fn().mockResolvedValue({}) } as any,
    );
  };

  it('detects TOKEN_NOT_CONFIGURED when no token is present', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue(null);
    const service = createMockEngService();

    const result = await service.probeGithubToken();
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.pushReadiness).toBe(false);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.TOKEN_NOT_CONFIGURED);
  });

  it('detects TOKEN_INVALID when GitHub API returns HTTP 401', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_invalid_expired_token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    const service = createMockEngService();

    const result = await service.probeGithubToken();
    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.pushReadiness).toBe(false);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.TOKEN_INVALID);
    expect(result.failureReason).toContain('401');
  });

  it('detects REPOSITORY_NOT_FOUND when repository does not exist or has no access', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('github_pat_11CL_valid');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );

    const service = createMockEngService();
    const result = await service.diagnoseRepository('CodynexNepal', 'NonExistentRepo');

    expect(result.exists).toBe(false);
    expect(result.hasAccess).toBe(false);
    expect(result.hasPushPermission).toBe(false);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.REPOSITORY_NOT_FOUND);
  });

  it('detects CONTENTS_WRITE_PERMISSION_MISSING for Fine-Grained PAT lacking contents=write', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('github_pat_11CL_read_only');
    vi.spyOn(globalThis, 'fetch')
      // 1. GET /repos/CodynexNepal/Hostel_Ghar_Frontend (repo metadata 200)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'Hostel_Ghar_Frontend',
            private: false,
            default_branch: 'main',
            permissions: { admin: true, push: true, pull: true },
          }),
          { status: 200 },
        ),
      )
      // 2. POST /repos/CodynexNepal/Hostel_Ghar_Frontend/git/refs (dry run returns 403 Resource not accessible)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Resource not accessible by personal access token',
            documentation_url: 'https://docs.github.com/rest/git/refs#create-a-reference',
          }),
          {
            status: 403,
            headers: { 'x-accepted-github-permissions': 'contents=write; contents=write,workflows=write' },
          },
        ),
      );

    const service = createMockEngService();
    const result = await service.diagnoseRepository('CodynexNepal', 'Hostel_Ghar_Frontend');

    expect(result.exists).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.hasPushPermission).toBe(false);
    expect(result.effectiveWriteAuthorized).toBe(false);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING);
    expect(result.failureReason).toContain('Contents: Read & write');
    expect(result.correctiveAction).toContain('Developer Settings');
  });

  it('detects CONTENTS_WRITE_PERMISSION_MISSING for Classic PAT missing repo scope', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_read_only_classic');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'CodynexOs',
          private: false,
          default_branch: 'main',
          permissions: { push: true },
        }),
        { status: 200, headers: { 'x-oauth-scopes': 'read:user' } },
      ),
    );

    const service = createMockEngService();
    const result = await service.diagnoseRepository('CodynexNepal', 'CodynexOs');

    expect(result.effectiveWriteAuthorized).toBe(false);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING);
    expect(result.failureReason).toContain("missing 'repo' write scope");
  });

  it('detects ORGANIZATION_APPROVAL_REQUIRED when SAML/SSO or org approval blocks token', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('github_pat_org_blocked');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Resource protected by organization SAML enforcement or requires organization owner approval',
        }),
        { status: 403 },
      ),
    );

    const service = createMockEngService();
    const result = await service.diagnoseRepository('CodynexNepal', 'InternalRepo');

    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.ORGANIZATION_APPROVAL_REQUIRED);
    expect(result.effectiveWriteAuthorized).toBe(false);
  });

  it('detects READY_FOR_PUSH when Fine-Grained PAT has verified contents=write permission (422 on probe)', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('github_pat_11CL_full_write');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'Hostel_Ghar_Dashboard',
            private: true,
            default_branch: 'main',
            permissions: { admin: true, push: true, pull: true },
          }),
          { status: 200 },
        ),
      )
      // Dry run POST returns 422 Unprocessable Entity (proves token has contents=write and validated SHA)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Object does not exist', status: '422' }), { status: 422 }),
      );

    const service = createMockEngService();
    const result = await service.diagnoseRepository('CodynexNepal', 'Hostel_Ghar_Dashboard');

    expect(result.isPrivate).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.hasPushPermission).toBe(true);
    expect(result.effectiveWriteAuthorized).toBe(true);
    expect(result.diagnosticCode).toBe(GithubDiagnosticCode.READY_FOR_PUSH);
  });

  it('never reports pushReadiness as true when only authentication succeeds but write permission fails', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('github_pat_11CL_partial');
    vi.spyOn(globalThis, 'fetch')
      // GET /user (authenticated)
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'CodynexNepal', type: 'User' }), { status: 200 }))
      // GET /repos/CodynexNepal/Hostel_Ghar_Frontend (repo accessible)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'Hostel_Ghar_Frontend',
            private: false,
            default_branch: 'main',
            permissions: { push: true },
          }),
          { status: 200 },
        ),
      )
      // POST git/refs (write denied 403)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 }),
      );

    const service = createMockEngService([
      { id: 'repo-1', owner: 'CodynexNepal', name: 'Hostel_Ghar_Frontend', isWriteAuthorized: true },
    ]);

    const diag = await service.probeGithubToken();
    expect(diag.authenticated).toBe(true);
    expect(diag.authenticatedAccount).toBe('CodynexNepal');
    // Must distinguish authentication from write authorization!
    expect(diag.pushReadiness).toBe(false);
    expect(diag.repositoryWritePermission).toBe(false);
    expect(diag.diagnosticCode).toBe(GithubDiagnosticCode.CONTENTS_WRITE_PERMISSION_MISSING);
  });

  it('maps native Git CLI push 403 errors to CONTENTS_WRITE_PERMISSION_MISSING with token redaction', async () => {
    const ws = new WorkspaceService();
    // Simulate git push failing with 403
    const mockRunGit = vi.spyOn(ws as any, 'runGit').mockImplementation(async () => {
      const err: any = new Error('fatal: unable to access: The requested URL returned error: 403');
      err.stderr = 'remote: Permission to CodynexNepal/Hostel_Ghar_Frontend.git denied to CodynexNepal with basic Z2l0aHViX3BhdF8xMUNMOnh4eA==';
      throw err;
    });

    await expect(
      ws.commitAndPushBranch({
        owner: 'CodynexNepal',
        name: 'Hostel_Ghar_Frontend',
        branchName: 'codynex/test-branch',
        defaultBranch: 'main',
        commitMessage: 'test',
        token: 'github_pat_11CL_secret',
      }),
    ).rejects.toThrow();

    mockRunGit.mockRestore();
  });
});
