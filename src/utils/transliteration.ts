// Transliteration and script mapping utility for Indian languages in Raahi (राही)
// Supports Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati and English

// 1. Common Dictionary for Navigation Terms & Indian Landmarks
export const KNOWN_PLACE_DICTIONARY: Record<string, string> = {
  // Hindi / Devanagari Landmarks & Categories
  'रेल म्यूजियम': 'National Rail Museum',
  'नेशनल रेल म्यूजियम': 'National Rail Museum',
  'राष्ट्रीय रेल संग्रहालय': 'National Rail Museum',
  'हौज खास': 'Hauz Khas',
  'हौज खास विलेज': 'Hauz Khas Village',
  'आगरा': 'Agra',
  'आगरा का किला': 'Agra Fort',
  'ताज महल': 'Taj Mahal',
  'मथुरा': 'Mathura',
  'वृन्दावन': 'Vrindavan',
  'दिल्ली': 'Delhi',
  'नई दिल्ली': 'New Delhi',
  'गुरुग्राम': 'Gurugram',
  'गुड़गांव': 'Gurugram',
  'नोएडा': 'Noida',
  'जयपुर': 'Jaipur',
  'धौला कुआँ': 'Dhaula Kuan',
  'धौला कुआं': 'Dhaula Kuan',
  'साइबर हब': 'Cyber Hub',
  'कनॉट प्लेस': 'Connaught Place',
  'इंडिया गेट': 'India Gate',
  'लाल किला': 'Red Fort',
  'कुतुब मीनार': 'Qutub Minar',
  'चांदनी चौक': 'Chandni Chowk',
  'राजीव चौक': 'Rajiv Chowk',
  'जिम कॉर्बेट': 'Jim Corbett National Park',
  'जिम कॉर्बेट नेशनल पार्क': 'Jim Corbett National Park',
  'राजौरी गार्डन': 'Rajouri Garden',
  'डीपीएस आरके पुरम': 'DPS RK Puram Delhi Public School',
  'डीपीएस आर के पुरम': 'DPS RK Puram Delhi Public School',
  'गुरु तेग बहादुर इंस्टीट्यूट ऑफ टेक्नोलॉजी': 'Guru Tegh Bahadur Institute of Technology GTBIT',
  'पुणे': 'Pune',
  'मुंबई': 'Mumbai',
  'हैदराबाद': 'Hyderabad',
  'बेंगलुरु': 'Bengaluru',
  'बैंगलोर': 'Bengaluru',
  'कोलकाता': 'Kolkata',
  'अहमदाबाद': 'Ahmedabad',
  'वडोदरा': 'Vadodara',
  'सूरत': 'Surat',
  'नासिक': 'Nashik',
  'लोनावाला': 'Lonavala',

  'लक्ष्मी नारायण मंदिर': 'Laxmi Narayan Mandir',
  'लक्ष्मी नारायण मंदिर मालवीय नगर': 'Laxmi Narayan Mandir Malviya Nagar',
  'मालवीय नगर': 'Malviya Nagar',
  'भरतपुर': 'Bharatpur',
  'बिरला मंदिर': 'Birla Mandir Laxmi Narayan Temple',

  // Marathi
  'पुणे स्टेशन': 'Pune Railway Station',
  'दादर': 'Dadar Mumbai',
  'नाशिक': 'Nashik',
  'लोणावळा': 'Lonavala',
  'खंडाळा': 'Khandala',

  // Telugu
  'విజయవాడ': 'Vijayawada',
  'హైదరాబాద్': 'Hyderabad',
  'విశాఖపట్నం': 'Visakhapatnam',
  'తిరుపతి': 'Tirupati',

  // Tamil
  'சென்னை': 'Chennai',
  'மதுரை': 'Madurai',
  'கோயம்புத்தூர்': 'Coimbatore',
  'திருச்சி': 'Tiruchirappalli',

  // Bengali
  'কলকাতা': 'Kolkata',
  'হাওড়া': 'Howrah',
  'দার্জিলিং': 'Darjeeling',

  // Gujarati
  'અમદાવાદ': 'Ahmedabad',
  'વડોદરા': 'Vadodara',
  'સુરત': 'Surat',
  'રાજકોટ': 'Rajkot',
};

// 2. Vocabulary translations for generic place terms
const TERM_TRANSLATIONS: Record<string, string> = {
  म्यूजियम: 'museum',
  संग्रहालय: 'museum',
  रेल: 'rail',
  हवाईअड्डा: 'airport',
  हवाई: 'air',
  अड्डा: 'station',
  स्टेशन: 'station',
  बस: 'bus',
  अस्पताल: 'hospital',
  दवाखाना: 'pharmacy',
  स्कूल: 'school',
  विद्यालय: 'school',
  कॉलेज: 'college',
  महाविद्यालय: 'college',
  यूनिवर्सिटी: 'university',
  विश्वविद्यालय: 'university',
  पेट्रोल: 'petrol',
  पंप: 'pump',
  किला: 'fort',
  मंदिर: 'temple',
  मस्जिद: 'mosque',
  गुरुद्वारा: 'gurudwara',
  बाजार: 'bazar',
  मार्केट: 'market',
  उद्यान: 'garden',
  बगीचा: 'garden',
  पार्क: 'park',
  सड़क: 'road',
  मार्ग: 'road',
  गेट: 'gate',
  नगर: 'nagar',
  विहार: 'vihar',
  चौक: 'chowk',
  गांव: 'gaon',
};

