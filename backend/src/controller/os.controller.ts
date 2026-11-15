import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { CommandService } from '../services/command.service';
import { OrchestratorService } from '../services/orchestrator.service';
import { OrganizationRepository } from '../repository/organization.repository';
import { ProjectRepository } from '../repository/project.repository';
import { TaskRepository } from '../repository/task.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { CrmRepository } from '../repository/crm.repository';
import { EngineeringService } from '../services/engineering.service';
import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';
import { getRequiredParam } from '../decorators/http.decorator';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { ApprovalStatus, TaskStatus } from '../constant/enum.constant';
import { ApiError } from '../utils/api-error.util';
import { socketServer } from '../socket/socket.server';
import { browserService } from '../services/browser.service';
import { terminalService } from '../services/terminal.service';
import { agentExecutionService } from '../services/agent-execution.service';
import { verificationGateService } from '../services/verification-gate.service';
import { voiceService } from '../services/voice.service';

export class OsController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly commandService: CommandService,
    private readonly orchestratorService: OrchestratorService,
    private readonly orgRepo: OrganizationRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly taskRepo: TaskRepository,
    private readonly governanceRepo: GovernanceRepository,
    private readonly crmRepo: CrmRepository,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly engService?: EngineeringService,
  ) {}

  overview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.dashboardService.getOverview();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  departments = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.orgRepo.findAllDepartments();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  employees = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.orgRepo.findAllEmployees();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const existing = await this.orgRepo.findEmployeeById(id);
      if (!existing) throw ApiError.notFound('AI employee not found.');

      const patch: Record<string, unknown> = {};
      if (typeof req.body.isActive === 'boolean') patch.isActive = req.body.isActive;
      if (typeof req.body.dailyTokenBudget === 'number' && req.body.dailyTokenBudget >= 1000) {
        patch.dailyTokenBudget = Math.floor(req.body.dailyTokenBudget);
      }
      if (typeof req.body.preferredProvider === 'string' && req.body.preferredProvider.trim()) {
        patch.preferredProvider = req.body.preferredProvider.trim();
      }
      if (typeof req.body.preferredModel === 'string' && req.body.preferredModel.trim()) {
        patch.preferredModel = req.body.preferredModel.trim();
      }

      await this.orgRepo.updateEmployee(id, patch);
      const updated = await this.orgRepo.findEmployeeById(id);

      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'AI_EMPLOYEE_UPDATED',
        resourceType: 'ai_employee',
        resourceId: id,
        metadata: patch,
      });

      res.status(STATUS_CODE.OK).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  issueCommand = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.commandService.issueCommand({
        userId: req.user!.userId,
        instruction: req.body.instruction,
        title: req.body.title,
        priority: req.body.priority,
        clarificationAnswer: req.body.clarificationAnswer,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  projects = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.projectRepo.findAll();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  tasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const status = typeof req.query.status === 'string' ? (req.query.status as TaskStatus) : undefined;
      const departmentId =
        typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
      const data = await this.taskRepo.findAll({ projectId, status, departmentId });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  createTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${req.body.projectId}:${req.body.title}:${Date.now()}`)
        .digest('hex')
        .slice(0, 64);

      let assignedEmployeeId = req.body.assignedEmployeeId ?? null;
      if (!assignedEmployeeId && req.body.departmentId) {
        const deptEmployees = await this.orgRepo.findEmployeesByDepartmentId(req.body.departmentId);
        assignedEmployeeId = deptEmployees[0]?.id ?? null;
      }

      const task = await this.taskRepo.save({
        projectId: req.body.projectId,
        departmentId: req.body.departmentId,
        assignedEmployeeId,
        title: req.body.title,
        description: req.body.description,
        taskType: req.body.taskType,
        priority: req.body.priority ?? 50,
        status: TaskStatus.QUEUED,
        idempotencyKey,
      });

      if (Array.isArray(req.body.dependsOnTaskIds)) {
        for (const depId of req.body.dependsOnTaskIds) {
          if (depId && depId !== task.id) {
            await this.taskRepo.addDependency(task.id, depId);
          }
        }
      }

      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'TASK_CREATED',
        resourceType: 'task',
        resourceId: task.id,
      });

      res.status(STATUS_CODE.CREATED).json({ success: true, data: task });
    } catch (err) {
      next(err);
    }
  };

  taskLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.taskRepo.getLogs(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  agentLiveActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId =
        typeof req.query.projectId === 'string' && req.query.projectId.trim()
          ? req.query.projectId.trim()
          : undefined;
      const runningTasks = await this.taskRepo.findRunningTasks();
      const recentLogs = await this.taskRepo.getRecentLogs(50);
      const recentTasks = projectId
        ? await this.taskRepo.findAll({ projectId })
        : await this.taskRepo.findAll();

      res.status(STATUS_CODE.OK).json({
        success: true,
        data: {
          runningTasks: projectId
            ? runningTasks.filter((t) => t.projectId === projectId)
            : runningTasks,
          recentLogs: projectId
            ? recentLogs.filter(
                (l) =>
                  (l.metadata as any)?.projectId === projectId ||
                  recentTasks.some((t) => t.id === l.taskId),
              )
            : recentLogs,
          recentTasks: recentTasks.slice(0, 30),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  retryTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const task = await this.taskRepo.findById(id);
      if (!task) throw ApiError.notFound('Task not found.');
      await this.taskRepo.updateById(id, {
        status: TaskStatus.QUEUED,
        nextRunAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.taskRepo.appendLog(id, 'INFO', 'Task manually re-queued by CEO');
      socketServer.emit('task:updated', { taskId: id, status: TaskStatus.QUEUED });
      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'TASK_RETRIED',
        resourceType: 'task',
        resourceId: id,
      });
      res.status(STATUS_CODE.OK).json({ success: true, message: 'Task queued for retry' });
    } catch (err) {
      next(err);
    }
  };

  cancelTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const task = await this.taskRepo.findById(id);
      if (!task) throw ApiError.notFound('Task not found.');
      await this.taskRepo.updateById(id, {
        status: TaskStatus.CANCELLED,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      await this.taskRepo.appendLog(id, 'WARN', 'Task cancelled by CEO');
      socketServer.emit('task:updated', { taskId: id, status: TaskStatus.CANCELLED });
      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'TASK_CANCELLED',
        resourceType: 'task',
        resourceId: id,
      });
      res.status(STATUS_CODE.OK).json({ success: true, message: 'Task cancelled' });
    } catch (err) {
      next(err);
    }
  };

  approvals = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status =
        typeof req.query.status === 'string' ? (req.query.status as ApprovalStatus) : undefined;
      const data = await this.governanceRepo.findApprovals(status);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  reviewApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const approval = await this.governanceRepo.findApprovalById(id);
      if (!approval) throw ApiError.notFound('Approval request not found.');
      if (approval.status !== ApprovalStatus.PENDING) {
        throw ApiError.badRequest('Approval request has already been reviewed.');
      }

      const decision = req.body.decision as 'APPROVED' | 'REJECTED';

      if (
        decision === 'APPROVED' &&
        approval.actionType === 'MERGE_AND_DEPLOY' &&
        this.engService &&
        typeof approval.payload?.repoId === 'string' &&
        typeof approval.payload?.prNumber === 'number'
      ) {
        await this.engService.mergeApprovedPullRequest({
          repoId: approval.payload.repoId,
          prId: typeof approval.payload.prId === 'string' ? approval.payload.prId : undefined,
          prNumber: approval.payload.prNumber,
          actorId: req.user!.userId,
        });
      }

      approval.status = decision === 'APPROVED' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
      approval.reviewedBy = req.user!.userId;
      approval.reviewNote = req.body.note ?? null;
      approval.reviewedAt = new Date();
      await this.governanceRepo.saveApproval(approval);

      if (approval.taskId) {
        await this.taskRepo.updateById(approval.taskId, {
          status: decision === 'APPROVED' ? TaskStatus.QUEUED : TaskStatus.CANCELLED,
          nextRunAt: new Date(),
        });
        await this.taskRepo.appendLog(
          approval.taskId,
          decision === 'APPROVED' ? 'INFO' : 'WARN',
          `CEO ${decision.toLowerCase()} approval request: ${approval.summary}`,
        );
      }

      const campaignId =
        typeof approval.payload?.campaignId === 'string' ? approval.payload.campaignId : null;
      if (campaignId) {
        const campaign = await this.crmRepo.findCampaignById(campaignId);
        if (campaign) {
          campaign.status = decision === 'APPROVED' ? 'APPROVED' : 'PAUSED';
          campaign.approvedBy = decision === 'APPROVED' ? req.user!.userId : null;
          await this.crmRepo.saveCampaign(campaign);
        }
      }

      const interactionId =
        typeof approval.payload?.interactionId === 'string' ? approval.payload.interactionId : null;
      if (interactionId) {
        const interaction = await this.crmRepo.findInteractionById(interactionId);
        if (interaction && interaction.approvalStatus !== 'SENT') {
          interaction.approvalStatus = decision === 'APPROVED' ? 'APPROVED' : 'BLOCKED';
          await this.crmRepo.saveInteraction(interaction);
        }
      }

      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: `APPROVAL_${decision}`,
        resourceType: 'approval_request',
        resourceId: id,
      });

      if (req.user?.userId) {
        await this.governanceRepo.markApprovalNotificationsRead(req.user.userId);
        socketServer.emit('notification:all_read', { userId: req.user.userId, reason: 'approval_reviewed' });
      }
      socketServer.emit('approval:reviewed', { id, decision, approval });

      res.status(STATUS_CODE.OK).json({ success: true, data: approval });
    } catch (err) {
      next(err);
    }
  };

  sendTestNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await this.notificationService.notifyUser({
        userId: req.user!.userId,
        category: (req.body.category as string) || 'APPROVAL_REQUEST',
        severity: (req.body.severity as 'INFO' | 'WARNING' | 'CRITICAL') || 'WARNING',
        title: (req.body.title as string) || 'CEO Approval Needed: Production Deployment v1.2',
        message:
          (req.body.message as string) ||
          'AI Engineering department requests sign-off for merging and deploying to production.',
        linkUrl: (req.body.linkUrl as string) || '/deployments',
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data: notification });
    } catch (err) {
      next(err);
    }
  };

  notifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.notificationService.listForUser(req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      await this.notificationService.markRead(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.notificationService.markAllRead(req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  auditLogs = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.governanceRepo.findAuditLogs(200);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  settings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.dashboardService.getSettings();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  upsertSetting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.dashboardService.upsertSetting(
        req.body.key,
        req.body.value ?? {},
        Boolean(req.body.isSecret),
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  workerTick = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orchestratorService.runTick(3);
      res.status(STATUS_CODE.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  getBrowserState = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const state = await browserService.getSessionState(sessionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  };

  browserNavigate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const url = req.body.url;
      const state = await browserService.navigate(sessionId, url);
      res.status(STATUS_CODE.OK).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  };

  browserClick = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const selector = req.body.selector;
      const state = await browserService.click(sessionId, selector);
      res.status(STATUS_CODE.OK).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  };

  browserType = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { selector, text } = req.body;
      const state = await browserService.type(sessionId, selector, text);
      res.status(STATUS_CODE.OK).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  };

  browserTakeover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const enabled = Boolean(req.body.enabled);
      const state = await browserService.setHumanTakeover(sessionId, enabled);
      res.status(STATUS_CODE.OK).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  };

  browserClickCoordinate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { x, y } = req.body;
      await browserService.clickCoordinate(sessionId, Number(x), Number(y));
      res.status(STATUS_CODE.OK).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  browserWheel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { deltaX = 0, deltaY = 0 } = req.body;
      await browserService.mouseWheel(sessionId, Number(deltaX), Number(deltaY));
      res.status(STATUS_CODE.OK).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  browserKeyPress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { key, text } = req.body;
      if (text) {
        await browserService.typeDirect(sessionId, String(text));
      } else if (key) {
        await browserService.keyPress(sessionId, String(key));
      }
      res.status(STATUS_CODE.OK).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  terminalExecute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { command, cwd } = req.body;
      const record = await terminalService.executeCommand({
        sessionId,
        command,
        cwd,
        actorId: req.user?.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: record });
    } catch (err) {
      next(err);
    }
  };

  terminalCancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const executionId = getRequiredParam(req, 'executionId');
      const ok = terminalService.cancelCommand(executionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: { cancelled: ok } });
    } catch (err) {
      next(err);
    }
  };

  agentGetSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const session = agentExecutionService.getSession(sessionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  };

  agentPause = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const ok = agentExecutionService.pauseSession(sessionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: { paused: ok } });
    } catch (err) {
      next(err);
    }
  };

  agentResume = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const ok = agentExecutionService.resumeSession(sessionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: { resumed: ok } });
    } catch (err) {
      next(err);
    }
  };

  agentCancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const ok = agentExecutionService.cancelSession(sessionId);
      res.status(STATUS_CODE.OK).json({ success: true, data: { cancelled: ok } });
    } catch (err) {
      next(err);
    }
  };

  agentReplySession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = getRequiredParam(req, 'sessionId');
      const { message, additionalSteps } = req.body;
      if (!message || typeof message !== 'string') {
        throw ApiError.badRequest('A non-empty reply message is required.');
      }
      void agentExecutionService.replyToSession({
        sessionId,
        message,
        additionalSteps: typeof additionalSteps === 'number' ? additionalSteps : 15,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: { sessionId, status: 'REPLIED' } });
    } catch (err) {
      next(err);
    }
  };

  agentRunSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, taskId, instruction, roleTitle, owner, repoName, maxSteps, preferredProvider, preferredModel } = req.body;
      const cleanSessionId = sessionId || `session_${Date.now()}`;
      void agentExecutionService.runAgentLoop({
        sessionId: cleanSessionId,
        taskId: taskId || cleanSessionId,
        instruction: instruction || 'Review workspace and check application health.',
        roleTitle: roleTitle || 'Autonomous AI Engineer',
        owner,
        repoName,
        maxSteps,
        preferredProvider,
        preferredModel,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: { sessionId: cleanSessionId, status: 'STARTED' } });
    } catch (err) {
      next(err);
    }
  };

  getLatestReleaseCertificate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { owner = 'organization', name = 'workspace', taskId } = req.query as {
        owner?: string;
        name?: string;
        taskId?: string;
      };
      const certificate = await verificationGateService.getLatestCertificate({
        owner,
        name,
        taskId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: certificate });
    } catch (err) {
      next(err);
    }
  };

  evaluateReleaseGates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { owner = 'organization', name = 'workspace', taskId, previewUrl, expectedDeliverables } = req.body;
      const certificate = await verificationGateService.evaluateReleaseGates({
        owner,
        name,
        taskId,
        reviewerEmployeeId: req.body?.reviewerEmployeeId,
        previewUrl,
        expectedDeliverables,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data: certificate });
    } catch (err) {
      next(err);
    }
  };

  // --- Nepali Voice Intelligence API ---

  voiceTranscribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { audioBase64, format = 'webm' } = req.body;
      if (!audioBase64) {
        throw new ApiError(STATUS_CODE.BAD_REQUEST, 'Missing audioBase64 payload');
      }
      const result = await voiceService.transcribeAudio(audioBase64, format);
      res.status(STATUS_CODE.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  voiceSynthesize = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, voice } = req.body;
      if (!text) {
        throw new ApiError(STATUS_CODE.BAD_REQUEST, 'Missing text payload');
      }
      const result = await voiceService.synthesizeSpeech(text, voice);
      res.status(STATUS_CODE.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  voiceDirective = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nepaliText, activeSessionId, activeWorkspace } = req.body;
      if (!nepaliText) {
        throw new ApiError(STATUS_CODE.BAD_REQUEST, 'Missing nepaliText payload');
      }
      const intent = await voiceService.processNepaliVoiceDirective(nepaliText, {
        activeSessionId,
        activeWorkspace,
        userId: (req as any).user?.id,
      });

      // Synthesize audio response for the voice assistant reply
      let audioResult: { audioBase64: string; mimeType: string } | null = null;
      try {
        audioResult = await voiceService.synthesizeSpeech(intent.nepaliVoiceReply);
      } catch {
        // Voice synthesis optional fallback
      }

      // If auto-approved (Level 1), execute immediately
      let executionResult: { executionSessionId?: string } | null = null;
      if (!intent.requiresConfirmation) {
        executionResult = await voiceService.executeAuthorizedIntent(intent.intentId, true);
      }

      res.status(STATUS_CODE.OK).json({
        success: true,
        data: {
          intent,
          audioBase64: audioResult?.audioBase64,
          mimeType: audioResult?.mimeType || 'audio/mpeg',
          executionSessionId: executionResult?.executionSessionId,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  voiceConfirmApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const intentId = String(req.params.intentId || '');
      if (!intentId) {
        throw new ApiError(STATUS_CODE.BAD_REQUEST, 'Missing intentId parameter');
      }
      const { confirmed } = req.body;
      const result = await voiceService.executeAuthorizedIntent(intentId, Boolean(confirmed));

      let audioResult: { audioBase64: string; mimeType: string } | null = null;
      try {
        audioResult = await voiceService.synthesizeSpeech(result.voiceReply);
      } catch {
        // Voice synthesis optional fallback
      }

      res.status(STATUS_CODE.OK).json({
        success: true,
        data: {
          ...result,
          audioBase64: audioResult?.audioBase64,
          mimeType: audioResult?.mimeType || 'audio/mpeg',
        },
      });
    } catch (err) {
      next(err);
    }
  };

  voiceStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const isReady = await voiceService.pingVoiceEngine();
      res.status(STATUS_CODE.OK).json({
        success: true,
        data: {
          status: isReady ? 'ONLINE' : 'OFFLINE',
          voice: 'ne-NP-SagarNeural (Native Kathmandu Male)',
          stt: 'faster-whisper int8 (Nepali Devanagari & Code-switching)',
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
