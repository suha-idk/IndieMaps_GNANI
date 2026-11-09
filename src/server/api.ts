import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { fallbackRuleBasedParser } from '../services/aiService.ts';
import { getGnaniStatus, handleGnaniTtsRest } from './gnaniProxy.ts';
import { getAuthoritativeConfig, persistEnvConfig, readEnvFile } from './envStorage.ts';

export const apiApp = express();
apiApp.use(express.json({ limit: '25mb' }));
apiApp.use(express.urlencoded({ limit: '25mb', extended: true }));

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '25mb' }));
apiRouter.use(express.urlencoded({ limit: '25mb', extended: true }));

// Error handler for body parser errors on apiRouter
apiRouter.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: 'Payload too large',
      message: 'Request payload exceeded maximum size (25MB)',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next(err);
});

apiApp.use('/api', apiRouter);
apiApp.use(apiRouter);

export const getGoogleMapsApiKey = (): string => {
  const envVal = (process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envVal) return envVal;
  try {
    const fileEnv = readEnvFile();
    if (fileEnv.VITE_GOOGLE_MAPS_API_KEY?.trim()) {
      process.env.VITE_GOOGLE_MAPS_API_KEY = fileEnv.VITE_GOOGLE_MAPS_API_KEY.trim();
      return fileEnv.VITE_GOOGLE_MAPS_API_KEY.trim();
    }
  } catch {}
  return '';
};

// Safe runtime diagnostics: reports configuration presence, never secret values.
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    mapsConfigured: Boolean(getGoogleMapsApiKey()),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  });
});

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// Multi-model Gemini caller with candidate fallback and safe timeout
async function callGeminiWithFallback(prompt: string, timeoutMs: number = 12000): Promise<string | null> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  const candidateModels = [...new Set([PRIMARY_GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'])];
  for (const model of candidateModels) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('AI timeout')), timeoutMs);
        }),
      ]);
      const text = response?.text?.trim();
      if (text) {
        return text;
      }
    } catch (error: any) {
      const status = error?.status || error?.statusCode;
      if (status === 401 || status === 403) return null;
      continue;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return null;
}

// In-memory route cache: key -> { data, timestamp }
const routeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getRouteCacheKey(
  origin: any,
  destination: any,
  intermediates: any[],
  travelMode: string,
  avoidTolls: boolean,
  avoidHighways: boolean
): string {
  const getWpKey = (wp: any) => {
    if (!wp) return 'null';
    if (wp.latLng && typeof wp.latLng.lat === 'number') {
      return `${wp.latLng.lat.toFixed(4)},${wp.latLng.lng.toFixed(4)}`;
    }
    return wp.placeId || wp.address || wp.name || '';
  };

  const org = getWpKey(origin);
  const dest = getWpKey(destination);
  const stops = (intermediates || []).map(getWpKey).join('|');
  return `${travelMode}_tolls${avoidTolls}_hwy${avoidHighways}_${org}->${stops}->${dest}`;
}

export const formatWaypointForRoute = (wp: any) => {
  if (wp.latLng && typeof wp.latLng.lat === 'number' && typeof wp.latLng.lng === 'number') {
    return {
      location: {
        latLng: {
          latitude: wp.latLng.lat,
          longitude: wp.latLng.lng,
        },
      },
    };
  }
  if (wp.placeId) {
    return { placeId: wp.placeId };
  }
  return { address: wp.address || wp.name };
};

