import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';

export interface TerminalExecutionRecord {
  id: string;
  sessionId: string;
  command: string;
  cwd: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  exitCode: number | null;
  startedAt: string;
  finishedAt?: string;
  stdout: string;
  stderr: string;
}

const DANGEROUS_PATTERNS = [
  /\bformat\s+[a-z]:/i,
  /\brm\s+-rf\s+[\/\\]/i,
  /\bdel\s+\/[sfq]\s+c:\\windows/i,
  /\bdrop\s+database\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /:(){ :|:& };:/, // fork bomb
];

export class TerminalService {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private executionHistory: Map<string, TerminalExecutionRecord[]> = new Map();

  async executeCommand(params: {
    sessionId: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
    actorId?: string;
  }): Promise<TerminalExecutionRecord> {
    const { sessionId, command } = params;
    const timeoutMs = params.timeoutMs || 300000; // 5 min default
    const cwd = params.cwd ? path.resolve(params.cwd) : path.resolve(process.cwd());

    // Security check against destructive system commands
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(`Command blocked by security policy: matches dangerous pattern '${pattern.source}'`);
      }
    }

    const executionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record: TerminalExecutionRecord = {
      id: executionId,
      sessionId,
      command,
      cwd,
      status: 'RUNNING',
      exitCode: null,
      startedAt: new Date().toISOString(),
      stdout: '',
      stderr: '',
    };

    if (!this.executionHistory.has(sessionId)) {
      this.executionHistory.set(sessionId, []);
    }
    this.executionHistory.get(sessionId)!.push(record);

    socketServer.emit('terminal:start', {
      sessionId,
      executionId,
      command,
      cwd,
      startedAt: record.startedAt,
    });

    return new Promise<TerminalExecutionRecord>((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];

      const child = spawn(shell, shellArgs, {
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          CODYNEX_OS_AGENT: 'true',
        },
      });

      this.activeProcesses.set(executionId, child);

      const timer = setTimeout(() => {
        if (record.status === 'RUNNING') {
          record.status = 'FAILED';
          record.stderr += '\n[ERROR] Command timed out after ' + timeoutMs + 'ms';
          child.kill('SIGKILL');
        }
      }, timeoutMs);

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8');
        record.stdout += chunk;
        if (record.stdout.length > 500000) record.stdout = record.stdout.slice(-500000);

        socketServer.emit('terminal:output', {
          sessionId,
          executionId,
          stream: 'stdout',
          chunk,
          timestamp: new Date().toISOString(),
        });
      });

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8');
        record.stderr += chunk;
        if (record.stderr.length > 500000) record.stderr = record.stderr.slice(-500000);

        socketServer.emit('terminal:output', {
          sessionId,
          executionId,
          stream: 'stderr',
          chunk,
          timestamp: new Date().toISOString(),
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(executionId);
        record.finishedAt = new Date().toISOString();
        record.exitCode = code;
        if (record.status === 'RUNNING') {
          record.status = code === 0 ? 'COMPLETED' : 'FAILED';
        }

        socketServer.emit('terminal:exit', {
          sessionId,
          executionId,
          status: record.status,
          exitCode: code,
          finishedAt: record.finishedAt,
        });

        resolve(record);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(executionId);
        record.finishedAt = new Date().toISOString();
        record.status = 'FAILED';
        record.stderr += `\n[SPAWN ERROR] ${err.message}`;

        socketServer.emit('terminal:exit', {
          sessionId,
          executionId,
          status: 'FAILED',
          error: err.message,
          finishedAt: record.finishedAt,
        });

        resolve(record);
      });
    });
  }

  cancelCommand(executionId: string): boolean {
    const child = this.activeProcesses.get(executionId);
    if (child) {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2000);
      this.activeProcesses.delete(executionId);
      return true;
    }
    return false;
  }

  getHistory(sessionId: string): TerminalExecutionRecord[] {
    return this.executionHistory.get(sessionId) || [];
  }
}

export const terminalService = new TerminalService();
