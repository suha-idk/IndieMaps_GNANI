// Centralized Typed Configuration for Gnani AI (Vachana) Multilingual Speech Integration
// Single source of truth for STT language codes, TTS language values, models, default voices, and verified candidate voices.

export type LanguageId =
  | 'en'
  | 'hi'
  | 'hinglish'
  | 'ta'
  | 'te'
  | 'kn'
  | 'ml'
  | 'mr'
  | 'bn'
  | 'gu'
  | 'pa';

export type TtsModel = 'timbre-v2.5' | 'timbre-v3.0';

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  models: TtsModel[];
}

export interface LanguageConfig {
  id: LanguageId;
  name: string;
  nativeName: string;
  sttCode: string; // Used for Gnani STT WebSocket header lang_code
  ttsLangCode: string; // Used for Gnani TTS payload language field
  supportedModels: TtsModel[];
  defaultModel: TtsModel;
  defaultVoices: Record<TtsModel, string>;
  voices: VoiceOption[];
  sampleText: string;
}

export const GNANI_TTS_MODELS: TtsModel[] = ['timbre-v2.5', 'timbre-v3.0'];

// Default model is timbre-v2.5 for the requested 11-language regional voice catalog
export const DEFAULT_TTS_MODEL: TtsModel = 'timbre-v2.5';

/**
 * Strict timbre-v3.0 unified voice catalog.
 * Verified via official Gnani API contract and upstream validation error:
 * "Voice is not supported by model 'timbre-v3.0'. Supported voices: Avinash, Shivani, Lakshmi, Kalpana, Shubham, Prakash, Devansh, Yashraj, Chetana, Vasudha, Harshad, Riyaa, Tarika"
 */
export const TIMBRE_V3_VOICES: VoiceOption[] = [
  { id: 'Shivani', name: 'Shivani (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Avinash', name: 'Avinash (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Lakshmi', name: 'Lakshmi (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Kalpana', name: 'Kalpana (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Shubham', name: 'Shubham (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Prakash', name: 'Prakash (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Devansh', name: 'Devansh (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Yashraj', name: 'Yashraj (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Chetana', name: 'Chetana (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Vasudha', name: 'Vasudha (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Harshad', name: 'Harshad (Male)', gender: 'male', models: ['timbre-v3.0'] },
  { id: 'Riyaa', name: 'Riyaa (Female)', gender: 'female', models: ['timbre-v3.0'] },
  { id: 'Tarika', name: 'Tarika (Female)', gender: 'female', models: ['timbre-v3.0'] },
];

export const TIMBRE_V3_DEFAULT_VOICE = 'Shivani';

/**
 * Authoritative 11 Indian languages configuration.
 * Regional voice catalog is associated with timbre-v2.5.
 * timbre-v3.0 uses its own strict 13-voice unified catalog.
 */
