import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRouterService } from '../../src/ai/router/model-router.service';
import { OpenRouterAdapter } from '../../src/ai/adapters/openrouter.adapter';
import { CloudflareAdapter } from '../../src/ai/adapters/cloudflare.adapter';
import { HuggingFaceAdapter } from '../../src/ai/adapters/huggingface.adapter';
import { OllamaAdapter } from '../../src/ai/adapters/ollama.adapter';
import { GeminiAdapter } from '../../src/ai/adapters/gemini.adapter';
import { GroqAdapter } from '../../src/ai/adapters/groq.adapter';
import { OpenAiAdapter } from '../../src/ai/adapters/openai.adapter';
import { ModelEligibilityValidator } from '../../src/ai/services/model-eligibility.validator';
import { AiProviderName, ModelEligibilityStatus } from '../../src/constant/enum.constant';
import { AiProviderError } from '../../src/ai/ai-provider.interface';
import * as runtimeSecrets from '../../src/services/runtime-secrets.service';

describe('Multi-Provider Free AI Integration & Management System', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Model Eligibility Validator (Strict FREE-ONLY Mode)', () => {
    it('verifies $0 free models as FREE_VERIFIED and allows them to execute', () => {
      const geminiResult = ModelEligibilityValidator.validate(AiProviderName.GEMINI, 'gemini-3.8-flash', {
        freeOnlyMode: true,
      });
      expect(geminiResult.eligible).toBe(true);
      expect(geminiResult.status).toBe(ModelEligibilityStatus.FREE_VERIFIED);

      const groqResult = ModelEligibilityValidator.validate(AiProviderName.GROQ, 'llama-3.3-70b-versatile', {
        freeOnlyMode: true,
      });
      expect(groqResult.eligible).toBe(true);
      expect(groqResult.status).toBe(ModelEligibilityStatus.FREE_VERIFIED);

      const openrouterFree = ModelEligibilityValidator.validate(
        AiProviderName.OPENROUTER,
        'meta-llama/llama-3.3-70b-instruct:free',
        { freeOnlyMode: true },
      );
      expect(openrouterFree.eligible).toBe(true);
      expect(openrouterFree.status).toBe(ModelEligibilityStatus.FREE_VERIFIED);

      const ollamaLocal = ModelEligibilityValidator.validate(AiProviderName.OLLAMA, 'qwen3:4b', {
        freeOnlyMode: true,
      });
      expect(ollamaLocal.eligible).toBe(true);
      expect(ollamaLocal.status).toBe(ModelEligibilityStatus.FREE_VERIFIED);
    });

    it('PROVES THAT NO AGENT CAN EXECUTE A PAID MODEL WHILE FREE-ONLY MODE IS ENABLED', () => {
      // 1. OpenAI gpt-4o must be blocked
      const openAiValidation = ModelEligibilityValidator.validate(AiProviderName.OPENAI, 'gpt-4o', {
        freeOnlyMode: true,
      });
      expect(openAiValidation.eligible).toBe(false);
      expect(openAiValidation.status).toBe(ModelEligibilityStatus.PAID);
      expect(openAiValidation.reason).toContain('PAID model');

      // 2. OpenAI gpt-4o-mini must be blocked
      const openAiMiniValidation = ModelEligibilityValidator.validate(AiProviderName.OPENAI, 'gpt-4o-mini', {
        freeOnlyMode: true,
      });
      expect(openAiMiniValidation.eligible).toBe(false);
      expect(openAiMiniValidation.status).toBe(ModelEligibilityStatus.PAID);

      // 3. Paid OpenRouter model without :free suffix must be blocked
      const paidOpenRouter = ModelEligibilityValidator.validate(
        AiProviderName.OPENROUTER,
        'anthropic/claude-3.5-sonnet',
        { freeOnlyMode: true },
      );
      expect(paidOpenRouter.eligible).toBe(false);
      expect(paidOpenRouter.status).toBe(ModelEligibilityStatus.UNKNOWN);
      expect(paidOpenRouter.reason).toContain('FREE-ONLY mode');

      // 4. AssertEligible throws AiProviderError
      expect(() => {
        ModelEligibilityValidator.assertEligible(AiProviderName.OPENAI, 'gpt-4o', { freeOnlyMode: true });
      }).toThrow(AiProviderError);
    });

    it('rejects models with unknown pricing safely under FREE-ONLY mode', () => {
      const unknownResult = ModelEligibilityValidator.validate(AiProviderName.GEMINI, 'custom-unknown-model-v99', {
        freeOnlyMode: true,
      });
      expect(unknownResult.eligible).toBe(false);
      expect(unknownResult.status).toBe(ModelEligibilityStatus.UNKNOWN);
      expect(unknownResult.reason).toContain('UNKNOWN pricing');
    });

    it('rejects providers when daily free quota is exhausted', () => {
      const quotaResult = ModelEligibilityValidator.validate(AiProviderName.CLOUDFLARE, '@cf/meta/llama-3.1-8b-instruct', {
        freeOnlyMode: true,
        isQuotaExhausted: true,
      });
      expect(quotaResult.eligible).toBe(false);
      expect(quotaResult.status).toBe(ModelEligibilityStatus.QUOTA_EXHAUSTED);
      expect(quotaResult.reason).toContain('exhausted');
    });
  });

  describe('2. OpenRouter Provider Adapter', () => {
    it('discovers free models and filters out paid models with non-zero pricing', async () => {
      const adapter = new OpenRouterAdapter();
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'meta-llama/llama-3.3-70b-instruct:free',
                name: 'Llama 3.3 70B (Free)',
                pricing: { prompt: '0', completion: '0', request: '0' },
              },
              {
                id: 'anthropic/claude-3-opus',
                name: 'Claude 3 Opus',
                pricing: { prompt: '0.000015', completion: '0.000075', request: '0' },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const freeModels = await adapter.discoverFreeModels('test-openrouter-key');
      expect(freeModels).toHaveLength(1);
      expect(freeModels[0].id).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(freeModels[0].isFree).toBe(true);
      expect(freeModels[0].pricing?.promptUsdPerMillion).toBe(0);
    });

    it('successfully generates completion with $0 cost and handles rate limiting (429)', async () => {
      vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-or-key');

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'OpenRouter free completion' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 15, completion_tokens: 10 },
              model: 'meta-llama/llama-3.3-70b-instruct:free',
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
            status: 429,
            headers: { 'retry-after': '10' },
          }),
        );

      const adapter = new OpenRouterAdapter();
      const res = await adapter.complete({
        systemPrompt: 'sys',
        userPrompt: 'hi',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
      });

      expect(res.content).toBe('OpenRouter free completion');
      expect(res.estimatedCostUsd).toBe(0);
      expect(res.provider).toBe(AiProviderName.OPENROUTER);

      // Second call triggers 429 error
      await expect(
        adapter.complete({
          systemPrompt: 'sys',
          userPrompt: 'hi',
          model: 'meta-llama/llama-3.3-70b-instruct:free',
        }),
      ).rejects.toThrow(AiProviderError);
    });
  });

  describe('3. Cloudflare Workers AI Provider Adapter', () => {
    it('executes text completion against Cloudflare Workers AI edge model', async () => {
      vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockImplementation(async (k) => {
        if (k === 'cloudflare_account_id') return 'mock-cf-account-id';
        if (k === 'cloudflare_api_token') return 'mock-cf-api-token';
        return '';
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: { response: 'Cloudflare edge generated response' },
            success: true,
          }),
          { status: 200 },
        ),
      );

      const adapter = new CloudflareAdapter();
      const res = await adapter.complete({
        systemPrompt: 'sys',
        userPrompt: 'generate edge text',
        model: '@cf/meta/llama-3.1-8b-instruct',
      });

      expect(res.content).toBe('Cloudflare edge generated response');
      expect(res.provider).toBe(AiProviderName.CLOUDFLARE);
      expect(res.estimatedCostUsd).toBe(0);
    });

    it('throws error when credentials are not configured', async () => {
      vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('');
      const adapter = new CloudflareAdapter();
      await expect(
        adapter.complete({ systemPrompt: 'sys', userPrompt: 'hi' }),
      ).rejects.toThrow('Cloudflare Workers AI requires CLOUDFLARE_ACCOUNT_ID');
    });
  });

  describe('4. Hugging Face Serverless Inference Provider Adapter', () => {
    it('executes text generation on Hugging Face Serverless free tier', async () => {
      vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-hf-key');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'HF serverless response' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 8 },
          }),
          { status: 200 },
        ),
      );

      const adapter = new HuggingFaceAdapter();
      const res = await adapter.complete({
        systemPrompt: 'sys',
        userPrompt: 'summarize',
        model: 'meta-llama/Llama-3.2-3B-Instruct',
      });

      expect(res.content).toBe('HF serverless response');
      expect(res.provider).toBe(AiProviderName.HUGGINGFACE);
      expect(res.estimatedCostUsd).toBe(0);
    });
  });

  describe('5. Ollama Local Provider & Clear Offline Instructions', () => {
    it('provides clear installation and startup instructions when local Ollama server is offline', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

      const adapter = new OllamaAdapter();
      try {
        await adapter.complete({ systemPrompt: 'sys', userPrompt: 'hello local' });
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err).toBeInstanceOf(AiProviderError);
        expect(err.message).toContain('Setup: 1) Install from https://ollama.com');
        expect(err.message).toContain("2) Start with 'ollama serve'");
      }
    });
  });

  describe('6. Intelligent AI Router & Free-Provider Fallback', () => {
    it('automatically falls back across verified free providers when primary hits rate limit (429)', async () => {
      const router = new ModelRouterService();
      const ollamaAdapter = router.providerManager.getAdapter(AiProviderName.OLLAMA)!;
      const geminiAdapter = router.providerManager.getAdapter(AiProviderName.GEMINI)!;
      const groqAdapter = router.providerManager.getAdapter(AiProviderName.GROQ)!;

      vi.spyOn(ollamaAdapter, 'complete').mockRejectedValueOnce(
        new AiProviderError(AiProviderName.OLLAMA, 'NOT_CONFIGURED', 'Ollama offline', { category: 'UNAVAILABLE' }),
      );
      vi.spyOn(geminiAdapter, 'complete').mockRejectedValueOnce(
        new AiProviderError(AiProviderName.GEMINI, 'RATE_LIMITED', 'Gemini 429 quota reached', {
          category: 'RATE_LIMIT',
          statusCode: 429,
        }),
      );
      vi.spyOn(groqAdapter, 'complete').mockResolvedValueOnce({
        provider: AiProviderName.GROQ,
        model: 'llama-3.3-70b-versatile',
        content: 'Groq fallback output',
        inputTokens: 20,
        outputTokens: 10,
        estimatedCostUsd: 0,
        latencyMs: 12,
      });

      const res = await router.complete({
        systemPrompt: 'sys',
        userPrompt: 'execute fallback test',
      });

      expect(res.provider).toBe(AiProviderName.GROQ);
      expect(res.content).toBe('Groq fallback output');
      expect(res.estimatedCostUsd).toBe(0);
    });

    it('respects agent-specific preferences (e.g. Coding Agent prefers Groq)', async () => {
      const router = new ModelRouterService();
      const groqAdapter = router.providerManager.getAdapter(AiProviderName.GROQ)!;

      vi.spyOn(groqAdapter, 'complete').mockResolvedValueOnce({
        provider: AiProviderName.GROQ,
        model: 'llama-3.3-70b-versatile',
        content: 'Coding Agent Code Output',
        inputTokens: 30,
        outputTokens: 40,
        estimatedCostUsd: 0,
        latencyMs: 15,
      });

      const res = await router.complete(
        { systemPrompt: 'sys', userPrompt: 'write code' },
        { agentRole: 'coding' },
      );

      expect(res.provider).toBe(AiProviderName.GROQ);
      expect(res.content).toBe('Coding Agent Code Output');
    });

    it('completely blocks OpenAI execution when freeOnlyMode is active even if preferred', async () => {
      const router = new ModelRouterService();

      vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('openai-key');
      vi.spyOn(router.aiSettingsService, 'getGlobalSettings').mockResolvedValue({
        freeOnlyMode: true,
        allowPaidProviders: false,
        autoFreeFallback: false,
        maxRetries: 1,
        requestTimeoutMs: 5000,
        maxConcurrentRequests: 4,
        dailyTokenLimit: 500000,
        providerPriority: [AiProviderName.OPENAI],
      });

      // Attempting to route with preferredProvider = 'openai' under FREE-ONLY mode
      await expect(
        router.complete(
          { systemPrompt: 'sys', userPrompt: 'paid attempt' },
          { preferredProvider: AiProviderName.OPENAI, preferredModel: 'gpt-4o' },
        ),
      ).rejects.toThrow();
    }, 20000);
  });

  describe('7. Quota and Provider Management', () => {
    it('lists all 7 providers with accurate free/paid and local/cloud indicators', async () => {
      const router = new ModelRouterService();
      const providers = await router.listProviders();

      expect(providers).toHaveLength(7);
      const providerNames = providers.map((p) => p.provider);
      expect(providerNames).toContain(AiProviderName.OLLAMA);
      expect(providerNames).toContain(AiProviderName.GEMINI);
      expect(providerNames).toContain(AiProviderName.GROQ);
      expect(providerNames).toContain(AiProviderName.OPENROUTER);
      expect(providerNames).toContain(AiProviderName.CLOUDFLARE);
      expect(providerNames).toContain(AiProviderName.HUGGINGFACE);
      expect(providerNames).toContain(AiProviderName.OPENAI);

      // Only OpenAI is marked as paid
      const paidProviders = providers.filter((p) => p.isPaid).map((p) => p.provider);
      expect(paidProviders).toEqual([AiProviderName.OPENAI]);
    });

    it('accurately reports "Quota information unavailable" when provider headers do not expose live quotas', async () => {
      const router = new ModelRouterService();
      const quotas = await router.getQuotaStatus();

      const geminiQuota = quotas.find((q) => q.provider === AiProviderName.GEMINI);
      expect(geminiQuota?.quotaKnown).toBe(false);
      expect(geminiQuota?.detail).toContain('Quota information unavailable');

      const ollamaQuota = quotas.find((q) => q.provider === AiProviderName.OLLAMA);
      expect(ollamaQuota?.quotaKnown).toBe(true);
      expect(ollamaQuota?.detail).toContain('Zero external API quota limits');
    });
  });
});
