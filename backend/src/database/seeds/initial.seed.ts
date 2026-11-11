import { AppDataSource } from '../database-source';
import { UserEntity } from '../../entities/user.entity';
import { DepartmentEntity } from '../../entities/department.entity';
import { AiEmployeeEntity } from '../../entities/ai-employee.entity';
import { BudgetPolicyEntity } from '../../entities/budget-policy.entity';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { CompanyMemoryEntity } from '../../entities/company-memory.entity';
import { AI_EMPLOYEE_SEEDS, DEPARTMENT_SEEDS } from '../../constant/company.constant';
import { MemoryCategory, UserRole } from '../../constant/enum.constant';
import { dotEnvConfig } from '../../configs/envConfig';
import { hashPassword } from '../../utils/password.util';
import { logger } from '../../utils/logger.util';

export async function runInitialSeed(): Promise<void> {
  const userRepo = AppDataSource.getRepository(UserEntity);
  const deptRepo = AppDataSource.getRepository(DepartmentEntity);
  const empRepo = AppDataSource.getRepository(AiEmployeeEntity);
  const budgetRepo = AppDataSource.getRepository(BudgetPolicyEntity);
  const settingRepo = AppDataSource.getRepository(SystemSettingEntity);
  const memoryRepo = AppDataSource.getRepository(CompanyMemoryEntity);

  // 1. Seed CEO account if absent
  let ceo = await userRepo.findOne({ where: { email: dotEnvConfig.CEO_EMAIL } });
  if (!ceo) {
    ceo = userRepo.create({
      email: dotEnvConfig.CEO_EMAIL,
      passwordHash: await hashPassword(dotEnvConfig.CEO_PASSWORD),
      fullName: dotEnvConfig.CEO_NAME,
      role: UserRole.CEO,
      isActive: true,
    });
    await userRepo.save(ceo);
    logger.info('Seeded initial CEO account', { email: ceo.email });
  }

  // 2. Seed 5 Departments
  const deptMap = new Map<string, DepartmentEntity>();
  for (const d of DEPARTMENT_SEEDS) {
    let dept = await deptRepo.findOne({ where: { slug: d.slug } });
    if (!dept) {
      dept = deptRepo.create({
        slug: d.slug,
        name: d.name,
        description: d.description,
        dailyTokenBudget: d.dailyTokenBudget,
        isActive: true,
      });
      await deptRepo.save(dept);
    }
    deptMap.set(d.slug, dept);
  }

  // 3. Seed 20 Logical AI Employees
  for (const e of AI_EMPLOYEE_SEEDS) {
    const dept = deptMap.get(e.departmentSlug);
    if (!dept) continue;
    const existing = await empRepo.findOne({ where: { slug: e.slug } });
    if (!existing) {
      await empRepo.save(
        empRepo.create({
          departmentId: dept.id,
          slug: e.slug,
          roleTitle: e.roleTitle,
          systemInstruction: e.systemInstruction,
          allowedTools: e.allowedTools,
          knowledgeScopes: e.knowledgeScopes,
          preferredProvider: 'gemini',
          preferredModel: dotEnvConfig.GEMINI_MODEL,
          fallbackProvider: 'groq',
          fallbackModel: dotEnvConfig.GROQ_MODEL,
          dailyTokenBudget: e.dailyTokenBudget,
          executionBudgetMs: e.executionBudgetMs,
          isActive: true,
        }),
      );
    } else if (
      existing.preferredModel === 'gemini-2.5-flash' ||
      existing.fallbackModel === 'llama-3.3-70b-versatile'
    ) {
      await empRepo.update(
        { id: existing.id },
        {
          ...(existing.preferredModel === 'gemini-2.5-flash'
            ? { preferredModel: dotEnvConfig.GEMINI_MODEL }
            : {}),
          ...(existing.fallbackModel === 'llama-3.3-70b-versatile'
            ? { fallbackModel: dotEnvConfig.GROQ_MODEL }
            : {}),
        },
      );
    }
  }

  // 4. Global Zero-Cost Budget Policy (paid providers disabled by default)
  const globalBudget = await budgetRepo.findOne({ where: { scopeType: 'GLOBAL' } });
  if (!globalBudget) {
    await budgetRepo.save(
      budgetRepo.create({
        scopeType: 'GLOBAL',
        scopeId: null,
        dailyTokenLimit: 500000,
        monthlyUsdLimit: '0.0000',
        maxConcurrentRequests: 3,
        allowPaidProviders: dotEnvConfig.ALLOW_PAID_PROVIDERS,
      }),
    );
  }

  // 5. Default System Settings
  const defaultSettings: Array<{ key: string; value: Record<string, unknown> }> = [
    {
      key: 'cost_policy',
      value: {
        targetMonthlySpendNpr: 0,
        allowPaidProviders: false,
        pauseOnQuotaExhausted: true,
      },
    },
    {
      key: 'worker_config',
      value: {
        maxConcurrentTasks: 3,
        leaseDurationSeconds: 120,
        defaultMaxRetries: 3,
      },
    },
  ];
  for (const s of defaultSettings) {
    const exists = await settingRepo.findOne({ where: { key: s.key } });
    if (!exists) {
      await settingRepo.save(settingRepo.create({ key: s.key, value: s.value, isSecret: false }));
    }
  }

  // 6. Seed foundational Company Memory entry if empty
  const memCount = await memoryRepo.count();
  if (memCount === 0) {
    await memoryRepo.save(
      memoryRepo.create({
        category: MemoryCategory.INSTRUCTION,
        title: 'CodyNex OS Operating Charter & NPR 0 Rule',
        content:
          'All departments operate under CEO authority. Never push directly to production branches, never send bulk outreach without CEO approval, never claim completion without QA verification, and never silently switch to paid AI services.',
        tags: ['charter', 'governance', 'cost-control'],
      }),
    );
  }
}
