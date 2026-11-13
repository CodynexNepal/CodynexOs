import { AppDataSource } from '../database/database-source';
import { AgentContractEntity } from '../entities/agent-contract.entity';
import { CompanyRuleEntity } from '../entities/company-rule.entity';
import { RuleViolationEntity } from '../entities/rule-violation.entity';
import { AgentTokenTransactionEntity } from '../entities/agent-token-transaction.entity';

export class HrRepository {
  private get contractRepo() {
    return AppDataSource.getRepository(AgentContractEntity);
  }

  private get ruleRepo() {
    return AppDataSource.getRepository(CompanyRuleEntity);
  }

  private get violationRepo() {
    return AppDataSource.getRepository(RuleViolationEntity);
  }

  private get txRepo() {
    return AppDataSource.getRepository(AgentTokenTransactionEntity);
  }

  // --- Contracts ---
  async findAllContracts(): Promise<AgentContractEntity[]> {
    return this.contractRepo.find({
      relations: ['employee', 'employee.department'],
      order: { reputationScore: 'DESC', createdAt: 'ASC' },
    });
  }

  async findContractById(id: string): Promise<AgentContractEntity | null> {
    return this.contractRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.department'],
    });
  }

  async findContractByEmployeeId(employeeId: string): Promise<AgentContractEntity | null> {
    return this.contractRepo.findOne({
      where: { employeeId },
      relations: ['employee', 'employee.department'],
    });
  }

  async saveContract(contract: Partial<AgentContractEntity>): Promise<AgentContractEntity> {
    return this.contractRepo.save(contract);
  }

  // --- Rules ---
  async findAllRules(): Promise<CompanyRuleEntity[]> {
    return this.ruleRepo.find({
      order: { severity: 'DESC', createdAt: 'ASC' },
    });
  }

  async findRuleById(id: string): Promise<CompanyRuleEntity | null> {
    return this.ruleRepo.findOne({ where: { id } });
  }

  async findRuleByCode(ruleCode: string): Promise<CompanyRuleEntity | null> {
    return this.ruleRepo.findOne({ where: { ruleCode } });
  }

  async saveRule(rule: Partial<CompanyRuleEntity>): Promise<CompanyRuleEntity> {
    return this.ruleRepo.save(rule);
  }

  // --- Violations ---
  async findAllViolations(): Promise<RuleViolationEntity[]> {
    return this.violationRepo.find({
      relations: ['employee', 'employee.department', 'rule'],
      order: { createdAt: 'DESC' },
    });
  }

  async findViolationsByEmployeeId(employeeId: string): Promise<RuleViolationEntity[]> {
    return this.violationRepo.find({
      where: { employeeId },
      relations: ['employee', 'rule'],
      order: { createdAt: 'DESC' },
    });
  }

  async findViolationById(id: string): Promise<RuleViolationEntity | null> {
    return this.violationRepo.findOne({
      where: { id },
      relations: ['employee', 'rule'],
    });
  }

  async saveViolation(violation: Partial<RuleViolationEntity>): Promise<RuleViolationEntity> {
    return this.violationRepo.save(violation);
  }

  // --- Token Transactions ---
  async findAllTokenTransactions(limit = 100): Promise<AgentTokenTransactionEntity[]> {
    return this.txRepo.find({
      relations: ['employee'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findTokenTransactionsByEmployeeId(
    employeeId: string,
    limit = 50,
  ): Promise<AgentTokenTransactionEntity[]> {
    return this.txRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async saveTokenTransaction(
    tx: Partial<AgentTokenTransactionEntity>,
  ): Promise<AgentTokenTransactionEntity> {
    return this.txRepo.save(tx);
  }
}
