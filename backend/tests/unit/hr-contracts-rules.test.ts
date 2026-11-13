import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HrService } from '../../src/services/hr.service';
import {
  ContractStatus,
  PenaltyType,
  RuleSeverity,
  TokenTransactionType,
  ViolationStatus,
} from '../../src/constant/enum.constant';

describe('HR AI Employee, Agent Contracts, Rules & Token Penalty System', () => {
  let hrService: HrService;
  let mockHrRepo: any;
  let mockOrgRepo: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockEmployee = {
    id: 'emp-101',
    slug: 'backend_lead',
    roleTitle: 'Backend Engineering Lead',
    isActive: true,
    department: { name: 'Engineering', slug: 'engineering' },
  };

  const mockContract = {
    id: 'contract-201',
    employeeId: 'emp-101',
    contractNumber: 'CNT-ENG-001',
    title: 'Backend Engineering Lead Employment Agreement',
    status: ContractStatus.ACTIVE,
    tokenSalaryPerTask: 100,
    tokenBalance: 1000,
    stakedTokens: 0,
    totalTokensEarned: 1000,
    totalTokensPenalized: 0,
    reputationScore: 100,
    violationsCount: 0,
    penaltiesCount: 0,
    employee: mockEmployee,
  };

  const mockRule = {
    id: 'rule-301',
    ruleCode: 'RULE_NO_UNAUTHORIZED_DEPLOY',
    title: 'Zero Unauthorized Production Deployments',
    severity: RuleSeverity.CRITICAL,
    defaultPenaltyTokens: 1000,
    category: 'GOVERNANCE',
    isActive: true,
  };

  beforeEach(() => {
    mockHrRepo = {
      findAllContracts: vi.fn().mockResolvedValue([mockContract]),
      findContractById: vi.fn().mockResolvedValue(mockContract),
      findContractByEmployeeId: vi.fn().mockResolvedValue({ ...mockContract }),
      saveContract: vi.fn().mockImplementation(async (c) => c),
      findAllRules: vi.fn().mockResolvedValue([mockRule]),
      findRuleById: vi.fn().mockResolvedValue(mockRule),
      findRuleByCode: vi.fn().mockImplementation(async (code) => (code === mockRule.ruleCode ? mockRule : null)),
      saveRule: vi.fn().mockImplementation(async (r) => r),
      findAllViolations: vi.fn().mockResolvedValue([]),
      findViolationsByEmployeeId: vi.fn().mockResolvedValue([]),
      findViolationById: vi.fn().mockResolvedValue(null),
      saveViolation: vi.fn().mockImplementation(async (v) => ({ id: 'viol-401', ...v })),
      findAllTokenTransactions: vi.fn().mockResolvedValue([]),
      findTokenTransactionsByEmployeeId: vi.fn().mockResolvedValue([]),
      saveTokenTransaction: vi.fn().mockImplementation(async (tx) => ({ id: 'tx-501', ...tx })),
    };

    mockOrgRepo = {
      findEmployeeById: vi.fn().mockResolvedValue({ ...mockEmployee }),
      updateEmployee: vi.fn().mockResolvedValue({}),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue({}),
    };

    mockNotificationService = {
      notifyUser: vi.fn().mockResolvedValue({}),
    };

    hrService = new HrService(mockHrRepo, mockOrgRepo, mockAuditService, mockNotificationService);
  });

  it('calculates HR overview with computational tokens in circulation instead of fiat currency', async () => {
    const overview = await hrService.getOverview();

    expect(overview.activeContracts).toBe(1);
    expect(overview.totalTokenCirculation).toBe(1000);
    expect(overview.totalTokensEarned).toBe(1000);
    expect(overview.totalTokensPenalized).toBe(0);
    expect(overview.averageReputation).toBe(100);
    expect(overview.leaderboard[0]?.roleTitle).toBe('Backend Engineering Lead');
  });

  it('punishes an agent who violates company rules with token deduction and reputation drop', async () => {
    const result = await hrService.issueDisciplinaryAction({
      employeeId: 'emp-101',
      ruleCode: 'RULE_NO_UNAUTHORIZED_DEPLOY',
      penaltyType: PenaltyType.TOKEN_DEDUCTION,
      tokenPenaltyAmount: 500,
      explanation: 'Attempted direct push to protected production branch without CEO approval.',
      actorId: 'ceo-user-1',
    });

    expect(result.contract.tokenBalance).toBe(500); // 1000 - 500
    expect(result.contract.totalTokensPenalized).toBe(500);
    expect(result.contract.violationsCount).toBe(1);
    expect(result.contract.reputationScore).toBe(90); // 100 - 10
    expect(result.violation.penaltyType).toBe(PenaltyType.TOKEN_DEDUCTION);

    // Verifies token deduction recorded in computational ledger
    expect(mockHrRepo.saveTokenTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-101',
        amount: -500,
        type: TokenTransactionType.RULE_PENALTY,
        balanceAfter: 500,
      }),
    );
  });

  it('punishes critical violations with SUSPENSION, deactivating employee and slashing reputation', async () => {
    const result = await hrService.issueDisciplinaryAction({
      employeeId: 'emp-101',
      ruleCode: 'RULE_NO_UNAUTHORIZED_DEPLOY',
      penaltyType: PenaltyType.SUSPENSION,
      tokenPenaltyAmount: 1000,
      explanation: 'Repeated unauthorized deployment attempts.',
      actorId: 'ceo-user-1',
    });

    expect(result.contract.status).toBe(ContractStatus.SUSPENDED);
    expect(result.contract.tokenBalance).toBe(0);
    expect(result.contract.reputationScore).toBe(60); // 100 - 40
    expect(mockOrgRepo.updateEmployee).toHaveBeenCalledWith('emp-101', { isActive: false });
  });

  it('places an agent on PROBATION when penalized with probation', async () => {
    const result = await hrService.issueDisciplinaryAction({
      employeeId: 'emp-101',
      ruleCode: 'RULE_NO_UNAUTHORIZED_DEPLOY',
      penaltyType: PenaltyType.PROBATION,
      tokenPenaltyAmount: 300,
      explanation: 'Minor deployment policy infraction.',
      actorId: 'ceo-user-1',
    });

    expect(result.contract.status).toBe(ContractStatus.PROBATION);
    expect(result.contract.tokenBalance).toBe(700);
    expect(result.contract.reputationScore).toBe(80);
  });

  it('rewards an AI agent in computational tokens upon successful task completion', async () => {
    const reward = await hrService.rewardTaskCompletion('task-999', 'emp-101', 100);

    expect(reward).not.toBeNull();
    expect(reward?.totalReward).toBe(150); // 100 base + 50 merit bonus for 100% QA
    expect(reward?.balanceAfter).toBe(1150); // 1000 + 150

    expect(mockHrRepo.saveTokenTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-101',
        taskId: 'task-999',
        amount: 150,
        type: TokenTransactionType.TASK_REWARD,
        balanceAfter: 1150,
      }),
    );
  });

  it('penalizes an AI agent in computational tokens upon unrecoverable task failure', async () => {
    const penalty = await hrService.handleTaskFailure('task-888', 'emp-101', 'Fatal execution timeout');

    expect(penalty?.penaltyDeducted).toBe(50);
    expect(penalty?.balanceAfter).toBe(950); // 1000 - 50

    expect(mockHrRepo.saveTokenTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'emp-101',
        taskId: 'task-888',
        amount: -50,
        type: TokenTransactionType.RULE_PENALTY,
        balanceAfter: 950,
      }),
    );
  });

  it('allows CEO to pardon a violation and refunds penalized tokens', async () => {
    const mockViolation = {
      id: 'viol-777',
      employeeId: 'emp-101',
      tokenPenaltyAmount: 300,
      status: ViolationStatus.ENFORCED,
    };
    mockHrRepo.findViolationById.mockResolvedValueOnce(mockViolation);

    const result = await hrService.pardonViolation('viol-777', 'ceo-1', 'False positive incident');

    expect(result.violation.status).toBe(ViolationStatus.PARDONED);
    expect(result.contract?.tokenBalance).toBe(1300); // 1000 + 300 refund
    expect(mockHrRepo.saveTokenTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        type: TokenTransactionType.MANUAL_GRANT,
      }),
    );
  });
});
