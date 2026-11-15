import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger.util';
import { socketServer } from '../socket/socket.server';
import { ModelRouterService } from '../ai/router/model-router.service';
import { agentExecutionService } from './agent-execution.service';
import { CommandService } from './command.service';
import { dotEnvConfig } from '../configs/envConfig';

export enum VoicePermissionLevel {
  LEVEL_1_READ_ONLY = 1,
  LEVEL_2_REVERSIBLE = 2,
  LEVEL_3_HIGH_IMPACT = 3,
}

export interface VoiceInstructionIntent {
  intentId: string;
  rawNepaliText: string;
  normalizedText: string;
  actionType:
    | 'INSPECT_STATUS'
    | 'STOP_ACTIVE_TASK'
    | 'RUN_TESTS'
    | 'DELEGATE_AGENT'
    | 'BROWSER_AUTOMATION'
    | 'TERMINAL_COMMAND'
    | 'PLAN_PROJECT'
    | 'CLARIFICATION_NEEDED';
  permissionLevel: VoicePermissionLevel;
  targetWorkspace?: string;
  assignedRole?: string;
  nepaliVoiceReply: string;
  technicalRecommendation?: string;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
  plannedPayload?: Record<string, unknown>;
}

export class VoiceService {
  private voiceProcess: ChildProcess | null = null;
  private voiceEngineUrl = process.env.VOICE_ENGINE_URL || 'http://127.0.0.1:5050';
  private isEngineReady = false;
  private pendingApprovals: Map<string, VoiceInstructionIntent> = new Map();

  constructor(
    private readonly modelRouter: ModelRouterService = new ModelRouterService(),
    private readonly commandService?: CommandService,
  ) {
    this.ensureVoiceEngineRunning();
  }

  public ensureVoiceEngineRunning(): void {
    void this.pingVoiceEngine().then((healthy) => {
      if (healthy) {
        this.isEngineReady = true;
        logger.info('Nepali Voice Engine is active and connected on ' + this.voiceEngineUrl);
        return;
      }

      const scriptPath = path.resolve(__dirname, '../../voice-engine/server.py');
      logger.info('Spawning Nepali Voice Engine background sidecar', { scriptPath });
      try {
        this.voiceProcess = spawn('python', [scriptPath], {
          detached: false,
          stdio: 'ignore',
          env: {
            ...process.env,
            VOICE_PORT: '5050',
            WHISPER_MODEL_SIZE: process.env.WHISPER_MODEL_SIZE || 'base',
          },
        });

        this.voiceProcess.on('error', (err) => {
          logger.warn('Could not launch voice engine sidecar process', { error: err.message });
        });

        // Retry ping after 3 seconds
        setTimeout(() => {
          void this.pingVoiceEngine().then((ok) => {
            this.isEngineReady = ok;
            if (ok) logger.info('Nepali Voice Engine started successfully on port 5050');
          });
        }, 3000);
      } catch (err: any) {
        logger.warn('Failed to spawn Python voice engine', { error: err.message });
      }
    });
  }

  public async pingVoiceEngine(): Promise<boolean> {
    try {
      const res = await fetch(`${this.voiceEngineUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        this.isEngineReady = true;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe user audio (base64) using the local int8 faster-whisper ASR engine.
   */
  public async transcribeAudio(
    audioBase64: string,
    format = 'webm',
  ): Promise<{ text: string; language: string; latencyMs: number }> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.voiceEngineUrl}/transcribe/base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, format, language: 'ne' }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`Voice engine HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        success: boolean;
        text: string;
        detected_language?: string;
        latencyMs?: number;
      };

      return {
        text: data.text || '',
        language: data.detected_language || 'ne',
        latencyMs: data.latencyMs || Date.now() - t0,
      };
    } catch (err: any) {
      logger.warn('Voice transcription engine error', { error: err.message });
      throw new Error(`Nepali Speech Transcription failed: ${err.message}`);
    }
  }

