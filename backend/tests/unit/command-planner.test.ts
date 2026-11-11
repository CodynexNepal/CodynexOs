import { describe, expect, it, vi } from 'vitest';
import { CommandService } from '../../src/services/command.service';
import { AiProviderError } from '../../src/ai/ai-provider.interface';
import { AiProviderName, ProjectPriority } from '../../src/constant/enum.constant';

function makeMocks() {
  const savedTasks: Array<Record<string, unknown>> = [];
  const savedDeps: Array<[string, string]> = [];
  const savedApprovals: Array<Record<string, unknown>> = [];

  const deptMap: Record<string, { id: string; slug: string }> = {
    executive: { id: 'd-exec', slug: 'executive' },
    engineering: { id: 'd-eng', slug: 'engineering' },
    marketing: { id: 'd-mkt', slug: 'marketing' },
    sales: { id: 'd-sales', slug: 'sales' },
    operations: { id: 'd-ops', slug: 'operations' },
  };

  const service = new CommandService(
    { save: vi.fn().mockImplementation(async (p) => ({ id: 'proj-1', ...p })) } as any,
    {
      save: vi.fn().mockImplementation(async (t) => {
        const created = { id: `task-${savedTasks.length + 1}`, ...t };
        savedTasks.push(created);
        return created;
      }),
      addDependency: vi.fn().mockImplementation(async (a, b) => {
        savedDeps.push([a, b]);
      }),
    } as any,
    {
      findDepartmentBySlug: vi.fn().mockImplementation(async (slug: string) => deptMap[slug] ?? null),
      findEmployeeBySlug: vi.fn().mockImplementation(async (slug: string) => ({
        id: `emp-${slug}`,
        slug,
      })),
    } as any,
    {
      searchMemory: vi.fn().mockResolvedValue([]),
      saveMemory: vi.fn().mockResolvedValue({}),
    } as any,
    {
      saveApproval: vi.fn().mockImplementation(async (a) => {
        const rec = { id: `appr-${savedApprovals.length + 1}`, ...a };
        savedApprovals.push(rec);
        return rec;
      }),
    } as any,
    {
      complete: vi
        .fn()
        .mockRejectedValue(
          new AiProviderError(AiProviderName.GEMINI, 'NOT_CONFIGURED', 'No key'),
        ),
    } as any,
    { notifyUser: vi.fn().mockResolvedValue({}) } as any,
    { log: vi.fn().mockResolvedValue({}) } as any,
  );

  return { service, savedTasks, savedDeps, savedApprovals };
}

describe('AI COO CommandService planning & approval gating', () => {
  it('requests clarification when instruction is too short', async () => {
    const { service, savedTasks } = makeMocks();
    const res = await service.issueCommand({
      userId: 'ceo-1',
      instruction: 'Build it',
      priority: ProjectPriority.HIGH,
    });

    expect(res.clarificationQuestions.length).toBeGreaterThan(0);
    expect(res.createdTaskCount).toBe(0);
    expect(savedTasks).toHaveLength(0);
  });

  it('generates parallel frontend/backend tasks and QA dependency for engineering commands', async () => {
    const { service, savedTasks, savedDeps } = makeMocks();
    const res = await service.issueCommand({
      userId: 'ceo-1',
      instruction: 'Build a new billing analytics module with backend API and dashboard UI.',
    });

    expect(res.plannerSource).toBe('deterministic');
    expect(res.createdTaskCount).toBe(4);
    expect(savedTasks.map((t) => t.taskType)).toEqual(['architecture', 'code', 'code', 'qa_verify']);
    expect(savedDeps).toHaveLength(4);
  });

  it('creates a CEO approval request for outbound campaign commands', async () => {
    const { service, savedApprovals } = makeMocks();
    await service.issueCommand({
      userId: 'ceo-1',
      instruction: 'Find 100 hostel owners in Kathmandu and prepare a marketing outreach campaign.',
    });

    expect(savedApprovals).toHaveLength(1);
    expect(savedApprovals[0]!.actionType).toBe('OUTREACH_CAMPAIGN_SEND');
  });

  it('normalizes AI string priorities to integers and ignores stop-words in repo names', async () => {
    const savedTasks: Array<Record<string, unknown>> = [];
    const service = new CommandService(
      { save: vi.fn().mockImplementation(async (p) => ({ id: 'proj-2', ...p })) } as any,
      {
        save: vi.fn().mockImplementation(async (t) => {
          const created = { id: `task-${savedTasks.length + 1}`, ...t };
          savedTasks.push(created);
          return created;
        }),
        addDependency: vi.fn(),
      } as any,
      {
        findDepartmentBySlug: vi.fn().mockResolvedValue({ id: 'd-eng', slug: 'engineering' }),
        findEmployeeBySlug: vi.fn().mockResolvedValue({ id: 'emp-1', slug: 'backend_lead' }),
      } as any,
      { searchMemory: vi.fn().mockResolvedValue([]), saveMemory: vi.fn() } as any,
      { saveApproval: vi.fn() } as any,
      {
        complete: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            tasks: [
              {
                key: 'api',
                title: 'Integrate Endpoints',
                description: 'Integrate endpoints',
                departmentSlug: 'engineering',
                employeeSlug: 'backend_lead',
                taskType: 'development',
                priority: 'HIGH',
                dependsOnKeys: [],
                requiresApproval: false,
              },
            ],
          }),
        }),
      } as any,
      { notifyUser: vi.fn() } as any,
      { log: vi.fn() } as any,
    );

    await service.issueCommand({
      userId: 'ceo-1',
      instruction: 'Integrate all endpoints on hostel ghar project under codynexNepal.',
    });

    expect(savedTasks).toHaveLength(1);
    expect(savedTasks[0]!.priority).toBe(80);
    expect((savedTasks[0]!.inputPayload as any).githubRepoName).toBeUndefined();
  });
});
