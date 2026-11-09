import fs from 'fs';
import path from 'path';

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

export interface PersistedSpeechConfig {
  gnaniApiKey: string;
  gnaniVoice: string;
  gnaniModel: string;
  hasPersistentFile: boolean;
  source: 'env_file' | 'process_env' | 'none';
}

/**
 * Safely parses the git-ignored .env file into key-value pairs without exposing contents to logs.
 */
export function readEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(ENV_FILE_PATH)) return result;

  try {
    const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
  } catch (err: any) {
    console.error('Error reading .env file:', err?.message || err);
  }
  return result;
}

/**
 * Persists Gnani speech configuration to the git-ignored .env file and syncs process.env.
 * Ensures permissions are 0o600 so only the server process can read it.
 */
export function persistEnvConfig(updates: {
  gnaniApiKey?: string;
  gnaniVoice?: string;
  gnaniModel?: string;
  apiKey?: string; // backwards compatibility
  voiceId?: string; // backwards compatibility
}): { success: boolean; error?: string } {
  try {
    const existing = readEnvFile();

    // Preserve system keys from environment if not present in existing .env
    if (!existing.VITE_GOOGLE_MAPS_API_KEY && process.env.VITE_GOOGLE_MAPS_API_KEY) {
      existing.VITE_GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
    }
    if (!existing.GEMINI_API_KEY && process.env.GEMINI_API_KEY) {
      existing.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    }
    if (!existing.PORT && process.env.PORT) {
      existing.PORT = process.env.PORT;
    }

    const keyUpdate = updates.gnaniApiKey !== undefined ? updates.gnaniApiKey : updates.apiKey;
    if (typeof keyUpdate === 'string') {
      const cleanKey = keyUpdate.trim();
      if (cleanKey === '') {
        delete existing.GNANI_API_KEY;
        delete process.env.GNANI_API_KEY;
      } else {
        existing.GNANI_API_KEY = cleanKey;
        process.env.GNANI_API_KEY = cleanKey;
      }
    }

    const voiceUpdate = updates.gnaniVoice !== undefined ? updates.gnaniVoice : updates.voiceId;
    if (typeof voiceUpdate === 'string') {
      const cleanVoice = voiceUpdate.trim();
      if (cleanVoice) {
        existing.GNANI_TTS_VOICE = cleanVoice;
        process.env.GNANI_TTS_VOICE = cleanVoice;
      }
    }

    if (typeof updates.gnaniModel === 'string') {
      const cleanModel = updates.gnaniModel.trim();
      if (cleanModel) {
        existing.GNANI_TTS_MODEL = cleanModel;
        process.env.GNANI_TTS_MODEL = cleanModel;
      }
    }

    const lines: string[] = [
      '# Raahi Persistent Environment Configuration',
      '# This file is strictly excluded from Git tracking via .gitignore',
      `VITE_GOOGLE_MAPS_API_KEY=${existing.VITE_GOOGLE_MAPS_API_KEY || ''}`,
      `GEMINI_API_KEY=${existing.GEMINI_API_KEY || ''}`,
      `GNANI_API_KEY=${existing.GNANI_API_KEY || ''}`,
      `GNANI_TTS_VOICE=${existing.GNANI_TTS_VOICE || 'hi_female_1'}`,
      `GNANI_TTS_MODEL=${existing.GNANI_TTS_MODEL || 'timbre-v3.0'}`,
      `PORT=${existing.PORT || '3000'}`,
    ];

    fs.writeFileSync(ENV_FILE_PATH, lines.join('\n') + '\n', { mode: 0o600 });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to write persistent .env file' };
  }
}

/**
 * Returns active configuration with source provenance without exposing secret keys.
 */
export function getAuthoritativeConfig(): PersistedSpeechConfig {
  const envFile = readEnvFile();
  const fileKey = (envFile.GNANI_API_KEY || '').trim();
  const processKey = (process.env.GNANI_API_KEY || '').trim();

  // 1. Check persistent file first
  if (fileKey) {
    return {
      gnaniApiKey: fileKey,
      gnaniVoice: (envFile.GNANI_TTS_VOICE || process.env.GNANI_TTS_VOICE || 'hi_female_1').trim(),
      gnaniModel: (envFile.GNANI_TTS_MODEL || process.env.GNANI_TTS_MODEL || 'timbre-v3.0').trim(),
      hasPersistentFile: true,
      source: 'env_file',
    };
  }

  // 2. Check process.env
  if (processKey) {
    return {
      gnaniApiKey: processKey,
      gnaniVoice: (process.env.GNANI_TTS_VOICE || envFile.GNANI_TTS_VOICE || 'hi_female_1').trim(),
      gnaniModel: (process.env.GNANI_TTS_MODEL || envFile.GNANI_TTS_MODEL || 'timbre-v3.0').trim(),
      hasPersistentFile: fs.existsSync(ENV_FILE_PATH),
      source: 'process_env',
    };
  }

  // 3. Fallback: No key configured
  return {
    gnaniApiKey: '',
    gnaniVoice: (envFile.GNANI_TTS_VOICE || process.env.GNANI_TTS_VOICE || 'hi_female_1').trim(),
    gnaniModel: (envFile.GNANI_TTS_MODEL || process.env.GNANI_TTS_MODEL || 'timbre-v3.0').trim(),
    hasPersistentFile: fs.existsSync(ENV_FILE_PATH),
    source: 'none',
  };
}
