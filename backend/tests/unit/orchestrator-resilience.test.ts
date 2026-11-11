import { describe, expect, it, vi } from 'vitest';
import { OrchestratorService } from '../../src/services/orchestrator.service';
import { AiProviderError } from '../../src/ai/ai-provider.interface';
import { AiProviderName, ProjectStatus, TaskStatus } from '../../src/constant/enum.constant';

describe('Orchestrator resilience, backoff & project reconciliation', () => {
  it('marks task BLOCKED immediately when no AI provider key is configured', async () => {
    const updateTask = vi.fn().mockResolvedValue({});
    const appendLog = vi.fn().mockResolvedValue({});
    const taskRepo = {
      reclaimExpiredLeases: vi.fn().mockResolvedValue(0),
      claimNextReadyTask: vi
        .fn()
        .mockResolvedValueOnce({ id: 't-1' })
        .mockResolvedValueOnce(null),
      findById: vi.fn().mockResolvedValue({
        id: 't-1',
        projectId: 'p-1',
        title: 'Analyze architecture',
        description: 'Review system',
        taskType: 'architecture',
        retryCount: 0,
        maxRetries: 3,
        inputPayload: {},
        assignedEmployeeId: 'emp-1',
        assignedEmployee: {
          id: 'emp-1',
          slug: 'cto',
          systemInstruction: 'Design safely',
          allowedTools: ['memory.read'],
        },
      }),
      createExecution: vi.fn().mockResolvedValue({ id: 'exec-1' }),
      updateExecution: vi.fn().mockResolvedValue({}),
      updateById: updateTask,
      appendLog,
    } as any;

    const modelRouter = {
      complete: vi
        .fn()
        .mockRejectedValue(
          new AiProviderError(AiProviderName.GEMINI, 'NOT_CONFIGURED', 'Missing API key'),
        ),
    } as any;

    const service = new OrchestratorService(
      taskRepo,
      {} as any,
      { searchMemory: vi.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      modelRouter,
      { notifyUser: vi.fn() } as any,
      { log: vi.fn() } as any,
    );

    const res = await service.runTick(2);
    expect(res.processed).toBe(1);
    expect(updateTask).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: TaskStatus.BLOCKED }),
    );
  });

  it('preserves task in QUEUED with incremented retryCount on RATE_LIMITED', async () => {
    const updateTask = vi.fn().mockResolvedValue({});
    const taskRepo = {
      reclaimExpiredLeases: vi.fn().mockResolvedValue(0),
      claimNextReadyTask: vi
        .fn()
        .mockResolvedValueOnce({ id: 't-2' })
        .mockResolvedValueOnce(null),
      findById: vi.fn().mockResolvedValue({
        id: 't-2',
        projectId: 'p-1',
        title: 'Research market',
        description: 'Scan competitors',
        taskType: 'research',
        retryCount: 1,
        maxRetries: 3,
        inputPayload: {},
        assignedEmployeeId: null,
        assignedEmployee: null,
      }),
      createExecution: vi.fn().mockResolvedValue({ id: 'exec-2' }),
      updateExecution: vi.fn().mockResolvedValue({}),
      updateById: updateTask,
      appendLog: vi.fn().mockResolvedValue({}),
    } as any;

    const modelRouter = {
      complete: vi
        .fn()
        .mockRejectedValue(
          new AiProviderError(AiProviderName.GEMINI, 'RATE_LIMITED', 'HTTP 429'),
        ),
    } as any;

    const service = new OrchestratorService(
      taskRepo,
      {} as any,
      { searchMemory: vi.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      modelRouter,
      { notifyUser: vi.fn() } as any,
      { log: vi.fn() } as any,
    );

    await service.runTick(1);
    expect(updateTask).toHaveBeenCalledWith(
      't-2',
      expect.objectContaining({
        status: TaskStatus.QUEUED,
        retryCount: 2,
      }),
    );
  });

  it('marks project COMPLETED and notifies CEO only when all tasks are COMPLETED', async () => {
    const updateProject = vi.fn().mockResolvedValue({});
    const notifyUser = vi.fn().mockResolvedValue({});
    const taskRepo = {
      findAll: vi.fn().mockResolvedValue([
        { id: 't1', status: TaskStatus.COMPLETED },
        { id: 't2', status: TaskStatus.COMPLETED },
      ]),
    } as any;
    const projectRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'p-1',
        title: 'Hostel SaaS',
        status: ProjectStatus.ACTIVE,
        createdBy: 'ceo-1',
      }),
      updateById: updateProject,
    } as any;

    const service = new OrchestratorService(
      taskRepo,
      projectRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { notifyUser } as any,
      { log: vi.fn() } as any,
    );

    await service.reconcileProjectStatus('p-1');
    expect(updateProject).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ status: ProjectStatus.COMPLETED }),
    );
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });
});
