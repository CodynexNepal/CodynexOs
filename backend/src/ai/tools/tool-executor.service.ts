import { AiChatMessage, AiCompletionResponse, AiToolCall } from '../ai-provider.interface';
import { ModelRouterService, RouteOptions } from '../router/model-router.service';
import { getAllowedToolDefinitions, SAFE_TOOL_REGISTRY } from './tool-registry';
import { logger } from '../../utils/logger.util';

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface ToolLoopInput {
  systemPrompt: string;
  userPrompt: string;
  allowedTools: string[];
  handlers: Record<string, ToolHandler>;
  routeOptions?: RouteOptions;
  maxSteps?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ToolLoopResult {
  finalResponse: AiCompletionResponse;
  executedTools: Array<{ name: string; arguments: Record<string, unknown>; ok: boolean }>;
  stepsUsed: number;
}

export class ToolCallingEngine {
  constructor(private readonly modelRouter: ModelRouterService) {}

  async runLoop(input: ToolLoopInput): Promise<ToolLoopResult> {
    const maxSteps = Math.min(8, Math.max(1, input.maxSteps ?? 5));
    const timeoutMs = input.timeoutMs ?? 90_000;
    const deadline = Date.now() + timeoutMs;

    const toolDefs = getAllowedToolDefinitions(input.allowedTools);
    const messages: AiChatMessage[] = [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ];

    const executedSignatureSet = new Set<string>();
    const executedTools: ToolLoopResult['executedTools'] = [];

    let lastResponse: AiCompletionResponse | null = null;
    let stepsUsed = 0;

    for (let step = 0; step < maxSteps; step++) {
      if (input.signal?.aborted) {
        throw new Error('Tool-calling execution cancelled.');
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`Tool-calling loop exceeded timeout (${timeoutMs}ms).`);
      }

      stepsUsed += 1;
      lastResponse = await this.modelRouter.complete(
        {
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          messages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          timeoutMs: remainingMs,
          signal: input.signal,
        },
        input.routeOptions,
      );

      const calls: AiToolCall[] = lastResponse.toolCalls ?? [];
      if (calls.length === 0) {
        return { finalResponse: lastResponse, executedTools, stepsUsed };
      }

      messages.push({
        role: 'assistant',
        content: lastResponse.content || '',
        toolCalls: calls,
      });

      const permSet = new Set(input.allowedTools);

      for (const call of calls) {
        const reg = SAFE_TOOL_REGISTRY[call.name];
        let toolOutput: unknown;
        let ok = false;

        if (!reg) {
          toolOutput = { error: `Tool "${call.name}" is not in the safe registry.` };
        } else if (!permSet.has(reg.requiredPermission)) {
          toolOutput = { error: `Permission denied for tool "${call.name}".` };
        } else {
          const validation = reg.validateArgs(call.arguments ?? {});
          if (!validation.valid) {
            toolOutput = { error: `Invalid arguments: ${validation.error}` };
          } else {
            const sig = `${call.name}:${JSON.stringify(call.arguments ?? {})}`;
            if (executedSignatureSet.has(sig)) {
              toolOutput = {
                warning: 'Duplicate tool call skipped to prevent repeated execution.',
              };
            } else {
              const handler = input.handlers[call.name];
              if (!handler) {
                toolOutput = { error: `No handler bound for tool "${call.name}".` };
              } else {
                try {
                  executedSignatureSet.add(sig);
                  toolOutput = await handler(call.arguments ?? {});
                  ok = true;
                } catch (err) {
                  toolOutput = {
                    error: err instanceof Error ? err.message : String(err),
                  };
                }
              }
            }
          }
        }

        executedTools.push({
          name: call.name,
          arguments: call.arguments ?? {},
          ok,
        });

        logger.info('AI tool call processed', {
          tool: call.name,
          ok,
          step: step + 1,
        });

        messages.push({
          role: 'tool',
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify(toolOutput),
        });
      }
    }

    if (!lastResponse) {
      throw new Error('Tool-calling loop produced no response.');
    }

    return { finalResponse: lastResponse, executedTools, stepsUsed };
  }
}
