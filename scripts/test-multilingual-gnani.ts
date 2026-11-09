/**
 * Automated Verification Test Suite for Multilingual Gnani AI STT & TTS Integration
 *
 * Verifies:
 * 1. Centralized configuration across all 11 Indian languages
 * 2. Required Timbre v2.5 default voice mappings and timbre-v3.0 13-voice catalog separation
 * 3. Verified regional candidate voices roster
 * 4. Separation of STT codes and TTS language codes (including Hinglish hi-en / hi-IN)
 * 5. Dynamic voice resolution, model filtering, and invalid fallback safety
 * 6. Speaking speed clamping (0.85 - 1.15)
 * 7. Model-specific payload schema validation (rejecting Nalini on timbre-v3.0, accepting Shivani)
 * 8. Translation pipeline independence (0 navigation actions, journey preservation)
 * 9. Server status diagnostic contract
 */

import {
  GNANI_LANGUAGES,
  ALL_LANGUAGE_IDS,
  ALL_STT_CODES,
  ALL_TTS_CODES,
  DEFAULT_TTS_MODEL,
  TIMBRE_V3_VOICES,
  TIMBRE_V3_DEFAULT_VOICE,
  getLanguageConfig,
  getVoicesForLanguageAndModel,
  resolveVoice,
  clampSpeed,
  validateTtsPayload,
  LanguageId,
} from '../src/config/gnaniConfig.ts';

import { getGnaniStatus, GNANI_SUPPORTED_LANGUAGES } from '../src/server/gnaniProxy.ts';
import { parseTranslationIntent } from '../src/services/translationService.ts';
import { fallbackRuleBasedParser } from '../src/services/aiService.ts';

