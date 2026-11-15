import { AiProviderName } from '../../constant/enum.constant';
import { AppDataSource } from '../../database/database-source';
import { SystemSettingEntity } from '../../entities/system-setting.entity';
import { DEFAULT_AGENT_PREFERENCES, DEFAULT_AI_GLOBAL_SETTINGS } from '../config/free-models.config';
import { AgentModelPreference, AiGlobalSettings } from '../interfaces/ai-model.interface';

const SETTINGS_KEY = 'ai_global_settings';
const AGENT_PREFS_KEY = 'ai_agent_preferences';

export class AiSettingsService {
  /**
   * Retrieves global AI settings with strict FREE-ONLY default.
   */
  public async getGlobalSettings(): Promise<AiGlobalSettings> {
    if (!AppDataSource.isInitialized) {
      return { ...DEFAULT_AI_GLOBAL_SETTINGS };
    }

    try {
      const row = await AppDataSource.getRepository(SystemSettingEntity).findOne({
        where: { key: SETTINGS_KEY },
      });
      if (!row || !row.value) {
        return { ...DEFAULT_AI_GLOBAL_SETTINGS };
      }
      return {
        ...DEFAULT_AI_GLOBAL_SETTINGS,
        ...(row.value as unknown as Partial<AiGlobalSettings>),
      };
    } catch {
      return { ...DEFAULT_AI_GLOBAL_SETTINGS };
    }
  }

  /**
   * Updates global AI settings.
   */
  public async updateGlobalSettings(patch: Partial<AiGlobalSettings>): Promise<AiGlobalSettings> {
    const current = await this.getGlobalSettings();
    const updated: AiGlobalSettings = {
      ...current,
      ...patch,
      // If freeOnlyMode is explicitly turned on, force allowPaidProviders to false
      ...(patch.freeOnlyMode ? { allowPaidProviders: false } : {}),
    };

    if (AppDataSource.isInitialized) {
      const repo = AppDataSource.getRepository(SystemSettingEntity);
      let row = await repo.findOne({ where: { key: SETTINGS_KEY } });
      if (!row) {
        row = repo.create({ key: SETTINGS_KEY, isSecret: false, value: updated as any });
      } else {
        row.value = updated as any;
      }
      await repo.save(row);
    }

    return updated;
  }

  /**
   * Retrieves all agent model preferences.
   */
  public async getAgentPreferences(): Promise<AgentModelPreference[]> {
    if (!AppDataSource.isInitialized) {
      return [...DEFAULT_AGENT_PREFERENCES];
    }

    try {
      const row = await AppDataSource.getRepository(SystemSettingEntity).findOne({
        where: { key: AGENT_PREFS_KEY },
      });
      if (!row || !Array.isArray(row.value?.preferences)) {
        return [...DEFAULT_AGENT_PREFERENCES];
      }
      return row.value.preferences as AgentModelPreference[];
    } catch {
      return [...DEFAULT_AGENT_PREFERENCES];
    }
  }

  /**
   * Updates an agent's preferred provider and model.
   */
  public async updateAgentPreference(
    agentRole: string,
    patch: Partial<AgentModelPreference>,
  ): Promise<AgentModelPreference> {
    const list = await this.getAgentPreferences();
    const idx = list.findIndex((a) => a.agentRole.toLowerCase() === agentRole.toLowerCase());

    let updatedItem: AgentModelPreference;
    if (idx >= 0) {
      const existing = list[idx]!;
      updatedItem = {
        agentRole: patch.agentRole ?? existing.agentRole,
        agentName: patch.agentName ?? existing.agentName,
        preferredProvider: patch.preferredProvider ?? existing.preferredProvider,
        preferredModel: patch.preferredModel ?? existing.preferredModel,
        fallbackProvider: patch.fallbackProvider ?? existing.fallbackProvider,
        fallbackModel: patch.fallbackModel ?? existing.fallbackModel,
        notes: patch.notes ?? existing.notes,
      };
      list[idx] = updatedItem;
    } else {
      updatedItem = {
        agentRole,
        agentName: patch.agentName || `${agentRole.toUpperCase()} Agent`,
        preferredProvider: patch.preferredProvider || DEFAULT_AI_GLOBAL_SETTINGS.providerPriority[0] || AiProviderName.OLLAMA,
        preferredModel: patch.preferredModel || 'default',
        fallbackProvider: patch.fallbackProvider,
        fallbackModel: patch.fallbackModel,
        notes: patch.notes,
      };
      list.push(updatedItem);
    }

    if (AppDataSource.isInitialized) {
      const repo = AppDataSource.getRepository(SystemSettingEntity);
      let row = await repo.findOne({ where: { key: AGENT_PREFS_KEY } });
      if (!row) {
        row = repo.create({ key: AGENT_PREFS_KEY, isSecret: false, value: { preferences: list } as any });
      } else {
        row.value = { preferences: list } as any;
      }
      await repo.save(row);
    }

    return updatedItem;
  }
}
