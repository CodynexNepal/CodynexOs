import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { WorkspaceService } from '../../src/services/workspace.service';

describe('WorkspaceService security & folder isolation', () => {
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
});