function runMultilingualGnaniTests() {
  console.log('================================================================');
  console.log('  RAAHI — MULTILINGUAL GNANI STT & TTS VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      if (detail) console.error(`    Detail: ${detail}`);
    }
  }

  // 1. Centralized Configuration: All 11 Languages Defined
  console.log('--- 1. Centralized Configuration Integrity ---');
  const expectedLanguages: LanguageId[] = [
    'en', 'hi', 'hinglish', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'
  ];

  for (const langId of expectedLanguages) {
    const config = GNANI_LANGUAGES[langId];
    assert(Boolean(config), `Language "${langId}" exists in GNANI_LANGUAGES`);
    assert(Boolean(config.name && config.nativeName), `Language "${langId}" has display and native name`);
    assert(Boolean(config.sttCode), `Language "${langId}" has STT code (${config?.sttCode})`);
    assert(Boolean(config.ttsLangCode), `Language "${langId}" has TTS code (${config?.ttsLangCode})`);
    assert(config.defaultModel === 'timbre-v2.5', `Language "${langId}" uses timbre-v2.5 default`);
  }

  // 2. Required Timbre v2.5 Default Voice Mappings
  console.log('\n--- 2. Required Timbre v2.5 Default Voice Mappings ---');
  const requiredDefaults: Record<LanguageId, string> = {
    en: 'Kaveri',
    hi: 'Nalini',
    hinglish: 'Poorvi',
    ta: 'Asmita',
    te: 'Suhana',
    kn: 'Saanvi',
    ml: 'Reshma',
    mr: 'Zahira',
    bn: 'Kirra',
    gu: 'Falak',
    pa: 'Mehuli',
  };

  for (const [langId, expectedVoice] of Object.entries(requiredDefaults)) {
    const config = GNANI_LANGUAGES[langId as LanguageId];
    const actualDefault = config.defaultVoices['timbre-v2.5'];
    assert(
      actualDefault === expectedVoice,
      `${config.name} Timbre v2.5 default voice is "${expectedVoice}" (found: "${actualDefault}")`
    );
  }

  // 2b. Strict timbre-v3.0 13-voice Catalog Verification
  console.log('\n--- 2b. Strict timbre-v3.0 Catalog Verification ---');
  const expectedV3Voices = [
    'Avinash', 'Shivani', 'Lakshmi', 'Kalpana', 'Shubham', 'Prakash',
    'Devansh', 'Yashraj', 'Chetana', 'Vasudha', 'Harshad', 'Riyaa', 'Tarika'
  ];
  assert(TIMBRE_V3_VOICES.length === 13, `timbre-v3.0 catalog contains exactly 13 voices (found ${TIMBRE_V3_VOICES.length})`);
  for (const v3Name of expectedV3Voices) {
    assert(TIMBRE_V3_VOICES.some((v) => v.id === v3Name), `timbre-v3.0 includes "${v3Name}"`);
  }
  assert(!TIMBRE_V3_VOICES.some((v) => v.id === 'Nalini'), 'timbre-v3.0 strictly excludes Nalini');
  assert(!TIMBRE_V3_VOICES.some((v) => v.id === 'Kaveri'), 'timbre-v3.0 strictly excludes Kaveri');

  // 3. Candidate Voices Verification for timbre-v2.5
  console.log('\n--- 3. Candidate Regional Voices Verification (timbre-v2.5) ---');
  const expectedCandidates: Record<LanguageId, string[]> = {
    en: ['Kaveri', 'Trupti', 'Devika', 'Pranav', 'Shlok', 'Girish'],
    hi: ['Nalini', 'Bhavna', 'Yashvi', 'Urmila', 'Jwala', 'Chitra', 'Ambuja', 'Deepak', 'Roopesh', 'Vikrant', 'Hemraj', 'Jalaj', 'Omkar'],
    hinglish: ['Poorvi'],
    ta: ['Asmita', 'Trisha', 'Brinda', 'Vedika', 'Noopur'],
    te: ['Suhana', 'Lehara', 'Lavanya', 'Yukti', 'Varuni'],
    kn: ['Saanvi', 'Kavin'],
    ml: ['Reshma', 'Riyaan'],
    mr: ['Zahira', 'Ishaan'],
    bn: ['Kirra', 'Dhruva'],
    gu: ['Falak', 'Veera'],
    pa: ['Mehuli', 'Zayan'],
  };

  for (const [langId, candidates] of Object.entries(expectedCandidates)) {
    const config = GNANI_LANGUAGES[langId as LanguageId];
    const voiceIds = config.voices.map((v) => v.id);
    for (const cand of candidates) {
      assert(voiceIds.includes(cand), `${config.name} candidate voice "${cand}" is available`);
    }
  }

  // 4. STT vs TTS Code Separation & Hinglish Handling
  console.log('\n--- 4. STT vs TTS Language Code Separation ---');
  const hinglish = GNANI_LANGUAGES.hinglish;
  assert(hinglish.sttCode === 'hi-IN', 'Hinglish STT code maps to hi-IN (code-mixed acoustic model)');
  assert(hinglish.ttsLangCode === 'hi-en', 'Hinglish TTS code maps to hi-en (code-mixed synthesis model)');

  const resolvedFromHinglish = getLanguageConfig('hinglish');
  assert(resolvedFromHinglish.id === 'hinglish', 'getLanguageConfig("hinglish") resolves correctly');
  const resolvedFromHiEn = getLanguageConfig('hi-en');
  assert(resolvedFromHiEn.id === 'hinglish', 'getLanguageConfig("hi-en") resolves to hinglish');

  // 5. Dynamic Voice Resolution & Fallback Safety
  console.log('\n--- 5. Dynamic Voice Resolution & Fallback Safety ---');
  // Specific voice selection on timbre-v2.5
  assert(resolveVoice('en', 'timbre-v2.5', 'Trupti') === 'Trupti', 'Resolves requested candidate voice Trupti for English (v2.5)');
  assert(resolveVoice('hi', 'timbre-v2.5', 'Deepak') === 'Deepak', 'Resolves requested candidate voice Deepak for Hindi (v2.5)');
  assert(resolveVoice('ta', 'timbre-v2.5', 'Trisha') === 'Trisha', 'Resolves requested candidate voice Trisha for Tamil (v2.5)');

  // Default fallback when omitted on timbre-v2.5
  assert(resolveVoice('en', 'timbre-v2.5') === 'Kaveri', 'Omitting voice for English defaults to Kaveri');
  assert(resolveVoice('hi', 'timbre-v2.5') === 'Nalini', 'Omitting voice for Hindi defaults to Nalini');
  assert(resolveVoice('pa', 'timbre-v2.5') === 'Mehuli', 'Omitting voice for Punjabi defaults to Mehuli');

  // Graceful fallback when invalid voice passed to timbre-v2.5
  assert(resolveVoice('mr', 'timbre-v2.5', 'NonExistentVoice') === 'Zahira', 'Invalid voice for Marathi gracefully falls back to Zahira');
  assert(resolveVoice('bn', 'timbre-v2.5', 'RandomVoiceXYZ') === 'Kirra', 'Invalid voice for Bengali gracefully falls back to Kirra');

  // Model switching: switching to timbre-v3.0 resolves incompatible regional voice to valid v3 default
  assert(resolveVoice('hi', 'timbre-v3.0', 'Nalini') === 'Shivani', 'Switching to timbre-v3.0 resolves incompatible Nalini to Shivani');
  assert(resolveVoice('en', 'timbre-v3.0', 'Kaveri') === 'Shivani', 'Switching to timbre-v3.0 resolves incompatible Kaveri to Shivani');
  assert(resolveVoice('hi', 'timbre-v3.0', 'Avinash') === 'Avinash', 'Supported v3 voice Avinash is accepted for timbre-v3.0');

  // 6. Speaking Speed Clamping
  console.log('\n--- 6. Speaking Speed Clamping (0.85x - 1.15x) ---');
  assert(clampSpeed(0.5) === 0.85, 'Underflow speed 0.5 clamped to 0.85');
  assert(clampSpeed(2.0) === 1.15, 'Overflow speed 2.0 clamped to 1.15');
  assert(clampSpeed(1.0) === 1.0, 'Normal speed 1.0 preserved');
  assert(clampSpeed(0.95) === 0.95, 'Speed 0.95 preserved');
  assert(clampSpeed(NaN) === 1.0, 'NaN speed defaults safely to 1.0');

  // 7. Model-Specific TTS Payload Validation
  console.log('\n--- 7. Model-Specific TTS Payload Validation ---');
  // Valid timbre-v2.5
  const validV2Payload = {
    text: 'रास्ता सेट हो गया है',
    voice: 'Nalini',
    model: 'timbre-v2.5',
    language: 'hi-IN',
    speed: 1.0,
  };
  assert(validateTtsPayload(validV2Payload).valid, 'Valid timbre-v2.5 payload with Nalini passes validation');

  // Valid timbre-v3.0
  const validV3Payload = {
    text: 'रास्ता सेट हो गया है',
    voice: 'Shivani',
    model: 'timbre-v3.0',
    language: 'hi-IN',
    speed: 1.0,
  };
  assert(validateTtsPayload(validV3Payload).valid, 'Valid timbre-v3.0 payload with Shivani passes validation');

  // Incompatible voice on timbre-v3.0 MUST be rejected
  const invalidV3VoicePayload = {
    text: 'रास्ता सेट हो गया है',
    voice: 'Nalini',
    model: 'timbre-v3.0',
    language: 'hi-IN',
  };
  const v3Validation = validateTtsPayload(invalidV3VoicePayload);
  assert(!v3Validation.valid, 'timbre-v3.0 rejects Nalini voice');
  assert(Boolean(v3Validation.error?.includes('not supported by model \'timbre-v3.0\'')), 'Validation error explains timbre-v3.0 voice incompatibility');

  // Empty text rejected
  const emptyTextPayload = { ...validV2Payload, text: '' };
  assert(!validateTtsPayload(emptyTextPayload).valid, 'Empty text payload rejected');

  // Unsupported model rejected
  const invalidModelPayload = { ...validV2Payload, model: 'unsupported-model-v99' };
  assert(!validateTtsPayload(invalidModelPayload).valid, 'Unsupported model rejected');

  // 8. Translation Pipeline Independence
  console.log('\n--- 8. Translation Pipeline Independence ---');
  const transIntentTamil = parseTranslationIntent('Translate turn right at the fuel station into Tamil');
  assert(transIntentTamil.isTranslationOnly, 'Tamil translation command marked as translation only');
  assert(transIntentTamil.targetLang === 'ta', 'Target language parsed as Tamil (ta)');

  const transIntentKannada = parseTranslationIntent('Translate where is the hospital into Kannada');
  assert(transIntentKannada.isTranslationOnly, 'Kannada translation command marked as translation only');
  assert(transIntentKannada.targetLang === 'kn', 'Target language parsed as Kannada (kn)');

  const fallbackParsed = fallbackRuleBasedParser(
    'Translate take me to Agra into Marathi',
    { origin: null, destination: null, stops: [] }
  );
  assert(fallbackParsed.intent === 'translate', 'Fallback parser recognizes translation intent');
  assert(fallbackParsed.actions.length === 0, 'Translation command produces 0 navigation actions');

  // 9. Server Status Contract
  console.log('\n--- 9. Server Status & Diagnostics Contract ---');
  const status = getGnaniStatus();
  assert(Boolean(status.languages && status.languages.length >= 11), 'Status reports full catalog of 11 languages');
  assert(status.defaultModel === 'timbre-v2.5', 'Status defaultModel is timbre-v2.5');
  assert(Boolean(status.defaultVoice), `Status defaultVoice is configured: ${status.defaultVoice}`);
  assert(GNANI_SUPPORTED_LANGUAGES.includes('hi-en'), 'GNANI_SUPPORTED_LANGUAGES includes hi-en');
  assert(GNANI_SUPPORTED_LANGUAGES.includes('pa-IN'), 'GNANI_SUPPORTED_LANGUAGES includes pa-IN');
  assert(GNANI_SUPPORTED_LANGUAGES.includes('kn-IN'), 'GNANI_SUPPORTED_LANGUAGES includes kn-IN');
  assert(GNANI_SUPPORTED_LANGUAGES.includes('ml-IN'), 'GNANI_SUPPORTED_LANGUAGES includes ml-IN');

  // Summary
  console.log('\n================================================================');
  console.log(`  RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runMultilingualGnaniTests();
