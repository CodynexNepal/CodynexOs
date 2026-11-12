import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaAdapter } from '../../src/ai/adapters/ollama.adapter';
import { AiHealthService } from '../../src/ai/services/ai-health.service';
import { ModelSelectorService } from '../../src/ai/services/model-selector.service';
import { ToolCallingEngine } from '../../src/ai/tools/tool-executor.service';
import { ModelRouterService } from '../../src/ai/router/model-router.service';
import { AiProviderName, AiUsageStatus } from '../../src/constant/enum.constant';
import { AppDataSource } from '../../src/database/database-source';
import * as runtimeSecrets from '../../src/services/runtime-secrets.service';

describe('Ollama Primary AI Infrastructure, Tool Engine & Routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monitors Ollama connectivity, version, installed tags, and running ps models', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.6.8' }), { status: 200 });
      }
      if (u.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen3.5:4b', size: 3_324_173_934 }] }),
          { status: 200 },
        );
      }
      if (u.endsWith('/api/ps')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen3.5:4b', size_vram: 2_800_000_000 }] }),
          { status: 200 },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const health = new AiHealthService();
    const snap = await health.checkOllama();

    expect(snap.available).toBe(true);
    expect(snap.version).toBe('0.6.8');
    expect(snap.installedModels).toEqual(['qwen3.5:4b']);
    expect(snap.runningModels).toHaveLength(1);
  });

  it('selects tool-compatible installed models within hardware budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: 'qwen3.5:4b', size: 3_300_000_000 },
            { name: 'huge-model:405b', size: 900_000_000_000 },
          ],
        }),
        { status: 200 },
      ),
    );

    const selector = new ModelSelectorService();
    const selected = await selector.selectOllamaModel({ requiresTools: true });

    expect(selected.model).toBe('qwen3.5:4b');
    expect(selected.supportsTools).toBe(true);
  });

  it('performs successful inference, strips Qwen3 <think> traces, and captures metrics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '<think>internal chain of thought</think>Final clean answer.',
            thinking: 'secret trace',
          },
          prompt_eval_count: 42,
          eval_count: 18,
        }),
        { status: 200 },
      ),
    );

    const adapter = new OllamaAdapter();
    const res = await adapter.complete({
      systemPrompt: 'You are helpful',
      userPrompt: 'Say hi',
      model: 'qwen3:4b',
    });

    expect(res.provider).toBe(AiProviderName.OLLAMA);
    expect(res.content).toBe('Final clean answer.');
    expect(res.content).not.toContain('internal chain of thought');
    expect(res.inputTokens).toBe(42);
    expect(res.outputTokens).toBe(18);
  });

  it('handles streaming NDJSON responses from Ollama', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ message: { content: 'Hello ' }, done: false })}\n`),
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              message: { content: 'CodyNex' },
              done: true,
              prompt_eval_count: 10,
              eval_count: 5,
            })}\n`,
          ),
        );
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const tokens: string[] = [];
    const adapter = new OllamaAdapter();
    const res = await adapter.complete({
      systemPrompt: 'sys',
      userPrompt: 'hi',
      model: 'qwen3:4b',
      stream: true,
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toEqual(['Hello ', 'CodyNex']);
    expect(res.content).toBe('Hello CodyNex');
    expect(res.inputTokens).toBe(10);
    expect(res.outputTokens).toBe(5);
  });

  it('auto-discovers installed model on 404 or throws MODEL_NOT_FOUND when invalid', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'model not found' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), { status: 200 }));

    const adapter = new OllamaAdapter();
    await expect(
      adapter.complete({ systemPrompt: 'sys', userPrompt: 'hi', model: 'missing:99b' }),
    ).rejects.toMatchObject({
      category: 'MODEL_NOT_FOUND',
      statusCode: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports server unavailable and request timeout accurately', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const adapter = new OllamaAdapter();
    await expect(
      adapter.complete({ systemPrompt: 'sys', userPrompt: 'hi', model: 'qwen3:4b' }),
    ).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
      category: 'UNAVAILABLE',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    await expect(
      adapter.complete({
        systemPrompt: 'sys',
        userPrompt: 'hi',
        model: 'qwen3:4b',
        timeoutMs: 25,
      }),
    ).rejects.toMatchObject({
      category: 'TIMEOUT',
      statusCode: 504,
    });
  });

  it('executes authorized tool calls, rejects invalid arguments, and blocks unauthorized tools', async () => {
    const router = new ModelRouterService();
    const completeSpy = vi
      .spyOn(router, 'complete')
      .mockResolvedValueOnce({
        provider: AiProviderName.OLLAMA,
        model: 'qwen3.5:4b',
        content: '',
        toolCalls: [
          { id: 'c1', name: 'memory.read', arguments: { query: 'hostelghar' } },
          { id: 'c2', name: 'memory.read', arguments: { query: 'rm -rf /' } },
          { id: 'c3', name: 'memory.write', arguments: { title: 't', content: 'c' } },
        ],
        finishReason: 'tool_calls',
        inputTokens: 20,
        outputTokens: 10,
        estimatedCostUsd: 0,
        latencyMs: 50,
      })
      .mockResolvedValueOnce({
        provider: AiProviderName.OLLAMA,
        model: 'qwen3.5:4b',
        content: 'Found 1 memory item.',
        finishReason: 'stop',
        inputTokens: 30,
        outputTokens: 12,
        estimatedCostUsd: 0,
        latencyMs: 40,
      });

    const memoryReadHandler = vi.fn().mockResolvedValue([{ title: 'HostelGhar Architecture' }]);
    const memoryWriteHandler = vi.fn();

    const engine = new ToolCallingEngine(router);
    const result = await engine.runLoop({
      systemPrompt: 'sys',
      userPrompt: 'Check memory',
      allowedTools: ['memory.read'],
      handlers: {
        'memory.read': memoryReadHandler,
        'memory.write': memoryWriteHandler,
      },
    });

    expect(completeSpy).toHaveBeenCalledTimes(2);
    expect(memoryReadHandler).toHaveBeenCalledTimes(1);
    expect(memoryWriteHandler).not.toHaveBeenCalled();
    expect(result.executedTools).toEqual([
      { name: 'memory.read', arguments: { query: 'hostelghar' }, ok: true },
      { name: 'memory.read', arguments: { query: 'rm -rf /' }, ok: false },
      { name: 'memory.write', arguments: { title: 't', content: 'c' }, ok: false },
    ]);
    expect(result.finalResponse.content).toBe('Found 1 memory item.');
  });

  it('routes Ollama -> Gemini -> Groq fallback, handles HTTP 429 Retry-After, opens circuit breaker, and logs usage', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'gem-key';
      if (key === 'groq_api_key') return 'groq-key';
      return '';
    });

    const savedLogs: any[] = [];
    vi.spyOn(AppDataSource, 'isInitialized', 'get').mockReturnValue(true);
    vi.spyOn(AppDataSource, 'getRepository').mockImplementation((entity: any) => {
      const name = entity?.name || '';
      if (name === 'BudgetPolicyEntity') {
        return { findOne: vi.fn().mockResolvedValue({ dailyTokenLimit: 500000, maxConcurrentRequests: 3, allowPaidProviders: false }) } as any;
      }
      if (name === 'AiUsageLogEntity') {
        return {
          createQueryBuilder: () => ({
            select: () => ({
              where: () => ({
                andWhere: () => ({ getRawOne: vi.fn().mockResolvedValue({ total: '0' }) }),
                getRawOne: vi.fn().mockResolvedValue({ total: '0' }),
              }),
            }),
          }),
          create: (d: any) => d,
          save: vi.fn().mockImplementation(async (d) => {
            savedLogs.push(d);
            return d;
          }),
        } as any;
      }
      return {} as any;
    });

    // 1) Ollama unavailable -> Gemini 429 with Retry-After -> Groq succeeds
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('11434/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:4b', size: 3_000_000_000 }] }), { status: 200 });
      }
      if (u.includes('11434/api/chat')) {
        throw new Error('ECONNREFUSED');
      }
      if (u.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
          status: 429,
          headers: { 'Retry-After': '60' },
        });
      }
      if (u.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Groq fallback success' } }],
            usage: { prompt_tokens: 15, completion_tokens: 7 },
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const router = new ModelRouterService();
    const res1 = await router.complete(
      { systemPrompt: 'sys', userPrompt: 'hello', responseFormat: 'text' },
      { userId: 'user-1', employeeId: 'emp-1' },
    );

    expect(res1.provider).toBe(AiProviderName.GROQ);
    expect(res1.content).toBe('Groq fallback success');

    // Verify usage logs captured userId, employeeId, totalTokens, requestId, and errorCategory
    const gemErrLog = savedLogs.find((l) => l.provider === 'gemini');
    expect(gemErrLog.status).toBe(AiUsageStatus.RATE_LIMITED);
    expect(gemErrLog.errorCategory).toBe('RATE_LIMIT');
    expect(gemErrLog.userId).toBe('user-1');

    const groqSuccessLog = savedLogs.find((l) => l.provider === 'groq');
    expect(groqSuccessLog.status).toBe(AiUsageStatus.SUCCESS);
    expect(groqSuccessLog.totalTokens).toBe(22);
    expect(groqSuccessLog.requestId).toBeTruthy();

    // 2) Circuit breaker for Gemini must now be OPEN (second call should skip Gemini fetch)
    const health = await router.getHealthReport();
    const gemTelemetry = health.telemetry.find((t) => t.provider === AiProviderName.GEMINI);
    expect(gemTelemetry?.circuitState).toBe('OPEN');
  });
});
