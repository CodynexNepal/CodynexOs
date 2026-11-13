import { HrRepository } from '../repository/hr.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { socketServer } from '../socket/socket.server';
import { ApiError } from '../utils/api-error.util';
import {
  ContractStatus,
  PenaltyType,
  RuleSeverity,
  TokenTransactionType,
  ViolationStatus,
} from '../constant/enum.constant';
import { logger } from '../utils/logger.util';

export class HrService {
  constructor(
    private readonly hrRepo: HrRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly auditService: AuditService,
    private readonly notificationService?: NotificationService,
  ) {}

  async getOverview() {
    const contracts = await this.hrRepo.findAllContracts();
    const rules = await this.hrRepo.findAllRules();
    const violations = await this.hrRepo.findAllViolations();

    const activeContracts = contracts.filter((c) => c.status === ContractStatus.ACTIVE).length;
    const probationContracts = contracts.filter((c) => c.status === ContractStatus.PROBATION).length;
    const suspendedContracts = contracts.filter((c) => c.status === ContractStatus.SUSPENDED).length;

    const totalTokenCirculation = contracts.reduce((sum, c) => sum + c.tokenBalance, 0);
    const totalTokensEarned = contracts.reduce((sum, c) => sum + c.totalTokensEarned, 0);
    const totalTokensPenalized = contracts.reduce((sum, c) => sum + c.totalTokensPenalized, 0);

    const averageReputation =
      contracts.length > 0
        ? Math.round(contracts.reduce((sum, c) => sum + c.reputationScore, 0) / contracts.length)
        : 100;

    const leaderboard = [...contracts]
      .sort((a, b) => b.reputationScore - a.reputationScore || b.tokenBalance - a.tokenBalance)
      .slice(0, 5)
      .map((c) => ({
        employeeId: c.employeeId,
        roleTitle: c.employee?.roleTitle || 'AI Agent',
        department: c.employee?.department?.name || 'Department',
        tokenBalance: c.tokenBalance,
        reputationScore: c.reputationScore,
        status: c.status,
      }));

    return {
      activeContracts,
      probationContracts,
      suspendedContracts,
      totalContracts: contracts.length,
      totalRules: rules.filter((r) => r.isActive).length,
      totalViolations: violations.length,
      totalTokenCirculation,
      totalTokensEarned,
      totalTokensPenalized,
      averageReputation,
      leaderboard,
    };
  }

  async listContracts() {
    return this.hrRepo.findAllContracts();
  }

  async getContract(employeeId: string) {
    const contract = await this.hrRepo.findContractByEmployeeId(employeeId);
    if (!contract) {
      throw ApiError.notFound('Agent employment contract not found.');
    }
    const [violations, transactions] = await Promise.all([
      this.hrRepo.findViolationsByEmployeeId(employeeId),
      this.hrRepo.findTokenTransactionsByEmployeeId(employeeId, 25),
    ]);
    return { contract, violations, transactions };
  }

  async listRules() {
    return this.hrRepo.findAllRules();
  }

  async createRule(params: {
    ruleCode: string;
    title: string;
    description: string;
    severity: RuleSeverity;
    defaultPenaltyTokens?: number;
    category?: string;
    actorId: string;
  }) {
    const cleanCode = params.ruleCode.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = await this.hrRepo.findRuleByCode(cleanCode);
    if (existing) {
      throw ApiError.badRequest(`Rule code '${cleanCode}' already exists.`);
    }

    const rule = await this.hrRepo.saveRule({
      ruleCode: cleanCode,
      title: params.title.trim(),
      description: params.description.trim(),
      severity: params.severity,
      defaultPenaltyTokens: params.defaultPenaltyTokens ?? 200,
      category: params.category || 'OPERATIONAL',
      isActive: true,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'COMPANY_RULE_CREATED',
      resourceType: 'company_rule',
      resourceId: rule.id,
      metadata: { ruleCode: rule.ruleCode, title: rule.title },
    });

    return rule;
  }