// Devanagari character to Latin sound map
const DEVA_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
};

const DEVA_MATRAS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '',
};

const DEVA_CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
};

/**
 * Phonetic transliteration from Devanagari script to Latin/English characters
 */
export function transliterateDevanagariToLatin(text: string): string {
  if (!text) return '';

  let result = '';
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (DEVA_VOWELS[ch]) {
      result += DEVA_VOWELS[ch];
    } else if (DEVA_CONSONANTS[ch]) {
      const base = DEVA_CONSONANTS[ch];
      if (next === '्') {
        // Halant - no inherent vowel
        result += base;
        i++; // skip halant
      } else if (DEVA_MATRAS[next]) {
        // Has matra
        result += base + DEVA_MATRAS[next];
        i++; // skip matra
      } else if (DEVA_CONSONANTS[next] || DEVA_VOWELS[next] || next === ' ') {
        // Inherent 'a' sound for Indian names
        result += base + 'a';
      } else {
        result += base;
      }
    } else if (DEVA_MATRAS[ch]) {
      result += DEVA_MATRAS[ch];
    } else {
      result += ch;
    }
  }

  return result
    .replace(/\ba\b/g, '')
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Applies Indian linguistic schwa-deletion (drops unstressed word-final 'a' from Latin transliterations).
 * e.g. "hava mahala" -> "hava mahal", "jayapura" -> "jayapur", "somanatha" -> "somanath"
 */
export function applySchwaDeletion(text: string): string {
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((word) => {
      let w = word;
      if (w.length > 3 && w.endsWith('a') && !w.endsWith('aa')) {
        w = w.slice(0, -1);
      }
      // Medial schwa deletion in multi-syllabic words (e.g. somanath -> somnath, kalakatta -> kalkatta)
      if (w.length >= 6) {
        w = w.replace(/([aeiou][bcdfghjklmnpqrstvwxyz])a([bcdfghjklmnpqrstvwxyz])/gi, '$1$2');
      }
      return w;
    })
    .join(' ');
}

/**
 * Strips Unicode diacritics / accent marks (e.g. "Méridien" -> "Meridien", "Café" -> "Cafe").
 * Uses Unicode Normalization Form Canonical Decomposition (NFD) and removes Combining Diacritical Marks.
 */
export function stripDiacritics(text: string): string {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Phonetically normalizes text for comparing queries with Google Places API names.
 * Strips diacritics, unifies v/w, i/ee, u/oo, s/sh, and schwa variations.
 */
export function normalizeForPhoneticComparison(text: string): string {
  if (!text) return '';
  const unaccented = stripDiacritics(text.toLowerCase());
  return applySchwaDeletion(unaccented)
    .replace(/\blay\s+m/gi, 'le m')
    .replace(/\bmarid/gi, 'merid')
    .replace(/\bmeridian\b/gi, 'meridien')
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/sh/g, 's')
    .replace(/zh|z/g, 'j')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/bh/g, 'b')
    .replace(/ph/g, 'f')
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes place queries and generates search variants
 * across original script, transliteration, and canonical English equivalents.
 */
export function generatePlaceSearchVariants(query: string): string[] {
  const clean = query.trim();
  if (!clean) return [];

  const variants = new Set<string>();
  variants.add(clean);

  // 1. Direct dictionary match
  const lower = clean.toLowerCase();
  for (const [key, canonical] of Object.entries(KNOWN_PLACE_DICTIONARY)) {
    if (clean === key || lower === key.toLowerCase()) {
      variants.add(canonical);
    } else if (clean.includes(key)) {
      variants.add(clean.replace(key, canonical).trim());
    }
  }

  // 2. Devanagari term translation & transliteration
  const hasDevanagari = /[\u0900-\u097F]/.test(clean);
  if (hasDevanagari) {
    let termReplaced = clean;
    for (const [term, eng] of Object.entries(TERM_TRANSLATIONS)) {
      if (termReplaced.includes(term)) {
        termReplaced = termReplaced.replace(new RegExp(term, 'g'), ' ' + eng + ' ');
      }
    }
    const transliterated = transliterateDevanagariToLatin(termReplaced);
    if (transliterated && transliterated.length > 2) {
      variants.add(transliterated);
      const schwa = applySchwaDeletion(transliterated);
      if (schwa !== transliterated) {
        variants.add(schwa);
        variants.add(schwa.replace(/v/g, 'w'));
      }
    }

    const pureTranslit = transliterateDevanagariToLatin(clean);
    if (pureTranslit && pureTranslit.length > 2) {
      variants.add(pureTranslit);
      const schwaPure = applySchwaDeletion(pureTranslit);
      if (schwaPure !== pureTranslit) {
        variants.add(schwaPure);
        variants.add(schwaPure.replace(/v/g, 'w'));
      }
    }
  }

  // 3. Common abbreviations
  if (/\bdps\b/i.test(clean)) {
    variants.add(clean.replace(/\bdps\b/gi, 'Delhi Public School DPS'));
  }
  if (/\bgtbit\b/i.test(clean)) {
    variants.add('Guru Tegh Bahadur Institute of Technology GTBIT Rajouri Garden');
  }
  if (/\biit\b/i.test(clean)) {
    variants.add(clean.replace(/\biit\b/gi, 'Indian Institute of Technology IIT'));
  }
  if (/\baiims\b/i.test(clean)) {
    variants.add(clean.replace(/\baiims\b/gi, 'All India Institute of Medical Sciences AIIMS'));
  }

  return Array.from(variants);
}
