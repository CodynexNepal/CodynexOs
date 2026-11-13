import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../src/services/workspace.service';
import { EngineeringService } from '../../src/services/engineering.service';
import * as runtimeSecrets from '../../src/services/runtime-secrets.service';

describe('WorkspaceService security & folder isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks path traversal outside repository workspace directory', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-ws-'));
    const ws = new WorkspaceService(tmpRoot);

    await expect(ws.readFile('codynexnepal', 'demo', '../../etc/passwd')).rejects.toThrow(
      /Path traversal/i,
    );

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('forbids checking out or pushing directly to default production branches', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-ws-'));
    const ws = new WorkspaceService(tmpRoot);

    await expect(
      ws.checkoutBranch('codynexnepal', 'demo', 'main', 'main'),
    ).rejects.toThrow(/protected default branch/i);

    await expect(
      ws.commitAndPushBranch({
        owner: 'codynexnepal',
        name: 'demo',
        branchName: 'master',
        defaultBranch: 'main',
        commitMessage: 'unsafe',
        token: 'fake',
      }),
    ).rejects.toThrow(/prohibited/i);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('merges CEO-approved Pull Requests via GitHub API and updates PR status to MERGED', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_test_token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ merged: true, sha: 'abc1234' }), { status: 200 }),
    );

    const prRow = { id: 'pr-1', prNumber: 7, status: 'OPEN' as string };
    const savePr = vi.fn().mockImplementation(async (p) => p);
    const engRepo = {
      findRepoById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        owner: 'CodynexNepal',
        name: 'HostelGhar',
      }),
      findPullRequestById: vi.fn().mockResolvedValue(prRow),
      savePullRequest: savePr,
    } as any;

    const service = new EngineeringService(engRepo, {} as any, {} as any, { log: vi.fn() } as any);
    const result = await service.mergeApprovedPullRequest({
      repoId: 'repo-1',
      prId: 'pr-1',
      prNumber: 7,
      actorId: 'ceo-1',
    });

    expect(result.merged).toBe(true);
    expect(prRow.status).toBe('MERGED');
    expect(savePr).toHaveBeenCalledTimes(1);
  });

  it('rejects PR creation when GitHub compare API detects 0 unique commits between branches (prevents Validation Failed: No commits between main and branch)', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_test_token');

    // Mock compare API returning 0 commits ahead
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/compare/')) {
        return new Response(
          JSON.stringify({
            status: 'identical',
            ahead_by: 0,
            behind_by: 0,
            total_commits: 0,
            commits: [],
            files: [],
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes('/pulls?head=')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const mockWs = {
      commitAndPushBranch: vi.fn().mockResolvedValue({
        commitSha: '5bacc01',
        branchName: 'codynex/workspace-update',
        commitsCount: 0,
        changedFiles: [],
      }),
    };

    const engRepo = {
      findRepoById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        owner: 'CodynexNepal',
        name: 'aliza-wears',
        defaultBranch: 'main',
        isWriteAuthorized: true,
      }),
    } as any;

    const service = new EngineeringService(
      engRepo,
      {} as any,
      {} as any,
      { log: vi.fn() } as any,
      undefined,
      mockWs as any,
    );

    await expect(
      service.commitPushAndOpenPr({
        repoId: 'repo-1',
        branchName: 'codynex/workspace-update',
        title: 'update workspace',
        actorId: 'user-1',
      }),
    ).rejects.toThrow(/PR_NO_COMMITS_BETWEEN_BRANCHES/);
  });

  it('reuses existing open Pull Request if one is already open on remote instead of failing with 422', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_test_token');

    const openPrPayload = {
      number: 42,
      state: 'open',
      title: 'feat: existing feature PR',
      html_url: 'https://github.com/CodynexNepal/aliza-wears/pull/42',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/compare/')) {
        return new Response(
          JSON.stringify({
            status: 'identical',
            ahead_by: 0,
            total_commits: 0,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes('/pulls?head=')) {
        return new Response(JSON.stringify([openPrPayload]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const mockWs = {
      commitAndPushBranch: vi.fn().mockResolvedValue({
        commitSha: '5bacc01',
        branchName: 'codynex/feature-42',
        commitsCount: 1,
        changedFiles: ['README.md'],
      }),
    };

    const savedPr = { id: 'pr-42', prNumber: 42, status: 'OPEN' };
    const engRepo = {
      findRepoById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        owner: 'CodynexNepal',
        name: 'aliza-wears',
        defaultBranch: 'main',
        isWriteAuthorized: true,
      }),
      savePullRequest: vi.fn().mockResolvedValue(savedPr),
    } as any;

    const service = new EngineeringService(
      engRepo,
      {} as any,
      {} as any,
      { log: vi.fn() } as any,
      undefined,
      mockWs as any,
    );
    const result = await service.commitPushAndOpenPr({
      repoId: 'repo-1',
      branchName: 'codynex/feature-42',
      title: 'feat: existing feature PR',
      actorId: 'user-1',
    });

    expect(result.pullRequest.prNumber).toBe(42);
    expect(result.commitSha).toBe('5bacc01');
    expect(engRepo.savePullRequest).toHaveBeenCalledTimes(1);
  });

  it('auto-commits written files on isolated feature branch during writeWorkspaceFiles', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('ghp_test_token');

    const mockWs = {
      ensureClonedOrPulled: vi.fn().mockResolvedValue({ repoDir: '/tmp/repo', action: 'cloned' }),
      checkoutBranch: vi.fn().mockResolvedValue(undefined),
      writeFiles: vi.fn().mockResolvedValue(['src/index.ts', 'package.json']),
      stageAndCommit: vi.fn().mockResolvedValue({ committed: true, commitSha: 'abc999' }),
      installDependencies: vi.fn().mockResolvedValue({ success: true, output: 'ok' }),
    };

    const engRepo = {
      findRepoById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        owner: 'CodynexNepal',
        name: 'aliza-wears',
        defaultBranch: 'main',
        isWriteAuthorized: true,
      }),
    } as any;

    const service = new EngineeringService(
      engRepo,
      {} as any,
      {} as any,
      { log: vi.fn() } as any,
      undefined,
      mockWs as any,
    );
    const result = await service.writeWorkspaceFiles(
      'repo-1',
      'codynex/feature-task-1',
      [
        { path: 'src/index.ts', content: 'console.log("hello");' },
        { path: 'package.json', content: '{"name":"app"}' },
      ],
      'user-1',
    );

    expect(result.written).toEqual(['src/index.ts', 'package.json']);
    expect(mockWs.stageAndCommit).toHaveBeenCalledTimes(1);
    expect(mockWs.stageAndCommit).toHaveBeenCalledWith(
      'CodynexNepal',
      'aliza-wears',
      'codynex/feature-task-1',
      expect.stringContaining('write 2 implementation file(s)'),
    );
  });

  it('rejects push if feature branch has no unique commits compared to default branch', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-ws-ahead-'));
    const ws = new WorkspaceService(tmpRoot);

    // Mock runGit on the workspace service instance
    vi.spyOn(ws as any, 'runGit').mockImplementation(async (_cwd: string, args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.includes('fetch origin')) return { stdout: '', stderr: '' };
      if (cmd.includes('rev-parse --verify origin/main')) return { stdout: 'hash1', stderr: '' };
      if (cmd.includes('log origin/main..main')) return { stdout: '', stderr: '' };
      if (cmd.includes('rev-parse --verify HEAD')) return { stdout: 'hash1', stderr: '' };
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return { stdout: 'codynex/test-branch', stderr: '' };
      if (cmd.includes('status --porcelain')) return { stdout: '', stderr: '' };
      if (cmd.includes('branch -r --list origin/codynex/test-branch')) return { stdout: '', stderr: '' };
      // log ahead returns empty string (no unique commits)
      if (cmd.includes('log origin/main..HEAD')) return { stdout: '', stderr: '' };
      return { stdout: '', stderr: '' };
    });

    await expect(
      ws.commitAndPushBranch({
        owner: 'CodynexNepal',
        name: 'test-repo',
        branchName: 'codynex/test-branch',
        defaultBranch: 'main',
        commitMessage: 'feat: test commit',
        token: 'fake-token',
      }),
    ).rejects.toThrow(/has no unique commits compared to 'main'/);

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('aborts rebase cleanly and throws GIT_MERGE_CONFLICT when remote feature branch has conflicting changes', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-ws-conflict-'));
    const ws = new WorkspaceService(tmpRoot);

    let rebaseAborted = false;
    vi.spyOn(ws as any, 'runGit').mockImplementation(async (_cwd: string, args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.includes('fetch origin')) return { stdout: '', stderr: '' };
      if (cmd.includes('rev-parse --verify origin/main')) return { stdout: 'hash1', stderr: '' };
      if (cmd.includes('log origin/main..main')) return { stdout: '', stderr: '' };
      if (cmd.includes('rev-parse --verify HEAD')) return { stdout: 'hash1', stderr: '' };
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return { stdout: 'codynex/test-branch', stderr: '' };
      if (cmd.includes('status --porcelain')) return { stdout: '', stderr: '' };
      if (cmd.includes('branch -r --list origin/codynex/test-branch')) {
        return { stdout: 'origin/codynex/test-branch\n', stderr: '' };
      }
      if (cmd.includes('pull --rebase origin codynex/test-branch')) {
        throw new Error('CONFLICT (content): Merge conflict in src/app.ts');
      }
      if (cmd.includes('rebase --abort')) {
        rebaseAborted = true;
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    await expect(
      ws.commitAndPushBranch({
        owner: 'CodynexNepal',
        name: 'test-repo',
        branchName: 'codynex/test-branch',
        defaultBranch: 'main',
        commitMessage: 'feat: test commit',
        token: 'fake-token',
      }),
    ).rejects.toThrow(/GIT_MERGE_CONFLICT/);

    expect(rebaseAborted).toBe(true);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('executes safe terminal git commands and rejects unauthorized programs', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-terminal-'));
    const ws = new WorkspaceService(tmpRoot);

    // Mock runGit
    vi.spyOn(ws as any, 'runGit').mockImplementation(async (_cwd: string, args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'codynex/feature-test\n', stderr: '' };
      }
      if (cmd.includes('status')) {
        return { stdout: 'On branch codynex/feature-test\nnothing to commit\n', stderr: '' };
      }
      return { stdout: 'ok', stderr: '' };
    });

    // Test git status
    const statusRes = await ws.executeTerminalCommand({
      owner: 'CodynexNepal',
      name: 'aliza-wears',
      command: 'git status',
    });
    expect(statusRes.exitCode).toBe(0);
    expect(statusRes.stdout).toContain('On branch codynex/feature-test');
    expect(statusRes.branch).toBe('codynex/feature-test');

    // Test unauthorized shell injection / executable
    const unsafeRes = await ws.executeTerminalCommand({
      owner: 'CodynexNepal',
      name: 'aliza-wears',
      command: 'powershell -c whoami',
    });
    expect(unsafeRes.exitCode).toBe(1);
    expect(unsafeRes.stderr).toContain('not recognized');

    // Test forbidden git subcommand
    const forbiddenGit = await ws.executeTerminalCommand({
      owner: 'CodynexNepal',
      name: 'aliza-wears',
      command: 'git format-patch HEAD~1',
    });
    expect(forbiddenGit.exitCode).toBe(1);
    expect(forbiddenGit.stderr).toContain('is not permitted');

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('does not attempt branch -f on checked out feature branch in commitAndPushBranch', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codynex-push-safe-'));
    const ws = new WorkspaceService(tmpRoot);

    const executedCommands: string[] = [];
    vi.spyOn(ws as any, 'runGit').mockImplementation(async (_cwd: string, args: string[]) => {
      const cmd = args.join(' ');
      executedCommands.push(cmd);
      if (cmd.includes('rev-parse --verify origin/main')) return { stdout: 'main-sha', stderr: '' };
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return { stdout: 'codynex/feature-mwf2o49z\n', stderr: '' };
      if (cmd.includes('log origin/main..main')) return { stdout: '846f0be accidental commit\n', stderr: '' };
      if (cmd.includes('branch --list codynex/feature-mwf2o49z')) return { stdout: 'codynex/feature-mwf2o49z', stderr: '' };
      if (cmd.includes('status --porcelain')) return { stdout: '', stderr: '' };
      if (cmd.includes('log origin/main..HEAD')) return { stdout: 'commit1\n', stderr: '' };
      if (cmd.includes('diff --name-only')) return { stdout: 'src/app.ts\n', stderr: '' };
      if (cmd.includes('rev-parse HEAD')) return { stdout: 'sha123\n', stderr: '' };
      if (cmd.includes('push')) return { stdout: 'Pushed', stderr: '' };
      return { stdout: '', stderr: '' };
    });

    const result = await ws.commitAndPushBranch({
      owner: 'CodynexNepal',
      name: 'aliza-wears',
      branchName: 'codynex/feature-mwf2o49z',
      defaultBranch: 'main',
      commitMessage: 'feat: push feature',
      token: 'fake-token',
    });

    expect(result.branchName).toBe('codynex/feature-mwf2o49z');
    // Ensure we NEVER ran "branch -f codynex/feature-mwf2o49z" which causes worktree collision
    const collidedCommand = executedCommands.find((c) =>
      c.includes('branch -f codynex/feature-mwf2o49z'),
    );
    expect(collidedCommand).toBeUndefined();

    // Verify main was reset instead
    const mainReset = executedCommands.find((c) => c.includes('branch -f main origin/main'));
    expect(mainReset).toBeDefined();

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
