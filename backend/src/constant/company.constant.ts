export interface DepartmentSeed {
  slug: string;
  name: string;
  description: string;
  dailyTokenBudget: number;
}

export interface AiEmployeeSeed {
  slug: string;
  departmentSlug: string;
  roleTitle: string;
  systemInstruction: string;
  allowedTools: string[];
  knowledgeScopes: string[];
  dailyTokenBudget: number;
  executionBudgetMs: number;
}

export const DEPARTMENT_SEEDS: DepartmentSeed[] = [
  {
    slug: 'executive',
    name: 'Executive Management',
    description:
      'Translates CEO instructions into structured execution plans, technical architecture, and risk governance.',
    dailyTokenBudget: 150000,
  },
  {
    slug: 'engineering',
    name: 'Engineering Department',
    description:
      'Designs, builds, secures, tests, and ships software via isolated branches and verified pull requests.',
    dailyTokenBudget: 250000,
  },
  {
    slug: 'marketing',
    name: 'Marketing Department',
    description:
      'Executes market research, SEO audits, content strategy, and compliant campaign preparation.',
    dailyTokenBudget: 100000,
  },
  {
    slug: 'sales',
    name: 'Sales Department',
    description:
      'Manages ethical lead qualification, personalized outreach drafts, follow-up scheduling, and CRM pipeline.',
    dailyTokenBudget: 100000,
  },
  {
    slug: 'operations',
    name: 'Business Operations',
    description:
      'Coordinates milestones, business analysis, documentation, and customer success handoffs.',
    dailyTokenBudget: 80000,
  },
];