// 1. Google Routes API v2
apiRouter.post('/routes', async (req: Request, res: Response) => {
  try {
    const { origin, destination, intermediates = [], travelMode = 'DRIVE', routeModifiers = {} } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }

    const mode = travelMode === 'TWO_WHEELER' ? 'TWO_WHEELER' : 'DRIVE';
    const avoidTolls = Boolean(routeModifiers.avoidTolls);
    const avoidHighways = Boolean(routeModifiers.avoidHighways);

    // Check cache
    const cacheKey = getRouteCacheKey(origin, destination, intermediates, mode, avoidTolls, avoidHighways);
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // Build payload preserving exact driver waypoint sequence (NEVER optimize waypoint order)
    const buildPayload = (useTrafficPreference: boolean) => {
      const payload: any = {
        origin: formatWaypointForRoute(origin),
        destination: formatWaypointForRoute(destination),
        travelMode: mode,
        routeModifiers: {
          avoidTolls,
          avoidHighways,
        },
      };

      if (useTrafficPreference) {
        payload.routingPreference = 'TRAFFIC_AWARE';
      }

      if (intermediates && intermediates.length > 0) {
        payload.intermediates = intermediates.map((wp: any) => formatWaypointForRoute(wp));
      }
      return payload;
    };

    const callRoutesAPI = async (payload: any) => {
      return fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': getGoogleMapsApiKey(),
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.viewport,routes.legs',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify(payload),
      });
    };

    // Primary attempt with traffic aware
    let response = await callRoutesAPI(buildPayload(true));
    let data = await response.json();

    // If TWO_WHEELER or specific region rejects TRAFFIC_AWARE, fallback without routingPreference
    if (!response.ok && data.error?.message?.includes('routingPreference')) {
      response = await callRoutesAPI(buildPayload(false));
      data = await response.json();
    }

    // If placeId coordinate snapping fails, fallback with address format
    if (response.ok && (!data.routes || data.routes.length === 0)) {
      const fallbackPayload: any = {
        origin: { address: origin.address || origin.name },
        destination: { address: destination.address || destination.name },
        travelMode: mode,
        routeModifiers: { avoidTolls, avoidHighways },
      };
      if (mode === 'DRIVE') {
        fallbackPayload.routingPreference = 'TRAFFIC_AWARE';
      }
      if (intermediates && intermediates.length > 0) {
        fallbackPayload.intermediates = intermediates.map((s: any) => ({ address: s.address || s.name }));
      }
      const fallbackRes = await callRoutesAPI(fallbackPayload);
      const fallbackData = await fallbackRes.json();
      if (fallbackRes.ok && fallbackData.routes && fallbackData.routes.length > 0) {
        response = fallbackRes;
        data = fallbackData;
      }
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data.routes && data.routes.length > 0) {
      routeCache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return res.json(data);
  } catch (error: any) {
    console.warn('Routes API compute error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Failed to compute route' });
  }
});

// 2. Google Places API (New) - Text Search
apiRouter.post('/places/search', async (req: Request, res: Response) => {
  try {
    const { textQuery, locationBias, locationRestriction, includedType, maxResultCount = 8 } = req.body;

    if (!textQuery) {
      return res.status(400).json({ error: 'textQuery is required' });
    }

    const payload: any = {
      textQuery,
      maxResultCount: Math.min(maxResultCount, 15),
      languageCode: 'en-IN',
    };

    // Google Places API (New) constraint: NEVER combine locationBias and locationRestriction in a single request
    if (locationRestriction?.center && typeof locationRestriction.center.lat === 'number' && typeof locationRestriction.center.lng === 'number') {
      payload.locationRestriction = {
        circle: {
          center: {
            latitude: locationRestriction.center.lat,
            longitude: locationRestriction.center.lng,
          },
          radius: locationRestriction.radius || 8000,
        },
      };
    } else if (locationBias?.center && typeof locationBias.center.lat === 'number' && typeof locationBias.center.lng === 'number') {
      payload.locationBias = {
        circle: {
          center: {
            latitude: locationBias.center.lat,
            longitude: locationBias.center.lng,
          },
          radius: locationBias.radius || 15000,
        },
      };
    }

    if (includedType && typeof includedType === 'string') {
      payload.includedType = includedType;
    }

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getGoogleMapsApiKey(),
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.primaryType,places.types',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.warn('Places API search error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Places search failed' });
  }
});

// 3. Google Places API (New) - Nearby Search
apiRouter.post('/places/nearby', async (req: Request, res: Response) => {
  try {
    const { center, radius = 8000, includedTypes = ['restaurant'], maxResultCount = 10, rankPreference } = req.body;

    if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
      return res.status(400).json({ error: 'center { lat, lng } is required' });
    }

    const payload: any = {
      includedTypes,
      maxResultCount: Math.min(maxResultCount, 15),
      locationRestriction: {
        circle: {
          center: {
            latitude: center.lat,
            longitude: center.lng,
          },
          radius,
        },
      },
      languageCode: 'en-IN',
    };

    if (rankPreference === 'DISTANCE') {
      payload.rankPreference = 'DISTANCE';
    }

    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getGoogleMapsApiKey(),
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.primaryType,places.types',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.warn('Places API nearby error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Nearby search failed' });
  }
});

