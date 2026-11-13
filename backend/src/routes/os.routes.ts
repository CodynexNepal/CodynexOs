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
  CreateBusinessDto,
  CreateCampaignDto,
  CreateEmailAccountDto,
  CreateKnowledgeDto,
  CreateMemoryDto,
  SendInteractionEmailDto,
  UpdateBudgetPolicyDto,
  UpdateBusinessDto,
  UpdateEmailAccountDto,
  UpdateSettingDto,
  UpsertLeadDto,
  VerifyEmailAccountDto,
} from '../dto/domain.dto';
import { UserRole } from '../constant/enum.constant';

export function createOsRouter(): Router {
  const router = Router();
  const { osController, domainController, hrController } = getOsContainer();

  // Signed worker heartbeat endpoint (for laptop-off Cloudflare Cron / GitHub Actions)
  router.post('/workers/tick', requireWorkerSecret, osController.workerTick);

  // Protected CEO / Organization routes
  router.use(authenticate);

  router.get('/overview', osController.overview);
  router.get('/departments', osController.departments);
  router.get('/employees', osController.employees);
  router.patch(
    '/employees/:id',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    osController.updateEmployee,
  );

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
  router.get('/agents/live-activity', osController.agentLiveActivity);
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
  router.get('/github/probe', domainController.probeGithub);
  router.get(
    '/github/repos/:id/diagnostic',
    requireParam('id', { uuid: true }),
    domainController.diagnoseRepo,
  );
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
  router.get(
    '/github/repos/:id/analyze',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.analyzeRepo,
  );
  router.post(
    '/github/repos/:id/branch-pr',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.createBranchPr,
  );
  router.post(
    '/github/orgs/:owner/import',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('owner'),
    domainController.importOrgRepos,
  );
  router.post(
    '/github/repos/create',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    domainController.createGithubRepo,
  );
  router.post(
    '/github/repos/:id/workspace/sync',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.cloneOrPullWorkspace,
  );
  router.get(
    '/github/repos/:id/workspace/files',
    requireParam('id', { uuid: true }),
    domainController.listWorkspaceFiles,
  );
  router.get(
    '/github/repos/:id/workspace/file',
    requireParam('id', { uuid: true }),
    domainController.readWorkspaceFile,
  );
  router.post(
    '/github/repos/:id/workspace/files',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.writeWorkspaceFiles,
  );
  router.post(
    '/github/repos/:id/workspace/commit',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.commitWorkspace,
  );
  router.post(
    '/github/repos/:id/workspace/terminal',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.runWorkspaceTerminal,
  );
  router.post(
    '/github/repos/:id/workspace/install-deps',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.installWorkspaceDeps,
  );
  router.post(
    '/github/repos/:id/workspace/checks',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.runWorkspaceChecks,
  );
  router.get('/frontends', domainController.listFrontendWorkspaces);
  router.get(
    '/github/repos/:id/workspace/preview',
    requireParam('id', { uuid: true }),
    domainController.getWorkspacePreview,
  );
  router.post(
    '/github/repos/:id/workspace/push-pr',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.commitPushWorkspace,
  );
  router.get('/github/pull-requests', domainController.listPullRequests);
  router.post(
    '/github/pull-requests/sync',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.syncAllPullRequests,
  );

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
  router.get('/marketing/occasions', domainController.getMarketingOccasions);
  router.post(
    '/marketing/generate-content',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.generateMarketingContent,
  );
  router.post(
    '/marketing/publish',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.publishSocialPosts,
  );
  router.post(
    '/marketing/ceo-instant-post',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.executeCeoInstantPost,
  );
  router.get('/marketing/social-accounts', domainController.listSocialAccounts);
  router.post(
    '/marketing/social-accounts',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.upsertSocialAccount,
  );
  router.post(
    '/marketing/social-accounts/:id/test',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.testSocialAccount,
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
  router.post(
    '/crm/leads/:id/outreach',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.draftLeadOutreach,
  );
  router.patch(
    '/crm/leads/:id/stage',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.updateLeadStage,
  );
  router.get('/crm/interactions', domainController.listInteractions);
  router.post(
    '/crm/interactions/:id/classify',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    domainController.classifyReply,
  );
  router.post(
    '/crm/interactions/:id/approve',
    requireRoles(UserRole.CEO),
    requireParam('id', { uuid: true }),
    domainController.approveInteraction,
  );
  router.post(
    '/crm/interactions/:id/send',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    requireParam('id', { uuid: true }),
    validateDto(SendInteractionEmailDto),
    domainController.sendInteractionEmail,
  );

  // Multi-Business & Multi-Email Sender Accounts
  router.get('/businesses', domainController.listBusinesses);
  router.post(
    '/businesses',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    validateDto(CreateBusinessDto),
    domainController.createBusiness,
  );
  router.patch(
    '/businesses/:id',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    validateDto(UpdateBusinessDto),
    domainController.updateBusiness,
  );

  router.get(
    '/email-accounts',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    domainController.listEmailAccounts,
  );
  router.post(
    '/email-accounts',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    validateDto(CreateEmailAccountDto),
    domainController.createEmailAccount,
  );
  router.patch(
    '/email-accounts/:id',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    validateDto(UpdateEmailAccountDto),
    domainController.updateEmailAccount,
  );
  router.delete(
    '/email-accounts/:id',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    domainController.deleteEmailAccount,
  );
  router.post(
    '/email-accounts/:id/verify',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    validateDto(VerifyEmailAccountDto),
    domainController.verifyEmailAccount,
  );

  router.get('/ai-usage', domainController.aiUsage);
  router.get('/ai-usage/probe', domainController.probeProviders);
  router.get('/ai/health', domainController.aiHealth);
  router.put(
    '/ai-usage/budget',
    requireRoles(UserRole.CEO),
    validateDto(UpdateBudgetPolicyDto),
    domainController.updateBudget,
  );

  router.get('/notifications', osController.notifications);
  router.post('/notifications/test', osController.sendTestNotification);
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

  // --- HR, AI Agent Contracts, Company Rules & Computational Token System ---
  router.get('/hr/overview', hrController.getOverview);
  router.get('/hr/contracts', hrController.listContracts);
  router.get(
    '/hr/contracts/:employeeId',
    requireParam('employeeId', { uuid: true }),
    hrController.getContract,
  );
  router.get('/hr/rules', hrController.listRules);
  router.post('/hr/rules', requireRoles(UserRole.CEO, UserRole.ADMIN), hrController.createRule);
  router.patch(
    '/hr/rules/:id',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    requireParam('id', { uuid: true }),
    hrController.updateRule,
  );
  router.get('/hr/violations', hrController.listViolations);
  router.post(
    '/hr/violations/enforce',
    requireRoles(UserRole.CEO, UserRole.ADMIN, UserRole.OPERATOR),
    hrController.issueDisciplinaryAction,
  );
  router.post(
    '/hr/violations/:id/pardon',
    requireRoles(UserRole.CEO),
    requireParam('id', { uuid: true }),
    hrController.pardonViolation,
  );
  router.get('/hr/tokens/transactions', hrController.listTokenTransactions);
  router.post(
    '/hr/tokens/grant',
    requireRoles(UserRole.CEO, UserRole.ADMIN),
    hrController.grantTokens,
  );

  return router;
}
