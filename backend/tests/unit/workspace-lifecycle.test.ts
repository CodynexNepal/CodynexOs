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
});