export const GNANI_LANGUAGES: Record<LanguageId, LanguageConfig> = {
  en: {
    id: 'en',
    name: 'English',
    nativeName: 'English (India)',
    sttCode: 'en-IN',
    ttsLangCode: 'en-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Kaveri',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Kaveri', name: 'Kaveri (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Trupti', name: 'Trupti (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Devika', name: 'Devika (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Pranav', name: 'Pranav (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Shlok', name: 'Shlok (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Girish', name: 'Girish (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'en_female_1', name: 'English Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'en_male_1', name: 'English Male 1 (Legacy)', gender: 'male', models: ['timbre-v2.5'] },
    ],
    sampleText: 'Hello! Raahi navigation is ready. Setting your route now.',
  },

  hi: {
    id: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी (Hindi)',
    sttCode: 'hi-IN',
    ttsLangCode: 'hi-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Nalini',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Nalini', name: 'Nalini (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Bhavna', name: 'Bhavna (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Yashvi', name: 'Yashvi (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Urmila', name: 'Urmila (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Jwala', name: 'Jwala (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Chitra', name: 'Chitra (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Ambuja', name: 'Ambuja (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Deepak', name: 'Deepak (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Roopesh', name: 'Roopesh (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Vikrant', name: 'Vikrant (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Hemraj', name: 'Hemraj (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Jalaj', name: 'Jalaj (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'Omkar', name: 'Omkar (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'hi_female_1', name: 'Hindi Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'hi_male_1', name: 'Hindi Male 1 (Legacy)', gender: 'male', models: ['timbre-v2.5'] },
    ],
    sampleText: 'नमस्ते! राही नेविगेशन तैयार है। आपका रास्ता अपडेट हो गया है।',
  },

  hinglish: {
    id: 'hinglish',
    name: 'Hinglish',
    nativeName: 'हिंग्लिश (Hinglish)',
    sttCode: 'hi-IN', // Gnani STT handles mixed code via hi-IN acoustic models
    ttsLangCode: 'hi-en', // Documented Gnani code-mixed TTS language value
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Poorvi',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Poorvi', name: 'Poorvi (Female)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'Hello! Raahi ready hai, agla stop do kilometre par hai.',
  },

  ta: {
    id: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ் (Tamil)',
    sttCode: 'ta-IN',
    ttsLangCode: 'ta-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Asmita',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Asmita', name: 'Asmita (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Trisha', name: 'Trisha (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Brinda', name: 'Brinda (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Vedika', name: 'Vedika (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Noopur', name: 'Noopur (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'ta_female_1', name: 'Tamil Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'வணக்கம்! ராகி வழிசெலுத்தல் தயார். உங்கள் பாதை அமைக்கப்பட்டது.',
  },

  te: {
    id: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు (Telugu)',
    sttCode: 'te-IN',
    ttsLangCode: 'te-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Suhana',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Suhana', name: 'Suhana (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Lehara', name: 'Lehara (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Lavanya', name: 'Lavanya (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Yukti', name: 'Yukti (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Varuni', name: 'Varuni (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'te_female_1', name: 'Telugu Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'నమస్కారం! రాహి నావిగేషన్ సిద్ధంగా ఉంది. మీ మార్గం సిద్ధమైంది.',
  },

  kn: {
    id: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ (Kannada)',
    sttCode: 'kn-IN',
    ttsLangCode: 'kn-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Saanvi',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Saanvi', name: 'Saanvi (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Kavin', name: 'Kavin (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'kn_female_1', name: 'Kannada Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'ನಮಸ್ಕಾರ! ರಾಹಿ ನ್ಯಾವಿಗೇಷನ್ ಸಿದ್ಧವಾಗಿದೆ. ಮಾರ್ಗ ಹೊಂದಿಸಲಾಗಿದೆ.',
  },

  ml: {
    id: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം (Malayalam)',
    sttCode: 'ml-IN',
    ttsLangCode: 'ml-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Reshma',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Reshma', name: 'Reshma (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Riyaan', name: 'Riyaan (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'ml_female_1', name: 'Malayalam Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'നമസ്കാരം! രാഹി നാവിഗേഷൻ തയ്യാറാണ്. പുതിയ വഴി സജ്ജമാക്കി.',
  },

  mr: {
    id: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी (Marathi)',
    sttCode: 'mr-IN',
    ttsLangCode: 'mr-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Zahira',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Zahira', name: 'Zahira (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Ishaan', name: 'Ishaan (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'mr_female_1', name: 'Marathi Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'नमस्कार! राही नेव्हिगेशन सज्ज आहे. तुमचा मार्ग अपडेट केला आहे.',
  },

  bn: {
    id: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা (Bengali)',
    sttCode: 'bn-IN',
    ttsLangCode: 'bn-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Kirra',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Kirra', name: 'Kirra (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Dhruva', name: 'Dhruva (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'bn_female_1', name: 'Bengali Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'নমস্কার! রাহী নেভিগেশন প্রস্তুত। আপনার নতুন রুট সেট করা হয়েছে।',
  },

  gu: {
    id: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી (Gujarati)',
    sttCode: 'gu-IN',
    ttsLangCode: 'gu-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Falak',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Falak', name: 'Falak (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Veera', name: 'Veera (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'gu_female_1', name: 'Gujarati Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'નમસ્તે! રાહી નેવિગેશન તૈયાર છે. તમારો રૂટ સેટ થઈ ગયો છે.',
  },

  pa: {
    id: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ (ਪੰਜਾਬੀ)',
    sttCode: 'pa-IN',
    ttsLangCode: 'pa-IN',
    supportedModels: ['timbre-v2.5', 'timbre-v3.0'],
    defaultModel: 'timbre-v2.5',
    defaultVoices: {
      'timbre-v2.5': 'Mehuli',
      'timbre-v3.0': 'Shivani',
    },
    voices: [
      { id: 'Mehuli', name: 'Mehuli (Female)', gender: 'female', models: ['timbre-v2.5'] },
      { id: 'Zayan', name: 'Zayan (Male)', gender: 'male', models: ['timbre-v2.5'] },
      { id: 'pa_female_1', name: 'Punjabi Female 1 (Legacy)', gender: 'female', models: ['timbre-v2.5'] },
    ],
    sampleText: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਰਾਹੀ ਨੈਵੀਗੇਸ਼ਨ ਤਿਆਰ ਹੈ। ਤੁਹਾਡਾ ਰਸਤਾ ਅੱਪਡੇਟ ਹੋ ਗਿਆ ਹੈ।',
  },
};

export const ALL_LANGUAGE_IDS: LanguageId[] = [
  'en',
  'hi',
  'hinglish',
  'ta',
  'te',
  'kn',
  'ml',
  'mr',
  'bn',
  'gu',
  'pa',
];

export const ALL_STT_CODES = Array.from(new Set(Object.values(GNANI_LANGUAGES).map((c) => c.sttCode)));
export const ALL_TTS_CODES = Array.from(new Set(Object.values(GNANI_LANGUAGES).map((c) => c.ttsLangCode)));

/**
 * Normalizes any language code, ID, or locale into a valid LanguageConfig.
 * Handles 'hi', 'hi-IN', 'hinglish', 'hi-en', 'en', 'en-IN', etc.
 */
export function getLanguageConfig(identifier?: string): LanguageConfig {
  if (!identifier) return GNANI_LANGUAGES.hi;

  const clean = identifier.trim().toLowerCase();

  // 1. Direct ID match
  if (clean in GNANI_LANGUAGES) {
    return GNANI_LANGUAGES[clean as LanguageId];
  }

  // 2. Hinglish special cases
  if (clean === 'hi-en' || clean === 'hinglish' || clean === 'hng') {
    return GNANI_LANGUAGES.hinglish;
  }

  // 3. Match by ttsLangCode or sttCode
  for (const cfg of Object.values(GNANI_LANGUAGES)) {
    if (cfg.ttsLangCode.toLowerCase() === clean || cfg.sttCode.toLowerCase() === clean) {
      return cfg;
    }
  }

  // 4. Match by prefix (e.g. 'ta' matches 'ta-IN')
  const prefix = clean.split(/[-_]/)[0];
  if (prefix in GNANI_LANGUAGES) {
    return GNANI_LANGUAGES[prefix as LanguageId];
  }

  // Default to Hindi
  return GNANI_LANGUAGES.hi;
}

/**
 * Retrieves valid voices for a given language and model.
 * - For timbre-v3.0: returns strictly the 13 supported unified timbre-v3.0 voices.
 * - For timbre-v2.5: returns the language-specific regional voices.
 * The two voice catalogs are kept strictly separate.
 */
export function getVoicesForLanguageAndModel(identifier: string, model: TtsModel = DEFAULT_TTS_MODEL): VoiceOption[] {
  if (model === 'timbre-v3.0') {
    return TIMBRE_V3_VOICES;
  }

  const langConfig = getLanguageConfig(identifier);
  const matched = langConfig.voices.filter((v) => v.models.includes('timbre-v2.5'));
  if (matched.length > 0) return matched;
  return langConfig.voices;
}

/**
 * Resolves the active voice for a given language, model, and preferred voice.
 * If preferredVoice is valid for this model & language, returns it.
 * Otherwise, cleanly falls back to the configured default voice for that model.
 * Never silently sends an unsupported voice/model combination.
 */
export function resolveVoice(identifier: string, model: TtsModel = DEFAULT_TTS_MODEL, preferredVoice?: string): string {
  const langConfig = getLanguageConfig(identifier);
  const validVoices = getVoicesForLanguageAndModel(identifier, model);

  if (preferredVoice) {
    const isDirectMatch = validVoices.some((v) => v.id.toLowerCase() === preferredVoice.toLowerCase());
    if (isDirectMatch) {
      const match = validVoices.find((v) => v.id.toLowerCase() === preferredVoice.toLowerCase());
      return match ? match.id : preferredVoice;
    }
  }

  // Fallback to default voice for model
  const defaultForModel = langConfig.defaultVoices[model];
  if (defaultForModel) {
    // Verify default is indeed in validVoices for this model
    const isValidDefault = validVoices.some((v) => v.id.toLowerCase() === defaultForModel.toLowerCase());
    if (isValidDefault) return defaultForModel;
  }

  if (model === 'timbre-v3.0') {
    return TIMBRE_V3_DEFAULT_VOICE;
  }

  return langConfig.defaultVoices['timbre-v2.5'] || validVoices[0]?.id || 'Nalini';
}

/**
 * Validates and clamps speaking speed between 0.85 and 1.15.
 */
export function clampSpeed(speed?: number): number {
  if (typeof speed !== 'number' || isNaN(speed)) return 1.0;
  return Math.min(1.15, Math.max(0.85, Math.round(speed * 100) / 100));
}

/**
 * Validates a synthesis payload against Gnani API requirements and model-specific catalogs.
 * Enforces that timbre-v3.0 rejects regional voices (like Nalini, Kaveri),
 * and validates timbre-v2.5 against regional voice lists.
 */
export function validateTtsPayload(payload: any): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be a non-empty object' };
  }
  if (!payload.text || typeof payload.text !== 'string' || !payload.text.trim()) {
    return { valid: false, error: 'text is required and must not be empty' };
  }
  const model: TtsModel = payload.model || DEFAULT_TTS_MODEL;
  if (!GNANI_TTS_MODELS.includes(model)) {
    return { valid: false, error: `Invalid model: ${payload.model}. Must be one of ${GNANI_TTS_MODELS.join(', ')}` };
  }
  if (!payload.voice || typeof payload.voice !== 'string') {
    return { valid: false, error: 'voice is required' };
  }

  // Strict Model-Specific Voice Catalog Validation
  if (model === 'timbre-v3.0') {
    const isV3Voice = TIMBRE_V3_VOICES.some((v) => v.id.toLowerCase() === payload.voice.trim().toLowerCase());
    if (!isV3Voice) {
      return {
        valid: false,
        error: `Voice '${payload.voice}' is not supported by model 'timbre-v3.0'. Supported voices: ${TIMBRE_V3_VOICES.map((v) => v.id).join(', ')}`,
      };
    }
  } else if (model === 'timbre-v2.5') {
    if (payload.language) {
      const langConfig = getLanguageConfig(payload.language);
      const v2Voices = langConfig.voices.filter((v) => v.models.includes('timbre-v2.5'));
      const isV2Voice = v2Voices.some((v) => v.id.toLowerCase() === payload.voice.trim().toLowerCase());
      if (!isV2Voice) {
        return {
          valid: false,
          error: `Voice '${payload.voice}' is not supported for ${langConfig.name} with model 'timbre-v2.5'. Supported voices: ${v2Voices.map((v) => v.id).join(', ')}`,
        };
      }
    }
  }

  return { valid: true };
}
