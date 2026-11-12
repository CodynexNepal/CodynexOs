import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from '../../src/ai/adapters/gemini.adapter';
import { GroqAdapter } from '../../src/ai/adapters/groq.adapter';
import { OpenAiAdapter } from '../../src/ai/adapters/openai.adapter';
import * as runtimeSecrets from '../../src/services/runtime-secrets.service';

describe('AI adapter model deprecation fallback & discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GeminiAdapter falls back to gemini-3.8-flash when a deprecated model is requested', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-gemini-key');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash',
            },
          }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
          }),
          { status: 200 },
        ),
      );

    const adapter = new GeminiAdapter();
    const res = await adapter.complete({
      systemPrompt: 'sys',
      userPrompt: 'hello',
      model: 'gemini-2.5-flash',
      responseFormat: 'json',
    });

    expect(res.model).toBe('gemini-3.8-flash');
    expect(res.content).toBe('{"summary":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GroqAdapter falls back to active model when requested model does not exist', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-groq-key');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'The model `llama-3.3-70b-versatile` does not exist' },
          }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"summary":"groq-ok"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

    const adapter = new GroqAdapter();
    const res = await adapter.complete({
      systemPrompt: 'sys',
      userPrompt: 'hello',
      model: 'llama-3.3-70b-versatile',
      responseFormat: 'json',
    });

    expect(res.model).toBe('llama-3.1-8b-instant');
    expect(res.content).toBe('{"summary":"groq-ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GroqAdapter falls back to llama-3.1-8b-instant on tool choice error', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-groq-key');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'Tool choice is none, but model called a tool' },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"summary":"fallback-ok"}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

    const adapter = new GroqAdapter();
    const res = await adapter.complete({
      systemPrompt: 'sys',
      userPrompt: 'hello',
      model: 'openai/gpt-oss-20b',
      responseFormat: 'json',
    });

    expect(res.model).toBe('llama-3.1-8b-instant');
    expect(res.content).toBe('{"summary":"fallback-ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GroqAdapter recovers JSON from failed_generation on json_validate_failed', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-groq-key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'json_validate_failed',
            message:
              "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
            failed_generation: '<think>reasoning</think>\n```json\n{"summary":"recovered-ok"}\n```',
          },
        }),
        { status: 400 },
      ),
    );

    const adapter = new GroqAdapter();
    const res = await adapter.complete({
      systemPrompt: 'Summarize the task',
      userPrompt: 'hello',
      model: 'llama-3.1-8b-instant',
      responseFormat: 'json',
    });

    expect(res.content).toBe('{"summary":"recovered-ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GroqAdapter retries without response_format when json_validate_failed has unrecoverable output', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('test-groq-key');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'json_validate_failed',
              message:
                "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
              failed_generation: 'not json at all',
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '```json\n{"summary":"retried-ok"}\n```' } }],
            usage: { prompt_tokens: 12, completion_tokens: 6 },
          }),
          { status: 200 },
        ),
      );

    const adapter = new GroqAdapter();
    const res = await adapter.complete({
      systemPrompt: 'Summarize',
      userPrompt: 'hello',
      model: 'llama-3.1-8b-instant',
      responseFormat: 'json',
    });

    expect(res.content).toBe('{"summary":"retried-ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondCallBody.response_format).toBeUndefined();
  });

  it('OpenAiAdapter resolves runtime secret openai_api_key and completes', async () => {
    vi.spyOn(runtimeSecrets, 'resolveRuntimeSecret').mockResolvedValue('sk-test-openai');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"openai-ok"}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        { status: 200 },
      ),
    );

    const adapter = new OpenAiAdapter();
    const res = await adapter.complete({
      systemPrompt: 'sys',
      userPrompt: 'hello',
      responseFormat: 'json',
    });

    expect(res.provider).toBe('openai');
    expect(res.content).toBe('{"summary":"openai-ok"}');
    expect(res.estimatedCostUsd).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
