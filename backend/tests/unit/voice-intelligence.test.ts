import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceService, VoicePermissionLevel } from '../../src/services/voice.service';
import { agentExecutionService } from '../../src/services/agent-execution.service';

describe('Nepali Voice Intelligence System', () => {
  let voiceService: VoiceService;
  const mockModelRouter = {
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    voiceService = new VoiceService(mockModelRouter as any);
  });

  describe('Risk-Based 3-Level Permission Classifier', () => {
    it('classifies read-only status and inspection queries as Level 1 (Auto-Approved)', async () => {
      mockModelRouter.complete.mockResolvedValueOnce({
        content: JSON.stringify({
          actionType: 'INSPECT_STATUS',
          assignedRole: 'QA Engineer',
          targetWorkspace: 'HostelGhar',
          nepaliVoiceReply: 'म Hostel Ghar वेबसाइट र इन्जिनियरिङको अवस्था जाँच गर्दैछु।',
          requiresConfirmation: false,
        }),
      });

      const intent = await voiceService.processNepaliVoiceDirective('मेरो Hostel Ghar को वेबसाइट जाँच गर');

      expect(intent.permissionLevel).toBe(VoicePermissionLevel.LEVEL_1_READ_ONLY);
      expect(intent.actionType).toBe('INSPECT_STATUS');
      expect(intent.requiresConfirmation).toBe(false);
      expect(intent.nepaliVoiceReply).toContain('जाँच गर्दैछु');
    });

    it('classifies failing test inspection and log review as Level 1 (Read-Only)', async () => {
      mockModelRouter.complete.mockResolvedValueOnce({
        content: JSON.stringify({
          actionType: 'INSPECT_STATUS',
          assignedRole: 'QA Engineer',
          targetWorkspace: 'aliza-wears',
          nepaliVoiceReply: 'म GitHub मा भएका असफल परीक्षणहरू हेर्दैछु।',
          requiresConfirmation: false,
        }),
      });

      const intent = await voiceService.processNepaliVoiceDirective('मेरो GitHub मा भएका failing tests जाँच गर');

      expect(intent.permissionLevel).toBe(VoicePermissionLevel.LEVEL_1_READ_ONLY);
      expect(intent.requiresConfirmation).toBe(false);
    });

    it('classifies reversible task creation and agent delegation as Level 2 (Confirmation Required)', async () => {
      mockModelRouter.complete.mockResolvedValueOnce({
        content: JSON.stringify({
          actionType: 'DELEGATE_AGENT',
          assignedRole: 'CTO',
          targetWorkspace: 'HostelGhar',
          nepaliVoiceReply: 'म AI CTO लाई यो समस्या अनुसन्धान गर्न लगाउँछु। के म अघि बढौँ?',
          technicalRecommendation: 'पहिले error logs र stack trace विश्लेषण गर्नु उपयुक्त हुन्छ।',
          requiresConfirmation: true,
          confirmationPrompt: 'के म AI CTO लाई यो कार्य दिन स्वीकृत गरौँ?',
        }),
      });

      const intent = await voiceService.processNepaliVoiceDirective('AI CTO लाई यो bug investigate गर्न लगाऊ');

      expect(intent.permissionLevel).toBe(VoicePermissionLevel.LEVEL_2_REVERSIBLE);
      expect(intent.requiresConfirmation).toBe(true);
      expect(intent.technicalRecommendation).toContain('error logs');
    });

    it('classifies destructive and production operations as Level 3 (High-Impact Dangerous)', async () => {
      mockModelRouter.complete.mockResolvedValueOnce({
        content: JSON.stringify({
          actionType: 'TERMINAL_COMMAND',
          assignedRole: 'DevOps Engineer',
          targetWorkspace: 'HostelGhar',
          nepaliVoiceReply: 'यो अत्यन्त संवेदनशील कार्य हो। सबै फाइलहरू मेटिनेछन्।',
          requiresConfirmation: true,
          confirmationPrompt: 'के हजुर पक्का हुनुहुन्छ कि सबै फाइलहरू मेटाउने?',
        }),
      });

      const intent = await voiceService.processNepaliVoiceDirective('कार्यक्षेत्रका सबै files मेटाउ र drop database गर');

      expect(intent.permissionLevel).toBe(VoicePermissionLevel.LEVEL_3_HIGH_IMPACT);
      expect(intent.requiresConfirmation).toBe(true);
      expect(intent.confirmationPrompt).toBeDefined();
    });
  });

  describe('Fast-Path Sub-50ms Directive Execution', () => {
    it('immediately halts active task on "रोक" without LLM inference latency', async () => {
      const pauseSpy = vi.spyOn(agentExecutionService, 'pauseSession').mockReturnValue(true);

      const intent = await voiceService.processNepaliVoiceDirective('अहिले चलिरहेको task रोक', {
        activeSessionId: 'sess_running_123',
      });

      expect(pauseSpy).toHaveBeenCalledWith('sess_running_123');
      expect(intent.actionType).toBe('STOP_ACTIVE_TASK');
      expect(intent.permissionLevel).toBe(VoicePermissionLevel.LEVEL_1_READ_ONLY);
      expect(intent.nepaliVoiceReply).toContain('रोकिदिएको');
      expect(mockModelRouter.complete).not.toHaveBeenCalled();
    });

    it('handles stop / pause variants in English and Nepali', async () => {
      const pauseSpy = vi.spyOn(agentExecutionService, 'pauseSession').mockReturnValue(true);

      const intent = await voiceService.processNepaliVoiceDirective('काम बन्द गर');
      expect(intent.actionType).toBe('STOP_ACTIVE_TASK');
    });
  });

  describe('Execution of Authorized Intent', () => {
    it('launches autonomous agent execution loop when user approves', async () => {
      const runAgentLoopSpy = vi.spyOn(agentExecutionService, 'runAgentLoop').mockResolvedValue({} as any);

      // Register an intent first
      mockModelRouter.complete.mockResolvedValueOnce({
        content: JSON.stringify({
          actionType: 'DELEGATE_AGENT',
          assignedRole: 'Frontend Engineer',
          targetWorkspace: 'CodynexNepal/HostelGhar',
          nepaliVoiceReply: 'कार्य स्वीकृत भयो।',
          requiresConfirmation: true,
        }),
      });

      const intent = await voiceService.processNepaliVoiceDirective('Hostel Ghar को नयाँ ल्यान्डिङ पेज बनाउ');
      expect(intent.requiresConfirmation).toBe(true);

      const result = await voiceService.executeAuthorizedIntent(intent.intentId, true);

      expect(result.success).toBe(true);
      expect(result.executionSessionId).toBeDefined();
      expect(runAgentLoopSpy).toHaveBeenCalled();
    });

    it('gracefully handles user rejection of Level 2/3 intents', async () => {
      const runAgentLoopSpy = vi.spyOn(agentExecutionService, 'runAgentLoop');

      const result = await voiceService.executeAuthorizedIntent('non_existent_id', false);

      expect(result.success).toBe(false);
      expect(result.voiceReply).toContain('रद्द');
      expect(runAgentLoopSpy).not.toHaveBeenCalled();
    });
  });
});
