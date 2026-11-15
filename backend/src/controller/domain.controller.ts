import { Request, Response, NextFunction } from 'express';
import { MemoryRepository } from '../repository/memory.repository';
import { EngineeringService } from '../services/engineering.service';
import { CrmService } from '../services/crm.service';
import { GovernanceRepository } from '../repository/governance.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { AuditService } from '../services/audit.service';
import { BusinessEmailService } from '../services/business-email.service';
import { MarketingService } from '../services/marketing.service';
import { workspacePreviewService } from '../services/workspace-preview.service';
import { getRequiredParam } from '../decorators/http.decorator';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { AiProviderName, MemoryCategory, QaVerdict } from '../constant/enum.constant';

export class DomainController {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly engService: EngineeringService,
    private readonly crmService: CrmService,
    private readonly governanceRepo: GovernanceRepository,
    private readonly modelRouter: ModelRouterService,
    private readonly auditService: AuditService,
    private readonly businessEmailService: BusinessEmailService,
    private readonly marketingService?: MarketingService,
  ) {}

  listMemory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const category =
        typeof req.query.category === 'string' ? (req.query.category as MemoryCategory) : undefined;
      const data = await this.memoryRepo.searchMemory(q, category);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createMemory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.memoryRepo.saveMemory({
        category: req.body.category,
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags ?? [],
        projectId: req.body.projectId ?? null,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listKnowledge = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.memoryRepo.findAllKnowledge();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createKnowledge = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = `${req.body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80)}-${Date.now().toString(36)}`;
      const data = await this.memoryRepo.saveKnowledge({
        title: req.body.title,
        slug,
        contentMd: req.body.contentMd,
        departmentId: req.body.departmentId ?? null,
        createdBy: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listRepos = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.listRepos();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  probeGithub = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
      const repo = typeof req.query.repo === 'string' ? req.query.repo : undefined;
      const data = await this.engService.probeGithubToken({ owner, repo });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  diagnoseRepo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.diagnoseRepositoryById(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  connectRepo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.connectRepo(
        req.body.owner,
        req.body.name,
        req.body.defaultBranch,
        Boolean(req.body.isWriteAuthorized),
        req.user!.userId,
      );
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  syncRepo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.syncRepoFromGithub(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  analyzeRepo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.analyzeRepo(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createBranchPr = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.createTaskBranchAndPr({
        repoId: id,
        branchName: req.body.branchName,
        title: req.body.title,
        body: req.body.body,
        taskId: req.body.taskId,
        filePath: req.body.filePath,
        fileContent: req.body.fileContent,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  importOrgRepos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = getRequiredParam(req, 'owner');
      const data = await this.engService.importOwnerRepos(owner, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createGithubRepo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.createGithubRepo({
        name: req.body.name,
        description: req.body.description,
        owner: req.body.owner,
        isPrivate: Boolean(req.body.isPrivate),
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  cloneOrPullWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.cloneOrPullWorkspace(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  listWorkspaceFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const subPath = typeof req.query.path === 'string' ? req.query.path : '';
      const data = await this.engService.listWorkspaceFiles(id, subPath);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  readWorkspaceFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const filePath = typeof req.query.path === 'string' ? req.query.path : '';
      const data = await this.engService.readWorkspaceFile(id, filePath);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listFrontendWorkspaces = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = workspacePreviewService.listAvailableFrontends();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getWorkspacePreview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.getWorkspacePreviewInfo(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  writeWorkspaceFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.writeWorkspaceFiles(
        id,
        req.body.branchName,
        req.body.files ?? [],
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  commitWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.commitWorkspaceFiles({
        repoId: id,
        branchName: req.body.branchName,
        commitMessage: req.body.commitMessage || req.body.message,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  runWorkspaceTerminal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const command = typeof req.body?.command === 'string' ? req.body.command : '';
      const data = await this.engService.executeWorkspaceTerminal({
        repoId: id,
        command,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  installWorkspaceDeps = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.installWorkspaceDependencies(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  runWorkspaceChecks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : undefined;
      const data = await this.engService.runWorkspaceChecks(id, taskId, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  commitPushWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.engService.commitPushAndOpenPr({
        repoId: id,
        branchName: req.body.branchName,
        title: req.body.title,
        body: req.body.body,
        commitMessage: req.body.commitMessage,
        taskId: req.body.taskId,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listPullRequests = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.listPullRequests();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  syncAllPullRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.syncAllPullRequests(req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  listQaReports = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.listQaReports();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createQaReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.recordQaReport({
        taskId: req.body.taskId,
        verdict: req.body.verdict as QaVerdict,
        checksExecuted: req.body.checksExecuted ?? [],
        failedComponent: req.body.failedComponent,
        summary: req.body.summary,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : undefined;
      const data = this.marketingService
        ? await this.marketingService.listCampaigns(businessId)
        : await this.crmService.listCampaigns(businessId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  createCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.crmService.createCampaign(req.body, req.user!.userId);
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getMarketingOccasions = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.OK).json({ success: true, data: [] });
      }
      const data = this.marketingService.getOccasions();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  generateMarketingContent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const data = await this.marketingService.generateContent({
        occasionKey: req.body.occasionKey,
        businessId: req.body.businessId,
        businessName: req.body.businessName,
        customPrompt: req.body.customPrompt,
        channels: req.body.channels || ['TIKTOK', 'FACEBOOK', 'WHATSAPP'],
        brandVoice: req.body.brandVoice,
        discountCode: req.body.discountCode,
        targetAudience: req.body.targetAudience,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  publishSocialPosts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const data = await this.marketingService.publishToSocialChannels({
        campaignId: req.body.campaignId,
        occasion: req.body.occasion,
        channels: req.body.channels || ['TIKTOK', 'FACEBOOK', 'WHATSAPP'],
        content: req.body.content,
        businessId: req.body.businessId,
        actorId: req.user?.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  executeCeoInstantPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const data = await this.marketingService.executeCeoCommandPost({
        commandText: req.body.commandText,
        occasionKey: req.body.occasionKey,
        channels: req.body.channels,
        businessId: req.body.businessId,
        actorId: req.user?.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listSocialAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.OK).json({ success: true, data: [] });
      }
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : undefined;
      const data = await this.marketingService.listSocialAccounts(businessId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  upsertSocialAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const data = await this.marketingService.saveSocialAccount(req.body);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  testSocialAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const id = getRequiredParam(req, 'id');
      const data = await this.marketingService.testAccountConnection(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  deleteSocialAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.marketingService) {
        return res.status(STATUS_CODE.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Marketing service not configured',
        });
      }
      const id = getRequiredParam(req, 'id');
      const data = await this.marketingService.deleteSocialAccount(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : undefined;
      const data = await this.crmService.listLeads(stage, businessId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  upsertLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.crmService.upsertLead(req.body, req.user!.userId);
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  optOutLead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.crmService.markOptOut(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  listInteractions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
      const data = await this.crmService.listInteractions(leadId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  draftLeadOutreach = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.crmService.draftOutreach(id, {
        subject: req.body.subject,
        body: req.body.body,
        channel: req.body.channel ?? 'EMAIL',
        businessId: req.body.businessId,
        emailAccountId: req.body.emailAccountId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  approveInteraction = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.crmService.approveInteraction(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  sendInteractionEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const emailAccountId =
        typeof req.body?.emailAccountId === 'string' ? req.body.emailAccountId : undefined;
      const data = await this.crmService.sendApprovedInteraction(
        id,
        req.user!.userId,
        emailAccountId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  listBusinesses = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.businessEmailService.listBusinesses();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createBusiness = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.businessEmailService.createBusiness(req.body, req.user!.userId);
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateBusiness = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.businessEmailService.updateBusiness(id, req.body, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  listEmailAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : undefined;
      const data = await this.businessEmailService.listEmailAccounts(businessId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  createEmailAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.businessEmailService.createEmailAccount(req.body, req.user!.userId);
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateEmailAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.businessEmailService.updateEmailAccount(id, req.body, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  deleteEmailAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.businessEmailService.deleteEmailAccount(id, req.user!.userId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  verifyEmailAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const testRecipientEmail =
        typeof req.body?.testRecipientEmail === 'string'
          ? req.body.testRecipientEmail
          : undefined;
      const data = await this.businessEmailService.verifyEmailAccount(
        id,
        testRecipientEmail,
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  updateLeadStage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.crmService.updateLeadStage(
        id,
        req.body.stage,
        req.body.nextFollowUpAt,
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  classifyReply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.crmService.classifyInteractionReply(
        id,
        req.body.classification,
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  aiUsage = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [summary, logs, budget] = await Promise.all([
        this.governanceRepo.getUsageSummary(),
        this.governanceRepo.findUsageLogs(100),
        this.governanceRepo.findGlobalBudget(),
      ]);
      res.status(STATUS_CODE.OK).json({ success: true, data: { summary, logs, budget } });
    } catch (err) {
      next(err);
    }
  };

  probeProviders = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.probeFreeProviders();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  aiHealth = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.getHealthReport();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };


  updateBudget = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await this.governanceRepo.findGlobalBudget();
      const saved = await this.governanceRepo.saveBudget({
        ...(existing ? { id: existing.id } : {}),
        scopeType: 'GLOBAL',
        dailyTokenLimit: req.body.dailyTokenLimit,
        maxConcurrentRequests: req.body.maxConcurrentRequests,
        allowPaidProviders: Boolean(req.body.allowPaidProviders),
      });

      await this.auditService.log({
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'BUDGET_POLICY_UPDATED',
        resourceType: 'budget_policy',
        resourceId: saved.id,
        metadata: {
          dailyTokenLimit: saved.dailyTokenLimit,
          allowPaidProviders: saved.allowPaidProviders,
        },
      });

      res.status(STATUS_CODE.OK).json({ success: true, data: saved });
    } catch (err) {
      next(err);
    }
  };

  listAiProviders = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.listProviders();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  saveAiProvider = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = req.body.provider as AiProviderName;
      await this.modelRouter.saveProviderCredentials(provider, {
        apiKey: req.body.apiKey,
        accountId: req.body.accountId,
        apiToken: req.body.apiToken,
        baseUrl: req.body.baseUrl,
      });

      if (req.user?.userId) {
        await this.auditService.log({
          actorType: 'USER',
          actorId: req.user.userId,
          action: 'AI_PROVIDER_CREDENTIALS_UPDATED',
          resourceType: 'ai_provider',
          resourceId: provider,
          metadata: { provider },
        });
      }

      res.status(STATUS_CODE.OK).json({ success: true, message: `Updated credentials for ${provider}` });
    } catch (err) {
      next(err);
    }
  };

  deleteAiProvider = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id') as AiProviderName;
      await this.modelRouter.removeProviderCredentials(id);

      if (req.user?.userId) {
        await this.auditService.log({
          actorType: 'USER',
          actorId: req.user.userId,
          action: 'AI_PROVIDER_CREDENTIALS_DELETED',
          resourceType: 'ai_provider',
          resourceId: id,
          metadata: { provider: id },
        });
      }

      res.status(STATUS_CODE.OK).json({ success: true, message: `Removed credentials for ${id}` });
    } catch (err) {
      next(err);
    }
  };

  testAiProvider = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id') as AiProviderName;
      const data = await this.modelRouter.testProvider(id, {
        apiKey: req.body?.apiKey,
        accountId: req.body?.accountId,
        apiToken: req.body?.apiToken,
        baseUrl: req.body?.baseUrl,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getAiProviderModels = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id') as AiProviderName;
      const data = await this.modelRouter.getProviderModels(id);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getAllAiModels = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.getAllFreeModels();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getAiQuotas = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.getQuotaStatus();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getAiSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.getGlobalSettings();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateAiSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.updateGlobalSettings(req.body);

      if (req.user?.userId) {
        await this.auditService.log({
          actorType: 'USER',
          actorId: req.user.userId,
          action: 'AI_GLOBAL_SETTINGS_UPDATED',
          resourceType: 'ai_settings',
          resourceId: 'global',
          metadata: req.body,
        });
      }

      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getAiAgentPreferences = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.modelRouter.getAgentPreferences();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateAiAgentPreference = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.modelRouter.updateAgentPreference(id, req.body);

      if (req.user?.userId) {
        await this.auditService.log({
          actorType: 'USER',
          actorId: req.user.userId,
          action: 'AI_AGENT_PREFERENCE_UPDATED',
          resourceType: 'ai_agent_preference',
          resourceId: id,
          metadata: req.body,
        });
      }

      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