// 4. Gemini Multilingual Voice / Text Command Interpretation
apiRouter.post('/interpret', async (req: Request, res: Response) => {
  try {
    const { command, currentJourney, responseLanguage = 'hi' } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'command is required' });
    }

    const systemPrompt = `You are Raahi (राही), an expert multilingual navigation copilot for Indian drivers.
The user may speak in Hindi (Devanagari or Romanized), English, Hinglish, Marathi, Telugu, Tamil, Bengali, Gujarati, or code-mixed dialects.

CRITICAL REQUIREMENT 0: SEPARATE INPUT LANGUAGE FROM RESPONSE LANGUAGE
- The user can issue commands in ANY language (English, Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati, etc.).
- The selected responseLanguage is "${responseLanguage}". It determines ONLY what language you speak back in (spokenResponse).
- An English command like "Set the destination to Agra" MUST be understood and parsed correctly even if responseLanguage is Hindi!
- NEVER reject an English command when Hindi is selected.
- NEVER treat an entire sentence as a place name! Extract ONLY the actual place entity.

CRITICAL REQUIREMENT 1: MULTI-OPERATION SUPPORT
You must parse the user's message into a COMPLETE set of structured operations, NOT a single mutually exclusive intent.
A single user utterance can contain BOTH additions and deletions, origin/destination changes, and nearby searches!

CRITICAL REQUIREMENT 2: STOP ADDITION VS DESTINATION CHANGE
- Explicit stop-addition language in ANY language:
  "बीच में ... स्टॉप जोड़ दो", "रास्ते में जोड़ दो", "... जाते समय ... में रुकना है", "... को स्टॉप बनाओ", "... वाला स्टॉप हटा दो",
  "beech mein ... stop add karo", "route mein jod do", "rukna hai", "add a stop at ...", "add ... as an intermediate stop",
  "मध्ये ... ला एक stop add करा", "વચ્ચે ... માં એક stop add કરો".
  -> THIS IS STRICTLY ADD_STOP (an intermediate waypoint).
  -> NEVER classify an intermediate stop request as SET_DESTINATION or CHANGE_DESTINATION!
  -> Preserve current origin, destination, and other intermediate stops.

CRITICAL REQUIREMENT 3: GENERALISE PLACE & LOCALITY EXTRACTION
For any place entity mentioned:
- "placeQuery": clean name in the user's language/script (e.g. "हवा महल", "Somnath Temple")
- "normalizedName": standard English/Latin name for search (e.g. "Hawa Mahal", "Somnath Temple", "Albert Hall Museum")
- "localityContext": city or neighbourhood if mentioned (e.g. "Jaipur", "Prabhas Patan", "Malviya Nagar", "Delhi")
- "isCategorySearch": true if user requested a category rather than a specific business (e.g. petrol pump, tea stall, restaurant, CNG station, hospital)
- "category": "gas_station" | "cng_station" | "restaurant" | "hospital" | "pharmacy" | "parking" | "ev_charging" | undefined

CRITICAL REQUIREMENT 4: TRANSLATION COMMAND SEPARATION
- If user asks to translate text (e.g. 'Translate "Turn right at the petrol pump" into Hindi' or 'इसे मराठी में ट्रांसलेट करो: ...'):
  -> intent: "translate"
  -> actions: [] (NO navigation actions!)
  -> spokenResponse: The accurate, natural translation into the requested target language.
  -> translation: { "translatedText": string, "sourceLanguage": string, "targetLanguage": string, "preservedEntities": string[] }

CRITICAL REQUIREMENT 5: GENERAL / NON-NAVIGATION QUESTIONS
- If user asks a general question (e.g. "What is the capital of India?"):
  -> intent: "general_question"
  -> actions: []
  -> spokenResponse: direct, polite answer in responseLanguage.

CRITICAL REQUIREMENT 6: DESTINATION PRESERVATION
- If user says "Agra destination same रखना, बस Mathura add कर दो" or "Keep Agra as destination, just add Mathura":
  -> NEVER replace the destination with Mathura!
  -> Keep destination unchanged (preserveDestination: true).
  -> Add Mathura as an intermediate stop (type: "ADD_STOP", placeQuery: "Mathura", position: "least_detour", searchAnchor: "route").

CRITICAL REQUIREMENT 7: COMPOUND MULTI-STOP ORDERING & PRIORITY
- If user issues compound commands like "मुझे मथुरा जाना है, बीच में आगरा रुकना है, और रास्ते में पेट्रोल पंप डाल दो":
  -> Decompose cleanly:
     1. SET_DESTINATION for "Mathura"
     2. ADD_STOP for "Agra" (position: "before", relativeTo: "destination", searchAnchor: "route")
     3. ADD_STOP for "Petrol Pump" (category: "gas_station", isCategorySearch: true, searchAnchor: "route", position: "least_detour")
- If user says "Actually Jaipur भी जाना है, but सबसे पहले petrol भरवाना है" / "first fill petrol":
  -> Petrol pump MUST be ordered FIRST: type: "ADD_STOP", placeQuery: "Petrol Pump", category: "gas_station", position: "start", searchAnchor: "route".
  -> Jaipur added as stop (position: "end") or destination, ensuring petrol pump is placed before it.

CRITICAL REQUIREMENT 8: ROUTE SEARCH WITH FILTERS
- If user asks "Find a Punjabi restaurant above 4.5 stars on my route":
  -> type: "SEARCH_NEARBY"
  -> placeQuery: "Punjabi restaurant"
  -> category: "restaurant"
  -> searchAnchor: "route"
  -> minRating: 4.5

CRITICAL REQUIREMENT 9: ORDINAL STOP REMOVAL
- If user says "दूसरा stop हटा दो, लेकिन बाकी route same रखना" or "Remove the second stop, keep rest same":
  -> type: "REMOVE_STOP"
  -> targetStopIdentifier: { byOrdinal: 2 }

CRITICAL REQUIREMENT 10: LANDMARK-ANCHORED SEARCH VS DESTINATION
- When a user asks for a business, category, or service near a named landmark (e.g. "Take me to a cafe near Guru Tegh Bahadur Institute of Technology", "Find restaurants around Bangla Sahib", "GTBIT ke paas chai ki dukaan dikhao"):
  -> type: "SEARCH_NEARBY"
  -> placeQuery: the requested business or category (e.g. "cafe", "restaurant", "chai ki dukaan", "tea stall", "pharmacy")
  -> category: appropriate category ("restaurant", "pharmacy", "gas_station", "hospital", etc.)
  -> isCategorySearch: true if searching for a generic category rather than a specific business name
  -> searchAnchor: "landmark"
  -> anchorPlaceQuery: the actual named landmark (e.g. "Guru Tegh Bahadur Institute of Technology", "GTBIT", "Bangla Sahib", "India Gate")
  -> intendedActionAfterSelect:
     - "set_destination": if user asked to be taken to or navigate to the business ("take me to", "navigate to", "le chalo", "chalo")
     - "add_stop": if user asked to add it as a stop ("add kardo", "stop banao", "beech mein jod do")
     - "show_options": if user asked to search, find, or show options ("find", "show me", "dikhao", "batao", "options")
- CRITICAL LANDMARK INSTRUCTIONS:
  1. The named landmark (e.g. "Guru Tegh Bahadur Institute of Technology" or "Bangla Sahib") is ONLY a temporary search anchor.
  2. The named landmark must NEVER be set as the destination or origin!
  3. NEVER classify the named landmark itself as the requested business.
  4. "near", "around", "close to", "ke paas", "aas-paas", "nazdeek", "च्या जवळ", "daggaralo" indicate a search anchor, NOT a destination.
  5. Never silently replace a named landmark with the current journey destination, origin, or device location.

OUTPUT SCHEMA (STRICT JSON, NO CODEBLOCKS):
{
  "detectedLanguage": "hi" | "hinglish" | "en" | "mr" | "te" | "ta" | "bn" | "gu",
  "intent": "compound" | "add_stop" | "remove_stop" | "set_destination" | "change_destination" | "set_origin" | "change_origin" | "toggle_toll_avoidance" | "search_nearby" | "translate" | "request_current_location" | "general_question" | "unknown",
  "actions": [
    {
      "type": "REMOVE_STOP" | "ADD_STOP" | "SET_DESTINATION" | "CHANGE_DESTINATION" | "SET_ORIGIN" | "CHANGE_ORIGIN" | "CLEAR_STOPS" | "CLEAR_JOURNEY" | "TOGGLE_TOLLS" | "SET_TRAVEL_MODE" | "REQUEST_CURRENT_LOCATION" | "SEARCH_NEARBY",
      "placeQuery": string,
      "normalizedName": string,
      "localityContext": string,
      "isCategorySearch": boolean,
      "category": "gas_station" | "cng_station" | "restaurant" | "hospital" | "pharmacy" | "parking" | "ev_charging",
      "searchAnchor": "origin" | "destination" | "current_location" | "route" | "stop" | "landmark",
      "anchorPlaceQuery": string,
      "intendedActionAfterSelect": "set_destination" | "add_stop" | "show_options" | "ask_user",
      "immediateSelectionOrdinal": number,
      "anchorStopName": string,
      "position": "start" | "end" | "before" | "after" | "least_detour",
      "relativeTo": string | number,
      "targetStopIdentifier": {
        "byOrdinal": number,
        "byName": string
      },
      "minRating": number,
      "preserveDestination": boolean,
      "avoidTolls": boolean,
      "travelMode": "DRIVE" | "TWO_WHEELER"
    }
  ],
  "requiresConfirmation": false,
  "spokenResponse": string,
  "translation": {
    "translatedText": string,
    "sourceLanguage": string,
    "targetLanguage": string,
    "preservedEntities": string[]
  }
}

CURRENT JOURNEY CONTEXT:
- Origin: ${JSON.stringify(currentJourney?.origin || 'None')}
- Destination: ${JSON.stringify(currentJourney?.destination || 'None')}
- Current Stops: ${JSON.stringify(currentJourney?.stops?.map((s: any, idx: number) => ({ ordinal: idx + 1, name: s.name, address: s.address, category: s.category })) || [])}
- Travel Mode: ${currentJourney?.travelMode || 'DRIVE'}
- Response Language Preference: ${responseLanguage}

Output ONLY valid JSON.`;

    const rawText = await callGeminiWithFallback(`${systemPrompt}\n\nUSER COMMAND: "${command}"`, 12000);
    if (rawText) {
      try {
        const cleanedText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedText);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.actions)) {
          return res.json(parsed);
        }
      } catch {
        // Fall through to deterministic parser
      }
    }

    // Instant, deterministic, verified fallback parser (zero error output, 100% resilient)
    const fallback = fallbackRuleBasedParser(command, currentJourney, responseLanguage);
    return res.json(fallback);
  } catch (error: any) {
    const fallback = fallbackRuleBasedParser(req.body?.command || '', req.body?.currentJourney, req.body?.responseLanguage);
    return res.json(fallback);
  }
});