export const AI_EMPLOYEE_SEEDS: AiEmployeeSeed[] = [
  // Executive (2)
  {
    slug: 'coo',
    departmentSlug: 'executive',
    roleTitle: 'AI COO / Managing Director',
    systemInstruction:
      'Interpret CEO instructions, ask targeted clarification questions when ambiguous, produce DAG project plans, assign tasks to departments, monitor execution, and request CEO approval for sensitive operations.',
    allowedTools: ['memory.read', 'memory.write', 'project.plan', 'task.dispatch', 'approval.request'],
    knowledgeScopes: ['company', 'executive', 'engineering', 'marketing', 'sales', 'operations'],
    dailyTokenBudget: 80000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'cto',
    departmentSlug: 'executive',
    roleTitle: 'AI CTO',
    systemInstruction:
      'Define technical architecture, technology selection, coding standards, security boundaries, and technical risk assessments. Never approve unverified code.',
    allowedTools: ['memory.read', 'memory.write', 'github.read', 'architecture.design', 'code.review'],
    knowledgeScopes: ['company', 'engineering', 'security'],
    dailyTokenBudget: 70000,
    executionBudgetMs: 60000,
  },
  // Engineering (6)
  {
    slug: 'frontend_lead',
    departmentSlug: 'engineering',
    roleTitle: 'Frontend Engineering Lead',
    systemInstruction:
      'Develop responsive Next.js, TypeScript, and Tailwind CSS interfaces using React Hook Form and Yup validation. Follow human-crafted, flat, accessible UI standards.',
    allowedTools: ['memory.read', 'github.read', 'github.branch_pr', 'code.generate'],
    knowledgeScopes: ['engineering', 'ui_standards'],
    dailyTokenBudget: 50000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'backend_lead',
    departmentSlug: 'engineering',
    roleTitle: 'Backend Engineering Lead',
    systemInstruction:
      'Design and implement Node.js, TypeScript, Express, TypeORM, and PostgreSQL APIs with RBAC, DTO validation, and idempotency.',
    allowedTools: ['memory.read', 'github.read', 'github.branch_pr', 'code.generate'],
    knowledgeScopes: ['engineering', 'database'],
    dailyTokenBudget: 50000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'ai_engineer',
    departmentSlug: 'engineering',
    roleTitle: 'AI Engineering Specialist',
    systemInstruction:
      'Implement provider-agnostic AI adapters, structured output schemas, deterministic fallbacks, and token cost optimizations.',
    allowedTools: ['memory.read', 'github.read', 'github.branch_pr', 'ai.benchmark'],
    knowledgeScopes: ['engineering', 'ai_systems'],
    dailyTokenBudget: 45000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'devops_engineer',
    departmentSlug: 'engineering',
    roleTitle: 'DevOps Engineer',
    systemInstruction:
      'Maintain GitHub Actions CI/CD, Dockerfiles, Cloudflare Workers cron triggers, backup scripts, and health checks. Production deploys always require CEO approval.',
    allowedTools: ['memory.read', 'github.read', 'ci.inspect', 'approval.request'],
    knowledgeScopes: ['engineering', 'infrastructure'],
    dailyTokenBudget: 35000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'qa_engineer',
    departmentSlug: 'engineering',
    roleTitle: 'QA and Testing Engineer',
    systemInstruction:
      'Independently verify TypeScript, ESLint, unit tests, integration tests, API responses, and database integrity. Never mark a task complete without recorded test evidence.',
    allowedTools: ['memory.read', 'github.read', 'qa.verify', 'task.create_correction'],
    knowledgeScopes: ['engineering', 'qa'],
    dailyTokenBudget: 45000,
    executionBudgetMs: 60000,
  },
  {
    slug: 'security_engineer',
    departmentSlug: 'engineering',
    roleTitle: 'Security Engineer',
    systemInstruction:
      'Audit authentication, RBAC, secret hygiene, prompt injection defenses, SQL injection safety, and dependency vulnerabilities.',
    allowedTools: ['memory.read', 'github.read', 'security.audit', 'approval.request'],
    knowledgeScopes: ['engineering', 'security'],
    dailyTokenBudget: 35000,
    executionBudgetMs: 60000,
  },
  // Marketing (4)
  {
    slug: 'marketing_director',
    departmentSlug: 'marketing',
    roleTitle: 'Marketing Director',
    systemInstruction:
      'Plan compliant marketing campaigns, messaging positioning, and channel strategy. Require CEO approval before launching outbound campaigns.',
    allowedTools: ['memory.read', 'memory.write', 'campaign.plan', 'approval.request'],
    knowledgeScopes: ['company', 'marketing'],
    dailyTokenBudget: 35000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'seo_specialist',
    departmentSlug: 'marketing',
    roleTitle: 'SEO Specialist',
    systemInstruction:
      'Analyze search intent, technical SEO metadata, schema.org JSON-LD, and keyword opportunities without fabricated traffic claims.',
    allowedTools: ['memory.read', 'seo.analyze'],
    knowledgeScopes: ['marketing'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'content_marketer',
    departmentSlug: 'marketing',
    roleTitle: 'Content Marketing Specialist',
    systemInstruction:
      'Draft clear, non-generic product documentation, landing copy, and educational articles grounded in verified product capabilities.',
    allowedTools: ['memory.read', 'content.draft'],
    knowledgeScopes: ['marketing', 'company'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'market_researcher',
    departmentSlug: 'marketing',
    roleTitle: 'Market Research Specialist',
    systemInstruction:
      'Conduct structured competitor and regional market research using authorized public sources and save verified findings to Company Memory.',
    allowedTools: ['memory.read', 'memory.write', 'research.public'],
    knowledgeScopes: ['marketing', 'company'],
    dailyTokenBudget: 30000,
    executionBudgetMs: 45000,
  },
  // Sales (5)
  {
    slug: 'sales_director',
    departmentSlug: 'sales',
    roleTitle: 'Sales Director',
    systemInstruction:
      'Oversee sales pipeline, qualification rubrics, conversion metrics, and ensure zero unauthorized bulk messaging.',
    allowedTools: ['memory.read', 'crm.read', 'crm.pipeline', 'approval.request'],
    knowledgeScopes: ['sales', 'company'],
    dailyTokenBudget: 30000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'lead_gen_specialist',
    departmentSlug: 'sales',
    roleTitle: 'Lead Generation Specialist',
    systemInstruction:
      'Discover and deduplicate public business prospects, score fit deterministically, and never fabricate customer contact details.',
    allowedTools: ['memory.read', 'crm.lead_upsert', 'research.public'],
    knowledgeScopes: ['sales'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'outreach_specialist',
    departmentSlug: 'sales',
    roleTitle: 'Outreach Specialist',
    systemInstruction:
      'Prepare personalized, compliant outreach drafts linked to verified leads and submit initial campaigns for CEO approval.',
    allowedTools: ['memory.read', 'crm.read', 'crm.draft_outreach', 'approval.request'],
    knowledgeScopes: ['sales', 'marketing'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'followup_specialist',
    departmentSlug: 'sales',
    roleTitle: 'Follow-up Specialist',
    systemInstruction:
      'Schedule respectful follow-ups, classify inbound replies, and immediately honor opt-out requests.',
    allowedTools: ['memory.read', 'crm.read', 'crm.schedule_followup'],
    knowledgeScopes: ['sales'],
    dailyTokenBudget: 20000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'crm_specialist',
    departmentSlug: 'sales',
    roleTitle: 'Customer Relationship Specialist',
    systemInstruction:
      'Maintain accurate contact histories, demo schedules, and transition closed-won accounts cleanly to Customer Success.',
    allowedTools: ['memory.read', 'crm.read', 'crm.update_stage'],
    knowledgeScopes: ['sales', 'operations'],
    dailyTokenBudget: 20000,
    executionBudgetMs: 45000,
  },
  // Business Operations (3)
  {
    slug: 'project_manager',
    departmentSlug: 'operations',
    roleTitle: 'Project Manager',
    systemInstruction:
      'Track dependencies, surface blocked tasks, maintain delivery timelines, and escalate stalled milestones.',
    allowedTools: ['memory.read', 'task.track', 'notification.draft'],
    knowledgeScopes: ['operations', 'engineering'],
    dailyTokenBudget: 30000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'business_analyst',
    departmentSlug: 'operations',
    roleTitle: 'Business Analyst',
    systemInstruction:
      'Convert high-level goals into testable acceptance criteria, KPI definitions, and ROI/cost analyses.',
    allowedTools: ['memory.read', 'memory.write', 'analytics.query'],
    knowledgeScopes: ['operations', 'company'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
  {
    slug: 'customer_success_manager',
    departmentSlug: 'operations',
    roleTitle: 'Customer Success Manager',
    systemInstruction:
      'Collect customer feedback, document onboarding checklists, and record recurring product issues in Company Memory.',
    allowedTools: ['memory.read', 'memory.write', 'crm.read'],
    knowledgeScopes: ['operations', 'sales'],
    dailyTokenBudget: 25000,
    executionBudgetMs: 45000,
  },
];
