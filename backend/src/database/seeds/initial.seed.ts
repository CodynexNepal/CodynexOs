import crypto from 'crypto';
import { AppDataSource } from '../database-source';
import { UserEntity } from '../../entities/user.entity';
import { DepartmentEntity } from '../../entities/department.entity';
import { AiEmployeeEntity } from '../../entities/ai-employee.entity';
import { BudgetPolicyEntity } from '../../entities/budget-policy.entity';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { CompanyMemoryEntity } from '../../entities/company-memory.entity';
import { KnowledgeDocumentEntity } from '../../entities/knowledge-document.entity';
import { BusinessEntity } from '../../entities/business.entity';
import { TaskEntity } from '../../entities/task.entity';
import { CompanyRuleEntity } from '../../entities/company-rule.entity';
import { AgentContractEntity } from '../../entities/agent-contract.entity';
import { AgentTokenTransactionEntity } from '../../entities/agent-token-transaction.entity';
import {
  AI_EMPLOYEE_SEEDS,
  DEPARTMENT_SEEDS,
  DEFAULT_COMPANY_RULES,
  DEFAULT_AGENT_CONTRACT_TERMS,
} from '../../constant/company.constant';
import {
  ContractStatus,
  MemoryCategory,
  TokenTransactionType,
  UserRole,
} from '../../constant/enum.constant';
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
  const knowledgeRepo = AppDataSource.getRepository(KnowledgeDocumentEntity);

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

  // 7. Seed foundational Knowledge Base SOPs & Playbooks if empty
  const kbCount = await knowledgeRepo.count();
  if (kbCount === 0) {
    const engDept = deptMap.get('engineering');
    const mktDept = deptMap.get('marketing');
    const salesDept = deptMap.get('sales');

    const sops = [
      {
        departmentId: engDept?.id ?? null,
        title: 'Engineering SOP: HostelGhar Backend & Next.js Standards',
        slug: 'engineering-sop-hostelghar-standards',
        contentMd:
          '1. Backend follows Express 5 + TypeScript + TypeORM layered flow: route -> middleware/decorator -> controller -> service -> repository.\n2. Keep all TypeORM queries inside src/repository/*.\n3. Frontend uses Next.js App Router, Tailwind CSS, React Hook Form, and Yup.\n4. Never push directly to main; always create a task branch and Pull Request.',
        isTrusted: true,
        createdBy: ceo.id,
      },
      {
        departmentId: engDept?.id ?? null,
        title: 'UI/UX Playbook: Wise-Inspired Flat Design & Color Theory',
        slug: 'ui-ux-playbook-wise-flat-design',
        contentMd:
          '1. Zero gradients, zero glassmorphism, zero artificial neon glow.\n2. Apply 60-30-10 color balance: warm alabaster (#F7F7F5) and white (#FFFFFF) surfaces, deep charcoal ink (#0E0F0C), and lime (#C3FF7D / #9FE870) strictly for primary CTAs and active states.\n3. Use tabular-nums for metrics, tokens, and timestamps.',
        isTrusted: true,
        createdBy: ceo.id,
      },
      {
        departmentId: engDept?.id ?? null,
        title: 'QA Verification Playbook: Mandatory Release Gate',
        slug: 'qa-verification-playbook-release-gate',
        contentMd:
          'Before marking any engineering task complete: run tsc --noEmit, eslint, unit tests, and integration tests. Check API responses, RBAC permissions, and database integrity. If any check fails, spawn a linked correction task assigned to the responsible engineer.',
        isTrusted: true,
        createdBy: ceo.id,
      },
      {
        departmentId: salesDept?.id ?? mktDept?.id ?? null,
        title: 'Sales & Marketing SOP: Ethical Outreach & Opt-Out Policy',
        slug: 'sales-marketing-sop-ethical-outreach',
        contentMd:
          '1. Collect prospects only from authorized public business listings.\n2. Deduplicate leads before enrollment and never fabricate contact details.\n3. Submit initial outreach campaigns for CEO approval before sending.\n4. Immediately honor opt-out requests and block future outbound drafts.',
        isTrusted: true,
        createdBy: ceo.id,
      },
    ];

    for (const sop of sops) {
      await knowledgeRepo.save(knowledgeRepo.create(sop));
    }
  }

  // 8. Seed default parent business ("CodyNex") if none exist
  const businessRepo = AppDataSource.getRepository(BusinessEntity);
  const businessCount = await businessRepo.count();
  if (businessCount === 0) {
    await businessRepo.save(
      businessRepo.create({
        name: 'CodyNex',
        slug: 'codynex',
        domain: 'codynex.com',
        industry: 'Software & AI Venture Studio',
        description: 'Parent venture studio operating autonomous software businesses.',
        defaultGithubOwner: 'CodynexNepal',
        isActive: true,
      }),
    );
    logger.info('Seeded default CodyNex business');
  }

  // 9. Backfill legacy unassigned tasks to their department's lead agent
  const taskRepo = AppDataSource.getRepository(TaskEntity);
  const unassignedTasks = await taskRepo.find({
    where: { assignedEmployeeId: null as unknown as string },
    relations: ['department'],
  });

  if (unassignedTasks.length > 0) {
    for (const task of unassignedTasks) {
      if (task.departmentId) {
        const lead = await empRepo.findOne({
          where: { departmentId: task.departmentId, isActive: true },
          order: { roleTitle: 'ASC' },
        });
        if (lead) {
          await taskRepo.update({ id: task.id }, { assignedEmployeeId: lead.id });
        }
      }
    }
    logger.info(`Backfilled ${unassignedTasks.length} unassigned tasks to active department lead agents`);
  }

  // 10. Seed Company Rules
  const ruleRepo = AppDataSource.getRepository(CompanyRuleEntity);
  for (const r of DEFAULT_COMPANY_RULES) {
    const existingRule = await ruleRepo.findOne({ where: { ruleCode: r.ruleCode } });
    if (!existingRule) {
      await ruleRepo.save(
        ruleRepo.create({
          ruleCode: r.ruleCode,
          title: r.title,
          description: r.description,
          severity: r.severity,
          defaultPenaltyTokens: r.defaultPenaltyTokens,
          category: r.category,
          isActive: true,
        }),
      );
    }
  }

  // 11. Seed Binding Agent Contracts & Initial Token Wallets (1000 CNT Signing Bonus)
  const contractRepo = AppDataSource.getRepository(AgentContractEntity);
  const tokenTxRepo = AppDataSource.getRepository(AgentTokenTransactionEntity);
  const allEmployees = await empRepo.find({ relations: ['department'] });

  for (const [idx, emp] of allEmployees.entries()) {
    const existingContract = await contractRepo.findOne({ where: { employeeId: emp.id } });
    if (!existingContract) {
      const deptCode = (emp.department?.slug || 'GEN').slice(0, 3).toUpperCase();
      const numStr = String(idx + 1).padStart(3, '0');
      const contractNumber = `CNT-${deptCode}-${numStr}`;
      const signatureHash = crypto
        .createHash('sha256')
        .update(`${contractNumber}:${emp.slug}:${Date.now()}:CodyNex-OS`)
        .digest('hex');

      const contract = await contractRepo.save(
        contractRepo.create({
          employeeId: emp.id,
          contractNumber,
          title: `${emp.roleTitle} Employment & Code of Conduct Agreement`,
          status: ContractStatus.ACTIVE,
          tokenSalaryPerTask: 100,
          tokenBalance: 1000,
          stakedTokens: 0,
          totalTokensEarned: 1000,
          totalTokensPenalized: 0,
          reputationScore: 100,
          termsContentMd: DEFAULT_AGENT_CONTRACT_TERMS,
          signedAt: new Date(),
          signatureHash,
          violationsCount: 0,
          penaltiesCount: 0,
        }),
      );

      await tokenTxRepo.save(
        tokenTxRepo.create({
          employeeId: emp.id,
          contractId: contract.id,
          amount: 1000,
          type: TokenTransactionType.SIGNING_BONUS,
          balanceAfter: 1000,
          description: 'Initial employment signing bonus (Computational Tokens)',
        }),
      );
    }
  }
}
