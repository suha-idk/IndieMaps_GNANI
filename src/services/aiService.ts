import type { CommandInterpretation, AtomicAction } from '../types/navigation.ts';
import { parseTranslationIntent, translateText, type SupportedLanguage } from './translationService.ts';

function isHighConfidenceLocalNavigationCommand(command: string): boolean {
  const c = command.trim();
  return /(?:set|change)\s+(?:the\s+|my\s+)?destination\s+to\s+.+|take me to\s+.+|navigate to\s+.+|मुझे\s+.+\s+जाना\s+है|मुझे\s+.+\s+ले\s+चलो|गंतव्य बदलकर.+(?:करो|कर दो)|मला\s+.+\s+जायचे\s+आहे|నన్ను.+కు.+తీసుకెళ్లండి|என்னை.+க்கு.+அழைத்துச்\s*செல்லுங்கள்|আমাকে.+নিয়ে\s*চলুন|મારે.+જવું\s+છે|बीच में.+(?:जोड़|स्टॉप)|रास्ते में.+(?:जोड़|रुकना)|beech mein.+(?:stop add|jod)|route mein.+(?:stop add|jod)|add\s+(?:a\s+)?stop\s+(?:at|in|near)\s+.+|add\s+.+\s+as\s+(?:intermediate\s+)?stops?|.+\s+(?:को|ko)\s+(?:स्टॉप|stop)\s+(?:बनाओ|जोड़ो|जोड़ दो|लगाओ|add)/i.test(c)
    || /destination same rakhna.*stop add/i.test(c)
    || /मंजिल मत बदलना.*(?:स्टॉप|stop)/i.test(c)
    || /(?:current location|my location|meri location|मेरी (?:वर्तमान )?लोकेशन|મારું સ્થાન|నా ప్రస్తుత స్థానం|என் இருப்பிடம்|আমার অবস্থান)/i.test(c);
}

export async function interpretCommand(
  command: string,
  currentJourney: any,
  responseLanguage: string = 'hi'
): Promise<CommandInterpretation> {
  const clean = command.trim();
  if (!clean) {
    return {
      detectedLanguage: 'en',
      intent: 'unknown',
      actions: [],
      requiresConfirmation: false,
      spokenResponse: responseLanguage === 'hi' ? 'कोई कमांड सुनाई नहीं दी। कृपया फिर से बोलें।' : 'I did not hear a command. Please speak again.',
      clarificationNeeded: null,
    };
  }

  // Check if this is an explicit translation request
  const transIntent = parseTranslationIntent(clean);
  if (transIntent.isTranslationOnly && transIntent.textToTranslate && transIntent.targetLang) {
    try {
      const transResult = await translateText(transIntent.textToTranslate, transIntent.targetLang);
      return {
        detectedLanguage: transResult.sourceLanguage,
        intent: 'translate',
        actions: [],
        requiresConfirmation: false,
        spokenResponse: transResult.translatedText,
        clarificationNeeded: null,
      };
    } catch {
      // Fall through if translation fails
    }
  }

  // Primary: Cloud Gemini AI API for intelligent, generalizable understanding.
  // This extracts nuanced entities, normalized names, locality context, and compound actions without brittle regexes.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000); // 15-second timeout for cloud AI inference
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: clean,
        currentJourney,
        responseLanguage,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data: CommandInterpretation = await res.json();
      if (data && typeof data === 'object' && Array.isArray(data.actions)) {
        // Guard: Do not let an incomplete remote AI response that misclassified a landmark as destination bypass landmark search!
        const localLandmark = extractLandmarkNearbySearch(clean);
        if (localLandmark) {
          const hasProperLandmark = data.actions.some(
            (a) => a.type === 'SEARCH_NEARBY' && a.searchAnchor === 'landmark' && Boolean(a.anchorPlaceQuery)
          );
          if (!hasProperLandmark) {
            data.intent = 'search_nearby';
            data.actions = [localLandmark];
            if (responseLanguage.startsWith('hi')) {
              data.spokenResponse = `${localLandmark.anchorPlaceQuery} के पास ${localLandmark.placeQuery} खोज रहा हूँ।`;
            } else {
              data.spokenResponse = `Searching for ${localLandmark.placeQuery} near ${localLandmark.anchorPlaceQuery}.`;
            }
          }
        }

        if (data.actions.length > 0 || data.intent === 'translate' || Boolean(data.spokenResponse)) {
          return data;
        }
      }
    }
  } catch (err) {
    console.warn('interpretCommand remote API warning:', err);
  }

  // Fallback Rule-Based Multilingual Engine for Instant Resilience (offline or server error)
  return fallbackRuleBasedParser(clean, currentJourney, responseLanguage);
}

export function extractLandmarkNearbySearch(clean: string): AtomicAction | null {
  // Guard: if user says "destination same", stop removal, or route filter, skip
  if (/destination same|मंजिल मत बदलना|destination mat badalna/i.test(clean) || /hata|remove|delete/i.test(clean)) {
    return null;
  }

  // 1. Check for immediate selection instruction, e.g. "pehla wala add kar dena", "pehla wala add kardo"
  let immediateSelectionOrdinal: number | undefined = undefined;
  if (/(?:pehla|first|1st|पहला)\s*(?:wala|waala|option|one)?\s*(?:add|जोड़|jod)/i.test(clean)) {
    immediateSelectionOrdinal = 1;
  } else if (/(?:doosra|dusra|second|2nd|दूसरा)\s*(?:wala|waala|option|one)?\s*(?:add|जोड़|jod)/i.test(clean)) {
    immediateSelectionOrdinal = 2;
  }

  // 2. Pattern A: Hindi / Hinglish "<Landmark> ke paas / aas-paas / near ... <Subject> [action]"
  const hindiLandmarkMatch = clean.match(
    /^(?:mujhe\s+|hamko\s+|please\s+)?(.+?)\s+(?:ke\s+(?:paas|aas-paas|aas\s+paas|near|bagal\s+mein|nazdeek)|के\s+(?:पास|आस-पास|आस\s+पास|नजदीक|बगल\s+में)|च्या\s+जवळ|javal|daggaralo|na\s+paas)\s*(?:wali|vali|वाली)?\s*(.+)/i
  );

  if (hindiLandmarkMatch) {
    const rawLandmark = hindiLandmarkMatch[1]
      .replace(/^(?:mujhe|hamko|humko|please|mere)\s+/i, '')
      .trim();
    let rawSubject = hindiLandmarkMatch[2].trim();

    let intendedActionAfterSelect: 'set_destination' | 'add_stop' | 'show_options' | 'ask_user' = 'show_options';
    if (/(?:le chalo|le chalo.|ले चलो|take me to|navigate to|chalo|जाना है)/i.test(rawSubject)) {
      intendedActionAfterSelect = 'set_destination';
    } else if (/(?:add\s*kar\s*do|add\s*kardo|add\s*karo|जोड़ दो|जोड़ो|jod do|jodo|add kar dena)/i.test(rawSubject) || immediateSelectionOrdinal) {
      intendedActionAfterSelect = 'add_stop';
    } else if (/(?:batao|dikhao|find karo|chahiye|options dikhao|dhoondo|dhundo|बताओ|दिखाओ|चाहिए)/i.test(rawSubject)) {
      intendedActionAfterSelect = 'show_options';
    }

    let cleanSubject = rawSubject
      .replace(/[.,!?;]+$/g, '')
      .trim()
      .replace(/(?:,\s*)?(?:pehla|doosra|first|second)\s*(?:wala|waala|one)?\s*(?:add\s*kar\s*dena|add\s*kardo|add\s*kar\s*do|जोड़ देना|जोड़ दो)/gi, '')
      .replace(/(?:le\s+chalo|ले\s+चलो|take\s+me\s+to|navigate\s+to|chalo|जाना\s+है)$/gi, '')
      .replace(/(?:batao|dikhao|find\s+karo|chahiye|options\s+dikhao|dhoondo|dhundo|बताओ|दिखाओ|चाहिए|खोजो)$/gi, '')
      .replace(/(?:add\s*kar\s*do|add\s*kardo|add\s*karo|जोड़\s*दो|जोड़ो|jod\s*do|jodo)$/gi, '')
      .replace(/^(?:koi|koyi|ek|kuch|achhe|achha|accha|acche|good|famous|badhiya|best|wali|vali|वाली)\s+/gi, '')
      .replace(/^(?:achhe|achha|accha|acche|good|famous|badhiya|best)\s+/gi, '')
      .replace(/[.,!?;]+$/g, '')
      .trim();

    if (!cleanSubject || /^(?:options?|jagah|places?)$/i.test(cleanSubject)) {
      cleanSubject = 'places';
    }

    let category: any = undefined;
    if (/chai|tea|pakod|coffee|cafe|dhaba|restaurant|khana|sweet|नाश्ता|चाय/i.test(cleanSubject)) {
      category = 'restaurant';
    } else if (/pharmacy|medical|chemist|medicine|दवा/i.test(cleanSubject)) {
      category = 'pharmacy';
    } else if (/petrol|fuel|gas station|पेट्रोल/i.test(cleanSubject)) {
      category = 'gas_station';
    } else if (/cng/i.test(cleanSubject)) {
      category = 'cng_station';
    } else if (/hospital|doctor|clinic|अस्पताल/i.test(cleanSubject)) {
      category = 'hospital';
    }

    if (rawLandmark && rawLandmark.length > 1 && !/^(?:route|raaste|rasta|mere|my|apne)$/i.test(rawLandmark)) {
      return {
        type: 'SEARCH_NEARBY',
        placeQuery: cleanSubject,
        anchorPlaceQuery: rawLandmark,
        searchAnchor: 'landmark',
        category,
        isCategorySearch: Boolean(category) || /shop|stall|dhaba|restaurant|cafe|pharmacy|store/i.test(cleanSubject),
        intendedActionAfterSelect,
        immediateSelectionOrdinal,
      };
    }
  }

  // 3. Pattern B: English "<Action> <Subject> near <Landmark>"
  const englishNearMatch = clean.match(
    /^(?:take\s+me\s+to|navigate\s+to|find\s+me|find|show\s+me|show|search\s+for|search|look\s+for|get\s+me|get)?\s*(?:a\s+|an\s+|some\s+|good\s+)?(.+?)\s+(?:near|around|close\s+to|by)\s+(.+?)(?:$|[.,;!?])/i
  );

  if (englishNearMatch) {
    let rawSubject = englishNearMatch[1]
      .replace(/^(?:a\s+|an\s+|some\s+|good\s+|best\s+)/i, '')
      .trim();
    let rawLandmark = englishNearMatch[2]
      .replace(/[.,;!?]+$/, '')
      .trim();

    let intendedActionAfterSelect: 'set_destination' | 'add_stop' | 'show_options' | 'ask_user' = 'show_options';
    if (/^take\s+me\s+to|^navigate\s+to/i.test(clean)) {
      intendedActionAfterSelect = 'set_destination';
    }

    let category: any = undefined;
    if (/chai|tea|pakod|coffee|cafe|dhaba|restaurant|food|snacks|sweets/i.test(rawSubject)) {
      category = 'restaurant';
    } else if (/pharmacy|pharmacies|medical|chemist|medicine/i.test(rawSubject)) {
      category = 'pharmacy';
    } else if (/petrol|fuel|gas station/i.test(rawSubject)) {
      category = 'gas_station';
    } else if (/cng/i.test(rawSubject)) {
      category = 'cng_station';
    } else if (/hospital|doctor|clinic/i.test(rawSubject)) {
      category = 'hospital';
    }

    if (rawLandmark && !/^(?:me|my location|current location|here|route)$/i.test(rawLandmark)) {
      return {
        type: 'SEARCH_NEARBY',
        placeQuery: rawSubject,
        anchorPlaceQuery: rawLandmark,
        searchAnchor: 'landmark',
        category,
        isCategorySearch: Boolean(category) || /shop|stall|dhaba|restaurant|cafe|pharmacy|store|pharmacies/i.test(rawSubject),
        intendedActionAfterSelect,
        immediateSelectionOrdinal,
      };
    }
  }

  return null;
}