// Translation & Cross-Language API Endpoint
apiRouter.post('/translate', async (req: Request, res: Response) => {
  try {
    const { text, targetLang, sourceLang = 'en' } = req.body;
    if (!text || !targetLang) {
      return res.status(400).json({ error: 'text and targetLang are required' });
    }

    const prompt = `You are an expert translator for the Indian navigation app Raahi (राही).
Translate the following text accurately from ${sourceLang} to ${targetLang}.

CRITICAL REQUIREMENTS:
1. STRICTLY PRESERVE all proper nouns, place names, landmarks, and institutions (e.g. "Agra", "Mathura", "DPS RK Puram", "Cyber Hub", "National Rail Museum").
2. Do NOT translate proper place names into literal dictionary words!
3. Strictly preserve numbers, distances, units, times, prices, and negation (e.g. "mat badalna", "do not change").
4. Strictly preserve navigation intent and direction instructions.
5. Supported target languages: en (English), hi (Hindi), mr (Marathi), te (Telugu), ta (Tamil), bn (Bengali), gu (Gujarati).

OUTPUT STRICT JSON (NO CODEBLOCKS):
{
  "translatedText": string,
  "sourceLanguage": string,
  "targetLanguage": string,
  "preservedEntities": string[]
}

TEXT TO TRANSLATE:
"${text}"`;

    const rawText = await callGeminiWithFallback(prompt, 12000);
    if (rawText) {
      try {
        const cleanedText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedText);
        const translated = parsed?.translatedText || parsed?.translation || parsed?.translated_text;
        if (parsed && translated) {
          return res.json({
            translatedText: translated,
            sourceLanguage: parsed.sourceLanguage || sourceLang,
            targetLanguage: parsed.targetLanguage || targetLang,
            preservedEntities: parsed.preservedEntities || [],
          });
        }
      } catch {
        // Fall through to default fallback
      }
    }

    return res.json({
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      preservedEntities: [],
    });
  } catch (err: any) {
    return res.json({
      translatedText: req.body?.text || '',
      sourceLanguage: req.body?.sourceLang || 'en',
      targetLanguage: req.body?.targetLang || 'hi',
      preservedEntities: [],
    });
  }
});

