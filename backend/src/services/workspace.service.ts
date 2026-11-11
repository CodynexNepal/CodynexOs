import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ApiError } from '../utils/api-error.util';

const execFileAsync = promisify(execFile);

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export class WorkspaceService {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = path.resolve(rootDir || path.join(process.cwd(), 'workspaces'));
  }

  public getRepoDir(owner: string, name: string): string {
    const safeOwner = owner.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.rootDir, safeOwner, safeName);
  }

  private resolveInsideRepo(repoDir: string, relPath: string): string {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const target = path.resolve(repoDir, normalized);
    const base = path.resolve(repoDir);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw ApiError.badRequest('Path traversal outside repository workspace is forbidden.');
    }
    return target;
  }

  private async runGit(
    cwd: string,
    args: string[],
    token?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const finalArgs = [...args];
    if (token && (args[0] === 'clone' || args[0] === 'pull' || args[0] === 'push' || args[0] === 'fetch')) {
      const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
      finalArgs.unshift(
        '-c',
        'credential.helper=',
        '-c',
        `http.extraheader=AUTHORIZATION: basic ${basic}`,
      );
    }

    try {
      const result = await execFileAsync('git', finalArgs, {
        cwd,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (err: any) {
      const stderr = String(err?.stderr || err?.message || 'Git command failed').replace(
        /basic\s+[A-Za-z0-9+/=]+/gi,
        'basic [REDACTED]',
      );
      if (/403|Permission to .* denied/i.test(stderr)) {
        throw ApiError.forbidden(
          `GitHub denied push/write access (403). Verify your GITHUB_TOKEN has 'repo' scope (classic PAT) or 'Contents: Read & Write' + 'Pull requests: Read & Write' (fine-grained PAT) for this repository. Details: ${stderr}`,
        );
      }
      throw new Error(stderr, { cause: err });
    }
  }

  async ensureClonedOrPulled(params: {
    owner: string;
    name: string;
    defaultBranch: string;
    token?: string;
  }): Promise<{ repoDir: string; action: 'cloned' | 'pulled' }> {
    const repoDir = this.getRepoDir(params.owner, params.name);
    const gitDir = path.join(repoDir, '.git');
    const remoteUrl = `https://github.com/${params.owner}/${params.name}.git`;

    const exists = await fs.access(gitDir).then(
      () => true,
      () => false,
    );

    if (!exists) {
      await fs.mkdir(path.dirname(repoDir), { recursive: true });
      await this.runGit(
        path.dirname(repoDir),
        ['clone', '--depth', '50', remoteUrl, repoDir],
        params.token,
      );
      await this.runGit(repoDir, ['config', 'user.name', 'CodyNex OS Engineering']);
      await this.runGit(repoDir, ['config', 'user.email', 'engineering@codynex.local']);
      return { repoDir, action: 'cloned' };
    }

    await this.runGit(repoDir, ['fetch', 'origin'], params.token);
    await this.runGit(repoDir, ['pull', '--ff-only', 'origin', params.defaultBranch], params.token).catch(
      () => {},
    );
    return { repoDir, action: 'pulled' };
  }

  async existsLocally(owner: string, name: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.getRepoDir(owner, name), '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async listTree(owner: string, name: string, subPath = ''): Promise<WorkspaceEntry[]> {
    const repoDir = this.getRepoDir(owner, name);
    const targetDir = this.resolveInsideRepo(repoDir, subPath);

    try {
      await fs.access(targetDir);
    } catch {
      return [];
    }

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const out: WorkspaceEntry[] = [];
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next') {
        continue;
      }
      const rel = subPath ? `${subPath.replace(/\/+$/, '')}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        out.push({ name: entry.name, path: rel, type: 'dir' });
      } else if (entry.isFile()) {
        const stat = await fs.stat(path.join(targetDir, entry.name)).catch(() => null);
        out.push({ name: entry.name, path: rel, type: 'file', size: stat?.size });
      }
    }

    return out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(owner: string, name: string, relPath: string): Promise<string> {
    const repoDir = this.getRepoDir(owner, name);
    const target = this.resolveInsideRepo(repoDir, relPath);
    const content = await fs.readFile(target, 'utf8');
    return content.slice(0, 100000);
  }

  async writeFiles(
    owner: string,
    name: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<string[]> {
    const repoDir = this.getRepoDir(owner, name);
    const written: string[] = [];
    for (const f of files) {
      const cleanPath = f.path.trim();
      if (!cleanPath || cleanPath.includes('.git/') || cleanPath === '.env') {
        continue;
      }
      const target = this.resolveInsideRepo(repoDir, cleanPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, f.content, 'utf8');
      written.push(cleanPath);
    }
    return written;
  }

  async checkoutBranch(owner: string, name: string, branchName: string, defaultBranch: string) {
    const clean = branchName.trim();
    if (!clean || clean === defaultBranch || clean === 'main' || clean === 'master') {
      throw ApiError.forbidden('Cannot checkout or push directly to the protected default branch.');
    }
    const repoDir = this.getRepoDir(owner, name);
    const { stdout } = await this.runGit(repoDir, ['branch', '--list', clean]);
    if (stdout.trim()) {
      await this.runGit(repoDir, ['checkout', clean]);
    } else {
      await this.runGit(repoDir, ['checkout', '-b', clean]);
    }
  }

  async getDiffAndStatus(owner: string, name: string): Promise<{
    branch: string;
    status: string;
    diff: string;
  }> {
    const repoDir = this.getRepoDir(owner, name);
    const exists = await this.existsLocally(owner, name);
    if (!exists) {
      return { branch: 'not-cloned', status: '', diff: '' };
    }
    const [branchRes, statusRes, diffRes] = await Promise.all([
      this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.runGit(repoDir, ['status', '--short']),
      this.runGit(repoDir, ['diff', '--no-color']),
    ]);
    return {
      branch: branchRes.stdout.trim(),
      status: statusRes.stdout.trim(),
      diff: diffRes.stdout.slice(0, 50000),
    };
  }

  async commitAndPushBranch(params: {
    owner: string;
    name: string;
    branchName: string;
    defaultBranch: string;
    commitMessage: string;
    token: string;
  }): Promise<{ commitSha: string; branchName: string }> {
    const clean = params.branchName.trim();
    if (!clean || clean === params.defaultBranch || clean === 'main' || clean === 'master') {
      throw ApiError.forbidden('Direct push to the production/default branch is prohibited.');
    }
    const repoDir = this.getRepoDir(params.owner, params.name);
    await this.checkoutBranch(params.owner, params.name, clean, params.defaultBranch);
    await this.runGit(repoDir, ['add', '-A']);

    const status = await this.runGit(repoDir, ['status', '--porcelain']);
    if (status.stdout.trim()) {
      await this.runGit(repoDir, ['commit', '-m', params.commitMessage]);
    }

    const shaRes = await this.runGit(repoDir, ['rev-parse', 'HEAD']);
    await this.runGit(repoDir, ['push', '-u', 'origin', clean], params.token);
    return { commitSha: shaRes.stdout.trim(), branchName: clean };
  }

  async runSafeChecks(owner: string, name: string): Promise<
    Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; output: string }>
  > {
    const repoDir = this.getRepoDir(owner, name);
    const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; output: string }> = [];

    const pkgJson = await fs
      .readFile(path.join(repoDir, 'package.json'), 'utf8')
      .then((raw) => JSON.parse(raw) as { scripts?: Record<string, string> }, () => null);

    if (!pkgJson?.scripts) {
      return [
        {
          name: 'workspace_files',
          status: 'PASS',
          output: 'Non-Node repository workspace verified on disk.',
        },
      ];
    }

    try {
      await fs.access(path.join(repoDir, 'node_modules'));
    } catch {
      checks.push({
        name: 'dependencies',
        status: 'SKIPPED',
        output: 'node_modules not installed in workspace; skipping script execution.',
      });
      return checks;
    }

    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    for (const scriptName of ['typecheck', 'lint', 'test']) {
      if (!pkgJson.scripts[scriptName]) continue;
      try {
        const res = await execFileAsync(npmBin, ['run', scriptName], {
          cwd: repoDir,
          timeout: 90000,
          maxBuffer: 2 * 1024 * 1024,
        });
        checks.push({
          name: scriptName,
          status: 'PASS',
          output: (res.stdout || 'Passed').slice(-1000),
        });
      } catch (err: any) {
        checks.push({
          name: scriptName,
          status: 'FAIL',
          output: String(err?.stderr || err?.stdout || err?.message || 'Failed').slice(-1500),
        });
      }
    }

    return checks;
  }
}
