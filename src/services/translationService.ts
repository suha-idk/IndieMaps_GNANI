// Translation & Cross-Language Service for Raahi (राही)
// Supports English, Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati
// Strictly preserves named entities, coordinates, numbers, negation, and route constraints.

export type SupportedLanguage =
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

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  preservedEntities: string[];
  executionSeparated: boolean;
  navigationCommand?: string;
}

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  hinglish: 'Hinglish (हिंग्लिश)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  kn: 'Kannada (ಕನ್ನಡ)',
  ml: 'Malayalam (മലയാളം)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  gu: 'Gujarati (ગુજરાતી)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
};

/**
 * Translates text between supported language pairs using backend Gemini API.
 * Preserves place names, stops, distances, units, negation, and route instructions.
 */
export async function translateText(
  text: string,
  targetLang: SupportedLanguage,
  sourceLang?: SupportedLanguage
): Promise<TranslationResult> {
  const clean = text.trim();
  if (!clean) {
    return {
      translatedText: '',
      sourceLanguage: sourceLang || 'en',
      targetLanguage: targetLang,
      preservedEntities: [],
      executionSeparated: true,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000); // Generous timeout for high-quality model inference
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        targetLang,
        sourceLang: sourceLang || 'en',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.translatedText) {
        return {
          translatedText: data.translatedText,
          sourceLanguage: data.sourceLanguage || sourceLang || 'en',
          targetLanguage: data.targetLanguage || targetLang,
          preservedEntities: data.preservedEntities || [],
          executionSeparated: true,
          navigationCommand: data.navigationCommand,
        };
      }
    }
  } catch (err) {
    console.warn('translateText fetch warning:', err);
  }

  // Graceful semantic fallback if backend is unreachable or timed out
  const fallbackTranslation = offlineNavigationTranslate(clean, targetLang);
  return {
    translatedText: fallbackTranslation,
    sourceLanguage: sourceLang || 'en',
    targetLanguage: targetLang,
    preservedEntities: [],
    executionSeparated: true,
  };
}

/**
 * Basic offline fallback dictionary for core navigation phrases when cloud API is offline.
 */
function offlineNavigationTranslate(text: string, targetLang: SupportedLanguage): string {
  const lower = text.toLowerCase().trim();
  const navMap: Record<string, Partial<Record<SupportedLanguage, string>>> = {
    'set destination to agra': {
      en: 'Set destination to Agra',
      hi: 'गंतव्य को आगरा सेट करें',
      mr: 'मुक्काम आग्रा सेट करा',
      te: 'గమ్యాన్ని ఆగ్రాకు సెట్ చేయండి',
      ta: 'சேருமிடத்தை ஆக்ரா என அமைக்கவும்',
      bn: 'গন্তব্য আগ্রা সেট করুন',
      gu: 'ગંતવ્ય આગ્રા સેટ કરો',
    },
    'set the destination to agra': {
      en: 'Set destination to Agra',
      hi: 'गंतव्य को आगरा सेट करें',
      mr: 'मुक्काम आग्रा सेट करा',
      te: 'గమ్యాన్ని ఆగ్రాకు సెట్ చేయండి',
      ta: 'சேருமிடத்தை ஆக்ரா என அமைக்கவும்',
      bn: 'গন্তব্য আগ্রা সেট করুন',
      gu: 'ગંતવ્ય આગ્રા સેટ કરો',
    },
    'turn right': {
      en: 'Turn right',
      hi: 'दाएं मुड़ें',
      mr: 'उजवीकडे वळा',
      te: 'కుడివైపు తిరగండి',
      ta: 'வலதுபுறம் திரும்பவும்',
      bn: 'ডানদিকে ঘুরুন',
      gu: 'જમણે વળો',
    },
    'turn left': {
      en: 'Turn left',
      hi: 'बाएं मुड़ें',
      mr: 'डावीकडे वळा',
      te: 'ఎడమవైపు తిరగండి',
      ta: 'இடதுபுறம் திரும்பவும்',
      bn: 'বামদিকে ঘুরুন',
      gu: 'ડાબે વળો',
    },
  };

  if (navMap[lower] && navMap[lower][targetLang]) {
    return navMap[lower][targetLang];
  }

  return text;
}

/**
 * Separates explicit translation requests from navigation commands.
 * Handles diverse natural phrasing without strict boilerplate templates.
 */
