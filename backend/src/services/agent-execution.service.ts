import fs from 'fs';
import path from 'path';
import { browserService } from './browser.service';
import { terminalService } from './terminal.service';
import { WorkspaceService } from './workspace.service';
import { verificationGateService } from './verification-gate.service';
import { ModelRouterService } from '../ai/router/model-router.service';
import { socketServer } from '../socket/socket.server';
import { dotEnvConfig } from '../configs/envConfig';
import { logger } from '../utils/logger.util';
import { sopLearningService } from './sop-learning.service';

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
  instruction?: string;
  roleTitle?: string;
  owner?: string;
  repoName?: string;
  effectiveProvider?: string;
  preferredModel?: string;
  contextHistory?: string;
  filesWrittenSet?: Set<string>;
}

export class AgentExecutionService {
  private sessions: Map<string, AgentSessionExecution> = new Map();
  private pausedSessions: Set<string> = new Set();
  private cancelledSessions: Set<string> = new Set();
  private storagePath = path.join(process.cwd(), 'workspaces', '.agent_sessions', 'sessions.json');

  constructor(
    private readonly modelRouter = new ModelRouterService(),
    private readonly workspaceService = new WorkspaceService(),
  ) {
    this.loadSessionsFromDisk();
  }

  private loadSessionsFromDisk() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list = JSON.parse(raw) as AgentSessionExecution[];
        if (Array.isArray(list)) {
          for (const s of list) {
            s.filesWrittenSet = new Set(s.filesWritten || []);
            this.sessions.set(s.sessionId, s);
          }
          logger.info('Loaded persistent agent sessions from disk', { count: list.length });
        }
      }
    } catch (err: any) {
      logger.warn('Could not load persistent agent sessions from disk', { error: err.message });
    }
  }

  private persistSessionsToDisk() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.sessions.values()).map((s) => ({
        ...s,
        filesWritten: Array.from(s.filesWrittenSet || []),
        filesWrittenSet: undefined,
      }));
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err: any) {
      logger.warn('Could not persist agent sessions to disk', { error: err.message });
    }
  }

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
        description: 'Type text into an input field or contenteditable element on the browser page (supports Enter to send message/search).',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector, label, or search identifier' },
            text: { type: 'string', description: 'Text to type' },
            pressEnter: { type: 'boolean', description: 'Set true to press Enter immediately after typing (e.g. to send chat message or trigger search)' },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'browser_press_key',
        description: 'Press a keyboard key in the active browser window (e.g. "Enter" to submit or send a WhatsApp message, "Escape", "Tab", "ArrowDown").',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Key name (e.g. "Enter", "Tab", "Escape")' },
          },
          required: ['key'],
        },
      },
      {
        name: 'browser_scroll',
        description: 'Scroll the browser viewport UP or DOWN.',
        parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['UP', 'DOWN'] }, amount: { type: 'number' } }, required: ['direction'] },
      },
      {
        name: 'browser_extract',
        description: 'Extract visible text, page title, and interactive DOM elements (buttons, inputs, search fields, contenteditable textboxes) with exact selectors from the active browser page.',
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
    const maxSteps = params.maxSteps || 30; // 30 rapid steps to ensure full task completion within 4 minutes
    const effectiveProvider =
      preferredProvider ||
      (dotEnvConfig.GROQ_API_KEY ? 'groq' : dotEnvConfig.OPENCODE_API_KEY ? 'opencode' : dotEnvConfig.GEMINI_API_KEY ? 'gemini' : 'groq');

    let contextHistory = `Initial User Task: ${instruction}\n`;
    if (owner && repoName && owner !== 'organization' && owner !== 'workspace' && repoName !== 'workspace') {
      contextHistory += `Target Workspace: ${owner}/${repoName}\n`;
    }

    const session: AgentSessionExecution = {
      sessionId,
      taskId,
      status: 'PLANNING',
      currentStep: 0,
      maxSteps,
      steps: [],
      startedAt: new Date().toISOString(),
      instruction,
      roleTitle,
      owner,
      repoName,
      effectiveProvider,
      preferredModel,
      contextHistory,
      filesWrittenSet: new Set<string>(),
    };

    this.sessions.set(sessionId, session);
    this.persistSessionsToDisk();
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

    return this.executeSessionLoop(session);
  }

  async replyToSession(params: {
    sessionId: string;
    message: string;
    additionalSteps?: number;
  }): Promise<AgentSessionExecution> {
    const { sessionId, message, additionalSteps = 30 } = params;
    const session = this.sessions.get(sessionId);

    if (!session) {
      return this.runAgentLoop({
        sessionId,
        taskId: sessionId,
        instruction: message,
        roleTitle: 'Autonomous AI Engineer',
        maxSteps: additionalSteps,
      });
    }

    this.cancelledSessions.delete(sessionId);
    this.pausedSessions.delete(sessionId);

    void browserService.setHumanTakeover(sessionId, false);

    session.finalAnswer = undefined;
    session.completedAt = undefined;
    session.status = 'RUNNING';
    session.maxSteps = session.currentStep + additionalSteps;

    // Append human operator feedback cleanly into context history
    session.contextHistory = `${session.contextHistory || ''}\n\n[Human Operator Follow-Up Reply / User Input]:\n"${message}"\n\nContinue executing the task iteratively using your tools based on the user's reply.\n`;

    socketServer.emit('agent:lifecycle', {
      sessionId,
      taskId: session.taskId,
      status: 'RUNNING',
      userReply: message,
      currentStep: session.currentStep,
      maxSteps: session.maxSteps,
    });
    this.persistSessionsToDisk();

    return this.executeSessionLoop(session);
  }

  private async executeSessionLoop(session: AgentSessionExecution): Promise<AgentSessionExecution> {
    const tools = this.getToolDefinitions();
    const roleTitle = session.roleTitle || 'Autonomous AI Engineer';
    const preferredModel = session.preferredModel;
    const owner = session.owner || 'workspace';
    const repoName = session.repoName || 'workspace';
    const filesWrittenSet = session.filesWrittenSet || new Set<string>();

    // 4-MINUTE HIGH-SPEED EXECUTION BUDGET
    const FOUR_MINUTES_MS = 240_000;
    const sessionStartTime = Date.now();
    const deadlineMs = sessionStartTime + FOUR_MINUTES_MS;

    const availableFastProviders = ['groq', 'opencode', 'gemini', 'openrouter', 'cloudflare', 'ollama'];
    let currentProvider = (session.effectiveProvider || 'groq').toLowerCase();

    session.status = 'RUNNING';

    while (session.currentStep < session.maxSteps) {
      // 1. Check strict 4-minute maximum time limit
      const now = Date.now();
      const elapsedMs = now - sessionStartTime;
      const remainingMs = Math.max(0, deadlineMs - now);
      const remainingSec = Math.round(remainingMs / 1000);

      if (remainingMs <= 0) {
        logger.info('4-minute session execution budget reached, concluding and synthesizing result', {
          sessionId: session.sessionId,
          elapsedMs,
        });
        session.contextHistory += `\n[Time Notice: 4-minute maximum budget reached (${Math.round(elapsedMs / 1000)}s elapsed). Synthesizing final verified outcome.]\n`;
        break;
      }

      // Check cancellation
      if (this.cancelledSessions.has(session.sessionId)) {
        session.status = 'CANCELLED';
        break;
      }

      // Check pause
      while (this.pausedSessions.has(session.sessionId)) {
        session.status = 'PAUSED';
        socketServer.emit('agent:lifecycle', { sessionId: session.sessionId, taskId: session.taskId, status: 'PAUSED' });
        await new Promise((r) => setTimeout(r, 1000));
      }

      session.status = 'RUNNING';
      session.currentStep++;

      socketServer.emit('agent:thinking', {
        sessionId: session.sessionId,
        taskId: session.taskId,
        step: session.currentStep,
        maxSteps: session.maxSteps,
        provider: currentProvider,
        remainingSec,
        timestamp: new Date().toISOString(),
      });

      let learnedSopSection = '';
      try {
        learnedSopSection = await sopLearningService.getInjectedSopInstructions();
      } catch {
        learnedSopSection = '[MANDATORY SOP]: Generate complete folder structure and runnable code. Never stop at a README.md file.';
      }

      const dynamicSystemPrompt = `You are ${roleTitle}, an ultra-high-velocity autonomous AI software engineer inside CodyNex OS operating under a strict 4-MINUTE EXECUTION DEADLINE.
Time Remaining: ${remainingSec} seconds.
Your objective: You MUST execute decisive, rapid actions until the user's task is 100% complete and matches the prompt EXACTLY:
"${session.instruction}"

${learnedSopSection}

Rules for High Velocity & Exact Goal Completion:
1. Act with urgency: never repeat an action that already succeeded.
2. If searching or browsing: use exact keywords, find elements immediately, and confirm state.
3. If coding: write complete files directly across the entire folder structure without dummy placeholders.
4. STRICT ANTI-README & COMPLETENESS: Never return only a single README.md or markdown document for an implementation task. Generate functional, runnable code files across all required directories.
5. Only invoke 'task_complete' when you have verified that the prompt's requirements are 100% satisfied. If more actions are needed to fulfill the prompt, do them immediately!
6. If approaching the 4-minute mark, execute final verification and complete.

Output strictly valid JSON with this shape:
{
  "thought": "Your concise step-by-step reasoning",
  "tool": "name_of_tool",
  "toolInput": { ...arguments matching the tool definition }
}

Available tools:
${tools.map((t) => `- ${t.name}: ${t.description} (params: ${JSON.stringify(t.parameters)})`).join('\n')}`;

      let aiResponse: any;
      try {
        aiResponse = await this.modelRouter.complete(
          {
            systemPrompt: dynamicSystemPrompt,
            userPrompt: `[Execution Status: ${remainingSec}s left | Step ${session.currentStep} of ${session.maxSteps}]\nCurrent Context & History:\n${session.contextHistory}\nDecide the next decisive action or complete the task. Return JSON strictly.`,
            responseFormat: 'json',
            maxOutputTokens: 512,
          },
          {
            taskId: session.taskId,
            preferredProvider: currentProvider,
            preferredModel: currentProvider === session.effectiveProvider ? preferredModel : undefined,
            agentRole: roleTitle,
            fastTimeoutMs: currentProvider === 'ollama' ? 45000 : 7000, // Fast jump for cloud, generous for local Ollama
          },
        );
      } catch (err: any) {
        // FAST PROVIDER FAILOVER: Jump immediately to another active provider
        const curIdx = Math.max(0, availableFastProviders.indexOf(currentProvider));
        const nextProvider = availableFastProviders[(curIdx + 1) % availableFastProviders.length] || 'groq';
        logger.warn('AI reasoning stalled or timed out, instantly jumping to alternative provider', {
          stalledProvider: currentProvider,
          nextProvider,
          error: err.message,
          sessionId: session.sessionId,
        });
        session.effectiveProvider = nextProvider;
        currentProvider = nextProvider;
        session.contextHistory += `\n[Fast Jump Notice: Provider response stalled (${err.message}). Instantly jumped to ${nextProvider.toUpperCase()} for accelerated reasoning.]\n`;
        socketServer.emit('agent:thinking', {
          sessionId: session.sessionId,
          taskId: session.taskId,
          step: session.currentStep,
          maxSteps: session.maxSteps,
          jumpedToProvider: nextProvider,
          timestamp: new Date().toISOString(),
        });
        // Continue immediately on the new fast provider without waiting
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
        sessionId: session.sessionId,
        taskId: session.taskId,
        step: session.currentStep,
        thought,
        tool: toolName,
        toolInput,
        timestamp: stepRecord.timestamp,
      });

      if (toolName === 'task_complete') {
        // Prevent premature completion if work is required and time remains
        const isBrowsingTask = /whatsapp|message|chat|send|search|browse|login|navigate|web/i.test(session.instruction || '');
        const hasExecutedInteractiveTool = session.steps.some(
          (s) => (s.tool === 'browser_type' || s.tool === 'browser_press_key' || s.tool === 'browser_click') && s.status === 'SUCCESS',
        );

        const isPremature =
          remainingSec > 45 &&
          session.currentStep < session.maxSteps - 1 &&
          ((isBrowsingTask && !hasExecutedInteractiveTool) ||
            (session.currentStep <= 2 &&
              /create|build|write|implement|fix|deploy/i.test(session.instruction || '') &&
              filesWrittenSet.size === 0 &&
              !session.steps.some((s) => s.tool === 'terminal_execute')));

        if (isPremature) {
          session.contextHistory += `\n[System Alert: Task is NOT complete yet. Do not stop halfway! You must continue until the action (e.g. typing, sending message, or running tools) is completed for: "${session.instruction}".]\n`;
          continue;
        }

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
        toolResult = await this.dispatchTool(toolName, toolInput, { sessionId: session.sessionId, owner, repoName });
        stepRecord.status = 'SUCCESS';
        stepRecord.toolOutput = toolResult;
      } catch (err: any) {
        stepRecord.status = 'FAILED';
        stepRecord.toolOutput = { error: err.message };
        toolResult = `Error: ${err.message}`;
      }
      stepRecord.durationMs = Date.now() - startMs;

      socketServer.emit('agent:tool_completed', {
        sessionId: session.sessionId,
        taskId: session.taskId,
        step: session.currentStep,
        tool: toolName,
        output: toolResult,
        status: stepRecord.status,
        durationMs: stepRecord.durationMs,
        timestamp: new Date().toISOString(),
      });
      this.persistSessionsToDisk();

      // Format compact observation to minimize token consumption and prevent HTTP 429 rate limits
      const obsStr =
        typeof toolResult === 'string'
          ? toolResult.slice(0, 250)
          : JSON.stringify(toolResult).slice(0, 250);
      session.contextHistory += `\nStep ${session.currentStep} [${toolName}]: ${obsStr}\n`;

      // Keep context lean (< 2000 chars / ~400 tokens) for sub-500ms lightning-fast response times
      if (session.contextHistory && session.contextHistory.length > 2000) {
        const lines = session.contextHistory.split('\n');
        const header = lines.slice(0, 2).join('\n');
        const recent = lines.slice(-8).join('\n');
        session.contextHistory = `${header}\n... [earlier steps compacted for speed] ...\n${recent}`;
      }
    }

    session.filesWritten = Array.from(filesWrittenSet);
    session.filesWrittenSet = filesWrittenSet;

    if (session.status !== 'COMPLETED' && session.status !== 'CANCELLED') {
      session.status = session.currentStep >= session.maxSteps ? 'COMPLETED' : 'FAILED';
    }

    // If finalAnswer was not set by task_complete, synthesize an in-depth executive debrief
    if (!session.finalAnswer) {
      try {
        const debriefRes = await this.modelRouter.complete(
          {
            systemPrompt:
              'You are a Principal Software Architect synthesizing an executive deliverable debrief of an autonomous AI engineering run.',
            userPrompt: `Autonomous Task Session Completed.
Task: "${session.instruction}"
${owner && repoName && owner !== 'organization' && owner !== 'workspace' && repoName !== 'workspace' ? `Target Workspace: "${owner}/${repoName}"\n` : ''}Total Steps: ${session.currentStep} of ${session.maxSteps}
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
          { taskId: session.taskId, preferredProvider: currentProvider, preferredModel, agentRole: roleTitle },
        );
        session.finalAnswer = debriefRes.content;
      } catch {
        session.finalAnswer = `Autonomous run completed after ${session.currentStep} steps across tools: ${session.steps
          .map((s) => s.tool)
          .join(', ')}. Files modified: ${session.filesWritten.length > 0 ? session.filesWritten.join(', ') : 'None'}.`;
      }
    }

    session.completedAt = new Date().toISOString();
    this.persistSessionsToDisk();
    socketServer.emit('agent:lifecycle', {
      sessionId: session.sessionId,
      taskId: session.taskId,
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
        const pressEnter = Boolean(input.pressEnter);
        await browserService.type(sessionId, String(input.selector), String(input.text), pressEnter);
        return { status: `Typed text into ${input.selector}${pressEnter ? ' and pressed Enter' : ''}` };
      }
      case 'browser_press_key': {
        const key = String(input.key || 'Enter');
        await browserService.keyPress(sessionId, key);
        return { status: `Pressed key ${key}` };
      }
      case 'browser_scroll': {
        await browserService.scroll(sessionId, input.direction === 'UP' ? 'UP' : 'DOWN', input.amount || 400);
        return { status: `Scrolled ${input.direction}` };
      }
      case 'browser_extract': {
        const content = await browserService.extractContent(sessionId);
        const compactElements = (content.interactiveElements || []).slice(0, 6).map((el: any) => ({
          selector: el.selector,
          type: el.role || el.tag,
          text: el.text ? el.text.slice(0, 30) : undefined,
          placeholder: el.placeholder ? el.placeholder.slice(0, 30) : undefined,
        }));
        return {
          url: content.url,
          title: content.title,
          interactiveElements: compactElements,
          snippet: content.text ? content.text.slice(0, 150) : '',
        };
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
      const s = this.sessions.get(sessionId);
      if (s) s.status = 'PAUSED';
      this.persistSessionsToDisk();
      void browserService.setHumanTakeover(sessionId, true);
      return true;
    }
    return false;
  }

  resumeSession(sessionId: string): boolean {
    if (this.pausedSessions.has(sessionId)) {
      this.pausedSessions.delete(sessionId);
      const s = this.sessions.get(sessionId);
      if (s) s.status = 'RUNNING';
      this.persistSessionsToDisk();
      void browserService.setHumanTakeover(sessionId, false);
      return true;
    }
    return false;
  }

  cancelSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.cancelledSessions.add(sessionId);
      this.pausedSessions.delete(sessionId);
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'CANCELLED';
        s.completedAt = new Date().toISOString();
      }
      this.persistSessionsToDisk();
      return true;
    }
    return false;
  }

  getSession(sessionId: string): AgentSessionExecution | null {
    return this.sessions.get(sessionId) || null;
  }

  getAllSessions(): AgentSessionExecution[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }
}

export const agentExecutionService = new AgentExecutionService();
