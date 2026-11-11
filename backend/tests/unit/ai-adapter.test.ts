import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from '../../src/ai/adapters/gemini.adapter';
import { GroqAdapter } from '../../src/ai/adapters/groq.adapter';
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
});
