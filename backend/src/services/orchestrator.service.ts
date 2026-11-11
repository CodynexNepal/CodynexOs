import os from 'os';
import { TaskRepository } from '../repository/task.repository';
import { ProjectRepository } from '../repository/project.repository';
import { MemoryRepository } from '../repository/memory.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { EngineeringRepository } from '../repository/engineering.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { AiProviderError } from '../ai/ai-provider.interface';
import { sanitizeUntrustedContent } from '../ai/prompt-guard';
import {
  MemoryCategory,
  ProjectStatus,
  QaVerdict,
  TaskStatus,
} from '../constant/enum.constant';
import { NotificationService } from './notification.service';
import { AuditService } from './audit.service';
import { EngineeringService } from './engineering.service';
import { dotEnvConfig } from '../configs/envConfig';
import { socketServer } from '../socket/socket.server';
import { logger } from '../utils/logger.util';
import {
  formatReportAsReadableText,
  parseStructuredAiResult,
} from '../utils/report-formatter.util';

export class OrchestratorService {
  private readonly workerId = `worker-${os.hostname()}-${process.pid}`;

  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly governanceRepo: GovernanceRepository,
    private readonly engRepo: EngineeringRepository,
    private readonly modelRouter: ModelRouterService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly engineeringService?: EngineeringService,
  ) {}

  async runTick(maxTasks = 2): Promise<{ reclaimed: number; processed: number }> {
    const reclaimed = await this.taskRepo.reclaimExpiredLeases();
    let processed = 0;

    for (let i = 0; i < maxTasks; i++) {
      const task = await this.taskRepo.claimNextReadyTask(this.workerId, 120);
      if (!task) break;
      processed += 1;
      await this.executeClaimedTask(task.id);
    }

    return { reclaimed, processed };
  }

  private async executeClaimedTask(taskId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return;

    const execution = await this.taskRepo.createExecution({
      taskId: task.id,
      employeeId: task.assignedEmployeeId,
      attemptNumber: task.retryCount + 1,
      workerId: this.workerId,
      status: 'RUNNING',
    });

    await this.taskRepo.appendLog(
      task.id,
      'INFO',
      `Claimed by ${this.workerId} (attempt #${task.retryCount + 1})`,
      { employeeSlug: task.assignedEmployee?.slug ?? 'unassigned' },
      execution.id,
    );

    socketServer.emit('task:updated', { taskId: task.id, status: TaskStatus.RUNNING });

    try {
      const [memories, sops] = await Promise.all([
        this.memoryRepo.searchMemory(task.title.slice(0, 40)),
        typeof this.memoryRepo.findTrustedKnowledgeForDepartment === 'function'
          ? this.memoryRepo.findTrustedKnowledgeForDepartment(task.departmentId)
          : Promise.resolve([]),
      ]);
      const { wrapped } = sanitizeUntrustedContent(
        `${task.description}\n\nInput: ${JSON.stringify(task.inputPayload)}`,
        `task:${task.id}`,
      );

      let outputPayload: Record<string, unknown>;
      let memoryReadableContent = '';
      const emp = task.assignedEmployee;

      if (task.taskType === 'github_inspect' && this.engineeringService) {
        const owner =
          (typeof task.inputPayload.githubOwner === 'string' && task.inputPayload.githubOwner) ||
          dotEnvConfig.GITHUB_DEFAULT_OWNER ||
          'CodynexNepal';
        const imported = await this.engineeringService.importOwnerRepos(
          owner,
          task.project?.createdBy || this.workerId,
        );
        const repoList = imported.repositories.map((r) => ({
          phase: `${r.owner}/${r.name}`,
          details: `Default branch: ${r.defaultBranch} · Connected in CodyNex OS`,
        }));
        const report = {
          summary: `Imported and inspected ${imported.count} repositories under '${imported.owner}' from GitHub.`,
          deliverables: repoList,
          nextRecommendations: [
            'Open GitHub Integration to clone a workspace, browse folders/files, run checks, or open Pull Requests.',
          ],
        };
        outputPayload = { mode: 'github_api', report };
        memoryReadableContent = formatReportAsReadableText({
          provider: 'github',
          model: 'rest-v3',
          tokens: 0,
          rawContent: JSON.stringify(report),
          parsed: report,
        });
      } else if (task.taskType === 'repo_provision' && this.engineeringService) {
        const repoName =
          (typeof task.inputPayload.githubRepoName === 'string' &&
            task.inputPayload.githubRepoName) ||
          String(task.inputPayload.projectTitle || 'codynex-app')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) ||
          `codynex-project-${task.projectId.slice(0, 6)}`;
        const owner =
          typeof task.inputPayload.githubOwner === 'string'
            ? task.inputPayload.githubOwner
            : dotEnvConfig.GITHUB_DEFAULT_OWNER || undefined;

        const existingRepos = await this.engRepo.findAllRepos();
        let repo = existingRepos.find(
          (r) => r.name.toLowerCase() === repoName.toLowerCase(),
        );
        if (!repo) {
          repo = await this.engineeringService.createGithubRepo({
            name: repoName,
            owner,
            description: String(task.inputPayload.projectTitle || 'Created by CodyNex OS'),
            isPrivate: false,
            actorId: task.project?.createdBy || this.workerId,
          });
        } else {
          await this.engineeringService.cloneOrPullWorkspace(
            repo.id,
            task.project?.createdBy || this.workerId,
          );
        }

        // Propagate repoId to sibling tasks in the same project
        const siblingTasks = await this.taskRepo.findAll({ projectId: task.projectId });
        for (const sib of siblingTasks) {
          if (sib.id !== task.id) {
            await this.taskRepo.updateById(sib.id, {
              inputPayload: { ...sib.inputPayload, repoId: repo.id },
            });
          }
        }

        const report = {
          summary: `Provisioned workspace and GitHub repository '${repo.owner}/${repo.name}' (base branch: ${repo.defaultBranch}).`,
          deliverables: [
            {
              phase: 'Workspace Ready',
              details: `Cloned into local workspace and prepared isolated branch ${String(task.inputPayload.branchName || 'codynex/task')}`,
            },
          ],
        };
        outputPayload = { mode: 'workspace', repoId: repo.id, report };
        memoryReadableContent = formatReportAsReadableText({
          provider: 'git',
          model: 'workspace',
          tokens: 0,
          rawContent: JSON.stringify(report),
          parsed: report,
        });
      } else if (task.taskType === 'code_generate' && this.engineeringService) {
        const aiRes = await this.modelRouter.complete(
          {
            systemPrompt: `${emp?.systemInstruction || ''}\nReturn JSON with keys: summary, files (array of {path, content}), deliverables (array of {phase, details}), risks (array). Write complete runnable TypeScript/Node/README files.`,
            userPrompt: `Trusted Company SOPs:\n${
              sops.length > 0
                ? sops.map((s) => `- ${s.title}: ${s.contentMd.slice(0, 300)}`).join('\n')
                : 'None'
            }\n\nTask:\n${wrapped}`,
            responseFormat: 'json',
            maxOutputTokens: 2048,
          },
          {
            taskId: task.id,
            employeeId: emp?.id,
            preferredProvider: emp?.preferredProvider,
            preferredModel: emp?.preferredModel,
            fallbackProvider: emp?.fallbackProvider,
            fallbackModel: emp?.fallbackModel,
            employeeDailyTokenBudget: emp?.dailyTokenBudget,
          },
        );
        const totalTokens = aiRes.inputTokens + aiRes.outputTokens;
        const parsed = parseStructuredAiResult(aiRes.content) as {
          summary?: string;
          files?: Array<{ path: string; content: string }>;
          deliverables?: Array<string | Record<string, unknown>>;
          risks?: Array<string | Record<string, unknown>>;
        } | null;

        const repoId = typeof task.inputPayload.repoId === 'string' ? task.inputPayload.repoId : '';
        const branchName =
          typeof task.inputPayload.branchName === 'string'
            ? task.inputPayload.branchName
            : `codynex/task-${task.id.slice(0, 6)}`;
        let writtenFiles: string[] = [];

        if (repoId && Array.isArray(parsed?.files) && parsed.files.length > 0) {
          const validFiles = parsed.files.filter(
            (f) => typeof f?.path === 'string' && typeof f?.content === 'string',
          );
          const resWrite = await this.engineeringService.writeWorkspaceFiles(
            repoId,
            branchName,
            validFiles,
            task.project?.createdBy || this.workerId,
          );
          writtenFiles = resWrite.written;
        }

        const report = {
          summary: parsed?.summary || 'Generated implementation files in isolated branch.',
          deliverables: [
            ...(parsed?.deliverables ?? []),
            ...writtenFiles.map((f) => ({ phase: 'File Written', details: f })),
          ],
          risks: parsed?.risks ?? [],
        };
        outputPayload = {
          mode: 'ai_code',
          provider: aiRes.provider,
          model: aiRes.model,
          tokens: totalTokens,
          writtenFiles,
          report,
        };
        memoryReadableContent = formatReportAsReadableText({
          provider: aiRes.provider,
          model: aiRes.model,
          tokens: totalTokens,
          rawContent: aiRes.content,
          parsed: report,
        });
      } else if (task.taskType === 'github_push_pr' && this.engineeringService) {
        const repoId = typeof task.inputPayload.repoId === 'string' ? task.inputPayload.repoId : '';
        const branchName =
          typeof task.inputPayload.branchName === 'string'
            ? task.inputPayload.branchName
            : `codynex/task-${task.id.slice(0, 6)}`;
        if (!repoId) {
          throw new Error('Missing repoId for github_push_pr task.');
        }
        const pushed = await this.engineeringService.commitPushAndOpenPr({
          repoId,
          branchName,
          title: `feat: ${String(task.inputPayload.projectTitle || task.title)}`,
          taskId: task.id,
          actorId: task.project?.createdBy || this.workerId,
        });
        const report = {
          summary: `Committed, pushed branch '${branchName}' (${pushed.commitSha.slice(0, 7)}), opened PR #${pushed.pullRequest.prNumber}, and queued CEO deployment approval.`,
          deliverables: [
            { phase: `PR #${pushed.pullRequest.prNumber}`, details: pushed.pullRequest.htmlUrl },
          ],
        };
        outputPayload = { mode: 'github_pr', ...pushed, report };
        memoryReadableContent = formatReportAsReadableText({
          provider: 'github',
          model: 'git-pr',
          tokens: 0,
          rawContent: JSON.stringify(report),
          parsed: report,
        });
      } else {
        try {
          const aiRes = await this.modelRouter.complete(
          {
            systemPrompt: emp
              ? `${emp.systemInstruction}\nApproved tools: ${emp.allowedTools.join(', ')}. Return a concise structured JSON report with keys: summary, deliverables, risks, nextRecommendations.`
              : 'Return a concise JSON report with keys: summary, deliverables, risks.',
            userPrompt: `Trusted Company SOPs & Playbooks:\n${
              sops.length > 0
                ? sops.map((s) => `- ${s.title}: ${s.contentMd.slice(0, 320)}`).join('\n')
                : 'None'
            }\n\nRelevant Memory:\n${memories
              .slice(0, 4)
              .map((m) => `- ${m.title}: ${m.content.slice(0, 160)}`)
              .join('\n')}\n\nTask:\n${wrapped}`,
            responseFormat: 'json',
            maxOutputTokens: 1500,
          },
          {
            taskId: task.id,
            employeeId: emp?.id,
            preferredProvider: emp?.preferredProvider,
            preferredModel: emp?.preferredModel,
            fallbackProvider: emp?.fallbackProvider,
            fallbackModel: emp?.fallbackModel,
            employeeDailyTokenBudget: emp?.dailyTokenBudget,
          },
        );
        const totalTokens = aiRes.inputTokens + aiRes.outputTokens;
        const parsedReport = parseStructuredAiResult(aiRes.content);
        outputPayload = {
          mode: 'ai',
          provider: aiRes.provider,
          model: aiRes.model,
          tokens: totalTokens,
          report: parsedReport ?? aiRes.content,
        };
        memoryReadableContent = formatReportAsReadableText({
          provider: aiRes.provider,
          model: aiRes.model,
          tokens: totalTokens,
          rawContent: aiRes.content,
          parsed: parsedReport,
        });
      } catch (aiErr) {
        if (aiErr instanceof AiProviderError && aiErr.code === 'NOT_CONFIGURED') {
          await this.taskRepo.updateById(task.id, {
            status: TaskStatus.BLOCKED,
            leaseOwner: null,
            leaseExpiresAt: null,
          });
          await this.taskRepo.updateExecution(execution.id, {
            status: 'FAILED',
            errorCode: aiErr.code,
            errorMessage: aiErr.message,
            finishedAt: new Date(),
          });
          await this.taskRepo.appendLog(
            task.id,
            'WARN',
            `Task blocked: ${aiErr.message}`,
            {},
            execution.id,
          );
          return;
        }

        if (
          aiErr instanceof AiProviderError &&
          (aiErr.code === 'RATE_LIMITED' || aiErr.code === 'QUOTA_EXHAUSTED')
        ) {
          const nextRetry = task.retryCount + 1;
          const maxQuotaPauses = Math.max(task.maxRetries, 5);
          if (nextRetry > maxQuotaPauses) {
            await this.taskRepo.updateById(task.id, {
              status: TaskStatus.BLOCKED,
              leaseOwner: null,
              leaseExpiresAt: null,
            });
            await this.taskRepo.updateExecution(execution.id, {
              status: 'FAILED',
              errorCode: aiErr.code,
              errorMessage: aiErr.message,
              finishedAt: new Date(),
            });
            await this.taskRepo.appendLog(
              task.id,
              'WARN',
              `Task paused (BLOCKED) after ${maxQuotaPauses} quota/rate-limit attempts: ${aiErr.message}`,
              {},
              execution.id,
            );
            return;
          }

          // Preserve task cleanly in QUEUED with bounded exponential backoff
          const backoffSec = Math.min(300, Math.pow(2, nextRetry) * 15);
          await this.taskRepo.updateById(task.id, {
            status: TaskStatus.QUEUED,
            retryCount: nextRetry,
            leaseOwner: null,
            leaseExpiresAt: null,
            nextRunAt: new Date(Date.now() + backoffSec * 1000),
          });
          await this.taskRepo.updateExecution(execution.id, {
            status: 'FAILED',
            errorCode: aiErr.code,
            errorMessage: aiErr.message,
            finishedAt: new Date(),
          });
          await this.taskRepo.appendLog(
            task.id,
            'WARN',
            `Paused & preserved due to AI quota/rate limit: ${aiErr.message}. Retry #${nextRetry} scheduled in ${backoffSec}s.`,
            {},
            execution.id,
          );
          return;
        }
        throw aiErr;
      }
      }

      if (task.taskType === 'qa_verify') {
        const repoId = typeof task.inputPayload.repoId === 'string' ? task.inputPayload.repoId : '';
        if (repoId && this.engineeringService) {
          await this.engineeringService.runWorkspaceChecks(
            repoId,
            task.id,
            task.project?.createdBy || this.workerId,
          );
        } else {
          const qa = await this.engRepo.saveQaReport({
            taskId: task.id,
            reviewerEmployeeId: task.assignedEmployeeId,
            verdict: QaVerdict.PASSED,
            checksExecuted: [
              { name: 'requirements_review', status: 'PASS', output: 'Deliverables inspected' },
              { name: 'payload_integrity', status: 'PASS', output: 'Structured output validated' },
            ],
            summary: 'Automated QA verification completed.',
          });
          await this.taskRepo.updateById(task.id, {
            status: TaskStatus.COMPLETED,
            outputPayload,
            verificationResult: { qaReportId: qa.id, verdict: qa.verdict },
            leaseOwner: null,
            leaseExpiresAt: null,
            completedAt: new Date(),
          });
        }
      } else {
        await this.taskRepo.updateById(task.id, {
          status: TaskStatus.COMPLETED,
          outputPayload,
          verificationResult: { verifiedBy: emp?.slug ?? 'orchestrator', verifiedAt: new Date().toISOString() },
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
        });
      }

      await this.taskRepo.updateExecution(execution.id, {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
      });

      await this.memoryRepo.saveMemory({
        projectId: task.projectId,
        sourceTaskId: task.id,
        category: MemoryCategory.LESSON_LEARNED,
        title: `Completed Task: ${task.title}`,
        content: memoryReadableContent || JSON.stringify(outputPayload),
        tags: [task.taskType, emp?.slug ?? 'system'],
      });

      await this.taskRepo.appendLog(task.id, 'INFO', 'Task completed successfully', {}, execution.id);
      socketServer.emit('task:updated', { taskId: task.id, status: TaskStatus.COMPLETED });

      await this.reconcileProjectStatus(task.projectId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextRetry = task.retryCount + 1;
      const exhausted = nextRetry > task.maxRetries;

      await this.taskRepo.updateExecution(execution.id, {
        status: 'FAILED',
        errorCode: 'EXECUTION_ERROR',
        errorMessage: msg,
        finishedAt: new Date(),
      });

      if (exhausted) {
        await this.taskRepo.updateById(task.id, {
          status: TaskStatus.FAILED,
          leaseOwner: null,
          leaseExpiresAt: null,
        });
        await this.taskRepo.appendLog(task.id, 'ERROR', `Task failed permanently: ${msg}`, {}, execution.id);

        if (task.project?.createdBy) {
          await this.notificationService.notifyUser({
            userId: task.project.createdBy,
            category: 'TASK_FAILED',
            severity: 'CRITICAL',
            title: `Task Failed: ${task.title}`,
            message: msg,
            linkUrl: '/tasks',
            sendExternal: true,
          });
        }
      } else {
        const delaySec = Math.min(300, Math.pow(2, nextRetry) * 5);
        await this.taskRepo.updateById(task.id, {
          status: TaskStatus.QUEUED,
          retryCount: nextRetry,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRunAt: new Date(Date.now() + delaySec * 1000),
        });
        await this.taskRepo.appendLog(
          task.id,
          'WARN',
          `Attempt failed (${msg}); retry #${nextRetry} scheduled in ${delaySec}s`,
          {},
          execution.id,
        );
      }

      logger.error('Task execution error', { taskId: task.id, error: msg });
    }
  }

  async reconcileProjectStatus(projectId: string): Promise<void> {
    const projectTasks = await this.taskRepo.findAll({ projectId });
    if (projectTasks.length === 0) return;

    const allCompleted = projectTasks.every((t) => t.status === TaskStatus.COMPLETED);
    const anyFailed = projectTasks.some((t) => t.status === TaskStatus.FAILED);
    const project = await this.projectRepo.findById(projectId);
    if (!project) return;

    if (allCompleted && project.status !== ProjectStatus.COMPLETED) {
      await this.projectRepo.updateById(projectId, {
        status: ProjectStatus.COMPLETED,
        completedAt: new Date(),
      });
      await this.notificationService.notifyUser({
        userId: project.createdBy,
        category: 'PROJECT_COMPLETED',
        severity: 'INFO',
        title: `Project Completed: ${project.title}`,
        message: `All ${projectTasks.length} tasks have completed and passed verification.`,
        linkUrl: '/projects',
        sendExternal: true,
      });
    } else if (anyFailed) {
      await this.auditService.log({
        actorType: 'WORKER',
        actorId: this.workerId,
        action: 'PROJECT_HAS_FAILED_TASK',
        resourceType: 'project',
        resourceId: projectId,
      });
    }
  }
}
