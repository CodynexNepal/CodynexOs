import { describe, expect, it, vi } from 'vitest';
import { EngineeringService } from '../../src/services/engineering.service';
import { CrmService } from '../../src/services/crm.service';
import { LeadStage, QaVerdict } from '../../src/constant/enum.constant';

describe('Engineering branch protection, QA correction loop & CRM opt-out compliance', () => {
  it('blocks direct commits/PRs targeting the default production branch', async () => {
    const engRepo = {
      findRepoById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        owner: 'CodynexNepal',
        name: 'HostelGhar',
        defaultBranch: 'main',
        isWriteAuthorized: true,
      }),
    } as any;

    const service = new EngineeringService(engRepo, {} as any, {} as any, { log: vi.fn() } as any);

    await expect(
      service.createTaskBranchAndPr({
        repoId: 'repo-1',
        branchName: 'main',
        title: 'Unsafe direct push',
        actorId: 'ceo-1',
      }),
    ).rejects.toThrow(/prohibited/i);
  });

  it('spawns a linked correction task when QA report fails', async () => {
    const saveTaskMock = vi.fn().mockResolvedValue({ id: 'correction-task-1' });
    const updateTaskMock = vi.fn().mockResolvedValue({});
    const taskRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'task-1',
        projectId: 'proj-1',
        departmentId: 'dept-eng',
        assignedEmployeeId: 'emp-be',
        title: 'Build Auth API',
      }),
      save: saveTaskMock,
      updateById: updateTaskMock,
    } as any;

    const orgRepo = {
      findEmployeeBySlug: vi.fn().mockResolvedValue({ id: 'emp-qa' }),
    } as any;

    const engRepo = {
      saveQaReport: vi.fn().mockImplementation(async (r) => ({ id: 'qa-1', ...r })),
    } as any;

    const service = new EngineeringService(engRepo, taskRepo, orgRepo, { log: vi.fn() } as any);
    const report = await service.recordQaReport({
      taskId: 'task-1',
      verdict: QaVerdict.FAILED,
      checksExecuted: [{ name: 'vitest', status: 'FAIL' }],
      failedComponent: 'auth.middleware.ts',
      summary: 'JWT expiry check failed',
      actorId: 'ceo-1',
    });

    expect(report.correctionTaskId).toBe('correction-task-1');
    expect(saveTaskMock).toHaveBeenCalledTimes(1);
    expect(saveTaskMock.mock.calls[0]![0].parentTaskId).toBe('task-1');
  });

  it('auto-opts out a lead when reply is classified OPT_OUT and blocks future outreach', async () => {
    const leadRecord = {
      id: 'lead-1',
      businessName: 'Himalayan Hostel',
      stage: LeadStage.CONTACTED,
      isOptedOut: false,
    };

    const crmRepo = {
      findInteractionById: vi.fn().mockResolvedValue({
        id: 'int-1',
        leadId: 'lead-1',
        replyClassification: null,
      }),
      saveInteraction: vi.fn().mockImplementation(async (x) => x),
      findLeadById: vi.fn().mockResolvedValue(leadRecord),
      saveLead: vi.fn().mockImplementation(async (l) => l),
    } as any;

    const service = new CrmService(crmRepo, {} as any, { log: vi.fn() } as any);
    await service.classifyInteractionReply('int-1', 'OPT_OUT', 'ceo-1');

    expect(leadRecord.isOptedOut).toBe(true);
    expect(leadRecord.stage).toBe(LeadStage.OPTED_OUT);

    await expect(
      service.draftOutreach('lead-1', {
        subject: 'Follow up',
        body: 'Checking in',
        channel: 'EMAIL',
      }),
    ).rejects.toThrow(/opted-out/i);
  });
});
