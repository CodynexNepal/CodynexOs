import os from 'os';
import { dotEnvConfig } from '../../configs/envConfig';

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  parameterSize?: string;
  supportsTools: boolean;
}

export interface ModelSelectionCriteria {
  taskType?: string;
  requiresTools?: boolean;
  complexity?: 'low' | 'medium' | 'high';
  preferredModel?: string;
}

const TOOL_COMPATIBLE_FAMILIES = /qwen2\.5|qwen3|llama3\.1|llama3\.2|llama3\.3|mistral|mixtral|command-r|gemma3/i;

export class ModelSelectorService {
  private cachedModels: { items: OllamaModelInfo[]; expiresAt: number } | null = null;

  async listInstalledModels(forceRefresh = false): Promise<OllamaModelInfo[]> {
    if (!forceRefresh && this.cachedModels && this.cachedModels.expiresAt > Date.now()) {
      return this.cachedModels.items;
    }

    if (!dotEnvConfig.OLLAMA_ENABLED || !dotEnvConfig.OLLAMA_BASE_URL) {
      return [];
    }

    try {
      const res = await fetch(`${dotEnvConfig.OLLAMA_BASE_URL}/api/tags`);
      if (!res.ok) return [];
      const body = (await res.json()) as {
        models?: Array<{
          name?: string;
          size?: number;
          details?: { parameter_size?: string };
        }>;
      };
      const items: OllamaModelInfo[] = (body.models ?? [])
        .filter((m) => Boolean(m.name))
        .map((m) => ({
          name: m.name!,
          sizeBytes: m.size ?? 0,
          parameterSize: m.details?.parameter_size,
          supportsTools: TOOL_COMPATIBLE_FAMILIES.test(m.name!),
        }));
      this.cachedModels = { items, expiresAt: Date.now() + 30_000 };
      return items;
    } catch {
      return [];
    }
  }

  isToolCompatible(modelName: string): boolean {
    return TOOL_COMPATIBLE_FAMILIES.test(modelName);
  }

  fitsHardwareBudget(modelSizeBytes: number): boolean {
    if (!modelSizeBytes || modelSizeBytes <= 0) return true;
    const totalRamBytes = os.totalmem();
    // Keep model footprint safely under 60% of system RAM to prevent swapping/OOM
    return modelSizeBytes <= totalRamBytes * 0.6;
  }

  async selectOllamaModel(criteria: ModelSelectionCriteria = {}): Promise<{
    model: string;
    supportsTools: boolean;
    reason: string;
  }> {
    const installed = await this.listInstalledModels();
    const defaultModel = dotEnvConfig.OLLAMA_MODEL;

    if (installed.length === 0) {
      return {
        model: criteria.preferredModel || defaultModel,
        supportsTools: this.isToolCompatible(criteria.preferredModel || defaultModel),
        reason: 'Configured default (Ollama tags unavailable)',
      };
    }

    const fitting = installed.filter((m) => this.fitsHardwareBudget(m.sizeBytes));
    const pool = fitting.length > 0 ? fitting : installed;

    if (criteria.preferredModel) {
      const exact = pool.find((m) => m.name === criteria.preferredModel);
      if (exact && (!criteria.requiresTools || exact.supportsTools)) {
        return {
          model: exact.name,
          supportsTools: exact.supportsTools,
          reason: 'Matched preferred installed model within hardware budget',
        };
      }
    }

    if (criteria.requiresTools) {
      const toolModel =
        pool.find((m) => m.name === defaultModel && m.supportsTools) ??
        pool.find((m) => /qwen3/i.test(m.name) && m.supportsTools) ??
        pool.find((m) => m.supportsTools);
      if (toolModel) {
        return {
          model: toolModel.name,
          supportsTools: true,
          reason: 'Selected tool-compatible local model within hardware budget',
        };
      }
    }

    if (criteria.complexity === 'low') {
      const fastest = [...pool].sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
      if (fastest) {
        return {
          model: fastest.name,
          supportsTools: fastest.supportsTools,
          reason: 'Selected lightest local model for low-complexity task',
        };
      }
    }

    const defaultInstalled = pool.find((m) => m.name === defaultModel);
    if (defaultInstalled) {
      return {
        model: defaultInstalled.name,
        supportsTools: defaultInstalled.supportsTools,
        reason: 'Matched configured default model',
      };
    }

    const qwenPreferred = pool.find((m) => /qwen3/i.test(m.name)) ?? pool[0]!;
    return {
      model: qwenPreferred.name,
      supportsTools: qwenPreferred.supportsTools,
      reason: 'Auto-selected installed local model within hardware budget',
    };
  }
}
