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

export interface BranchPushResult {
  commitSha: string;
  branchName: string;
  commitsCount: number;
  changedFiles: string[];
  isInitialBootstrap?: boolean;
}

export interface TerminalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  branch: string;
}

function parseCommandLine(cmd: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes: '' | "'" | '"' = '';
  let escapeNext = false;

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i]!;

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (inQuotes) {
      if (char === inQuotes) {
        inQuotes = '';
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuotes = char;
    } else if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
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
    const isNetworkCmd = args.some((a) => ['clone', 'pull', 'push', 'fetch'].includes(a));
    if (token && isNetworkCmd) {
      const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
      finalArgs.unshift(
        '-c',
        'credential.helper=',
        '-c',
        `http.extraheader=Authorization: Basic ${basic}`,
      );
    }

    try {
      const result = await execFileAsync('git', finalArgs, {
        cwd,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_CEILING_DIRECTORIES: this.rootDir,
        },
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (err: any) {
      const stderr = String(err?.stderr || err?.stdout || err?.message || 'Git command failed')
        .replace(/basic\s+[A-Za-z0-9+/=]+/gi, 'basic [REDACTED]')
        .replace(/github_pat_[A-Za-z0-9_]+/gi, 'github_pat_[REDACTED]')
        .replace(/ghp_[A-Za-z0-9_]+/gi, 'ghp_[REDACTED]');

      if (/403|Permission to .* denied/i.test(stderr)) {
        throw ApiError.forbidden(
          `[CONTENTS_WRITE_PERMISSION_MISSING] GitHub denied push/write access (HTTP 403). Verify that your Fine-Grained PAT has 'Contents: Read & write' and 'Pull requests: Read & write' permissions, or that your Classic PAT has 'repo' scope. Details: ${stderr}`,
        );
      }
      if (/protected branch|branch protection/i.test(stderr)) {
        throw ApiError.forbidden(
          `[BRANCH_PROTECTION_RESTRICTION] GitHub rejected push due to branch protection rules: ${stderr}`,
        );
      }
      if (/\[rejected\]|non-fast-forward|fetch first/i.test(stderr)) {
        throw ApiError.conflict(
          `[GIT_PUSH_REJECTED] GitHub rejected push because remote branch contains work that you do not have locally (non-fast-forward). Fetch and rebase before pushing: ${stderr}`,
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

    let isValidGit = false;
    if (exists) {
      try {
        const { stdout } = await this.runGit(repoDir, ['rev-parse', '--git-dir']);
        isValidGit = stdout.trim() === '.git' || stdout.trim().replace(/\\/g, '/').endsWith('/.git');
      } catch {
        isValidGit = false;
      }
    }

    if (!exists || !isValidGit) {
      await fs.mkdir(repoDir, { recursive: true });
      const entries = await fs.readdir(repoDir).catch(() => []);
      const nonGitEntries = entries.filter((f) => f !== '.git');

      if (nonGitEntries.length > 0) {
        if (exists && !isValidGit) {
          await fs.rm(gitDir, { recursive: true, force: true }).catch(() => {});
        }
        await this.runGit(repoDir, ['init', '-b', params.defaultBranch || 'main']);
        await this.runGit(repoDir, ['remote', 'add', 'origin', remoteUrl]).catch(async () => {
          await this.runGit(repoDir, ['remote', 'set-url', 'origin', remoteUrl]);
        });
        await this.runGit(repoDir, ['config', 'user.name', 'CodyNex OS Engineering']);
        await this.runGit(repoDir, ['config', 'user.email', 'engineering@codynex.local']);
        await this.runGit(repoDir, ['fetch', 'origin'], params.token).catch(() => {});
        return { repoDir, action: 'cloned' };
      } else {
        await fs.rm(repoDir, { recursive: true, force: true }).catch(() => {});
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
    }

    // Ensure origin URL points strictly to this repository
    const remoteUrlRes = await this.runGit(repoDir, ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }));
    if (!remoteUrlRes.stdout.includes(params.name)) {
      await this.runGit(repoDir, ['remote', 'set-url', 'origin', remoteUrl]).catch(() => {});
    }

    await this.runGit(repoDir, ['fetch', 'origin'], params.token).catch(() => {});
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

    // Check whether repository has any commits at all (empty/unborn repo handling)
    const hasCommits = await this.runGit(repoDir, ['rev-parse', '--verify', 'HEAD']).then(
      () => true,
      () => false,
    );
    if (!hasCommits) {
      await this.runGit(repoDir, ['checkout', '-B', clean]);
      return;
    }

    // Check current branch and dirty working tree status
    const currentBranchRes = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(
      () => ({ stdout: '' }),
    );
    const currentBranch = currentBranchRes.stdout.trim();
    if (currentBranch === clean) {
      return;
    }

    const statusRes = await this.runGit(repoDir, ['status', '--porcelain']).catch(() => ({ stdout: '' }));
    const hasUncommitted = Boolean(statusRes.stdout.trim());

    const { stdout: branchList } = await this.runGit(repoDir, ['branch', '--list', clean]);
    const branchExists = Boolean(branchList.trim());

    if (hasUncommitted) {
      // Stash uncommitted changes to transfer them cleanly across branch checkout
      await this.runGit(repoDir, ['stash', 'push', '-u', '-m', `codynex_transfer_${Date.now()}`]);
      try {
        if (branchExists) {
          await this.runGit(repoDir, ['checkout', clean]);
        } else {
          await this.runGit(repoDir, ['checkout', '-b', clean]);
        }
      } finally {
        await this.runGit(repoDir, ['stash', 'pop']).catch(() => {});
      }
    } else {
      if (branchExists) {
        await this.runGit(repoDir, ['checkout', clean]);
      } else {
        await this.runGit(repoDir, ['checkout', '-b', clean]);
      }
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

  async stageAndCommit(
    owner: string,
    name: string,
    branchName: string,
    commitMessage: string,
  ): Promise<{ committed: boolean; commitSha?: string }> {
    const clean = branchName.trim();
    const repoDir = this.getRepoDir(owner, name);
    if (clean && clean !== 'main' && clean !== 'master') {
      const curBranch = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: '' }));
      if (curBranch.stdout.trim() !== clean) {
        await this.checkoutBranch(owner, name, clean, 'main').catch(() => {});
      }
    }
    await this.runGit(repoDir, ['config', 'user.name', 'CodyNex OS Engineering']).catch(() => {});
    await this.runGit(repoDir, ['config', 'user.email', 'engineering@codynex.local']).catch(() => {});
    await this.runGit(repoDir, ['add', '-A']);
    const status = await this.runGit(repoDir, ['status', '--porcelain']);
    if (!status.stdout.trim()) {
      return { committed: false };
    }
    await this.runGit(repoDir, ['commit', '-m', commitMessage || `chore: update ${clean}`]);
    const sha = await this.runGit(repoDir, ['rev-parse', 'HEAD']);
    return { committed: true, commitSha: sha.stdout.trim() };
  }

  async commitAndPushBranch(params: {
    owner: string;
    name: string;
    branchName: string;
    defaultBranch: string;
    commitMessage: string;
    token: string;
  }): Promise<BranchPushResult> {
    const clean = params.branchName.trim();
    if (!clean || clean === params.defaultBranch || clean === 'main' || clean === 'master') {
      throw ApiError.forbidden('Direct push to the production/default branch is prohibited.');
    }
    const repoDir = this.getRepoDir(params.owner, params.name);

    // Fetch latest remote refs with retry to guarantee up-to-date tracking information
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.runGit(repoDir, ['fetch', 'origin'], params.token);
        break;
      } catch {
        // If fetch fails after retries, proceed with local refs
      }
    }

    // Safely transfer any accidental commits from local default branch to feature branch
    const hasDefaultRemote = await this.runGit(repoDir, [
      'rev-parse',
      '--verify',
      `origin/${params.defaultBranch}`,
    ]).then(
      () => true,
      () => false,
    );

    if (hasDefaultRemote) {
      const currentBranchRes = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(
        () => ({ stdout: '' }),
      );
      const currentBranch = currentBranchRes.stdout.trim();

      const defaultAhead = await this.runGit(repoDir, [
        'log',
        `origin/${params.defaultBranch}..${params.defaultBranch}`,
        '--oneline',
      ]).catch(() => ({ stdout: '' }));

      if (defaultAhead.stdout.trim()) {
        if (currentBranch === params.defaultBranch) {
          // Commits were accidentally committed to local default branch;
          // Switch to or create clean branch to preserve commits
          await this.runGit(repoDir, ['checkout', '-b', clean]).catch(async () => {
            await this.runGit(repoDir, ['checkout', clean]);
          });
          // Safely reset local default branch back to origin tracking ref
          await this.runGit(repoDir, ['branch', '-f', params.defaultBranch, `origin/${params.defaultBranch}`]);
        } else {
          // Current branch is already the feature branch or another branch;
          // safely reset local defaultBranch to match origin without touching the checked out worktree
          await this.runGit(repoDir, ['branch', '-f', params.defaultBranch, `origin/${params.defaultBranch}`]).catch(() => {});
        }
      }
    }

    // Switch to isolated feature branch
    await this.checkoutBranch(params.owner, params.name, clean, params.defaultBranch);

    // Stage and commit all uncommitted changes
    await this.runGit(repoDir, ['add', '-A']);
    const status = await this.runGit(repoDir, ['status', '--porcelain']);
    if (status.stdout.trim()) {
      await this.runGit(repoDir, ['commit', '-m', params.commitMessage]);
    }

    // Handle empty remote repository bootstrap
    let isInitialBootstrap = false;
    if (!hasDefaultRemote) {
      const hasLocalCommits = await this.runGit(repoDir, ['rev-parse', '--verify', 'HEAD']).then(
        () => true,
        () => false,
      );
      if (!hasLocalCommits) {
        throw ApiError.badRequest(
          `Repository '${params.owner}/${params.name}' is empty and no files were committed. Please create files in the workspace before pushing.`,
        );
      }
      // Initialize remote default branch with initial commit so base branch exists on GitHub
      await this.runGit(repoDir, ['push', '-u', 'origin', `HEAD:${params.defaultBranch}`], params.token);
      isInitialBootstrap = true;
    }

    // Check if remote feature branch already exists
    const remoteBranches = await this.runGit(repoDir, [
      'branch',
      '-r',
      '--list',
      `origin/${clean}`,
    ]).catch(() => ({ stdout: '' }));

    if (remoteBranches.stdout.trim() && !isInitialBootstrap) {
      try {
        await this.runGit(repoDir, ['pull', '--rebase', 'origin', clean], params.token);
      } catch (rebaseErr: any) {
        // In case of conflict, cleanly abort rebase to preserve workspace integrity
        await this.runGit(repoDir, ['rebase', '--abort']).catch(() => {});
        throw ApiError.conflict(
          `[GIT_MERGE_CONFLICT] Cannot push branch '${clean}': remote branch contains conflicting changes. Rebase was aborted cleanly to protect workspace: ${rebaseErr.message}`,
        );
      }
    }

    if (hasDefaultRemote && !isInitialBootstrap) {
      // Rebase on top of latest remote default branch to guarantee the branch is ahead and not behind
      try {
        await this.runGit(repoDir, ['rebase', `origin/${params.defaultBranch}`]);
      } catch {
        await this.runGit(repoDir, ['rebase', '--abort']).catch(() => {});
      }
    }

    // Verify branch has unique commits compared to the remote default branch
    let commitsCount: number;
    let changedFiles: string[];

    if (hasDefaultRemote && !isInitialBootstrap) {
      const logAhead = await this.runGit(repoDir, [
        'log',
        `origin/${params.defaultBranch}..HEAD`,
        '--oneline',
      ]).catch(() => ({ stdout: '' }));

      const lines = logAhead.stdout.trim().split('\n').filter(Boolean);
      commitsCount = lines.length;

      if (commitsCount === 0) {
        throw ApiError.badRequest(
          `Cannot create Pull Request: branch '${clean}' has no unique commits compared to '${params.defaultBranch}'. Please edit or create files in the workspace before pushing.`,
        );
      }

      const diffRes = await this.runGit(repoDir, [
        'diff',
        '--name-only',
        `origin/${params.defaultBranch}...HEAD`,
      ]).catch(() => ({ stdout: '' }));
      changedFiles = diffRes.stdout.trim().split('\n').filter(Boolean);
    } else {
      commitsCount = 1;
      const filesRes = await this.runGit(repoDir, ['diff', '--name-only', 'HEAD~1...HEAD']).catch(
        () => ({ stdout: '' }),
      );
      changedFiles = filesRes.stdout.trim().split('\n').filter(Boolean);
    }

    // Push feature branch to origin
    const shaRes = await this.runGit(repoDir, ['rev-parse', 'HEAD']);
    try {
      await this.runGit(repoDir, ['push', '-u', 'origin', clean], params.token);
    } catch {
      await this.runGit(repoDir, ['push', '--force-with-lease', '-u', 'origin', clean], params.token);
    }

    return {
      commitSha: shaRes.stdout.trim(),
      branchName: clean,
      commitsCount,
      changedFiles,
      isInitialBootstrap,
    };
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

  async executeTerminalCommand(params: {
    owner: string;
    name: string;
    command: string;
    token?: string;
  }): Promise<TerminalCommandResult> {
    const repoDir = this.getRepoDir(params.owner, params.name);
    const trimmed = params.command.trim();

    if (!trimmed) {
      return { stdout: '', stderr: '', exitCode: 0, branch: '' };
    }

    const tokens = parseCommandLine(trimmed);
    if (tokens.length === 0) {
      return { stdout: '', stderr: '', exitCode: 0, branch: '' };
    }

    const curBranchRes = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(
      () => ({ stdout: 'unknown' }),
    );
    const currentBranch = curBranchRes.stdout.trim();

    const allowedSubcommands = new Set([
      'status',
      'add',
      'commit',
      'diff',
      'log',
      'branch',
      'checkout',
      'switch',
      'push',
      'pull',
      'fetch',
      'show',
      'stash',
      'rev-parse',
      'reset',
      'restore',
      'merge',
      'rebase',
      'remote',
      'tag',
      'clean',
    ]);

    const rawProgram = tokens[0];
    if (!rawProgram) {
      return { stdout: '', stderr: '', exitCode: 0, branch: currentBranch };
    }

    let program = rawProgram.toLowerCase();
    let args = tokens.slice(1);

    if (allowedSubcommands.has(program)) {
      args = [program, ...args];
      program = 'git';
    }

    if (program === 'pwd') {
      return { stdout: repoDir, stderr: '', exitCode: 0, branch: currentBranch };
    }

    if (program === 'ls' || program === 'dir') {
      try {
        const files = await fs.readdir(repoDir);
        return {
          stdout: files.join('\n'),
          stderr: '',
          exitCode: 0,
          branch: currentBranch,
        };
      } catch (err: any) {
        return {
          stdout: '',
          stderr: err.message || 'Failed to list directory',
          exitCode: 1,
          branch: currentBranch,
        };
      }
    }

    if (program !== 'git') {
      return {
        stdout: '',
        stderr: `Command '${program}' not recognized. Permitted commands: git, ls, dir, pwd.`,
        exitCode: 1,
        branch: currentBranch,
      };
    }

    const rawSubCmd = args[0];
    if (!rawSubCmd) {
      return {
        stdout: 'usage: git [--version] [--help] [-C <path>] [-c <name>=<value>] <command> [<args>]',
        stderr: '',
        exitCode: 0,
        branch: currentBranch,
      };
    }

    const subCmd = rawSubCmd.toLowerCase();
    if (!allowedSubcommands.has(subCmd)) {
      return {
        stdout: '',
        stderr: `git subcommand '${subCmd}' is not permitted in workspace terminal. Allowed subcommands: ${Array.from(allowedSubcommands).join(', ')}`,
        exitCode: 1,
        branch: currentBranch,
      };
    }

    for (const arg of args) {
      if (arg === '-i' || arg === '--interactive') {
        return {
          stdout: '',
          stderr: 'Interactive modes are not supported in terminal commands.',
          exitCode: 1,
          branch: currentBranch,
        };
      }
    }

    await this.runGit(repoDir, ['config', 'user.name', 'CodyNex OS Operator']).catch(() => {});
    await this.runGit(repoDir, ['config', 'user.email', 'operator@codynex.local']).catch(() => {});

    const gitArgs = ['--no-pager', ...args];

    try {
      const res = await this.runGit(repoDir, gitArgs, params.token);
      const afterBranch = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({
        stdout: currentBranch,
      }));
      return {
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: 0,
        branch: afterBranch.stdout.trim(),
      };
    } catch (err: any) {
      const afterBranch = await this.runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({
        stdout: currentBranch,
      }));
      const rawMsg = err?.cause?.stderr || err?.stderr || err?.stdout || err?.message || String(err);
      return {
        stdout: err?.stdout ? String(err.stdout) : '',
        stderr: String(rawMsg),
        exitCode: typeof err?.code === 'number' ? err.code : 1,
        branch: afterBranch.stdout.trim(),
      };
    }
  }
}
