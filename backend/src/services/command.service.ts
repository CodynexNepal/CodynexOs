import crypto from 'crypto';
import { ProjectRepository } from '../repository/project.repository';
import { TaskRepository } from '../repository/task.repository';
import { OrganizationRepository } from '../repository/organization.repository';
import { MemoryRepository } from '../repository/memory.repository';
import { GovernanceRepository } from '../repository/governance.repository';
import { ModelRouterService } from '../ai/router/model-router.service';
import { sanitizeUntrustedContent } from '../ai/prompt-guard';
import {
  ApprovalStatus,
  MemoryCategory,
  ProjectPriority,
  ProjectStatus,
  TaskStatus,
} from '../constant/enum.constant';
import { NotificationService } from './notification.service';
import { AuditService } from './audit.service';
import { extractJsonObjectString } from '../utils/report-formatter.util';

export interface PlannedTaskSpec {
  key: string;
  title: string;
  description: string;
  departmentSlug: string;
  employeeSlug: string;
  taskType: string;
  priority: number;
  dependsOnKeys: string[];
  requiresApproval: boolean;
}

export class CommandService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly taskRepo: TaskRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly governanceRepo: GovernanceRepository,
    private readonly modelRouter: ModelRouterService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  private needsClarification(instruction: string, clarificationAnswer?: string): string[] {
    if (clarificationAnswer && clarificationAnswer.trim().length > 0) return [];
    const trimmed = instruction.trim();
    const questions: string[] = [];
    if (trimmed.length < 18) {
      questions.push(
        'Please specify the target deliverable, scope, or success criteria for this instruction.',
      );
    }
    if (
      /\bdeploy\b|\bproduction\b/i.test(trimmed) &&
      !/\bstaging\b|\bpreview\b|\bauto\b|\bgithub\b/i.test(trimmed)
    ) {
      questions.push(
        'Should engineering stop at a verified Pull Request & staging build, or prepare a production deployment approval request?',
      );
    }
    return questions;
  }

  private normalizePriorityNumber(val: unknown): number {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Math.min(100, Math.max(1, Math.round(val)));
    }
    if (typeof val === 'string') {
      const upper = val.trim().toUpperCase();
      if (upper === 'CRITICAL') return 95;
      if (upper === 'HIGH') return 80;
      if (upper === 'MEDIUM') return 50;
      if (upper === 'LOW') return 25;
      const parsed = Number(val);
      if (Number.isFinite(parsed)) {
        return Math.min(100, Math.max(1, Math.round(parsed)));
      }
    }
    return 50;
  }

  private extractGithubContext(instruction: string): {
    owner?: string;
    repoName?: string;
    isOrgInspect: boolean;
    isRepoLifecycle: boolean;
  } {
    const lower = instruction.toLowerCase();
    const stopWords = new Set([
      'under',
      'named',
      'called',
      'with',
      'from',
      'for',
      'the',
      'and',
      'all',
      'into',
      'onto',
      'this',
      'that',
      'new',
    ]);
    const ownerMatch = instruction.match(
      /(?:under|org|organization|user|owner|from)\s+([a-zA-Z0-9-]{2,39})/i,
    );
    const slugMatch = instruction.match(/github\.com\/([a-zA-Z0-9-]+)(?:\/([a-zA-Z0-9._-]+))?/i);
    const explicitRepoMatch = instruction.match(
      /(?:project|repo|repository|app)\s+(?:named|called)\s+([a-zA-Z0-9._-]{2,60})/i,
    );

    const rawOwner = slugMatch?.[1] || ownerMatch?.[1];
    const owner = rawOwner && !stopWords.has(rawOwner.toLowerCase()) ? rawOwner : undefined;
    const rawRepo = slugMatch?.[2] || explicitRepoMatch?.[1];
    const repoName = rawRepo && !stopWords.has(rawRepo.toLowerCase()) ? rawRepo : undefined;
    const isOrgInspect =
      /\b(read|list|fetch|import|scan|inspect)\b.*\b(repo|repos|repository|repositories)\b/i.test(
        lower,
      ) && Boolean(owner);
    // A coding directive must enter the executable workspace pipeline even
    // when the CEO does not explicitly say “GitHub” or “repository”. Before
    // this, requests such as “write code for project Aliza Wears” could be
    // replaced by an AI-generated analysis task, which only saved a report.
    const isImplementationRequest =
      /\b(write\s+(?:the\s+)?code|code|implement|build|scaffold|create|develop|update|fix|deploy)\b/i.test(
        lower,
      ) &&
      /\b(app|application|api|backend|frontend|website|site|page|screen|component|feature|project|repo|repository|code|ui|ux|dashboard|landing)\b/i.test(
        lower,
      );
    const isRepoLifecycle =
      isImplementationRequest ||
      (/\b(github|commit|push|pull request|\bpr\b|repo|repository)\b/i.test(lower) &&
        /\b(create|new|build|scaffold|update|fix|deploy)\b/i.test(lower));

    return { owner, repoName, isOrgInspect, isRepoLifecycle };
  }

  private buildDeterministicPlan(instruction: string): PlannedTaskSpec[] {
    const lower = instruction.toLowerCase();
    const gh = this.extractGithubContext(instruction);
    const tasks: PlannedTaskSpec[] = [];

    if (gh.isOrgInspect) {
      tasks.push({
        key: 'github_inspect',
        title: `Inspect & Import GitHub Repositories (${gh.owner})`,
        description: `Query GitHub REST API for all repositories under '${gh.owner}', sync metadata into CodyNex OS, and summarize inventory.`,
        departmentSlug: 'engineering',
        employeeSlug: 'cto',
        taskType: 'github_inspect',
        priority: 95,
        dependsOnKeys: [],
        requiresApproval: false,
      });
      return tasks;
    }

    if (gh.isRepoLifecycle) {
      tasks.push({
        key: 'repo_provision',
        title: 'Provision GitHub Workspace & Task Branch',
        description: `Create or clone repository workspace and prepare an isolated feature branch for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'devops_engineer',
        taskType: 'repo_provision',
        priority: 92,
        dependsOnKeys: [],
        requiresApproval: false,
      });
      tasks.push({
        key: 'code_generate',
        title: 'Generate & Write Implementation Files in Workspace',
        description: `Write production code and documentation files into the isolated workspace branch for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'backend_lead',
        taskType: 'code_generate',
        priority: 88,
        dependsOnKeys: ['repo_provision'],
        requiresApproval: false,
      });
      tasks.push({
        key: 'qa_verify',
        title: 'Run Workspace Typecheck, Lint & Automated Tests',
        description: `Execute automated verification checks on workspace files and record QA report.`,
        departmentSlug: 'engineering',
        employeeSlug: 'qa_engineer',
        taskType: 'qa_verify',
        priority: 94,
        dependsOnKeys: ['code_generate'],
        requiresApproval: false,
      });
      tasks.push({
        key: 'github_push_pr',
        title: 'Commit, Push Task Branch & Open Pull Request',
        description: `Commit verified changes, push isolated branch to GitHub, open Pull Request, and request CEO deployment approval.`,
        departmentSlug: 'engineering',
        employeeSlug: 'devops_engineer',
        taskType: 'github_push_pr',
        priority: 85,
        dependsOnKeys: ['qa_verify'],
        requiresApproval: false,
      });
      return tasks;
    }

    if (/tihar|dashain|occasion|wish|wishes|social|tiktok|facebook|whatsapp|post|content|festival|holiday/.test(lower)) {
      tasks.push({
        key: 'content_draft',
        title: 'Creative Content & Festive Copywriting (TikTok, Facebook, WhatsApp)',
        description: `Draft culturally authentic, high-converting social media posts, TikTok storyboard, Facebook copy, and WhatsApp VIP broadcasts for: ${instruction}`,
        departmentSlug: 'marketing',
        employeeSlug: 'content_marketer',
        taskType: 'content_draft',
        priority: 85,
        dependsOnKeys: [],
        requiresApproval: false,
      });

      tasks.push({
        key: 'social_dispatch',
        title: 'Multi-Channel Social Dispatch to Official Accounts',
        description: `Validate official accounts (TikTok, Facebook, WhatsApp) and execute coordinated marketing post dispatch for: ${instruction}`,
        departmentSlug: 'marketing',
        employeeSlug: 'marketing_director',
        taskType: 'social_dispatch',
        priority: 80,
        dependsOnKeys: ['content_draft'],
        requiresApproval: true,
      });
      return tasks;
    }

    if (/market|competitor|campaign|hostel|lead|outreach|sales|seo/.test(lower)) {
      tasks.push({
        key: 'research',
        title: 'Public Market & Competitor Research',
        description: `Research authorized public market data and competitor positioning for: ${instruction}`,
        departmentSlug: 'marketing',
        employeeSlug: 'market_researcher',
        taskType: 'research',
        priority: 80,
        dependsOnKeys: [],
        requiresApproval: false,
      });

      if (/lead|owner|outreach|campaign|sales/.test(lower)) {
        tasks.push({
          key: 'leads',
          title: 'Lead Discovery & Qualification',
          description: `Identify, deduplicate, and score prospects from authorized public listings for: ${instruction}`,
          departmentSlug: 'sales',
          employeeSlug: 'lead_gen_specialist',
          taskType: 'research',
          priority: 75,
          dependsOnKeys: ['research'],
          requiresApproval: false,
        });
        tasks.push({
          key: 'outreach',
          title: 'Prepare Outreach Campaign Draft (CEO Approval Required)',
          description: `Draft personalized outreach templates and campaign plan. Requires CEO approval before sending.`,
          departmentSlug: 'sales',
          employeeSlug: 'outreach_specialist',
          taskType: 'outreach',
          priority: 70,
          dependsOnKeys: ['leads'],
          requiresApproval: true,
        });
      }
    }

    if (/ui|ux|design|mockup|prototype|landing|website|page|screen|portal|platform|software|build|app|saas|module|fix|test|api|dashboard|frontend|backend|architect|investigate/.test(lower)) {
      tasks.push({
        key: 'architecture',
        title: 'Technical Architecture & Risk Assessment',
        description: `Review existing repository context and design architecture for: ${instruction}`,
        departmentSlug: 'executive',
        employeeSlug: 'cto',
        taskType: 'architecture',
        priority: 92,
        dependsOnKeys: tasks.some((t) => t.key === 'research') ? ['research'] : [],
        requiresApproval: false,
      });

      const needsUiUx =
        /ui|ux|design|mockup|prototype|landing|website|page|screen|portal|platform|software|build|app|saas|dashboard|frontend/.test(
          lower,
        );

      if (needsUiUx) {
        tasks.push({
          key: 'ui_ux_design',
          title: 'UI/UX Design & Interactive Live Prototype',
          description: `Design modern flat UI/UX layout, components, and generate a live interactive HTML5 preview for: ${instruction}`,
          departmentSlug: 'engineering',
          employeeSlug: 'frontend_lead',
          taskType: 'ui_ux_design',
          priority: 90,
          dependsOnKeys: ['architecture'],
          requiresApproval: false,
        });
      }

      tasks.push({
        key: 'backend',
        title: 'Backend & Database Implementation',
        description: `Implement backend API endpoints, validation, and migrations for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'backend_lead',
        taskType: 'code',
        priority: 82,
        dependsOnKeys: needsUiUx ? ['architecture', 'ui_ux_design'] : ['architecture'],
        requiresApproval: false,
      });

      tasks.push({
        key: 'frontend',
        title: 'Frontend UI Implementation',
        description: `Build responsive TypeScript/Tailwind components aligned with UI/UX prototype and wire live API hooks for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'frontend_lead',
        taskType: 'code',
        priority: 80,
        dependsOnKeys: needsUiUx ? ['architecture', 'ui_ux_design'] : ['architecture'],
        requiresApproval: false,
      });

      tasks.push({
        key: 'qa',
        title: 'Independent QA Verification & Security Review',
        description: `Verify TypeScript, ESLint, unit/integration tests, API contracts, and permissions.`,
        departmentSlug: 'engineering',
        employeeSlug: 'qa_engineer',
        taskType: 'qa_verify',
        priority: 95,
        dependsOnKeys: ['backend', 'frontend'],
        requiresApproval: false,
      });

      if (needsUiUx) {
        tasks.push({
          key: 'devops_deploy',
          title: 'DevOps Live Deployment & Preview URL Publishing',
          description: `Package verified UI/UX + frontend/backend deliverables, publish the live link, and request CEO sign-off.`,
          departmentSlug: 'engineering',
          employeeSlug: 'devops_engineer',
          taskType: 'devops_deploy',
          priority: 88,
          dependsOnKeys: ['qa'],
          requiresApproval: false,
        });
      }
    }

    if (tasks.length === 0) {
      tasks.push({
        key: 'analysis',
        title: 'COO Executive Analysis & Execution Plan',
        description: `Analyze instruction and prepare structured operational deliverables: ${instruction}`,
        departmentSlug: 'executive',
        employeeSlug: 'coo',
        taskType: 'planning',
        priority: 80,
        dependsOnKeys: [],
        requiresApproval: false,
      });
      tasks.push({
        key: 'pm_review',
        title: 'Project Manager Verification & Documentation',
        description: `Verify deliverables and document outcomes in Company Memory.`,
        departmentSlug: 'operations',
        employeeSlug: 'project_manager',
        taskType: 'qa_verify',
        priority: 70,
        dependsOnKeys: ['analysis'],
        requiresApproval: false,
      });
    }

    return tasks;
  }

  async issueCommand(params: {
    userId: string;
    instruction: string;
    title?: string;
    priority?: ProjectPriority;
    clarificationAnswer?: string;
  }) {
    const combinedInstruction = params.clarificationAnswer
      ? `${params.instruction}\n\nCEO Clarification: ${params.clarificationAnswer}`
      : params.instruction;

    const clarificationQuestions = this.needsClarification(
      params.instruction,
      params.clarificationAnswer,
    );

    const relatedMemory = await this.memoryRepo.searchMemory(params.instruction.slice(0, 60));
    const memoryContext = relatedMemory
      .slice(0, 5)
      .map((m) => `- [${m.category}] ${m.title}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const ghCtx = this.extractGithubContext(combinedInstruction);
    let planTasks: PlannedTaskSpec[] = this.buildDeterministicPlan(combinedInstruction);
    let plannerSource: 'ai' | 'deterministic' = 'deterministic';

    if (clarificationQuestions.length === 0 && !ghCtx.isOrgInspect && !ghCtx.isRepoLifecycle) {
      const coo = await this.orgRepo.findEmployeeBySlug('coo');
      const { wrapped } = sanitizeUntrustedContent(combinedInstruction, 'ceo_command');
      try {
        const aiRes = await this.modelRouter.complete(
          {
            systemPrompt:
              'You are the AI COO of CodyNex OS. Return JSON with key "tasks" (array of {key, title, description, departmentSlug, employeeSlug, taskType, priority, dependsOnKeys, requiresApproval}). Valid departmentSlug and employeeSlug pairs: executive (coo, cto), engineering (frontend_lead, backend_lead, ai_engineer, devops_engineer, qa_engineer, security_engineer), marketing (marketing_director, seo_specialist, content_marketer, market_researcher), sales (sales_director, lead_gen_specialist, outreach_specialist, followup_specialist, crm_specialist), operations (project_manager, business_analyst, customer_success_manager). Always pick an exact employeeSlug from this list.',
            userPrompt: `Company Memory:\n${memoryContext || 'None'}\n\nInstruction:\n${wrapped}`,
            responseFormat: 'json',
            maxOutputTokens: 1500,
          },
          {
            employeeId: coo?.id,
            preferredProvider: coo?.preferredProvider,
            preferredModel: coo?.preferredModel,
            fallbackProvider: coo?.fallbackProvider,
            fallbackModel: coo?.fallbackModel,
          },
        );
        const extracted = extractJsonObjectString(aiRes.content);
        const parsed = extracted ? (JSON.parse(extracted) as { tasks?: PlannedTaskSpec[] }) : {};
        if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
          planTasks = parsed.tasks;
          plannerSource = 'ai';
        }
      } catch {
        // Free AI provider unconfigured or quota exhausted: deterministic planner preserves execution.
        plannerSource = 'deterministic';
      }
    }

    const derivedTitle =
      params.title?.trim() ||
      combinedInstruction
        .split(/[.!?\n]/)[0]!
        .trim()
        .slice(0, 120) ||
      'CEO Directive';

    const hasSensitiveApproval = planTasks.some((t) => t.requiresApproval);
    const projectStatus =
      clarificationQuestions.length > 0
        ? ProjectStatus.AWAITING_CLARIFICATION
        : hasSensitiveApproval
          ? ProjectStatus.ACTIVE
          : ProjectStatus.ACTIVE;

    const project = await this.projectRepo.save({
      title: derivedTitle,
      ceoInstruction: combinedInstruction,
      clarificationQuestions,
      structuredPlan: { plannerSource, tasks: planTasks },
      status: projectStatus,
      priority: params.priority ?? ProjectPriority.MEDIUM,
      createdBy: params.userId,
      startedAt: clarificationQuestions.length === 0 ? new Date() : null,
    });

    await this.memoryRepo.saveMemory({
      projectId: project.id,
      category: MemoryCategory.INSTRUCTION,
      title: `CEO Directive: ${derivedTitle}`,
      content: combinedInstruction,
      tags: ['ceo-command', plannerSource],
    });

    const createdTasks: Record<string, string> = {};
    if (clarificationQuestions.length === 0) {
      for (const spec of planTasks) {
        const dept =
          (await this.orgRepo.findDepartmentBySlug(spec.departmentSlug)) ||
          (await this.orgRepo.findDepartmentBySlug('operations'));
        if (!dept) continue;

        let emp = spec.employeeSlug ? await this.orgRepo.findEmployeeBySlug(spec.employeeSlug) : null;
        if (!emp) {
          const deptEmployees = await this.orgRepo.findEmployeesByDepartmentId(dept.id);
          emp = deptEmployees[0] ?? null;
        }
        const status = spec.requiresApproval ? TaskStatus.PENDING_APPROVAL : TaskStatus.QUEUED;
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${project.id}:${spec.key}:${spec.title}`)
          .digest('hex')
          .slice(0, 64);

        const ghCtx = this.extractGithubContext(combinedInstruction);
        const task = await this.taskRepo.save({
          projectId: project.id,
          departmentId: dept.id,
          assignedEmployeeId: emp?.id ?? null,
          title: spec.title.slice(0, 200),
          description: spec.description,
          taskType: spec.taskType || 'general',
          priority: this.normalizePriorityNumber(spec.priority),
          status,
          idempotencyKey,
          inputPayload: {
            projectTitle: derivedTitle,
            instruction: combinedInstruction,
            ...(ghCtx.owner ? { githubOwner: ghCtx.owner } : {}),
            ...(ghCtx.repoName ? { githubRepoName: ghCtx.repoName } : {}),
            branchName: `codynex/${derivedTitle
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 32) || 'task'}-${project.id.slice(0, 6)}`,
          },
        });
        createdTasks[spec.key] = task.id;

        if (spec.requiresApproval) {
          const approval = await this.governanceRepo.saveApproval({
            projectId: project.id,
            taskId: task.id,
            requestedByEmployeeId: emp?.id ?? null,
            actionType: spec.taskType === 'outreach' ? 'OUTREACH_CAMPAIGN_SEND' : 'SENSITIVE_TASK',
            summary: `Approval required before executing: ${task.title}`,
            riskAssessment: 'External or production-impacting operation gated by CEO policy.',
            payload: { taskId: task.id, projectId: project.id },
            status: ApprovalStatus.PENDING,
          });

          await this.notificationService.notifyUser({
            userId: params.userId,
            category: 'APPROVAL_REQUEST',
            severity: 'WARNING',
            title: `CEO Approval Needed: ${task.title}`,
            message: approval.summary,
            linkUrl: '/deployments',
            sendExternal: true,
          });
        }
      }

      for (const spec of planTasks) {
        const taskId = createdTasks[spec.key];
        if (!taskId) continue;
        for (const depKey of spec.dependsOnKeys ?? []) {
          const depId = createdTasks[depKey];
          if (depId && depId !== taskId) {
            await this.taskRepo.addDependency(taskId, depId);
          }
        }
      }
    }

    await this.auditService.log({
      actorType: 'USER',
      actorId: params.userId,
      action: 'COMMAND_ISSUED',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { plannerSource, taskCount: Object.keys(createdTasks).length },
    });

    return {
      project,
      plannerSource,
      clarificationQuestions,
      createdTaskCount: Object.keys(createdTasks).length,
    };
  }
}