  /**
   * Synthesize text to deep, mature native Kathmandu male speech (ne-NP-SagarNeural).
   */
  public async synthesizeSpeech(
    text: string,
    voice = 'ne-NP-SagarNeural',
  ): Promise<{ audioBase64: string; mimeType: string; latencyMs: number }> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.voiceEngineUrl}/synthesize/base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, rate: '+0%', pitch: '+0Hz' }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`Voice synthesis HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        success: boolean;
        audioBase64: string;
        mimeType: string;
        latencyMs: number;
      };

      return {
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || 'audio/mpeg',
        latencyMs: data.latencyMs || Date.now() - t0,
      };
    } catch (err: any) {
      logger.warn('Voice synthesis failed', { error: err.message });
      throw new Error(`Nepali Speech Synthesis failed: ${err.message}`);
    }
  }

  /**
   * Risk-Based 3-Level Permission Classifier & Intelligent AI COO Voice Interpreter.
   * Understands native Nepali, Romanized Nepali, and code-switching technical terms.
   */
  public async processNepaliVoiceDirective(
    nepaliText: string,
    context: { activeSessionId?: string; activeWorkspace?: string; userId?: string } = {},
  ): Promise<VoiceInstructionIntent> {
    const intentId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const lower = nepaliText.toLowerCase();

    // 1. FAST RULE PRE-ROUTING (Sub-50ms execution for common voice commands)
    // "अहिले चलिरहेको task रोक" / "stop" / "pause"
    if (/रोक|बन्द गर|stop|pause|halt/i.test(lower)) {
      if (context.activeSessionId) {
        agentExecutionService.pauseSession(context.activeSessionId);
      }
      return {
        intentId,
        rawNepaliText: nepaliText,
        normalizedText: 'Stop active task',
        actionType: 'STOP_ACTIVE_TASK',
        permissionLevel: VoicePermissionLevel.LEVEL_1_READ_ONLY,
        nepaliVoiceReply: 'अहिले चलिरहेको कार्य सफलतापूर्वक रोकिदिएको छु।',
        requiresConfirmation: false,
      };
    }

    // 2. Risk-Based Level Classification
    // Level 3 (High-Impact Dangerous Operations): Delete, Drop, Push to Main, Merge, Production Deploy
    const isDangerous =
      /मेटाउ|हटाउ|delete|drop|destroy|remove\s+all|force\s+push|production\s+deploy|merge/i.test(lower);

    // Level 1 (Read-Only Operations): Inspect, Status, Test checking, Error explaining
    const isReadOnly =
      /जाँच|हेर|चेक|status|inspect|check|explain|read|review|failing tests|diff|logs/i.test(lower) &&
      !/बनाउ|लेख|create|build|write|implement|deploy|commit|push|modify/i.test(lower);

    let permissionLevel: VoicePermissionLevel = VoicePermissionLevel.LEVEL_2_REVERSIBLE;
    if (isDangerous) {
      permissionLevel = VoicePermissionLevel.LEVEL_3_HIGH_IMPACT;
    } else if (isReadOnly) {
      permissionLevel = VoicePermissionLevel.LEVEL_1_READ_ONLY;
    }

    // 3. Technical AI COO Reasoning Engine
    const systemPrompt = `You are the executive AI Chief Operating Officer (COO) and Technical Co-Founder of CodyNex OS.
You communicate strictly in natural, professional standard Nepali (ressembling a native Kathmandu speaker).
You understand native Devanagari Nepali, Romanized Nepali, and mixed Nepali-English software engineering code-switching.

Your responsibilities:
1. Parse the user's voice command into an actionable Codynex OS engineering directive.
2. If the user instruction is ambiguous (e.g. "वेबसाइट जाँच गर"), ask an intelligent clarifying question in natural Nepali.
3. If an instruction has architectural risks (e.g. running 5 agents on the same files simultaneously), provide a proactive COO technical recommendation ("मेरो सुझाव: ...").
4. Formulate an authoritative, deep, respectful response in natural Nepali for the user.

Output strictly valid JSON with this shape:
{
  "actionType": "INSPECT_STATUS" | "RUN_TESTS" | "DELEGATE_AGENT" | "BROWSER_AUTOMATION" | "TERMINAL_COMMAND" | "PLAN_PROJECT" | "CLARIFICATION_NEEDED",
  "assignedRole": "CTO" | "Frontend Engineer" | "Backend Lead" | "QA Engineer" | "DevOps Engineer" | "Autonomous Browser Agent",
  "targetWorkspace": "HostelGhar" | "aliza-wears" | "workspace",
  "nepaliVoiceReply": "Natural standard Nepali response to speak to the CEO",
  "technicalRecommendation": "Technical rationale or advice if applicable",
  "requiresConfirmation": boolean (true for Level 2 or Level 3 actions),
  "confirmationPrompt": "Short question asking confirmation if required"
}`;

    const userPrompt = `User Voice Instruction: "${nepaliText}"
