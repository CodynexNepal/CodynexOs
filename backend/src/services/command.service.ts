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
    if (/\bdeploy\b|\bproduction\b/i.test(trimmed) && !/\bstaging\b|\bpreview\b/i.test(trimmed)) {
      questions.push(
        'Should engineering stop at a verified Pull Request & staging build, or prepare a production deployment approval request?',
      );
    }
    return questions;
  }

  private buildDeterministicPlan(instruction: string): PlannedTaskSpec[] {
    const lower = instruction.toLowerCase();
    const tasks: PlannedTaskSpec[] = [];

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

    if (/build|app|saas|module|fix|test|api|dashboard|frontend|backend|architect|investigate/.test(lower)) {
      tasks.push({
        key: 'architecture',
        title: 'Technical Architecture & Risk Assessment',
        description: `Review existing repository context and design architecture for: ${instruction}`,
        departmentSlug: 'executive',
        employeeSlug: 'cto',
        taskType: 'architecture',
        priority: 90,
        dependsOnKeys: tasks.some((t) => t.key === 'research') ? ['research'] : [],
        requiresApproval: false,
      });

      tasks.push({
        key: 'backend',
        title: 'Backend & Database Implementation',
        description: `Implement backend API endpoints, validation, and migrations for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'backend_lead',
        taskType: 'code',
        priority: 80,
        dependsOnKeys: ['architecture'],
        requiresApproval: false,
      });

      tasks.push({
        key: 'frontend',
        title: 'Frontend UI Implementation',
        description: `Build responsive TypeScript/Tailwind components and wire live API hooks for: ${instruction}`,
        departmentSlug: 'engineering',
        employeeSlug: 'frontend_lead',
        taskType: 'code',
        priority: 75,
        dependsOnKeys: ['architecture'],
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

    let planTasks: PlannedTaskSpec[] = this.buildDeterministicPlan(combinedInstruction);
    let plannerSource: 'ai' | 'deterministic' = 'deterministic';

    if (clarificationQuestions.length === 0) {
      const coo = await this.orgRepo.findEmployeeBySlug('coo');
      const { wrapped } = sanitizeUntrustedContent(combinedInstruction, 'ceo_command');
      try {
        const aiRes = await this.modelRouter.complete(
          {
            systemPrompt:
              'You are the AI COO of CodyNex OS. Return JSON with key "tasks" (array of {key, title, description, departmentSlug, employeeSlug, taskType, priority, dependsOnKeys, requiresApproval}). Valid departmentSlug: executive, engineering, marketing, sales, operations.',
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
        const parsed = JSON.parse(aiRes.content) as { tasks?: PlannedTaskSpec[] };
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

        const emp = await this.orgRepo.findEmployeeBySlug(spec.employeeSlug);
        const status = spec.requiresApproval ? TaskStatus.PENDING_APPROVAL : TaskStatus.QUEUED;
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${project.id}:${spec.key}:${spec.title}`)
          .digest('hex')
          .slice(0, 64);

        const task = await this.taskRepo.save({
          projectId: project.id,
          departmentId: dept.id,
          assignedEmployeeId: emp?.id ?? null,
          title: spec.title.slice(0, 200),
          description: spec.description,
          taskType: spec.taskType || 'general',
          priority: Math.min(100, Math.max(1, spec.priority || 50)),
          status,
          idempotencyKey,
          inputPayload: { projectTitle: derivedTitle, instruction: combinedInstruction },
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