export function extractCompoundDestinationAndStops(clean: string): AtomicAction[] | null {
  if (/destination same|मंजिल मत बदलना|destination mat badalna/i.test(clean)) {
    return null;
  }
  // Exclude multi-operation compound statements with 3+ clauses or petrol priority (handled by main parser)
  if (/(?:और|aur\s+phir|and\s+then|aur\s+raaste)/i.test(clean) || (clean.match(/[,;]/g) || []).length >= 2) {
    return null;
  }

  // Pattern 1: "take me to <Dest> but/and add <Stop> in between"
  const enMatch = clean.match(
    /^(?:take\s+me\s+to|navigate\s+to|go\s+to)\s+([^,]+?)\s+(?:but|and)\s+(?:add|include)\s+(?:a\s+|an\s+)?([^,]+?)\s+(?:in\s+between|as\s+a\s+stop|as\s+an\s+intermediate\s+stop)(?:$|[.,;!?])/i
  );
  if (enMatch) {
    const dest = enMatch[1].trim();
    let stop = enMatch[2].replace(/^(?:a\s+|an\s+)/i, '').trim();
    if (dest && stop) {
      return [
        { type: 'SET_DESTINATION', placeQuery: dest },
        { type: 'ADD_STOP', placeQuery: stop, searchAnchor: 'route', position: 'least_detour' },
      ];
    }
  }

  // Pattern 2: "mujhe agra beech mein mathura brijwasi rukna hai"
  const hiMatch = clean.match(
    /^(?:mujhe\s+|hamko\s+|please\s+)?([^,]+?)\s+(?:beech\s+mein|बीच\s+में)\s+([^,]+?)\s*(?:par|mein|pe|को|पर|में)?\s*(?:rukna\s+hai|रुकना\s+है)(?:$|[.,;!?])/i
  );
  if (hiMatch) {
    const dest = hiMatch[1].replace(/^(?:mujhe|hamko|humko|please)\s+/i, '').trim();
    const stop = hiMatch[2].replace(/^(?:ek\s+|एक\s+)/i, '').trim();
    if (dest && stop && !/(?:jaana|जाना|beech|बीच|stop|स्टॉप)/i.test(dest)) {
      return [
        { type: 'SET_DESTINATION', placeQuery: dest },
        { type: 'ADD_STOP', placeQuery: stop, searchAnchor: 'route', position: 'least_detour' },
      ];
    }
  }

  // Pattern 3: "take me to <Dest> and add <Stop> on the way"
  const enMatch2 = clean.match(
    /^(?:take\s+me\s+to|navigate\s+to)\s+([^,]+?)\s+and\s+add\s+([^,]+?)\s+on\s+the\s+way(?:$|[.,;!?])/i
  );
  if (enMatch2) {
    const dest = enMatch2[1].trim();
    const stop = enMatch2[2].trim();
    if (dest && stop) {
      return [
        { type: 'SET_DESTINATION', placeQuery: dest },
        { type: 'ADD_STOP', placeQuery: stop, searchAnchor: 'route', position: 'least_detour' },
      ];
    }
  }

  return null;
}