// 5. Route-Aware Detour Ranking
apiRouter.post('/detour-rank', async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      currentStops = [],
      candidates = [],
      travelMode = 'DRIVE',
      anchorType = 'route',
      suggestedInsertIndex,
    } = req.body;

    if (!origin || !destination || candidates.length === 0) {
      return res.status(400).json({ error: 'Origin, destination, and candidates are required' });
    }

    const mode = travelMode === 'TWO_WHEELER' ? 'TWO_WHEELER' : 'DRIVE';

    // Step A: Calculate baseline route distance & duration
    const baselineRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getGoogleMapsApiKey(),
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
      body: JSON.stringify({
        origin: formatWaypointForRoute(origin),
        destination: formatWaypointForRoute(destination),
        intermediates: currentStops.map((s: any) => formatWaypointForRoute(s)),
        travelMode: mode,
      }),
    });

    const baselineData = await baselineRes.json();
    const baselineRoute = baselineData.routes?.[0];

    // A missing route response must not be treated as a zero-distance route!
    if (!baselineRes.ok || !baselineRoute || typeof baselineRoute.distanceMeters !== 'number') {
      const unrankedCandidates = candidates.slice(0, 6).map((candidate: any) => ({
        ...candidate,
        detourUnavailable: true,
        isRankedByDetour: false,
        detourMeters: undefined,
        detourKm: undefined,
        detourMinutes: undefined,
        score: undefined,
      }));

      return res.json({
        baseline: null,
        error: 'Baseline route could not be calculated',
        rankedCandidates: unrankedCandidates,
        bestCandidate: null,
      });
    }

    const baseDistanceMeters = baselineRoute.distanceMeters;
    const baseDurationSeconds = parseInt(baselineRoute?.duration?.replace('s', '') || '0', 10);

    // Step B: Evaluate candidates
    const candidatesToScore = candidates.slice(0, 6);
    const evaluatedCandidates = await Promise.all(
      candidatesToScore.map(async (candidate: any) => {
        try {
          const candWp = candidate.location
            ? { location: { latLng: { latitude: candidate.location.latitude, longitude: candidate.location.longitude } } }
            : candidate.placeId
            ? { placeId: candidate.placeId }
            : { address: candidate.formattedAddress || candidate.displayName?.text };

          // Determine insertion index based on anchor:
          let insertIdx = currentStops.length;
          if (anchorType === 'origin') {
            insertIdx = 0;
          } else if (anchorType === 'destination') {
            insertIdx = currentStops.length;
          } else if (typeof suggestedInsertIndex === 'number' && suggestedInsertIndex >= 0) {
            insertIdx = Math.min(suggestedInsertIndex, currentStops.length);
          }

          const newIntermediates = [...currentStops.map((s: any) => formatWaypointForRoute(s))];
          newIntermediates.splice(insertIdx, 0, candWp);

          const candRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': getGoogleMapsApiKey(),
              'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            },
            body: JSON.stringify({
              origin: formatWaypointForRoute(origin),
              destination: formatWaypointForRoute(destination),
              intermediates: newIntermediates,
              travelMode: mode,
            }),
          });

          const candData = await candRes.json();
          const candRoute = candData.routes?.[0];

          // A failed candidate route calculation must not be treated as if it had the baseline distance or duration!
          if (!candRes.ok || !candRoute || typeof candRoute.distanceMeters !== 'number') {
            return {
              ...candidate,
              detourUnavailable: true,
              isRankedByDetour: false,
              detourMeters: undefined,
              detourKm: undefined,
              detourMinutes: undefined,
              score: undefined,
              bestInsertIndex: insertIdx,
            };
          }

          const candDistanceMeters = candRoute.distanceMeters;
          const candDurationSeconds = parseInt(candRoute.duration?.replace('s', '') || `${baseDurationSeconds}`, 10);

          const detourMeters = Math.max(0, candDistanceMeters - baseDistanceMeters);
          const detourSeconds = Math.max(0, candDurationSeconds - baseDurationSeconds);

          // Calculate proximity penalty to anchor
          let anchorProximityPenalty = 0;
          if (anchorType === 'origin' && origin.latLng && candidate.location) {
            const dLat = (candidate.location.latitude - origin.latLng.lat) * 111000;
            const dLng = (candidate.location.longitude - origin.latLng.lng) * 111000 * Math.cos(origin.latLng.lat * (Math.PI / 180));
            anchorProximityPenalty = Math.sqrt(dLat * dLat + dLng * dLng) * 0.8;
          }

          return {
            ...candidate,
            detourMeters,
            detourKm: (detourMeters / 1000).toFixed(1),
            detourMinutes: Math.round(detourSeconds / 60),
            totalDurationMinutes: Math.round(candDurationSeconds / 60),
            score: detourMeters + detourSeconds * 5 + anchorProximityPenalty,
            bestInsertIndex: insertIdx,
            detourUnavailable: false,
            isRankedByDetour: true,
          };
        } catch {
          // Explicit unavailable state - NEVER fabricate 999999 / 99 / 9999999 metrics!
          return {
            ...candidate,
            detourUnavailable: true,
            isRankedByDetour: false,
            detourMeters: undefined,
            detourKm: undefined,
            detourMinutes: undefined,
            score: undefined,
            bestInsertIndex: currentStops.length,
          };
        }
      })
    );

    // Only sort successfully scored candidates; unranked candidates remain at end without false ranking
    const successfullyScored = evaluatedCandidates.filter((c) => !c.detourUnavailable && typeof c.score === 'number');
    const unrankedCandidates = evaluatedCandidates.filter((c) => c.detourUnavailable || typeof c.score !== 'number');

    successfullyScored.sort((a, b) => a.score! - b.score!);

    const allCandidates = [...successfullyScored, ...unrankedCandidates];
    const bestCandidate = successfullyScored.length > 0 ? successfullyScored[0] : null;

    return res.json({
      baseline: {
        distanceMeters: baseDistanceMeters,
        durationSeconds: baseDurationSeconds,
      },
      rankedCandidates: allCandidates,
      bestCandidate,
    });
  } catch (error: any) {
    console.warn('Detour ranking error:', error?.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Detour ranking failed' });
  }
});

