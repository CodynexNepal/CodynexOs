import { browserService } from './browser.service';
import { terminalService } from './terminal.service';
import { WorkspaceService } from './workspace.service';
import { verificationGateService } from './verification-gate.service';
import { ModelRouterService } from '../ai/router/model-router.service';
import { socketServer } from '../socket/socket.server';
import { dotEnvConfig } from '../configs/envConfig';
import { logger } from '../utils/logger.util';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentActionStep {
  stepIndex: number;
  thought: string;
  tool: string;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  status: 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'FAILED';
  durationMs?: number;
  timestamp: string;
}

export interface AgentSessionExecution {
  sessionId: string;
  taskId: string;
  status: 'IDLE' | 'PLANNING' | 'RUNNING' | 'WAITING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStep: number;
  maxSteps: number;
  steps: AgentActionStep[];
  startedAt: string;
  completedAt?: string;
  finalAnswer?: string;
  filesWritten?: string[];
  error?: string;
}

export class AgentExecutionService {
  private sessions: Map<string, AgentSessionExecution> = new Map();
  private pausedSessions: Set<string> = new Set();
  private cancelledSessions: Set<string> = new Set();

  constructor(
    private readonly modelRouter = new ModelRouterService(),
    private readonly workspaceService = new WorkspaceService(),
  ) {}

  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'browser_navigate',
        description: 'Navigate the live browser to a specific URL and observe the page.',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      },
      {
        name: 'browser_click',
        description: 'Click a button, link, or interactive element on the current browser page.',
        parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
      },
      {
        name: 'browser_type',
        description: 'Type text into an input field or textarea on the current browser page.',
        parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] },
      },
      {
        name: 'browser_scroll',
        description: 'Scroll the browser viewport UP or DOWN.',
        parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['UP', 'DOWN'] }, amount: { type: 'number' } }, required: ['direction'] },
      },
      {
        name: 'browser_extract',
        description: 'Extract text and HTML content from the current active page.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'terminal_execute',
        description: 'Execute a shell command inside the repository workspace (e.g. npm test, git status, ls).',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      },
      {
        name: 'file_read',
        description: 'Read the contents of a file in the workspace.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
      {
        name: 'file_write',
        description: 'Create or overwrite a source file in the repository workspace.',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      },
      {
        name: 'file_list',
        description: 'List files and directories in the repository workspace with Git status badges.',
        parameters: { type: 'object', properties: { subPath: { type: 'string' } } },
      },
      {
        name: 'git_diff',
        description: 'Inspect the git diff of changes made so far.',
        parameters: { type: 'object', properties: { statOnly: { type: 'boolean' } } },
      },
      {
        name: 'qa_verify_release',
        description: 'Run the 7 quality release gates (typecheck, tests, browser validation, security scan, diff review, acceptance sign-off) and generate a verified release certificate.',
        parameters: { type: 'object', properties: { previewUrl: { type: 'string' } } },
      },
      {
        name: 'task_complete',
        description: 'Finish the task and return the final verified report or answer.',
        parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
      },
    ];
  }

  async runAgentLoop(params: {
    sessionId: string;
    taskId: string;
    instruction: string;
    roleTitle: string;
    owner?: string;
    repoName?: string;
    maxSteps?: number;
    preferredProvider?: string;
    preferredModel?: string;
  }): Promise<AgentSessionExecution> {
    const { sessionId, taskId, instruction, roleTitle, owner = 'organization', repoName = 'workspace', preferredProvider, preferredModel } = params;
    const maxSteps = params.maxSteps || 15;
    const effectiveProvider =
      preferredProvider ||
      (dotEnvConfig.GROQ_API_KEY ? 'groq' : dotEnvConfig.GEMINI_API_KEY ? 'gemini' : undefined);

    const session: AgentSessionExecution = {
      sessionId,
      taskId,
      status: 'PLANNING',
      currentStep: 0,
      maxSteps,
      steps: [],
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.pausedSessions.delete(sessionId);
    this.cancelledSessions.delete(sessionId);

    socketServer.emit('agent:lifecycle', {
      sessionId,
      taskId,
      status: 'PLANNING',
      roleTitle,
      instruction,
      startedAt: session.startedAt,
    });

    const tools = this.getToolDefinitions();
    const systemPrompt = `You are ${roleTitle}, an autonomous AI software engineer and computer operating agent inside CodyNex OS.
You possess real computer capabilities: operating browsers, executing terminal commands, reading and writing files.
You MUST operate iteratively:
1. Reason about the current state.
2. Select ONE tool to execute.
3. Observe the tool output and page/terminal state.
4. When your goal is completely satisfied, invoke 'task_complete' with your final summary.

Output strictly valid JSON with this shape:
{
  "thought": "Your concise step-by-step reasoning",
  "tool": "name_of_tool",
  "toolInput": { ...arguments matching the tool definition }
}

Available tools:
${tools.map((t) => `- ${t.name}: ${t.description} (params: ${JSON.stringify(t.parameters)})`).join('\n')}`;

    let contextHistory = `Initial User Task: ${instruction}\nTarget Workspace: ${owner}/${repoName}\n`;
    session.status = 'RUNNING';
    const filesWrittenSet = new Set<string>();

    while (session.currentStep < maxSteps) {
      // Check cancellation
      if (this.cancelledSessions.has(sessionId)) {
        session.status = 'CANCELLED';
        break;
      }

      // Check pause
      while (this.pausedSessions.has(sessionId)) {
        session.status = 'PAUSED';
        socketServer.emit('agent:lifecycle', { sessionId, taskId, status: 'PAUSED' });
        await new Promise((r) => setTimeout(r, 1000));
      }

      session.status = 'RUNNING';
      session.currentStep++;

      socketServer.emit('agent:thinking', {
        sessionId,
        taskId,
        step: session.currentStep,
        maxSteps,
        timestamp: new Date().toISOString(),
      });

      let aiResponse: any;
      try {
        aiResponse = await this.modelRouter.complete(
          {
            systemPrompt,
            userPrompt: `Current Execution Context & History:\n${contextHistory}\nDecide the next action or complete the task. Return JSON.`,
            responseFormat: 'json',
            maxOutputTokens: 2048,
          },
          { taskId, preferredProvider: effectiveProvider, preferredModel, agentRole: roleTitle },
        );
      } catch (err: any) {
        logger.error('Agent reasoning step error', { error: err.message, taskId });
        contextHistory += `\n[Agent Inference Error: ${err.message}. Retrying action...]`;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const parsed: { thought?: string; tool?: string; toolInput?: Record<string, unknown> } = (() => {
        try {
          return JSON.parse(aiResponse.content);
        } catch {
          return { thought: 'Reviewing next step', tool: 'task_complete', toolInput: { summary: aiResponse.content } };
        }
      })();

      const thought = parsed.thought || 'Executing tool';
      const toolName = parsed.tool || 'task_complete';
      const toolInput = parsed.toolInput || {};

      const stepRecord: AgentActionStep = {
        stepIndex: session.currentStep,
        thought,
        tool: toolName,
        toolInput,
        status: 'EXECUTING',
        timestamp: new Date().toISOString(),
      };

      session.steps.push(stepRecord);

      socketServer.emit('agent:tool_started', {
        sessionId,
        taskId,
        step: session.currentStep,
        thought,
        tool: toolName,
        toolInput,
        timestamp: stepRecord.timestamp,
      });

      if (toolName === 'task_complete') {
        stepRecord.status = 'SUCCESS';
        stepRecord.toolOutput = toolInput.summary || 'Task completed successfully.';
        session.finalAnswer = String(stepRecord.toolOutput);
        session.status = 'COMPLETED';
        break;
      }

      if (toolName === 'file_write' && toolInput.path) {
        filesWrittenSet.add(String(toolInput.path));
      }

      // Execute real tool
      const startMs = Date.now();
      let toolResult: unknown;
      try {
        toolResult = await this.dispatchTool(toolName, toolInput, { sessionId, owner, repoName });
        stepRecord.status = 'SUCCESS';
        stepRecord.toolOutput = toolResult;
      } catch (err: any) {
        stepRecord.status = 'FAILED';
        stepRecord.toolOutput = { error: err.message };
        toolResult = `Error: ${err.message}`;
      }
      stepRecord.durationMs = Date.now() - startMs;

      socketServer.emit('agent:tool_completed', {
        sessionId,
        taskId,
        step: session.currentStep,
        tool: toolName,
        output: toolResult,
        status: stepRecord.status,
        durationMs: stepRecord.durationMs,
        timestamp: new Date().toISOString(),
      });

      // Append observation to context
      contextHistory += `\nStep ${session.currentStep} Tool [${toolName}] Input: ${JSON.stringify(toolInput)}\nObservation: ${
        typeof toolResult === 'string' ? toolResult.slice(0, 2000) : JSON.stringify(toolResult).slice(0, 2000)
      }\n`;

      // Bound context window to keep inference lean and ultra-responsive
      if (contextHistory.length > 8000) {
        const lines = contextHistory.split('\n');
        const header = lines.slice(0, 3).join('\n');
        const recent = lines.slice(-25).join('\n');
        contextHistory = `${header}\n... [earlier steps truncated for speed] ...\n${recent}`;
      }
    }

    session.filesWritten = Array.from(filesWrittenSet);

    if (session.status !== 'COMPLETED' && session.status !== 'CANCELLED') {
      session.status = session.currentStep >= maxSteps ? 'COMPLETED' : 'FAILED';
    }

    // If finalAnswer was not set by task_complete, synthesize an in-depth executive debrief
    if (!session.finalAnswer) {
      try {
        const debriefRes = await this.modelRouter.complete(
          {
            systemPrompt:
              'You are a Principal Software Architect synthesizing an executive deliverable debrief of an autonomous AI engineering run.',
            userPrompt: `Autonomous Task Session Completed.
Task: "${instruction}"
Target Workspace: "${owner}/${repoName}"
Total Steps: ${session.currentStep} of ${maxSteps}
Files Written: ${session.filesWritten.length > 0 ? session.filesWritten.join(', ') : 'None'}

Actions Log:
${session.steps
  .map(
    (s) =>
      `- Step ${s.stepIndex} [${s.tool}] ${s.thought} -> ${
        typeof s.toolOutput === 'string'
          ? s.toolOutput.slice(0, 150)
          : JSON.stringify(s.toolOutput).slice(0, 150)
      }`,
  )
  .join('\n')}

Generate a comprehensive Executive Deliverables Report in markdown:
### 1. Executive Summary
(Clear summary of what was accomplished, verified, or diagnosed)

### 2. Actions & Tools Breakdown
(What specific commands, browser checks, or file edits were executed)

### 3. Deliverables & Files Changed
(List files modified or created. If 0 files were changed, state why and identify the roadblocks)

### 4. Next Recommended Steps
(What the human operator or agent should do next)`,
            maxOutputTokens: 2048,
          },
          { taskId, preferredProvider: effectiveProvider, preferredModel, agentRole: roleTitle },
        );
        session.finalAnswer = debriefRes.content;
      } catch {
        session.finalAnswer = `Autonomous run completed after ${session.currentStep} steps across tools: ${session.steps
          .map((s) => s.tool)
          .join(', ')}. Files modified: ${session.filesWritten.length > 0 ? session.filesWritten.join(', ') : 'None'}.`;
      }
    }

    session.completedAt = new Date().toISOString();
    socketServer.emit('agent:lifecycle', {
      sessionId,
      taskId,
      status: session.status,
      completedAt: session.completedAt,
      finalAnswer: session.finalAnswer,
      filesWritten: session.filesWritten,
    });

    return session;
  }

  private async dispatchTool(
    toolName: string,
    input: Record<string, any>,
    context: { sessionId: string; owner: string; repoName: string },
  ): Promise<unknown> {
    const { sessionId, owner, repoName } = context;

    switch (toolName) {
      case 'browser_navigate': {
        const state = await browserService.navigate(sessionId, String(input.url));
        return { url: state.url, title: state.title, status: 'Navigated successfully' };
      }
      case 'browser_click': {
        const state = await browserService.click(sessionId, String(input.selector));
        return { url: state.url, title: state.title, status: `Clicked ${input.selector}` };
      }
      case 'browser_type': {
        await browserService.type(sessionId, String(input.selector), String(input.text));
        return { status: `Typed text into ${input.selector}` };
      }
      case 'browser_scroll': {
        await browserService.scroll(sessionId, input.direction === 'UP' ? 'UP' : 'DOWN', input.amount || 400);
        return { status: `Scrolled ${input.direction}` };
      }
      case 'browser_extract': {
        const content = await browserService.extractContent(sessionId);
        return { url: content.url, title: content.title, snippet: content.text.slice(0, 1500) };
      }
      case 'terminal_execute': {
        const repoDir = this.workspaceService.getRepoDir(owner, repoName);
        const record = await terminalService.executeCommand({
          sessionId,
          command: String(input.command),
          cwd: repoDir,
        });
        return {
          exitCode: record.exitCode,
          stdout: record.stdout.slice(0, 3000),
          stderr: record.stderr.slice(0, 1000),
        };
      }
      case 'file_read': {
        const content = await this.workspaceService.readFile(owner, repoName, String(input.path));
        return { path: input.path, content };
      }
      case 'file_write': {
        const written = await this.workspaceService.writeFiles(owner, repoName, [
          { path: String(input.path), content: String(input.content) },
        ]);
        return { written };
      }
      case 'file_list': {
        const entries = await this.workspaceService.listTree(owner, repoName, String(input.subPath || ''));
        return { count: entries.length, files: entries.map((e) => ({ name: e.name, type: e.type, gitStatus: e.gitStatus })) };
      }
      case 'git_diff': {
        const cmd = input.statOnly ? 'git diff --stat' : 'git diff HEAD';
        const res = await this.workspaceService.executeTerminalCommand({
          owner,
          name: repoName,
          command: cmd,
        });
        return { diff: (res.stdout || 'No diff detected').slice(0, 4000) };
      }
      case 'qa_verify_release': {
        const cert = await verificationGateService.evaluateReleaseGates({
          owner,
          name: repoName,
          previewUrl: input.previewUrl ? String(input.previewUrl) : undefined,
        });
        return {
          certificateId: cert.certificateId,
          verdict: cert.verdict,
          compositeScore: cert.compositeScore,
          gatesPassed: `${cert.gatesPassed}/${cert.totalGates}`,
          summary: cert.summary,
        };
      }
      default:
        throw new Error(`Unsupported tool '${toolName}'`);
    }
  }

  pauseSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.pausedSessions.add(sessionId);
      void browserService.setHumanTakeover(sessionId, true);
      return true;
    }
    return false;
  }

  resumeSession(sessionId: string): boolean {
    if (this.pausedSessions.has(sessionId)) {
      this.pausedSessions.delete(sessionId);
      void browserService.setHumanTakeover(sessionId, false);
      return true;
    }
    return false;
  }

  cancelSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.cancelledSessions.add(sessionId);
      this.pausedSessions.delete(sessionId);
      return true;
    }
    return false;
  }

  getSession(sessionId: string): AgentSessionExecution | null {
    return this.sessions.get(sessionId) || null;
  }
}

export const agentExecutionService = new AgentExecutionService();