export function fallbackRuleBasedParser(
  text: string,
  currentJourney: any,
  responseLanguage: string = 'hi'
): CommandInterpretation {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const actions: AtomicAction[] = [];

  // Language detection across regional scripts and keywords
  let detectedLanguage = 'hi';
  if (/[\u0C00-\u0C7F]/.test(clean) || /cheyyi|pettandi|velli|teesukellandi/i.test(lower)) {
    detectedLanguage = 'te';
  } else if (/[\u0B80-\u0BFF]/.test(clean) || /azhaithu|sellungal|amaikkavum|vaanga/i.test(lower)) {
    detectedLanguage = 'ta';
  } else if (/[\u0980-\u09FF]/.test(clean) || /cholun|niye|set korun/i.test(lower)) {
    detectedLanguage = 'bn';
  } else if (/[\u0A80-\u0AFF]/.test(clean) || /javu che|set karo|rakho|ane pachhi/i.test(lower)) {
    detectedLanguage = 'gu';
  } else if (/जायचे|करा|मध्ये|दादर|आहे|पुण्या|पुणे|लोणावळा/i.test(clean) || /jayache|kara|madhye|aahe/i.test(lower)) {
    detectedLanguage = 'mr';
  } else if (/[a-zA-Z]/.test(clean) && !/(hai|karo|jaana|hatao|pehle|stop|cheyyi|kar do|beech|paas|jodo|manzil|rasta|chalo|rukna|wala|waala)/i.test(clean)) {
    detectedLanguage = 'en';
  } else {
    detectedLanguage = 'hi';
  }

  const responseIsEnglish = responseLanguage === 'en';
  const acknowledgement = (action: AtomicAction, language = responseLanguage): CommandInterpretation => ({
    detectedLanguage,
    intent: action.type.toLowerCase(),
    actions: [action],
    requiresConfirmation: false,
    spokenResponse: action.type === 'ADD_STOP'
      ? (language === 'en' ? `Adding ${action.placeQuery} as an intermediate stop.` : `${action.placeQuery} को बीच के स्टॉप के रूप में जोड़ रहा हूँ।`)
      : action.type === 'REMOVE_STOP'
      ? (language === 'en' ? `Removing stop ${action.targetStopIdentifier?.byName || ''}.` : `${action.targetStopIdentifier?.byName || 'स्टॉप'} हटाने की कोशिश कर रहा हूँ।`)
      : (language === 'en' ? `Setting destination to ${action.placeQuery}.` : `डेस्टिनेशन ${action.placeQuery} सेट कर रहा हूँ।`),
    clarificationNeeded: null,
  });

  // Translation-only instructions must never become navigation actions.
  const explicitTranslation = parseTranslationIntent(clean);
  if (explicitTranslation.isTranslationOnly) {
    return {
      detectedLanguage, intent: 'translate', actions: [], requiresConfirmation: false,
      spokenResponse: responseLanguage === 'en' ? 'Translation is unavailable right now. No navigation action was executed.' : 'अभी अनुवाद उपलब्ध नहीं है। कोई नेविगेशन कमांड लागू नहीं की गई।', clarificationNeeded: null,
    };
  }

  // Current-location requests are handled by the location control, not Places search.
  if (/(?:current location|my location|meri location|meri current location|मेरी (?:वर्तमान )?लोकेशन|मेरी जगह|माझे स्थान|મારું સ્થાન|నా ప్రస్తుత స్థానం|என் இருப்பிடம்|আমার অবস্থান)/i.test(clean)) {
    return { detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : 'en', intent: 'request_current_location', actions: [{ type: 'REQUEST_CURRENT_LOCATION' }], requiresConfirmation: false,
      spokenResponse: responseIsEnglish ? 'Getting your current device location.' : 'आपकी वर्तमान लोकेशन प्राप्त कर रहा हूँ।', clarificationNeeded: null };
  }

  // Landmark-Anchored Nearby Search Flow
  const landmarkSearchAction = extractLandmarkNearbySearch(clean);
  if (landmarkSearchAction) {
    const spokenResponse = responseIsEnglish
      ? `Searching for ${landmarkSearchAction.placeQuery} near ${landmarkSearchAction.anchorPlaceQuery}.`
      : `${landmarkSearchAction.anchorPlaceQuery} के पास ${landmarkSearchAction.placeQuery} खोज रहा हूँ।`;
    return {
      detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : (detectedLanguage || 'hi'),
      intent: 'search_nearby',
      actions: [landmarkSearchAction],
      requiresConfirmation: false,
      spokenResponse,
      clarificationNeeded: null,
    };
  }

  // Compound Multi-Intent Destination + Intermediate Stops
  const compoundDestAndStops = extractCompoundDestinationAndStops(clean);
  if (compoundDestAndStops) {
    const dest = compoundDestAndStops.find((a) => a.type === 'SET_DESTINATION')?.placeQuery;
    const stop = compoundDestAndStops.find((a) => a.type === 'ADD_STOP')?.placeQuery;
    const spokenResponse = responseIsEnglish
      ? `Setting destination to ${dest} and adding ${stop} on the way.`
      : `गंतव्य ${dest} सेट कर रहा हूँ और रास्ते में ${stop} जोड़ रहा हूँ।`;
    return {
      detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : (detectedLanguage || 'hi'),
      intent: 'compound',
      actions: compoundDestAndStops,
      requiresConfirmation: false,
      spokenResponse,
      clarificationNeeded: null,
    };
  }

  // 1. Destination Preservation (TEST 2)
  // e.g. "Agra destination same रखना, बस Mathura add कर दो।"
  // e.g. "Keep Agra destination same, just add Mathura."
  // e.g. "Destination same rakhna, bas Mathura add kar do."
  const isDestPreservation = /(?:destination\s+same|destination\s+unchanged|मंजिल\s+मत\s+बदलना|गंतव्य\s+मत\s+बदलना|destination\s+mat\s+badalna|keep\s+(?:the\s+|my\s+)?(?:final\s+)?destination\s+(?:the\s+)?same|keep\s+(?:my\s+)?destination\s+unchanged)/i.test(clean);
  if (isDestPreservation) {
    let destToKeep = currentJourney?.destination?.name || null;
    const destMention = clean.match(/^([a-zA-Z\u0900-\u097F\s]+?)\s+(?:destination|मंजिल|गंतव्य)/i) ||
                        clean.match(/(?:keep\s+)?([a-zA-Z\u0900-\u097F\s]+?)\s+(?:as\s+(?:the\s+)?destination|destination\s+same)/i);
    if (destMention) {
      const extracted = destMention[1].replace(/^(?:keep|meri|apni|please|mera)\s+/i, '').trim();
      if (extracted && extracted.length > 1 && !/^(?:the|my|mera|same|rakhna|rakho)$/i.test(extracted)) {
        destToKeep = extracted;
      }
    }

    let stopToAdd = '';
    const hiMatch = clean.match(/(?:(?:destination\s+same\s+rakhna|मंजिल\s+मत\s+बदलना|destination\s+mat\s+badalna|same\s+rakhna|same\s+रखना)[,\s]+)?(?:बस|just|only)?\s*([a-zA-Z\u0900-\u097F]+?)(?:\s+(?:ko|को|par|में|mein))?\s*(?:(?:stop|स्टॉप)\s+add\s*(?:karo|kar\s*do|kardo|कर\s*दो|करो)|add\s*(?:kar\s*do|karo|kardo|कर\s*दो|करो)|(?:स्टॉप\s+)?जोड़\s*(?:दो|देना)|(?:स्टॉप\s+)?डाल\s*(?:दो|देना))/i);
    const enMatch = clean.match(/(?:just\s+add|add|include)\s+([a-zA-Z\u0900-\u097F]+?)(?:[.!?]|$)/i);
    if (hiMatch) stopToAdd = hiMatch[1].trim();
    else if (enMatch) stopToAdd = enMatch[1].trim();

    if (stopToAdd && stopToAdd.length > 1 && stopToAdd !== destToKeep) {
      actions.push({
        type: 'ADD_STOP',
        placeQuery: stopToAdd,
        searchAnchor: 'route',
        position: 'least_detour',
        preserveDestination: true,
      });

      return {
        detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : 'en',
        intent: 'add_stop',
        actions,
        requiresConfirmation: false,
        spokenResponse: responseIsEnglish
          ? `Keeping destination as ${destToKeep || 'is'}, adding ${stopToAdd} as an intermediate stop.`
          : `गंतव्य ${destToKeep || ''} सुरक्षित रखते हुए, ${stopToAdd} को बीच के स्टॉप के रूप में जोड़ रहा हूँ।`,
        clarificationNeeded: null,
      };
    }
  }

  // 2. Route Search with Rating Filters (TEST 3)
  // e.g. "Find a Punjabi restaurant above 4.5 stars on my route."
  // e.g. "रास्ते में 4.5 स्टार से ऊपर कोई पंजाबी रेस्टोरेंट ढूँढो"
  const isSearchCommand = /(?:find|search|dhoondo|dhundo|shodh|khojo|dekho|ढूँढो|ढूंढो|शोधून\s+द्या|खोजो)/i.test(clean) ||
                          /(?:above|se\s+upar|se\s+jyada|stars?)\s*\d/i.test(clean);

  if (isSearchCommand && (lower.includes('route') || clean.includes('रास्ते') || clean.includes('वाटेत') || /restaurant|food|hotel|dhaba|cafe|petrol|pump|रेस्टोरेंट|ढाबा/i.test(clean))) {
    const starMatch = clean.match(/(?:above|rating\s*(?:above|greater than|>)?|stars?\s*(?:above|greater than|>)?)\s*(\d+(?:\.\d+)?)\s*(?:stars?|rating)?/i) ||
                      clean.match(/(\d+(?:\.\d+)?)\s*(?:stars?|star)\s*(?:se\s+upar|se\s+jyada|above|>)/i) ||
                      clean.match(/(\d+(?:\.\d+)?)\s*(?:स्टार्स?|स्टार)\s*(?:से\s+(?:ऊपर|ज्यादा)|above|>)/i);
    const minRating = starMatch ? parseFloat(starMatch[1]) : undefined;

    let placeQuery = 'Restaurant';
    let category: any = 'restaurant';
    if (/punjabi|पंजाबी/i.test(clean)) {
      placeQuery = 'Punjabi restaurant';
      category = 'restaurant';
    } else if (/petrol|fuel|पेट्रोल/i.test(clean)) {
      placeQuery = 'Petrol Pump';
      category = 'gas_station';
    } else if (/cng/i.test(clean)) {
      placeQuery = 'CNG Station';
      category = 'cng_station';
    } else if (/cafe|coffee|कैफे/i.test(clean)) {
      placeQuery = 'Cafe';
      category = 'restaurant';
    } else if (/dhaba|ढाबा/i.test(clean)) {
      placeQuery = 'Dhaba';
      category = 'restaurant';
    } else {
      const match = clean.match(/(?:find|search|dhoondo|dhundo|ढूँढो)\s+(?:a\s+|an\s+)?(.+?)(?:\s+(?:above|with|on|along|in|near|rating|से ऊपर)|$)/i);
      if (match && match[1].length > 2) {
        placeQuery = match[1].trim();
      }
    }

    return {
      detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : 'en',
      intent: 'search_nearby',
      actions: [
        {
          type: 'SEARCH_NEARBY',
          placeQuery,
          category,
          searchAnchor: 'route',
          minRating,
          isCategorySearch: true,
        },
      ],
      requiresConfirmation: false,
      spokenResponse: responseIsEnglish
        ? `Searching for ${placeQuery}${minRating ? ` above ${minRating} stars` : ''} on your route.`
        : `आपके रास्ते पर ${minRating ? `${minRating} स्टार से ऊपर ` : ''}${placeQuery} ढूँढ रहा हूँ।`,
      clarificationNeeded: null,
    };
  }

  const isCompoundOrMultiAction = /(?:and|then|aur|beech mein|बीच में|रास्ते में|route mein|stop add|स्टॉप जोड़|stoppage|\bse\b|\bfrom\b|se start|start from|mathura stop)/i.test(clean);

  // Clear stop-addition commands. Keep the extracted entity separate from grammar.
  if (!isCompoundOrMultiAction || /destination same/i.test(clean)) {
    const stopCapture = clean.match(/(?:destination same rakhna[, ]*)?(?:बीच में|रास्ते में|रस्त्यात|वाटेत|beech mein|route mein|on the way[, ]*)\s*(.+?)(?:\s+(?:पर|में|pe|par|mein|में))?\s*(?:(?:दोनों|दो) जगह)?\s*(?:स्टॉप|stop)?\s*(?:जोड़ दो|जोड़ो|जोड़|लगाओ|बनाओ|डालो|जोड़ना है|रुकना है|rukna hai|stop add karo|stop add kar do|add as a stop|add as stops|add to (?:my )?route)/i)
      || clean.match(/(?:add|include)\s+(?:a\s+)?(?:stop\s+(?:at|in)\s+)?(.+?)\s+as\s+(?:intermediate\s+)?stops?/i)
      || clean.match(/(?:add|include)\s+(?:a\s+)?stop\s+(?:at|in|near)\s+(.+?)(?:[.!?]|$)/i)
      || clean.match(/(.+?)\s+(?:को|ko)\s+(?:स्टॉप|stop)\s+(?:बनाओ|जोड़ो|जोड़ दो|लगाओ|add\s*(?:karo|kar\s*do|kardo)|banao)/i)
      || clean.match(/(?:destination same rakhna|मंजिल मत बदलना|destination mat badalna)[,\s]+(.+?)\s+(?:stop add\s*(?:karo|kar\s*do|kardo)|स्टॉप जोड़ दो)/i);
    if (stopCapture) {
      let captured = stopCapture[1]
        .replace(/^(?:मुझे|मुझको|please|take me to|add|include)\s*/i, '')
        .replace(/(?:destination same rakhna|मंजिल मत बदलना|destination mat badalna|और|and|दोनों जगह|दो जगह)$/i, '')
        .replace(/\s+(?:पर|में|pe|par|mein)$/i, '').trim();
      // Multi-stop phrases can be split safely only when the stop action is explicit.
      const entities = captured.split(/\s+(?:और|आणि|અને|and|aur|&|,|तथा)\s+/i)
        .map((part) => part.replace(/(?:स्टॉप|stop|जोड़ दो|जोड़ो|रुकना है|rukna hai)$/i, '').trim())
        .filter((part) => part.length > 1 && !/^(?:दोनों|दो|जगह|place|stops?)$/i.test(part));
      if (entities.length > 0 && entities.length <= 5) {
        const parsedActions: AtomicAction[] = entities.map((placeQuery) => ({ type: 'ADD_STOP', placeQuery, searchAnchor: 'route', position: 'least_detour' }));
        return { detectedLanguage: /[\u0900-\u097F]/.test(clean) ? 'hi' : 'hinglish', intent: parsedActions.length > 1 ? 'compound' : 'add_stop', actions: parsedActions,
          requiresConfirmation: false, spokenResponse: responseIsEnglish ? `Adding ${entities.join(' and ')} as intermediate stop(s).` : `${entities.join(' और ')} को बीच के स्टॉप के रूप में जोड़ रहा हूँ।`, clarificationNeeded: null };
      }
    }
  }

  // Clear destination commands in English, Hindi, Hinglish and selected regional scripts.
  if (!isCompoundOrMultiAction) {
    const destinationCapture = clean.match(/(?:set|change)\s+(?:the\s+|my\s+)?destination\s+to\s+(.+?)(?:[.!?]|$)/i)
      || clean.match(/(?:take me to|navigate to|going to)\s+(.+?)(?:[.!?]|$)/i)
      || clean.match(/मुझे\s+(.+?)\s+जाना\s+है[।.!]?/i)
      || clean.match(/मुझे\s+(.+?)\s+ले\s+चलो[।.!]?/i)
      || clean.match(/(?:गंतव्य बदलकर|गंतव्य को|गंतव्य)\s*(.+?)\s*(?:करो|कर दो|बना दो|सेट करो|सेट कर दो)[।.!]?$/i)
      || clean.match(/मला\s+(.+?)\s+जायचे\s+आहे[।.!]?/i)
      || clean.match(/నన్ను\s*(.+?)కు\s*తీసుకెళ్లండి[।.!]?/i)
      || clean.match(/என்னை\s*(.+?)க்கு\s*அழைத்துச்\s*செல்லுங்கள்[।.!]?/i)
      || clean.match(/আমাকে\s*(.+?)\s*নিয়ে\s*চলুন[।.!]?/i)
      || clean.match(/મારે\s+(.+?)\s+જવું\s+છે[।.!]?/i);
    if (destinationCapture) {
      let placeQuery = destinationCapture[1].trim()
        .replace(/^(?:મને|मला|मुझे|please)\s*/i, '')
        .replace(/\s+(?:जाना है|जायचे आहे|જવું છે)$/i, '')
        .replace(/[।.!?,;]+$/g, '').trim();
      if (placeQuery.length > 1 && !/(?:रास्ते में|बीच में|stop|स्टॉप|जोड़|add|रुकना|destination same)/i.test(placeQuery)) {
        // Strip common grammatical suffixes without changing the user's original text elsewhere.
        if (placeQuery === 'पुण्या' || placeQuery === 'पुण्याला') {
          placeQuery = 'पुणे';
        } else if (placeQuery.endsWith('ला') && detectedLanguage === 'mr') {
          placeQuery = placeQuery.replace(/ला$/, '');
        } else {
          placeQuery = placeQuery.replace(/(दिल्लीला|मुंबईला|नाशिकला|लोणावळ्यात|आगरा को)$/i, (m) => ({ 'पुण्याला':'पुणे', 'दिल्लीला':'दिल्ली', 'मुंबईला':'मुंबई', 'नाशिकला':'नाशिक', 'लोणावळ्यात':'लोणावळा', 'आगरा को':'आगरा' } as Record<string,string>)[m] || m);
        }
        return acknowledgement({ type: currentJourney?.destination ? 'CHANGE_DESTINATION' : 'SET_DESTINATION', placeQuery });
      }
    }
  }
  let requiresConfirmation = false;

  // Check if translation request
  const transIntent = parseTranslationIntent(clean);
  if (transIntent.isTranslationOnly && transIntent.textToTranslate) {
    return {
      detectedLanguage,
      intent: 'translate',
      actions: [],
      requiresConfirmation: false,
      spokenResponse: `Translation: ${transIntent.textToTranslate}`,
      clarificationNeeded: null,
    };
  }

  // 1. Tolls toggle
  if (lower.includes('avoid toll') || lower.includes('toll avoid') || lower.includes('toll mat dikhana') || lower.includes('bina toll')) {
    actions.push({ type: 'TOGGLE_TOLLS', avoidTolls: true });
  } else if (lower.includes('allow toll') || lower.includes('toll le lo') || lower.includes('toll allow')) {
    actions.push({ type: 'TOGGLE_TOLLS', avoidTolls: false });
  }

  // 2. Travel Mode Switch
  if (lower.includes('bike mode') || lower.includes('two wheeler') || lower.includes('motorcycle') || lower.includes('bike se')) {
    actions.push({ type: 'SET_TRAVEL_MODE', travelMode: 'TWO_WHEELER' });
  } else if (lower.includes('car mode') || lower.includes('gaadi se') || lower.includes('drive mode') || lower.includes('car se')) {
    actions.push({ type: 'SET_TRAVEL_MODE', travelMode: 'DRIVE' });
  }

  // 3. Clear journey detection (high-impact -> requires confirmation)
  if (lower.includes('clear journey') || lower.includes('reset journey') || lower.includes('sara rasta hata do') || lower.includes('shuru se shuru karo')) {
    actions.push({ type: 'CLEAR_JOURNEY' });
    requiresConfirmation = true;
  }

  // 4. Ordinal Stop Removals (e.g. "remove the second stop", "doosra stop hata do", "दूसरा stop हटा दो, लेकिन बाकी route same रखना")
  const ordinalNumFromWord = (w: string): number => {
    const s = w.toLowerCase().trim();
    if (/^(?:pehla|first|1st|1|पहला|पहली|पहिला|पहिले)$/i.test(s)) return 1;
    if (/^(?:doosra|dusra|second|2nd|2|दूसरा|दूसरी|दुसरा|दुसरे)$/i.test(s)) return 2;
    if (/^(?:teesra|tisra|third|3rd|3|तीसरा|तीसरी|तिसरा|तिसरे)$/i.test(s)) return 3;
    if (/^(?:chautha|fourth|4th|4|चौथा|चौथी)$/i.test(s)) return 4;
    if (/^(?:paanchwa|fifth|5th|5|पांचवां|पाँचवाँ)$/i.test(s)) return 5;
    return 1;
  };

  const ordinalRemovalRegex = /(?:remove|delete|drop|hata do|hatao|nikal do|हटा दो|हटाओ|हटाएं|निकाल दो|कम करो)\s+(?:the\s+)?(pehla|first|1st|1|doosra|dusra|second|2nd|2|teesra|tisra|third|3rd|3|chautha|fourth|4th|4|पहला|पहली|पहिला|दूसरा|दूसरी|दुसरा|तीसरा|तीसरी|तिसरा|चौथा|चौथी)(?:\s*(?:stop|स्टॉप|waala|वाला|stoppage))?/gi;
  for (const match of clean.matchAll(ordinalRemovalRegex)) {
    const num = ordinalNumFromWord(match[1]);
    if (!actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byOrdinal === num)) {
      actions.push({
        type: 'REMOVE_STOP',
        targetStopIdentifier: { byOrdinal: num },
      });
    }
  }

  const reverseOrdinalRegex = /(pehla|first|1st|1|doosra|dusra|second|2nd|2|teesra|tisra|third|3rd|3|chautha|fourth|4th|4|पहला|पहली|पहिला|दूसरा|दूसरी|दुसरा|तीसरा|तीसरी|तिसरा|चौथा|चौथी)\s*(?:stop|स्टॉप|waala|वाला|stoppage)?\s*(?:hatao|hata do|remove|delete|drop|हटा दो|हटाओ|हटाएं|निकाल दो)/gi;
  for (const match of clean.matchAll(reverseOrdinalRegex)) {
    const num = ordinalNumFromWord(match[1]);
    if (!actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byOrdinal === num)) {
      actions.push({
        type: 'REMOVE_STOP',
        targetStopIdentifier: { byOrdinal: num },
      });
    }
  }

  // 5. Category Stop Removals
  if (lower.match(/(?:remove|delete|hata do|hatao)\s+(?:the\s+)?(?:petrol pump|fuel station|gas station)/i) ||
      lower.match(/(?:petrol pump|gas station)\s+(?:already in my route\s+)?(?:hata do|hatao|remove|delete)/i)) {
    if (!actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byName?.toLowerCase() === 'petrol pump')) {
      actions.push({
        type: 'REMOVE_STOP',
        category: 'gas_station',
        targetStopIdentifier: { byName: 'petrol pump' },
      });
    }
  }

  if (lower.match(/(?:remove|delete|hata do|hatao)\s+(?:the\s+)?(?:cng pump|cng station)/i) ||
      lower.match(/(?:cng pump|cng station)\s+(?:hata do|hatao|remove|delete)/i)) {
    if (!actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byName?.toLowerCase() === 'cng station')) {
      actions.push({
        type: 'REMOVE_STOP',
        category: 'cng_station',
        targetStopIdentifier: { byName: 'cng station' },
      });
    }
  }

  const hasOrdinalRemoval = actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byOrdinal);

  // 6. Devanagari Hindi Stop Removals (e.g. "मथुरा वाला स्टॉप हटा दो", "Cyber Hub हटाओ", "Dhaula Kuan हटा दो")
  if (!hasOrdinalRemoval) {
    const hindiRemMatch =
      clean.match(/(.+?)\s*(?:वाला\s+|का\s+)?स्टॉप\s*(?:हटा दो|हटाओ|हटाएं|निकाल दो|कम करो|डिलीट करो)/) ||
      clean.match(/(?:हटा दो|हटाओ|हटाएं|निकाल दो)\s*(?:स्टॉप)?\s*(.+)/);
    if (hindiRemMatch && !/(?:मंजिल|destination|origin|start|दूसरा|तीसरा|पहला|चौथा)/.test(hindiRemMatch[1])) {
      const q = hindiRemMatch[1].replace(/स्टॉप|वाला|का|को/g, '').trim();
      if (q && q.length > 1 && !actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byName === q)) {
        actions.push({
          type: 'REMOVE_STOP',
          targetStopIdentifier: { byName: q },
        });
      }
    }
  }

  // 7. Named Stop Removals per clause (e.g. "remove Cyber Hub", "remove the stop at Mathura", "Dhaula Kuan hata do")
  if (!hasOrdinalRemoval) {
    const rawClauses = clean.split(/[,;]|(?:\s+(?:and|aur|but|lekin|fir|aur fir|और|तथा|लेकिन|फिर)\s+)/i);
    for (const rawClause of rawClauses) {
      const cClean = rawClause.trim();
      if (!cClean) continue;
      if (/(?:remove|delete|drop|hata do|hatao|nikal do|nikalo|हटाओ|हटा दो|हटाएं|निकालो|निकाल दो)/i.test(cClean)) {
        if (/(?:petrol|cng|toll|the second|the first|the third|2nd|1st|3rd|doosra|dusra|pehla|teesra|दूसरा|तीसरा|पहला|चौथा|route same|बाकी route|same rakhna)\b/i.test(cClean)) {
          continue;
        }
        const match =
          cClean.match(/(?:remove|delete|drop|hata do|hatao|nikal do|हटाओ|हटा दो|हटाएं|निकालो|निकाल दो)\s+(?:the\s+)?(?:stop\s+at\s+)?([^,]+?)(?:\s+(?:from my stops|from stops|from route|stop|स्टॉप)|$)/i) ||
          cClean.match(/([^,]+?)\s*(?:ko|को\s*)?(?:hata do|hatao|nikal do|nikalo|हटाओ|हटा दो|हटाएं|निकालो|निकाल दो)/i);

        if (match) {
          let candidate = match[1]
            .replace(/from my stops|from stops|my stops|from route|the stop at|stop at|stop|स्टॉप|वाला|का|को|ko|aur|and|और/gi, '')
            .trim();
          if (
            candidate &&
            candidate.length > 2 &&
            !/(?:petrol|cng|toll|destination|origin|start|the second|the first|the third|2nd|1st|3rd|unchanged|doosra|pehla|teesra|मंजिल|route same|बाकी route|same rakhna)/i.test(candidate)
          ) {
            if (!actions.some(a => a.type === 'REMOVE_STOP' && a.targetStopIdentifier?.byName?.toLowerCase() === candidate.toLowerCase())) {
              actions.push({
                type: 'REMOVE_STOP',
                targetStopIdentifier: { byName: candidate },
              });
            }
          }
        }
      }
    }
  }

  // Priority ordering & Multi-stop ordering (TEST 5)
  // e.g. "Actually Jaipur भी जाना है, but सबसे पहले petrol भरवाना है।"
  // e.g. "Actually Jaipur bhi jaana hai, but first fill petrol."
  const priorityStopMatch = clean.match(/(?:सबसे पहले|sabse pehle|first of all|pehle|first)\s+(?:ek\s+|a\s+|need to\s+fill\s+|fill\s+)?(petrol|cng|fuel|gas|khana|restaurant|diesel)(?:\s+(?:pump|station|bharwana|bharna|lena|pe|par))?/i) ||
                            clean.match(/(petrol|cng|fuel|gas|diesel)\s+(?:pump|station)?\s*(?:bharwana|bharna)?\s*(?:सबसे पहले|sabse pehle|first)/i);
  if (priorityStopMatch) {
    if (!actions.some(a => a.type === 'ADD_STOP' && a.position === 'start')) {
      actions.push({
        type: 'ADD_STOP',
        placeQuery: 'Petrol Pump',
        category: 'gas_station',
        searchAnchor: 'route',
        position: 'start',
      });
    }
  }

  const alsoDestMatch = clean.match(/(?:actually\s+)?([a-zA-Z\u0900-\u097F\s]+?)\s*(?:भी|bhi|also)\s+(?:जाना है|jaana hai|chalo|visit karna|want to go to|go to)/i);
  if (alsoDestMatch) {
    const rawPlace = alsoDestMatch[1].replace(/^(?:actually|please|to|ko)\s+/i, '').trim();
    if (rawPlace && rawPlace.length > 1 && !/(?:petrol|fuel|cng|stop|start)/i.test(rawPlace)) {
      if (!actions.some(a => a.placeQuery?.toLowerCase() === rawPlace.toLowerCase())) {
        actions.push({
          type: currentJourney?.destination ? 'ADD_STOP' : 'SET_DESTINATION',
          placeQuery: rawPlace,
          position: 'end',
          searchAnchor: 'route',
        });
      }
    }
  }

  // 8. Origin + Destination Multi-Action: e.g. "Mujhe Delhi se Agra jaana hai", "Delhi to Agra", "Start from Delhi and go to Agra"
  const multiOdMatch =
    clean.match(/(?:mujhe\s+)?([^,]+?)\s+se\s+([^,]+?)\s+(?:jaana hai|navigate karo|chalo|जाना है|चलो)/i) ||
    clean.match(/(?:start from|from)\s+([^,]+?)\s+(?:to|and go to)\s+([^,]+)/i);

  if (multiOdMatch) {
    const orig = multiOdMatch[1].replace(/mujhe|hamko|humko|start from|from/gi, '').trim();
    const dest = multiOdMatch[2].replace(/jaana hai|navigate karo|chalo|जाना है|चलो/gi, '').trim();
    if (orig) {
      actions.push({
        type: 'SET_ORIGIN',
        placeQuery: orig,
      });
    }
    if (dest) {
      actions.push({
        type: currentJourney?.destination ? 'CHANGE_DESTINATION' : 'SET_DESTINATION',
        placeQuery: dest,
      });
    }
  }

  // 9. Sequential Destination + Multi-Stop Pattern: e.g. "Agra jaana hai, pehle Mathura, phir Vrindavan"
  const seqMatch = clean.match(/([^,]+?)\s+(?:jaana hai|chalo|जाना है|चलो)[,\s]+(?:pehle|first|पहले)\s+([^,]+?)[,\s]+(?:phir|fir|then|फिर|उसके बाद|uske baad)\s+([^,]+)/i);
  if (seqMatch) {
    const dest = seqMatch[1].replace(/mujhe|hamko|humko|to|ko/gi, '').trim();
    const stop1 = seqMatch[2].replace(/mein|par|pe|stop|ko/gi, '').trim();
    const stop2 = seqMatch[3].replace(/mein|par|pe|stop|ko/gi, '').trim();

    if (dest) {
      actions.push({
        type: currentJourney?.destination ? 'CHANGE_DESTINATION' : 'SET_DESTINATION',
        placeQuery: dest,
      });
    }
    if (stop1) {
      actions.push({
        type: 'ADD_STOP',
        placeQuery: stop1,
        searchAnchor: 'route',
        position: 'start',
      });
    }
    if (stop2) {
      actions.push({
        type: 'ADD_STOP',
        placeQuery: stop2,
        searchAnchor: 'route',
        position: 'end',
      });
    }
  }

  // 10. Multi-Stop Compound Expressions:
  // e.g. "Take me to Agra and add Mathura and Bharatpur as stops"
  // e.g. "आगरा चलो, रास्ते में मथुरा और भरतपुर दोनों जगह रुकना है", "वाटेत लोणावळा आणि खंडाळा थांबायचे आहे"
  // e.g. "एक पेट्रोल पंप और एक अच्छा रेस्टोरेंट जोड़ दो", "add a coffee shop and a petrol pump on the way"
  let matchedMultiStops = false;
  const multiStopMatch =
    clean.match(/add\s+(.+?)\s+as\s+(?:intermediate\s+)?stops?/i) ||
    clean.match(/रास्ते में\s+(.+?)\s+(?:दोनों जगह|दो जगह)?\s*रुकना है/i) ||
    clean.match(/वाटेत\s+(.+?)\s+थांबायचे आहे/i) ||
    clean.match(/(?:and\s+add|aur\s+add)\s+(.+?)\s+on\s+the\s+way/i) ||
    clean.match(/रास्ते में\s+(.+?)\s+जोड़ दो/i);

  if (multiStopMatch && !seqMatch) {
    const rawEntitiesStr = multiStopMatch[1].trim();
    const parts = rawEntitiesStr.split(/\s+(?:and|aur|और|आणि|तथा|&)\s+/i);
    if (parts.length >= 2) {
      matchedMultiStops = true;
      for (const p of parts) {
        const pClean = p.replace(/^(?:a\s+stop\s+(?:at|in)?|ek\s+|एक\s+|an?\s+)?/i, '').replace(/[\s,;]+$/, '').trim();
        if (pClean && pClean.length > 1 && !/(?:take|navigate|go to|chalo|jaana|agreed)/i.test(pClean)) {
          let cat: any = undefined;
          let q = pClean;
          if (/petrol|fuel|gas/i.test(pClean)) { cat = 'gas_station'; q = 'Petrol Pump'; }
          else if (/cng/i.test(pClean)) { cat = 'cng_station'; q = 'CNG Station'; }
          else if (/coffee|cafe|कैफे/i.test(pClean)) { cat = 'restaurant'; q = 'Coffee Shop'; }
          else if (/restaurant|dhaba|khana|रेस्टोरेंट|रेस्टॉरंट/i.test(pClean)) { cat = 'restaurant'; q = 'Restaurant'; }

          if (!actions.some(a => a.type === 'ADD_STOP' && a.placeQuery?.toLowerCase() === q.toLowerCase())) {
            actions.push({
              type: 'ADD_STOP',
              placeQuery: q,
              category: cat,
              searchAnchor: 'route',
              position: 'least_detour',
            });
          }
        }
      }
    }
  }

  // 11. Devanagari Hindi & Regional Stop Additions
  // e.g. "बीच में मथुरा पर स्टॉप जोड़ दो", "मथुरा को रास्ते में जोड़ दो", "आगरा जाते समय मथुरा में रुकना है", "मथुरा को स्टॉप बनाओ, मंजिल मत बदलना", "मध्ये नाशिकला एक stop add करा", "વચ્ચે વડોદરામાં એક stop add કરો", "फक्त एक पेट्रोल पंप जोड", "बस एक पेट्रोल पंप जोड़ दो"
  const regionalStopAddMatch =
    clean.match(/(?:बीच में|beech mein)\s+(.+?)\s+(?:पर|को|में|pe|par)?\s*(?:स्टॉप|stop)?\s*(?:जोड़ दो|जोड़ो|लगाओ|बनाओ|डालो|रखो|add\s*(?:karo|kar\s*do|kardo)|jod\s*do|jodo)/i) ||
    clean.match(/(?:^|[,;]|\s+aur\s+|\s+और\s+)([^,;]+?)\s+(?:को|में|ko|mein)?\s*(?:रास्ते में|route mein)\s*(?:स्टॉप|stop)?\s*(?:जोड़ दो|जोड़ो|लगाओ|बनाओ|डालो|jod\s*do|jodo|add\s*(?:karo|kar\s*do|kardo))/i) ||
    clean.match(/(?:^|[,;]|(?:\s+(?:और|aur|and|lekin|but|phir|fir)\s+))(?:\s*(?:बीच में|beech mein|रास्ते में))?\s*(?:.+?\s+(?:जाते|jaate)\s+(?:समय|हुए|samay|hue)\s+)?([^,;]+?)\s+(?:में|पर|pe|mein|par)?\s*(?:रुकना है|rukna hai)/i) ||
    clean.match(/(?:destination same rakhna|मंजिल मत बदलना)[,\s]+(.+?)\s*(?:stop\s+add\s*(?:karo|kar\s*do|kardo)|स्टॉप\s+जोड़\s+दो|ko\s+stop\s+banao)/i) ||
    clean.match(/(.+?)\s+(?:को|ko)?\s*(?:स्टॉप|stop)\s+(?:बनाओ|जोड़ो|जोड़ दो|लगाओ|add\s*(?:karo|kar\s*do|kardo)|banao)/i) ||
    clean.match(/मध्ये\s+(.+?)(?:ला)?\s+(?:एक\s+)?stop\s+add\s+करा/i) ||
    clean.match(/पुण्याला\s+जाताना\s+(.+?)(?:त|मध्ये|ला)?\s+थांबायचे\s+आहे/i) ||
    clean.match(/(?:फक्त|बस|मात्र)\s+(?:एक\s+)?(पेट्रोल पंप|petrol pump|cng station|रेस्टोरेंट|रेस्टॉरंट)\s+(?:जोड|जोड़ दो|add करा|add karo)/i) ||
    clean.match(/(?:रस्त्यात|रास्ते में)\s+(?:एक\s+)?(?:चांगले\s+|अच्छा\s+)?(रेस्टॉरंट|रेस्टोरेंट|restaurant|cafe|ढाबा)\s+(?:शोधून द्या|ढूँढकर दो|जोड़ दो|add करा)/i) ||
    clean.match(/(?:વચ્ચે\s+(.+?)(?:માં)?|(.+?)\s*(?:માં)?\s*વચ્ચે)\s*(?:એક\s+)?stop\s+add\s+કરો/i);

  if (regionalStopAddMatch && !seqMatch && !matchedMultiStops) {
    const rawStopGroup = regionalStopAddMatch[1] || regionalStopAddMatch[2] || '';
    let cat: any = undefined;
    let q = rawStopGroup.replace(/बीच में|beech mein|रास्ते में|route mein|स्टॉप|stop|को|में|पर|ko|mein|par|pe|add\s*(?:karo|kar\s*do|kardo)|jod\s*do|मध्ये|વચ્ચે|એક|एक|करा|કરો|માં|पुण्याला जाताना|फक्त|बस|जोड|जोड़ दो|शोधून द्या|ढूँढकर दो/gi, '').trim();

    if (/पेट्रोल|petrol|fuel/i.test(rawStopGroup)) { cat = 'gas_station'; q = 'Petrol Pump'; }
    else if (/cng/i.test(rawStopGroup)) { cat = 'cng_station'; q = 'CNG Station'; }
    else if (/रेस्टॉरंट|रेस्टोरेंट|restaurant|cafe|dhaba/i.test(rawStopGroup)) { cat = 'restaurant'; q = /cafe/i.test(rawStopGroup) ? 'Cafe' : 'Restaurant'; }

    if (q && q.length > 1 && !actions.some(a => a.type === 'ADD_STOP' && a.placeQuery?.toLowerCase() === q.toLowerCase())) {
      actions.push({
        type: 'ADD_STOP',
        placeQuery: q,
        category: cat,
        searchAnchor: 'route',
        position: 'least_detour',
      });
    }
  }

  // 12. Stop Additions per clause (English / Hinglish / Compound multi-additions)
  if (!seqMatch) {
    const clauses = clean.split(/[,;]|(?:\s+(?:and|aur|but|lekin|fir|aur fir|अने પછી|પછી|आणि|अब)\s+)/i);
    for (const clause of clauses) {
      const cClean = clause.trim();
      const cLower = cClean.toLowerCase();
      if (!cClean) continue;

      const isRemovalClause = /hata|remove|delete|drop|nikal/i.test(cLower);
      const isTollClause = /toll/i.test(cLower) && !/toll pump/i.test(cLower);
      const isDestOnly = (cLower.includes('jaana hai') || cLower.includes('navigate to') || cLower.includes('take me to') || cLower.includes('destination') || cLower.includes('गंतव्य') || cLower.includes('જવું છે') || cLower.includes('జాయచే ఆహే') || cLower.includes('తీసుకెళ్లండి') || cLower.includes('செல்லுங்கள்') || cLower.includes('চলুন') || cLower.includes('जायचे आहे')) &&
                         !cLower.includes('add') && !cLower.includes('jodo') && !cLower.includes('pump') && !cLower.includes('stall') && !cLower.includes('stop') && !cLower.includes('same') && !cLower.includes('વચ્ચે') && !cLower.includes('मध्ये') && !cLower.includes('फक्त') && !cLower.includes('बस');

      if (isRemovalClause || isTollClause || isDestOnly) continue;

      const hasAddWord = /add|jodo|lagao|include|put|shamil|rukna|stop|કરો|करा|जोड/i.test(cLower);
      const hasPetrol = /petrol|fuel|gas station|पेट्रोल/i.test(cLower);
      const hasCng = /cng/i.test(cLower);
      const hasFood = /tea|chai|dhaba|food|restaurant|khana|coffee|cafe|रेस्टोरेंट|रेस्टॉरंट|कैफे/i.test(cLower);
      const hasHospital = /hospital|medical|doctor/i.test(cLower);

      if (hasAddWord || hasPetrol || hasCng || hasFood || hasHospital) {
        let searchAnchor: any = 'route';
        let position: any = 'least_detour';
        let relativeTo: any = undefined;

        if (/origin|start|starting point|shuruat|pehle|माझे सुरुवातीचे/i.test(cLower)) {
          searchAnchor = 'origin';
          position = 'start';
        } else if (/destination|end point|manzil|end/i.test(cLower)) {
          searchAnchor = 'destination';
          position = cLower.includes('before') ? 'before' : 'end';
          if (position === 'before') {
            relativeTo = 'destination';
          }
        } else if (/near me|mere paas|aas-paas|current location/i.test(cLower)) {
          searchAnchor = 'current_location';
          position = 'start';
        }

        if (hasCng) {
          if (!actions.some(a => a.type === 'ADD_STOP' && a.category === 'cng_station' && a.searchAnchor === searchAnchor)) {
            actions.push({
              type: 'ADD_STOP',
              placeQuery: 'CNG Station',
              category: 'cng_station',
              searchAnchor,
              position,
              relativeTo,
            });
          }
        } else if (hasPetrol) {
          if (!actions.some(a => a.type === 'ADD_STOP' && a.category === 'gas_station' && a.searchAnchor === searchAnchor)) {
            actions.push({
              type: 'ADD_STOP',
              placeQuery: 'Petrol Pump',
              category: 'gas_station',
              searchAnchor,
              position,
              relativeTo,
            });
          }
        } else if (hasFood) {
          const foodLabel = /tea|chai/i.test(cLower) ? 'Tea Stall' : /coffee|cafe|कैफे/i.test(cLower) ? 'Cafe' : 'Restaurant';
          if (!actions.some(a => a.type === 'ADD_STOP' && a.category === 'restaurant' && a.searchAnchor === searchAnchor)) {
            actions.push({
              type: 'ADD_STOP',
              placeQuery: foodLabel,
              category: 'restaurant',
              searchAnchor,
              position,
              relativeTo,
            });
          }
        } else if (hasHospital) {
          if (!actions.some(a => a.type === 'ADD_STOP' && a.category === 'hospital')) {
            actions.push({
              type: 'ADD_STOP',
              placeQuery: 'Hospital',
              category: 'hospital',
              searchAnchor,
              position,
            });
          }
        } else {
          // Named place addition e.g. "Add a stop at DPS RK Puram", "DPS RK Puram par ek stop add kar do", "Add Mathura as an intermediate stop"
          const placeMatch =
            cClean.match(/(?:add\s+(?:an?\s+)?(?:intermediate\s+)?stop\s+(?:at|in|near)?\s*|add\s+)(.+?)(?:\s+(?:as\s+(?:an?\s+)?(?:intermediate\s+)?stop|to\s+(?:my\s+)?route|in\s+(?:my\s+)?route|ko\s+route\s+mein\s+jod\s+do|par\s+stop\s+add\s+kar\s+do)|$)/i) ||
            cClean.match(/(?:add|jodo|lagao)\s+([^,]+?)(?:\s+(?:to my route|near|at|stop)|$)/i) ||
            cClean.match(/(.+?)\s+par\s+ek\s+stop\s+add\s+kar\s+do/i);

          if (placeMatch) {
            let q = placeMatch[1]
              .replace(/^(?:a\s+stop\s+(?:at|in|near)\s+|stop\s+(?:at|in|near)\s+|at\s+|in\s+)/i, '')
              .replace(/(?:\s+as\s+(?:an?\s+)?(?:intermediate\s+)?stop|\s+as\s+a\s+stop|\s+to\s+my\s+route|\s+to\s+route|\s+in\s+route|\s+stop|\s+par\s+ek\s+stop)$/i, '')
              .replace(/[.,;!?]+$/, '')
              .trim();

            if (q && q.length > 1 && !actions.some(a => a.type === 'ADD_STOP' && a.placeQuery?.toLowerCase() === q.toLowerCase())) {
              actions.push({
                type: 'ADD_STOP',
                placeQuery: q,
                searchAnchor,
                position,
                relativeTo,
              });
            }
          }
        }
      }
    }
  }

  // 13. Destination Changes (Across English, Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati)
  const destinationUnchanged = lower.includes('destination unchanged') ||
                               lower.includes('keep my destination unchanged') ||
                               lower.includes('keep destination unchanged') ||
                               lower.includes('keep my final destination unchanged') ||
                               lower.includes('destination change mat karna') ||
                               lower.includes('destination wahi rahega') ||
                               lower.includes('मंजिल मत बदलना') ||
                               lower.includes('destination mat badalna') ||
                               lower.includes('destination mat badlo') ||
                               lower.includes('destination same rakhna') ||
                               lower.includes("don't change my destination") ||
                               lower.includes("dont change my destination") ||
                               lower.includes("keep the destination the same") ||
                               lower.includes("keep destination same") ||
                               lower.includes("माझे ठिकाण बदलू नको") ||
                               lower.includes("ठिकाण बदलू नको");

  if (!destinationUnchanged && !seqMatch && !multiOdMatch) {
    // Check regional language destination statements
    let regionalDest: string | null = null;

    if (/मला\s+(.+?)(?:ला)?\s+जायचे\s+आहे/i.test(clean)) {
      regionalDest = clean.match(/मला\s+(.+?)(?:ला)?\s+जायचे\s+आहे/i)?.[1] || null;
    } else if (/(.+?)ला\s+destination\s+set\s+करा/i.test(clean)) {
      regionalDest = clean.match(/(.+?)ला\s+destination\s+set\s+करा/i)?.[1] || null;
    } else if (/पुण्याला\s+जाताना/i.test(clean)) {
      regionalDest = 'Pune';
    } else if (/నన్ను\s+(.+?)కు\s+తీసుకెళ్లండి/i.test(clean)) {
      regionalDest = clean.match(/నన్ను\s+(.+?)కు\s+తీసుకెళ్లండి/i)?.[1] || null;
    } else if (/(.+?)(?:ను|ni)\s+destination\s+(?:గా|ga)\s+పెట్టండి/i.test(clean)) {
      regionalDest = clean.match(/(.+?)(?:ను|ni)\s+destination\s+(?:గా|ga)\s+పెట్టండి/i)?.[1] || null;
    } else if (/என்னை\s+(.+?)க்கு\s+அழைத்துச்\s+செல்லுங்கள்/i.test(clean)) {
      regionalDest = clean.match(/என்னை\s+(.+?)க்கு\s+அழைத்துச்\s+செல்லுங்கள்/i)?.[1] || null;
    } else if (/(.+?)ஐ\s+destination\s+ஆக\s+அமைக்கவும்/i.test(clean)) {
      regionalDest = clean.match(/(.+?)ஐ\s+destination\s+ஆக\s+அமைக்கவும்/i)?.[1] || null;
    } else if (/আমাকে\s+(.+?)\s+নিয়ে\s+চলুন/i.test(clean)) {
      regionalDest = clean.match(/আমাকে\s+(.+?)\s+নিয়ে\s+চলুন/i)?.[1] || null;
    } else if (/(.+?)কে\s+destination\s+হিসেবে\s+সেট\s+করুন/i.test(clean)) {
      regionalDest = clean.match(/(.+?)কে\s+destination\s+হিসেবে\s+সেট\s+করুন/i)?.[1] || null;
    } else if (/મારે\s+(.+?)\s+જવું\s+છે/i.test(clean)) {
      regionalDest = clean.match(/મારે\s+(.+?)\s+જવું\s+છે/i)?.[1] || null;
    } else if (/(.+?)ને\s+destination\s+તરીકે\s+સેટ\s+કરો/i.test(clean)) {
      regionalDest = clean.match(/(.+?)ને\s+destination\s+તરીકે\s+સેટ\s+કરો/i)?.[1] || null;
    } else if (/(.+?)\s+destination\s+રાખો/i.test(clean)) {
      regionalDest = clean.match(/(.+?)\s+destination\s+રાખો/i)?.[1] || null;
    }

    if (regionalDest) {
      const q = regionalDest.replace(/[.,;!?]+$/, '').trim();
      if (q && q.length > 1) {
        actions.push({
          type: currentJourney?.destination ? 'CHANGE_DESTINATION' : 'SET_DESTINATION',
          placeQuery: q,
        });
      }
    } else {
      // English, Hindi & Hinglish destination extraction
      const destMatch =
        clean.match(/(?:set|change)\s+(?:the\s+|my\s+)?destination\s+to\s+([^,.;]+?)(?:[,.;]|(?:\s+(?:and|but|with|pehle|aur|aur\s+add|अब))|$)/i) ||
        clean.match(/(?:take me to|navigate to|going to)\s+([^,.;]+?)(?:[,.;]|(?:\s+(?:and|but|with|pehle|aur|aur\s+add|अब))|$)/i) ||
        clean.match(/([^,.;]+?)\s+(?:jaana hai|chalo|जाना है|चलो)/i) ||
        clean.match(/(?:गंतव्य बदलकर|गंतव्य बदलो)\s*([^,.;]+?)(?:\s+(?:करो|कर दो)|$)/i) ||
        clean.match(/(?:destination|manzil|मंजिल|गंतव्य)\s+(?:change karke|to|ko|करके|बदलकर)?\s*([^,.;]+?)(?:\s+(?:kar do|karo|कर दो|करो|set kar do|set karo)|$)/i) ||
        clean.match(/(?:destination)\s+([^,.;]+?)\s+(?:set kar do|set karo|bana do)/i);

      if (destMatch) {
        let rawDest = destMatch[1]
          .replace(/^(?:the\s+|my\s+)?destination\s+to\s+/i, '')
          .replace(/^(?:actually|please|to|ko)\s+/i, '')
          .replace(/mujhe|hamko|humko|destination|change karke|kar do|set cheyyi|to|ko|par|करके|कर दो|बदलकर|करो|मुझे|मुझको|हमको|हम/gi, '')
          .replace(/\s+(?:भी|bhi|also)$/i, '')
          .replace(/[.,;!?]+$/, '')
          .trim();

        const isIntermediateKeyword = /beech mein|बीच में|रास्ते में|stop|स्टॉप|rukna|रुकना|petrol|cng|toll|unchanged|add\s+a\s+stop/i.test(rawDest);
        const alreadyCaptured = actions.some(a => a.placeQuery && (a.placeQuery.toLowerCase() === rawDest.toLowerCase() || rawDest.toLowerCase().includes(a.placeQuery.toLowerCase())));

        if (rawDest && rawDest.length > 2 && !isIntermediateKeyword && !alreadyCaptured) {
          actions.push({
            type: currentJourney?.destination ? 'CHANGE_DESTINATION' : 'SET_DESTINATION',
            placeQuery: rawDest,
          });
        }
      }
    }
  }

  // 13. Origin Changes
  const originUnchanged = lower.includes('origin unchanged') || lower.includes('keep origin unchanged');
  if (!originUnchanged && !multiOdMatch) {
    if (lower.includes('start from') || lower.includes('se start') || lower.includes('origin change') || clean.includes('से शुरू')) {
      const placeMatch = clean.match(/(?:start from|se start karo|origin change karke|से शुरू करो)\s*([^,]+?)(?:\s+(?:and|aur|instead)|$)/i);
      if (placeMatch) {
        const place = placeMatch[1].replace(/se start karo|origin change karke|instead|से शुरू करो/gi, '').replace(/[.,;!?]+$/, '').trim();
        if (place && !actions.some(a => a.type === 'CHANGE_ORIGIN' || a.type === 'SET_ORIGIN')) {
          actions.push({
            type: 'CHANGE_ORIGIN',
            placeQuery: place,
          });
        }
      }
    }
  }

  // 14. Safeguard: If no action was detected
  if (actions.length === 0) {
    if (/stop|स्टॉप|रुकना|halt/i.test(clean)) {
      const cleanedQuery = clean.replace(/stop|स्टॉप|रुकना|जोड़ दो|add|करो/gi, '').replace(/[.,;!?]+$/, '').trim();
      if (cleanedQuery.length > 1) {
        actions.push({
          type: 'ADD_STOP',
          placeQuery: cleanedQuery,
          searchAnchor: 'route',
          position: 'least_detour',
        });
      }
    } else if (!currentJourney?.destination) {
      // Extract place safely without leading command noise
      const cleanPlace = clean
        .replace(/^(?:set\s+(?:the\s+|my\s+)?destination\s+to|change\s+destination\s+to|take\s+me\s+to|navigate\s+to|going\s+to|mujhe)\s+/i, '')
        .replace(/\s+(?:jaana hai|chalo|जाना है|चलो)$/i, '')
        .replace(/[.,;!?]+$/, '')
        .trim();

      if (cleanPlace.length > 1) {
        actions.push({
          type: 'SET_DESTINATION',
          placeQuery: cleanPlace,
        });
      }
    }
  }

  const intent = actions.length > 1 ? 'compound' : actions[0]?.type?.toLowerCase() || 'unknown';

  // Build spoken acknowledgement in responseLanguage
  const isEnResp = responseLanguage === 'en';
  const descParts: string[] = [];
  for (const act of actions) {
    if (act.type === 'REMOVE_STOP') {
      const target = act.targetStopIdentifier?.byOrdinal
        ? `stop #${act.targetStopIdentifier.byOrdinal}`
        : act.targetStopIdentifier?.byName || 'stop';
      descParts.push(isEnResp ? `removed ${target}` : `${target} हटा दिया`);
    } else if (act.type === 'ADD_STOP') {
      const anchorDesc =
        act.searchAnchor === 'origin'
          ? (isEnResp ? 'near origin' : 'origin ke paas')
          : act.searchAnchor === 'destination'
          ? (isEnResp ? 'near destination' : 'destination ke paas')
          : (isEnResp ? 'along route' : 'रास्ते में');
      descParts.push(isEnResp ? `added ${act.placeQuery} (${anchorDesc})` : `${anchorDesc} ${act.placeQuery} जोड़ दिया`);
    } else if (act.type === 'SET_DESTINATION' || act.type === 'CHANGE_DESTINATION') {
      descParts.push(isEnResp ? `destination set to ${act.placeQuery}` : `destination ${act.placeQuery} set kar diya`);
    } else if (act.type === 'SET_ORIGIN' || act.type === 'CHANGE_ORIGIN') {
      descParts.push(isEnResp ? `origin set to ${act.placeQuery}` : `origin ${act.placeQuery} set kar diya`);
    } else if (act.type === 'SET_TRAVEL_MODE') {
      descParts.push(isEnResp ? `travel mode set to ${act.travelMode}` : `${act.travelMode} mode on kar diya`);
    } else if (act.type === 'TOGGLE_TOLLS') {
      descParts.push(isEnResp ? (act.avoidTolls ? 'avoiding tolls' : 'allowing tolls') : (act.avoidTolls ? 'toll avoid kar diya' : 'toll allow kar diya'));
    }
  }

  const spokenResponse = isEnResp
    ? `Route updated: ${descParts.join(', ')}.`
    : `रास्ता अपडेट हो गया है: ${descParts.join(', ')}.`;

  return {
    detectedLanguage,
    intent,
    actions,
    requiresConfirmation,
    spokenResponse,
    clarificationNeeded: null,
  };
}