export function parseTranslationIntent(text: string): {
  isTranslationOnly: boolean;
  isTranslateAndExecute: boolean;
  targetLang?: SupportedLanguage;
  textToTranslate?: string;
  commandToExecute?: string;
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Target language identification across English, Hindi, and regional languages
  let targetLang: SupportedLanguage = 'hi';
  if (/(?:into|in|to)\s+english|अंग्रेजी|इंग्लिश|in english|to english/i.test(lower)) targetLang = 'en';
  else if (/(?:into|in|to)\s+marathi|मराठी|in marathi|to marathi/i.test(lower)) targetLang = 'mr';
  else if (/(?:into|in|to)\s+telugu|तेलुगु|తెలుగు|in telugu|to telugu/i.test(lower)) targetLang = 'te';
  else if (/(?:into|in|to)\s+tamil|तमिल|தமிழ்|in tamil|to tamil/i.test(lower)) targetLang = 'ta';
  else if (/(?:into|in|to)\s+kannada|कन्नड़|ಕನ್ನಡ|in kannada|to kannada/i.test(lower)) targetLang = 'kn';
  else if (/(?:into|in|to)\s+malayalam|मलयालम|മലയാളം|in malayalam|to malayalam/i.test(lower)) targetLang = 'ml';
  else if (/(?:into|in|to)\s+punjabi|पंजाबी|ਪੰਜਾਬੀ|in punjabi|to punjabi/i.test(lower)) targetLang = 'pa';
  else if (/(?:into|in|to)\s+bengali|bangla|बंगाली|বাংলা|in bengali|to bengali/i.test(lower)) targetLang = 'bn';
  else if (/(?:into|in|to)\s+gujarati|गुजराती|ગુજરાતી|in gujarati|to gujarati/i.test(lower)) targetLang = 'gu';
  else if (/(?:into|in|to)\s+hinglish|हिंग्लिश|in hinglish|to hinglish/i.test(lower)) targetLang = 'hinglish';
  else if (/(?:into|in|to)\s+hindi|हिंदी|हिन्दी|in hindi|to hindi/i.test(lower)) targetLang = 'hi';

  const isTranslateRequest =
    /translate|अनुवाद|ट्रांसलेट|भाषांतर|how\s+(?:do\s+you|to)\s+say|what\s+is\s+.+\s+in\s+|क्या\s*कहते\s*हैं/i.test(lower);

  if (!isTranslateRequest) {
    return { isTranslationOnly: false, isTranslateAndExecute: false };
  }

  // Check if both translation and navigation were requested
  const hasAndNavigate =
    lower.includes('and then navigate to') ||
    lower.includes('and navigate to') ||
    lower.includes('and go to') ||
    lower.includes('aur fir navigate karo') ||
    lower.includes('aur fir chalo');

  if (hasAndNavigate) {
    const parts = clean.split(/(?:and then navigate to|and navigate to|aur fir navigate karo)/i);
    return {
      isTranslationOnly: false,
      isTranslateAndExecute: true,
      targetLang,
      textToTranslate: parts[0]?.replace(/^translate\s+/i, '').trim(),
      commandToExecute: parts[1]?.trim() ? `Navigate to ${parts[1].trim()}` : undefined,
    };
  }

  // Pure translation request
  // Check for quotes
  let textToTranslate = '';
  const quoted = clean.match(/["'\u201C\u201D]([^"'\u201C\u201D]+)["'\u201D]/);
  if (quoted && quoted[1].trim().length > 0) {
    textToTranslate = quoted[1].trim();
  } else {
    textToTranslate = clean
      .replace(/^(?:can\s+you\s+|please\s+)?translate\s+(?:this\s+)?(?:in|into|to)\s+[a-zA-Z\u0900-\u0D7F]+[:\s]*/i, '')
      .replace(/^(?:can\s+you\s+|please\s+)?translate\s+/i, '')
      .replace(/\s+(?:in|into|to)\s+(?:hindi|english|marathi|telugu|tamil|bengali|gujarati|kannada|malayalam|punjabi|hinglish)[.!?]?$/i, '')
      .replace(/^(?:how\s+(?:do\s+you|to)\s+say\s+|what\s+is\s+)/i, '')
      .replace(/\s+in\s+(?:hindi|english|marathi|telugu|tamil|bengali|gujarati|kannada|malayalam|punjabi|hinglish)[?]?$/i, '')
      .replace(/(?:हिंदी|मराठी|अंग्रेजी|तेलुगु|तमिल|बंगाली|गुजराती|कन्नड़|मलयालम|पंजाबी|हिंग्लिश)\s*में\s*(?:अनुवाद|ट्रांसलेट)\s*(?:करो|करें|कीजिए|कर दो)[:\s]*/gi, '')
      .replace(/[:\-\s]+$/, '')
      .replace(/^[:\-\s]+/, '')
      .trim();
  }

  return {
    isTranslationOnly: true,
    isTranslateAndExecute: false,
    targetLang,
    textToTranslate: textToTranslate || clean,
  };
}