Active Workspace: ${context.activeWorkspace || 'CodynexNepal/HostelGhar'}
Current Session: ${context.activeSessionId || 'none'}
Assigned Risk Level: Level ${permissionLevel}`;

    try {
      const completion = await this.modelRouter.complete(
        {
          systemPrompt,
          userPrompt,
          responseFormat: 'json',
          maxOutputTokens: 512,
        },
        { preferredProvider: 'groq', agentRole: 'COO Voice Intelligence' },
      );

      const parsed = JSON.parse(completion.content);
      const requiresConfirmation =
        permissionLevel === VoicePermissionLevel.LEVEL_3_HIGH_IMPACT ||
        (permissionLevel === VoicePermissionLevel.LEVEL_2_REVERSIBLE && parsed.requiresConfirmation !== false);

      const intent: VoiceInstructionIntent = {
        intentId,
        rawNepaliText: nepaliText,
        normalizedText: nepaliText.trim(),
        actionType: parsed.actionType || (isReadOnly ? 'INSPECT_STATUS' : 'DELEGATE_AGENT'),
        permissionLevel,
        targetWorkspace: parsed.targetWorkspace || context.activeWorkspace || 'HostelGhar',
        assignedRole: parsed.assignedRole || 'Autonomous AI Engineer',
        nepaliVoiceReply: parsed.nepaliVoiceReply || 'हजुरको आदेश प्राप्त भयो। म तुरुन्तै काम सुरु गर्छु।',
        technicalRecommendation: parsed.technicalRecommendation,
        requiresConfirmation,
        confirmationPrompt:
          parsed.confirmationPrompt ||
          (requiresConfirmation
            ? `यो ${permissionLevel === 3 ? 'अत्यन्त संवेदनशील' : 'महत्वपूर्ण'} कार्य हो। के म अघि बढौँ?`
            : undefined),
      };

      if (requiresConfirmation) {
        this.pendingApprovals.set(intentId, intent);
      }

      return intent;
    } catch {
      // Fallback intent if AI reasoning model is momentarily unavailable
      return {
        intentId,
        rawNepaliText: nepaliText,
        normalizedText: nepaliText.trim(),
        actionType: isReadOnly ? 'INSPECT_STATUS' : 'DELEGATE_AGENT',
        permissionLevel,
        nepaliVoiceReply: isReadOnly
          ? 'म प्रणाली र कार्यक्षेत्रको अवस्था जाँच गर्दैछु।'
          : 'हजुरको निर्देशन अनुसार इन्जिनियरिङ टोलीलाई परिचालन गर्दैछु।',
        requiresConfirmation: permissionLevel === VoicePermissionLevel.LEVEL_3_HIGH_IMPACT,
      };
    }
  }

  /**
   * Execute or confirm an authorized voice intent through Codynex OS.
   */
  public async executeAuthorizedIntent(
    intentId: string,
    confirmed = true,
  ): Promise<{ success: boolean; voiceReply: string; executionSessionId?: string }> {
    const intent = this.pendingApprovals.get(intentId);
    if (!intent && !confirmed) {
      return { success: false, voiceReply: 'कार्य रद्द गरिएको छ।' };
    }

    const activeIntent = intent || {
      rawNepaliText: 'Autonomous Voice Command',
      targetWorkspace: 'HostelGhar',
      assignedRole: 'Autonomous AI Engineer',
      actionType: 'DELEGATE_AGENT',
    };

    this.pendingApprovals.delete(intentId);

    // Launch Autonomous Agent Execution Loop
    const sessionId = `voice_exec_${Date.now()}`;
    const workspaceParts = (activeIntent.targetWorkspace || 'CodynexNepal/HostelGhar').split('/');
    const owner = workspaceParts.length > 1 ? workspaceParts[0] : 'CodynexNepal';
    const repoName = workspaceParts.length > 1 ? workspaceParts[1] : workspaceParts[0];

    void agentExecutionService.runAgentLoop({
      sessionId,
      taskId: sessionId,
      instruction: activeIntent.rawNepaliText,
      roleTitle: activeIntent.assignedRole || 'Autonomous Voice AI Engineer',
      owner,
      repoName,
      maxSteps: 20,
    });

    const voiceReply = 'कार्य सफलतापूर्वक सुरु गरियो। म यसको प्रगति प्रत्यक्ष ड्यासबोर्डमा देखाउँदैछु।';
    return { success: true, voiceReply, executionSessionId: sessionId };
  }
}

export const voiceService = new VoiceService();
