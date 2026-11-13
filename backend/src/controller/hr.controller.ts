import { Request, Response, NextFunction } from 'express';
import { HrService } from '../services/hr.service';
import { STATUS_CODE } from '../constant/statusCode.interface';
import { getRequiredParam } from '../decorators/http.decorator';

export class HrController {
  constructor(private readonly hrService: HrService) {}

  getOverview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.getOverview();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listContracts = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.listContracts();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  getContract = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = getRequiredParam(req, 'employeeId');
      const data = await this.hrService.getContract(employeeId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listRules = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.listRules();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  createRule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.createRule({
        ruleCode: req.body.ruleCode,
        title: req.body.title,
        description: req.body.description,
        severity: req.body.severity,
        defaultPenaltyTokens: req.body.defaultPenaltyTokens,
        category: req.body.category,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  updateRule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.hrService.updateRule(
        id,
        {
          title: req.body.title,
          description: req.body.description,
          severity: req.body.severity,
          defaultPenaltyTokens: req.body.defaultPenaltyTokens,
          isActive: req.body.isActive,
        },
        req.user!.userId,
      );
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listViolations = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.listViolations();
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  issueDisciplinaryAction = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.issueDisciplinaryAction({
        employeeId: req.body.employeeId,
        ruleCode: req.body.ruleCode,
        penaltyType: req.body.penaltyType,
        tokenPenaltyAmount: req.body.tokenPenaltyAmount,
        explanation: req.body.explanation,
        taskId: req.body.taskId,
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.CREATED).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  pardonViolation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getRequiredParam(req, 'id');
      const data = await this.hrService.pardonViolation(id, req.user!.userId, req.body.reason);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  listTokenTransactions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
      const data = await this.hrService.listTokenTransactions(limit, employeeId);
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  grantTokens = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.hrService.grantManualTokens({
        employeeId: req.body.employeeId,
        amount: Number(req.body.amount),
        reason: req.body.reason || 'CEO Token Grant',
        actorId: req.user!.userId,
      });
      res.status(STATUS_CODE.OK).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
