import { Router } from 'express';
import { getOsContainer } from '../factory/os.factory';
import { authenticate, requireRoles } from '../middleware/auth.middleware';
import { requireWorkerSecret } from '../middleware/worker-secret.middleware';
import { validateDto } from '../middleware/validate-dto.middleware';
import { requireParam } from '../decorators/http.decorator';
import { idempotencyKeyMiddleware } from '../decorators/idempotency.decorator';
import { commandRateLimiter } from '../configs/rateLimiter.config';
import { CreateTaskDto, IssueCommandDto, ReviewApprovalDto } from '../dto/command.dto';
import {
  ConnectRepoDto,
  CreateCampaignDto,
  CreateKnowledgeDto,
  CreateMemoryDto,
  UpdateBudgetPolicyDto,
  UpdateSettingDto,
  UpsertLeadDto,
} from '../dto/domain.dto';
import { UserRole } from '../constant/enum.constant';

export function createOsRouter(): Router {
  const router = Router();
  const { osController, domainController } = getOsContainer();

  // Signed worker heartbeat endpoint (for laptop-off Cloudflare Cron / GitHub Actions)
  router.post('/workers/tick', requireWorkerSecret, osController.workerTick);

  // Protected CEO / Organization routes
  router.use(authenticate);

  router.get('/overview', osController.overview);
  router.get('/departments', osController.departments);
  router.get('/employees', osController.employees);

  router.post(
    '/command',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    commandRateLimiter,
    idempotencyKeyMiddleware(),
    validateDto(IssueCommandDto),
    osController.issueCommand,
  );

  router.get('/projects', osController.projects);
  router.get('/tasks', osController.tasks);
  router.post(
    '/tasks',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    idempotencyKeyMiddleware(),
    validateDto(CreateTaskDto),
    osController.createTask,
  );
  router.get('/tasks/:id/logs', requireParam('id', { uuid: true }), osController.taskLogs);
  router.post(
    '/tasks/:id/retry',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    osController.retryTask,
  );
  router.post(
    '/tasks/:id/cancel',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    osController.cancelTask,
  );

  router.get('/approvals', osController.approvals);
  router.post(
    '/approvals/:id/review',
    requireRoles(UserRole.CEO),
    requireParam('id', { uuid: true }),
    validateDto(ReviewApprovalDto),
    osController.reviewApproval,
  );

  router.get('/memory', domainController.listMemory);
  router.post(
    '/memory',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    validateDto(CreateMemoryDto),
    domainController.createMemory,
  );

  router.get('/knowledge', domainController.listKnowledge);
  router.post(
    '/knowledge',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    validateDto(CreateKnowledgeDto),
    domainController.createKnowledge,
  );

  router.get('/github/repos', domainController.listRepos);
  router.post(
    '/github/repos',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    validateDto(ConnectRepoDto),
    domainController.connectRepo,
  );
  router.post(
    '/github/repos/:id/sync',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.syncRepo,
  );
  router.get('/github/pull-requests', domainController.listPullRequests);

  router.get('/qa/reports', domainController.listQaReports);
  router.post(
    '/qa/reports',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.createQaReport,
  );

  router.get('/marketing/campaigns', domainController.listCampaigns);
  router.post(
    '/marketing/campaigns',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    validateDto(CreateCampaignDto),
    domainController.createCampaign,
  );

  router.get('/crm/leads', domainController.listLeads);
  router.post(
    '/crm/leads',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    validateDto(UpsertLeadDto),
    domainController.upsertLead,
  );
  router.post(
    '/crm/leads/:id/opt-out',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.optOutLead,
  );
  router.get('/crm/interactions', domainController.listInteractions);

  router.get('/ai-usage', domainController.aiUsage);
  router.put(
    '/ai-usage/budget',
    requireRoles(UserRole.CEO),
    validateDto(UpdateBudgetPolicyDto),
    domainController.updateBudget,
  );

  router.get('/notifications', osController.notifications);
  router.patch(
    '/notifications/:id/read',
    requireParam('id', { uuid: true }),
    osController.markNotificationRead,
  );
  router.post('/notifications/read-all', osController.markAllNotificationsRead);

  router.get('/audit-logs', osController.auditLogs);
  router.get('/settings', requireRoles(UserRole.CEO, UserRole.ADMIN), osController.settings);
  router.put(
    '/settings',
    requireRoles(UserRole.CEO),
    validateDto(UpdateSettingDto),
    osController.upsertSetting,
  );

  return router;
}