// 6. Gnani & Speech Provider Configuration Status
apiRouter.get('/speech/config', (_req: Request, res: Response) => {
  const gnani = getGnaniStatus();
  const authoritative = getAuthoritativeConfig();

  res.json({
    ok: true,
    gnaniAvailable: gnani.configured,
    sttAvailable: gnani.configured,
    ttsAvailable: gnani.configured,
    defaultModel: gnani.defaultModel,
    defaultVoice: authoritative.gnaniVoice || gnani.defaultVoice,
    supportedLanguages: gnani.supportedLanguages,
    languages: gnani.languages,
    authStatus: gnani.configured ? 'authenticated' : 'not_configured',
    authMessage: gnani.configured
      ? 'Gnani AI Speech service is authenticated and ready'
      : 'GNANI_API_KEY is not configured. Browser speech fallback will be used.',
    persisted: authoritative.hasPersistentFile,
    source: authoritative.source,
  });
});

apiRouter.get('/gnani/status', (_req: Request, res: Response) => {
  res.json(getGnaniStatus());
});

// 7. Non-secret Speech Preference Sync (Credentials managed exclusively via server environment)
apiRouter.post('/speech/settings', (req: Request, res: Response) => {
  const { voiceId, model } = req.body;
  if (voiceId && typeof voiceId === 'string') {
    process.env.GNANI_TTS_VOICE = voiceId.trim();
  }
  if (model && typeof model === 'string') {
    process.env.GNANI_TTS_MODEL = model.trim();
  }

  const updatedStatus = getGnaniStatus();
  res.json({
    success: true,
    message: 'Speech preferences synced successfully',
    status: {
      authenticated: updatedStatus.configured,
      sttAvailable: updatedStatus.configured,
      ttsAvailable: updatedStatus.configured,
      voiceId: updatedStatus.defaultVoice,
      model: updatedStatus.defaultModel,
      status: updatedStatus.configured ? 'authenticated' : 'not_configured',
      message: updatedStatus.configured
        ? 'Gnani AI Speech service is authenticated via server environment.'
        : 'GNANI_API_KEY is not set in server environment. Native browser speech active.',
    },
  });
});

// 8. Test Voice Synthesis
apiRouter.post('/speech/test-voice', async (req: Request, res: Response) => {
  return handleGnaniTtsRest(req, res);
});

apiRouter.post('/gnani/tts', async (req: Request, res: Response) => {
  return handleGnaniTtsRest(req, res);
});