  async updateRule(
    id: string,
    patch: {
      title?: string;
      description?: string;
      severity?: RuleSeverity;
      defaultPenaltyTokens?: number;
      isActive?: boolean;
    },
    actorId: string,
  ) {
    const rule = await this.hrRepo.findRuleById(id);
    if (!rule) throw ApiError.notFound('Company rule not found.');

    Object.assign(rule, patch);
    const updated = await this.hrRepo.saveRule(rule);

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'COMPANY_RULE_UPDATED',
      resourceType: 'company_rule',
      resourceId: rule.id,
      metadata: { ruleCode: rule.ruleCode },
    });

    return updated;
  }

  async listViolations() {
    return this.hrRepo.findAllViolations();
  }

  async issueDisciplinaryAction(params: {
    employeeId: string;
    ruleCode: string;
    penaltyType: PenaltyType;
    tokenPenaltyAmount?: number;
    explanation: string;
    taskId?: string;
    actorId: string;
  }) {
    const employee = await this.orgRepo.findEmployeeById(params.employeeId);
    if (!employee) throw ApiError.notFound('Target AI employee not found.');

    const contract = await this.hrRepo.findContractByEmployeeId(params.employeeId);
    if (!contract) {
      throw ApiError.badRequest('No active employment contract exists for this employee.');
    }

    const rule = await this.hrRepo.findRuleByCode(params.ruleCode);
    const severity = rule?.severity || RuleSeverity.MEDIUM;
    const penaltyAmount = params.tokenPenaltyAmount ?? rule?.defaultPenaltyTokens ?? 200;

    // 1. Record the violation
    const violation = await this.hrRepo.saveViolation({
      employeeId: employee.id,
      ruleId: rule?.id || null,
      ruleCode: params.ruleCode,
      taskId: params.taskId || null,
      severity,
      penaltyType: params.penaltyType,
      tokenPenaltyAmount: penaltyAmount,
      status: ViolationStatus.ENFORCED,
      explanation: params.explanation,
      detectedBy: 'hr_director',
      enforcedAt: new Date(),
    });

    // 2. Enforce the punishment on the agent's contract & wallet
    contract.violationsCount += 1;
    contract.penaltiesCount += 1;

    let balanceDeduction = 0;
    if (
      params.penaltyType === PenaltyType.TOKEN_DEDUCTION ||
      params.penaltyType === PenaltyType.BUDGET_SLASH ||
      params.penaltyType === PenaltyType.PROBATION ||
      params.penaltyType === PenaltyType.SUSPENSION
    ) {
      balanceDeduction = Math.min(contract.tokenBalance, penaltyAmount);
      contract.tokenBalance = Math.max(0, contract.tokenBalance - balanceDeduction);
      contract.totalTokensPenalized += balanceDeduction;

      await this.hrRepo.saveTokenTransaction({
        employeeId: employee.id,
        contractId: contract.id,
        taskId: params.taskId || null,
        amount: -balanceDeduction,
        type: TokenTransactionType.RULE_PENALTY,
        balanceAfter: contract.tokenBalance,
        description: `Disciplinary token fine for violating ${params.ruleCode}: ${params.explanation.slice(0, 100)}`,
      });
    }

    if (params.penaltyType === PenaltyType.PROBATION) {
      contract.status = ContractStatus.PROBATION;
      contract.reputationScore = Math.max(10, contract.reputationScore - 20);
    } else if (params.penaltyType === PenaltyType.SUSPENSION) {
      contract.status = ContractStatus.SUSPENDED;
      contract.reputationScore = Math.max(0, contract.reputationScore - 40);
      employee.isActive = false;
      await this.orgRepo.updateEmployee(employee.id, { isActive: false });
    } else if (params.penaltyType === PenaltyType.TERMINATION) {
      contract.status = ContractStatus.TERMINATED;
      contract.reputationScore = 0;
      employee.isActive = false;
      await this.orgRepo.updateEmployee(employee.id, { isActive: false });
    } else {
      contract.reputationScore = Math.max(20, contract.reputationScore - 10);
    }

    await this.hrRepo.saveContract(contract);

    // 3. Socket broadcast & Audit log
    socketServer.emit('hr:violation_issued', {
      violationId: violation.id,
      employeeId: employee.id,
      roleTitle: employee.roleTitle,
      ruleCode: params.ruleCode,
      penaltyType: params.penaltyType,
      tokenPenaltyAmount: balanceDeduction,
      contractStatus: contract.status,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'HR_DISCIPLINARY_PUNISHMENT_ENFORCED',
      resourceType: 'ai_employee',
      resourceId: employee.id,
      metadata: {
        ruleCode: params.ruleCode,
        penaltyType: params.penaltyType,
        tokenPenalty: balanceDeduction,
        contractStatus: contract.status,
      },
    });

    if (this.notificationService) {
      await this.notificationService.notifyUser({
        userId: params.actorId,
        category: 'COMPLIANCE_VIOLATION',
        severity: severity === RuleSeverity.CRITICAL ? 'CRITICAL' : 'WARNING',
        title: `HR Disciplinary Action: ${employee.roleTitle}`,
        message: `Agent penalized for violating ${params.ruleCode}. Punishment: ${params.penaltyType} (${balanceDeduction} CNT deducted).`,
        linkUrl: '/hr',
      });
    }

    return {
      violation,
      contract,
      punishmentSummary: `Enforced ${params.penaltyType}. Deducted ${balanceDeduction} CNT. Contract status: ${contract.status}.`,
    };
  }

  async pardonViolation(violationId: string, actorId: string, reason?: string) {
    const violation = await this.hrRepo.findViolationById(violationId);
    if (!violation) throw ApiError.notFound('Violation record not found.');
    if (violation.status === ViolationStatus.PARDONED) {
      throw ApiError.badRequest('Violation is already pardoned.');
    }

    violation.status = ViolationStatus.PARDONED;
    await this.hrRepo.saveViolation(violation);

    const contract = await this.hrRepo.findContractByEmployeeId(violation.employeeId);
    if (contract) {
      // Refund tokens if any were penalized
      if (violation.tokenPenaltyAmount > 0) {
        contract.tokenBalance += violation.tokenPenaltyAmount;
        contract.totalTokensPenalized = Math.max(
          0,
          contract.totalTokensPenalized - violation.tokenPenaltyAmount,
        );

        await this.hrRepo.saveTokenTransaction({
          employeeId: violation.employeeId,
          contractId: contract.id,
          amount: violation.tokenPenaltyAmount,
          type: TokenTransactionType.MANUAL_GRANT,
          balanceAfter: contract.tokenBalance,
          description: `Pardon refund for violation #${violation.id.slice(0, 8)}`,
        });
      }

      if (contract.status === ContractStatus.PROBATION || contract.status === ContractStatus.SUSPENDED) {
        contract.status = ContractStatus.ACTIVE;
        await this.orgRepo.updateEmployee(violation.employeeId, { isActive: true });
      }

      contract.reputationScore = Math.min(100, contract.reputationScore + 15);
      await this.hrRepo.saveContract(contract);
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId,
      action: 'HR_VIOLATION_PARDONED',
      resourceType: 'rule_violation',
      resourceId: violation.id,
      metadata: { employeeId: violation.employeeId, reason },
    });

    return { violation, contract };
  }

  async rewardTaskCompletion(taskId: string, employeeId: string, qaScore = 100) {
    try {
      const contract = await this.hrRepo.findContractByEmployeeId(employeeId);
      if (!contract) return null;

      const baseSalary = contract.tokenSalaryPerTask || 100;
      const meritBonus = qaScore >= 100 ? 50 : qaScore >= 80 ? 25 : 0;
      const totalReward = baseSalary + meritBonus;

      contract.tokenBalance += totalReward;
      contract.totalTokensEarned += totalReward;
      contract.reputationScore = Math.min(100, contract.reputationScore + 1);

      await this.hrRepo.saveContract(contract);

      await this.hrRepo.saveTokenTransaction({
        employeeId,
        contractId: contract.id,
        taskId,
        amount: totalReward,
        type: TokenTransactionType.TASK_REWARD,
        balanceAfter: contract.tokenBalance,
        description: `Task completion computational token salary (${baseSalary} base + ${meritBonus} merit bonus)`,
      });

      logger.info('Rewarded agent task completion in computational tokens', {
        employeeId,
        taskId,
        totalReward,
        balanceAfter: contract.tokenBalance,
      });

      return { totalReward, balanceAfter: contract.tokenBalance };
    } catch (err) {
      logger.error('Failed to reward agent in tokens', {
        employeeId,
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async handleTaskFailure(taskId: string, employeeId: string, reason: string) {
    try {
      const contract = await this.hrRepo.findContractByEmployeeId(employeeId);
      if (!contract) return null;

      const penalty = 50; // minor token deduction for unrecoverable failure
      contract.tokenBalance = Math.max(0, contract.tokenBalance - penalty);
      contract.totalTokensPenalized += penalty;
      contract.reputationScore = Math.max(10, contract.reputationScore - 2);

      await this.hrRepo.saveContract(contract);

      await this.hrRepo.saveTokenTransaction({
        employeeId,
        contractId: contract.id,
        taskId,
        amount: -penalty,
        type: TokenTransactionType.RULE_PENALTY,
        balanceAfter: contract.tokenBalance,
        description: `Automated performance deduction for task failure: ${reason.slice(0, 100)}`,
      });

      return { penaltyDeducted: penalty, balanceAfter: contract.tokenBalance };
    } catch (err) {
      logger.error('Failed to process task failure penalty', {
        employeeId,
        taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async listTokenTransactions(limit = 100, employeeId?: string) {
    if (employeeId) {
      return this.hrRepo.findTokenTransactionsByEmployeeId(employeeId, limit);
    }
    return this.hrRepo.findAllTokenTransactions(limit);
  }

  async grantManualTokens(params: {
    employeeId: string;
    amount: number;
    reason: string;
    actorId: string;
  }) {
    if (params.amount <= 0) {
      throw ApiError.badRequest('Token grant amount must be positive.');
    }

    const contract = await this.hrRepo.findContractByEmployeeId(params.employeeId);
    if (!contract) {
      throw ApiError.notFound('Employee contract not found.');
    }

    contract.tokenBalance += params.amount;
    contract.totalTokensEarned += params.amount;
    await this.hrRepo.saveContract(contract);

    const tx = await this.hrRepo.saveTokenTransaction({
      employeeId: params.employeeId,
      contractId: contract.id,
      amount: params.amount,
      type: TokenTransactionType.MANUAL_GRANT,
      balanceAfter: contract.tokenBalance,
      description: `CEO Token Grant: ${params.reason}`,
    });

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.actorId,
      action: 'HR_MANUAL_TOKEN_GRANT',
      resourceType: 'agent_contract',
      resourceId: contract.id,
      metadata: { amount: params.amount, reason: params.reason },
    });

    return { contract, transaction: tx };
  }
}
