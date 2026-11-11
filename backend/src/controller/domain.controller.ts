import { Request, Response, NextFunction } from 'express';
import { MemoryRepository } from '../repository/memory.repository';
import { EngineeringService } from '../services/engineering.service';
import { CrmService } from '../services/crm.service';
import { GovernanceRepository } from '../repository/governance.repository';
import { AuditService } from '../services/audit.service';
import { getRequiredParam } from '../decorators/http.decorator';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { MemoryCategory, QaVerdict } from '../constant/enum.constant';

export class DomainController {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly engService: EngineeringService,
    private readonly crmService: CrmService,
    private readonly governanceRepo: GovernanceRepository,
    private readonly auditService: AuditService,
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

  listPullRequests = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.engService.listPullRequests();
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

  listCampaigns = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.crmService.listCampaigns();
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

  listLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;
      const data = await this.crmService.listLeads(stage);
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
}
