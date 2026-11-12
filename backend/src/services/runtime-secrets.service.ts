import { dotEnvConfig } from '../configs/envConfig';
import { AppDataSource } from '../database/database-source';
import { SystemSettingEntity } from '../entities/system-setting.entity';
import { decryptSecret } from '../utils/encryption.util';

const SETTING_ENV_MAP: Record<string, string> = {
  gemini_api_key: dotEnvConfig.GEMINI_API_KEY,
  groq_api_key: dotEnvConfig.GROQ_API_KEY,
  openai_api_key: dotEnvConfig.OPENAI_API_KEY,
  github_token: dotEnvConfig.GITHUB_TOKEN,
  whatsapp_access_token: dotEnvConfig.WHATSAPP_ACCESS_TOKEN,
  whatsapp_phone_number_id: dotEnvConfig.WHATSAPP_PHONE_NUMBER_ID,
  whatsapp_recipient_phone: dotEnvConfig.WHATSAPP_RECIPIENT_PHONE,
};

export async function resolveRuntimeSecret(key: string): Promise<string> {
  const envVal = SETTING_ENV_MAP[key];
  if (envVal && envVal.trim().length > 0) {
    return envVal.trim();
  }

  if (!AppDataSource.isInitialized) {
    return '';
  }

  try {
    const row = await AppDataSource.getRepository(SystemSettingEntity).findOne({ where: { key } });
    if (!row) return '';
    if (row.isSecret && typeof row.value?.encrypted === 'string') {
      return decryptSecret(row.value.encrypted).trim();
    }
    if (typeof row.value?.secret === 'string') {
      return row.value.secret.trim();
    }
    if (typeof row.value?.value === 'string') {
      return row.value.value.trim();
    }
  } catch {
    return '';
  }

  return '';
}
