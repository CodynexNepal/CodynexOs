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

      const task = await this.taskRepo.save({
        projectId: req.body.projectId,
        departmentId: req.body.departmentId,
        assignedEmployeeId: req.body.assignedEmployeeId ?? null,
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

      res.status(STATUS_CODE.OK).json({ success: true, data: approval });
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
}
