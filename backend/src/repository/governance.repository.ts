import { AppDataSource } from '../database/database-source';
import { ApprovalRequestEntity } from '../entities/approval-request.entity';
import { NotificationEntity } from '../entities/notification.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { BudgetPolicyEntity } from '../entities/budget-policy.entity';
import { AiUsageLogEntity } from '../entities/ai-usage-log.entity';
import { SystemSettingEntity } from '../entities/system-setting.entity';
import { ApprovalStatus } from '../constant/enum.constant';

export class GovernanceRepository {
  private get approvalRepo() {
    return AppDataSource.getRepository(ApprovalRequestEntity);
  }

  private get notifRepo() {
    return AppDataSource.getRepository(NotificationEntity);
  }

  private get auditRepo() {
    return AppDataSource.getRepository(AuditLogEntity);
  }

  private get budgetRepo() {
    return AppDataSource.getRepository(BudgetPolicyEntity);
  }

  private get usageRepo() {
    return AppDataSource.getRepository(AiUsageLogEntity);
  }

  private get settingRepo() {
    return AppDataSource.getRepository(SystemSettingEntity);
  }

  findApprovals(status?: ApprovalStatus) {
    return this.approvalRepo.find({
      ...(status ? { where: { status } } : {}),
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  findApprovalById(id: string) {
    return this.approvalRepo.findOne({ where: { id } });
  }

  saveApproval(data: Partial<ApprovalRequestEntity>) {
    return this.approvalRepo.save(this.approvalRepo.create(data));
  }

  findNotifications(userId: string) {
    return this.notifRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  saveNotification(data: Partial<NotificationEntity>) {
    return this.notifRepo.save(this.notifRepo.create(data));
  }

  markNotificationRead(id: string, userId: string) {
    return this.notifRepo.update({ id, userId }, { isRead: true });
  }

  markAllNotificationsRead(userId: string) {
    return this.notifRepo.update({ userId, isRead: false }, { isRead: true });
  }

  appendAuditLog(data: Partial<AuditLogEntity>) {
    return this.auditRepo.save(this.auditRepo.create(data));
  }

  findAuditLogs(limit = 150) {
    return this.auditRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  findGlobalBudget() {
    return this.budgetRepo.findOne({ where: { scopeType: 'GLOBAL' } });
  }

  saveBudget(data: Partial<BudgetPolicyEntity>) {
    return this.budgetRepo.save(this.budgetRepo.create(data));
  }

  findUsageLogs(limit = 100) {
    return this.usageRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async getUsageSummary() {
    const totals = await this.usageRepo
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.input_tokens), 0)', 'inputTokens')
      .addSelect('COALESCE(SUM(u.output_tokens), 0)', 'outputTokens')
      .addSelect('COALESCE(SUM(u.estimated_cost_usd), 0)', 'estimatedCostUsd')
      .addSelect('COUNT(*)', 'requestCount')
      .getRawOne<{
        inputTokens: string;
        outputTokens: string;
        estimatedCostUsd: string;
        requestCount: string;
      }>();

    const byProvider = await this.usageRepo
      .createQueryBuilder('u')
      .select('u.provider', 'provider')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('COALESCE(SUM(u.input_tokens + u.output_tokens), 0)', 'tokens')
      .addSelect(
        "SUM(CASE WHEN u.status IN ('RATE_LIMITED', 'QUOTA_EXHAUSTED') THEN 1 ELSE 0 END)",
        'quotaHits',
      )
      .groupBy('u.provider')
      .getRawMany();

    return {
      inputTokens: Number(totals?.inputTokens ?? 0),
      outputTokens: Number(totals?.outputTokens ?? 0),
      estimatedCostUsd: Number(totals?.estimatedCostUsd ?? 0),
      requestCount: Number(totals?.requestCount ?? 0),
      byProvider,
    };
  }

  findAllSettings() {
    return this.settingRepo.find({ order: { key: 'ASC' } });
  }

  findSetting(key: string) {
    return this.settingRepo.findOne({ where: { key } });
  }

  saveSetting(data: Partial<SystemSettingEntity>) {
    return this.settingRepo.save(this.settingRepo.create(data));
  }
}
