import { LatLng, Waypoint, PlaceResolutionResult } from '../types/navigation';
import {
  generatePlaceSearchVariants,
  transliterateDevanagariToLatin,
  normalizeForPhoneticComparison,
  stripDiacritics,
  KNOWN_PLACE_DICTIONARY,
} from '../utils/transliteration';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  latLng?: LatLng;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  category?: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging' | 'custom';
  types?: string[];
  primaryType?: string;
}

// Authoritative scoring thresholds & geographic mismatch limits
export const GEOGRAPHIC_MISMATCH_SCORE_CAP = 0.30;
export const CANONICAL_SUFFIX_MATCH_SCORE = 0.96;
export const AUTOMATIC_SELECTION_CONFIDENCE_THRESHOLD = 0.60;
export const AMBIGUITY_CONFIDENCE_THRESHOLD = 0.75;

function getEndpointUrl(path: string): string {
  if (typeof window !== 'undefined') return path;
  return `http://127.0.0.1:3000${path}`;
}

let testModeEnabled = false;
let testModeInjectedCandidates: PlaceResult[] | null = null;

/**
 * Explicit test mode configuration.
 * Guarded against production use: production builds NEVER enable test fixtures.
 */
export function configurePlacesTestMode(enabled: boolean, customCandidates?: PlaceResult[] | null): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' && !process.env?.VITEST && !process.env?.TSX_TEST) {
    console.warn('[PlacesService] Test mode cannot be enabled in production.');
    testModeEnabled = false;
    testModeInjectedCandidates = null;
    return;
  }
  testModeEnabled = enabled;
  testModeInjectedCandidates = customCandidates || null;
}

export function isPlacesTestMode(): boolean {
  return testModeEnabled;
}

export async function searchPlaces(
  query: string,
  locationBias?: { center: LatLng; radius?: number }
): Promise<PlaceResult[]> {
  // Explicit Test Mode: ONLY active during automated testing
  if (testModeEnabled) {
    if (testModeInjectedCandidates) {
      const qLower = query.toLowerCase();
      const filtered = testModeInjectedCandidates.filter((c) => {
        const nameLower = (c.name || '').toLowerCase();
        const addrLower = (c.address || '').toLowerCase();
        return nameLower.includes(qLower) || addrLower.includes(qLower) || qLower.includes(nameLower);
      });
      return filtered.length > 0 ? filtered : testModeInjectedCandidates;
    }
    const { getTestPlaceCandidates } = await import('./testFixtures');
    return getTestPlaceCandidates(query);
  }

  // Production Mode: Strict Google Places API search only. No hardcoded or fabricated substitutes.
  try {
    const res = await fetch(getEndpointUrl('/api/places/search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textQuery: query,
        locationBias,
        maxResultCount: 8,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.places || data.places.length === 0) {
      return [];
    }

    return data.places.map((p: any) => ({
      id: p.id,
      name: p.displayName?.text || query,
      address: p.formattedAddress || '',
      latLng: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      openNow: p.currentOpeningHours?.openNow,
      category: mapPlaceCategory(p.types || []),
      types: p.types || [],
      primaryType: p.primaryType || '',
    }));
  } catch (err: any) {
    console.warn('[PlacesService] Google Places search error:', err?.message || err);
    return [];
  }
}


export const TABLE_A_CATEGORY_TYPES: Record<string, string[]> = {
  cafe: ['cafe', 'coffee_shop'],
  coffee: ['cafe', 'coffee_shop'],
  tea: ['tea_house', 'cafe', 'coffee_shop'],
  chai: ['tea_house', 'cafe', 'coffee_shop'],
  tea_stall: ['tea_house', 'cafe', 'coffee_shop'],
  tea_house: ['tea_house', 'cafe', 'coffee_shop'],
  restaurant: ['restaurant', 'meal_takeaway'],
  fast_food: ['fast_food_restaurant', 'meal_takeaway', 'restaurant'],
  snacks: ['fast_food_restaurant', 'cafe', 'restaurant', 'meal_takeaway'],
  bakery: ['bakery', 'cafe'],
  pharmacy: ['pharmacy', 'drugstore'],
  chemist: ['pharmacy', 'drugstore'],
  gas_station: ['gas_station'],
  cng_station: ['gas_station'],
  hospital: ['hospital', 'doctor', 'medical_clinic'],
  parking: ['parking'],
  ev_charging: ['electric_vehicle_charging_station'],
};

export async function searchNearbyPlaces(
  center: LatLng,
  category: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging' | 'cafe' | 'fast_food' | 'tea_stall',
  radius: number = 8000,
  customIncludedTypes?: string[],
  rankPreference?: 'DISTANCE' | 'POPULARITY'
): Promise<PlaceResult[]> {
  if (testModeEnabled) {
    if (testModeInjectedCandidates && testModeInjectedCandidates.length > 0) {
      const filtered = testModeInjectedCandidates.filter(
        (c) => c.category === category || (c.types && c.types.some((t) => (customIncludedTypes || [category]).includes(t)))
      );
      return filtered.length > 0 ? filtered : testModeInjectedCandidates;
    }
    const { getTestPlaceCandidates } = await import('./testFixtures');
    const fixs = getTestPlaceCandidates(category);
    if (fixs.length > 0) return fixs;
  }

  try {
    const includedTypes = customIncludedTypes || TABLE_A_CATEGORY_TYPES[category] || ['restaurant'];

    const res = await fetch(getEndpointUrl('/api/places/nearby'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        center,
        includedTypes,
        radius,
        maxResultCount: 10,
        rankPreference,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.places) {
      return [];
    }

    return data.places.map((p: any) => ({
      id: p.id,
      name: p.displayName?.text || 'Nearby Place',
      address: p.formattedAddress || '',
      latLng: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      openNow: p.currentOpeningHours?.openNow,
      category: mapPlaceCategory(p.types || []),
      types: p.types || [],
      primaryType: p.primaryType || '',
    }));
  } catch (err: any) {
    console.warn('searchNearbyPlaces warning:', err?.message || err);
    return [];
  }
}

export interface LandmarkNearbySearchOptions {
  landmark: Waypoint;
  subject: string;
  category?: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging' | 'cafe' | 'fast_food' | 'tea_stall';
  minRating?: number;
  radiusMeters?: number;
}

export interface LandmarkSearchResultItem extends PlaceResult {
  straightLineDistanceKm?: string;
  distKm?: number;
}

export function haversineDistanceKm(p1: LatLng, p2: LatLng): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Searches for genuine businesses near a verified landmark.
 * Enforces strict Google Places API (New) Table A category types, strict geographic boundary validation,
 * zero fabricated results, and transparent straight-line distance labeling.
 */
export async function searchPlacesNearLandmark(
  options: LandmarkNearbySearchOptions
): Promise<LandmarkSearchResultItem[]> {
  const { landmark, subject, category, minRating, radiusMeters = 8000 } = options;
  if (!landmark.latLng) return [];

  const cleanSubj = subject
    .replace(/^(?:good|famous|achha|achhe|best|some|any|a|an|koi|koyi|ek)\s+/i, '')
    .trim();

  // 1. Resolve Table A category types
  const lowerSubj = cleanSubj.toLowerCase();
  let resolvedCategoryTypes: string[] | null = null;
  let resolvedCategory = category;

  if (lowerSubj.includes('cafe') || lowerSubj.includes('coffee')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.cafe;
    resolvedCategory = 'restaurant';
  } else if (lowerSubj.includes('chai') || lowerSubj.includes('tea') || lowerSubj.includes('tea stall')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.tea;
    resolvedCategory = 'restaurant';
  } else if (lowerSubj.includes('snack') || lowerSubj.includes('pakod') || lowerSubj.includes('fast food')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.snacks;
    resolvedCategory = 'restaurant';
  } else if (lowerSubj.includes('pharmacy') || lowerSubj.includes('medical') || lowerSubj.includes('chemist')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.pharmacy;
    resolvedCategory = 'pharmacy';
  } else if (lowerSubj.includes('petrol') || lowerSubj.includes('fuel') || lowerSubj.includes('gas station')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.gas_station;
    resolvedCategory = 'gas_station';
  } else if (lowerSubj.includes('hospital') || lowerSubj.includes('doctor') || lowerSubj.includes('clinic')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.hospital;
    resolvedCategory = 'hospital';
  } else if (category && TABLE_A_CATEGORY_TYPES[category]) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES[category];
  } else if (lowerSubj.includes('restaurant') || lowerSubj.includes('dhaba') || lowerSubj.includes('food')) {
    resolvedCategoryTypes = TABLE_A_CATEGORY_TYPES.restaurant;
    resolvedCategory = 'restaurant';
  }

  // 2. Fetch candidates: Prefer Nearby Search (New) with circle restriction for categories
  let rawCandidates: PlaceResult[] = [];

  if (resolvedCategoryTypes && resolvedCategoryTypes.length > 0) {
    rawCandidates = await searchNearbyPlaces(
      landmark.latLng,
      (resolvedCategory as any) || 'restaurant',
      radiusMeters,
      resolvedCategoryTypes,
      'DISTANCE'
    );
  }

  // If nearby search returned empty or if this is a specific business name query (e.g. "Haldiram's near Bangla Sahib")
  if (rawCandidates.length === 0) {
    const searchQuery = `${cleanSubj} near ${landmark.name}`;
    rawCandidates = await searchPlaces(searchQuery, {
      center: landmark.latLng,
      radius: radiusMeters,
    });
  }

  // 3. MANDATORY STRICT GEOGRAPHIC VALIDATION
  // Rejects candidates with missing coordinates, candidates outside search radius, and foreign mismatches (e.g. Singapore)
  const maxAllowedDistanceKm = (radiusMeters / 1000) * 1.15; // 15% boundary margin
  const landmarkAddrLower = (landmark.address || '').toLowerCase();
  const isIndianLandmark = /india|delhi|jaipur|mumbai|uttar pradesh|rajasthan|gujarat|haryana|bengaluru/i.test(landmarkAddrLower);

  const validatedCandidates: LandmarkSearchResultItem[] = [];

  for (const cand of rawCandidates) {
    // A candidate without coordinates is strictly rejected
    if (!cand.latLng || typeof cand.latLng.lat !== 'number' || typeof cand.latLng.lng !== 'number') {
      continue;
    }

    // Precise distance from verified landmark coordinates
    const distKm = haversineDistanceKm(landmark.latLng, cand.latLng);

    // Reject candidates outside the configured search radius (guarantees Singapore / unrelated cities are eliminated)
    if (distKm > maxAllowedDistanceKm) {
      continue;
    }

    // Geographic metadata verification: reject foreign city conflicts (e.g. Singapore for a Delhi search)
    const candAddr = (cand.address || '').toLowerCase();
    if (isIndianLandmark && /singapore|malaysia|thailand|indonesia|united kingdom|london|united states|new york/i.test(candAddr)) {
      continue;
    }

    validatedCandidates.push({
      ...cand,
      distKm,
      straightLineDistanceKm: `${distKm.toFixed(1)} km (approx. straight-line)`,
    });
  }

  // 4. Rating filter & Distance sorting
  let filtered = validatedCandidates;
  if (typeof minRating === 'number') {
    filtered = filtered.filter((c) => typeof c.rating === 'number' && c.rating >= minRating);
  }

  // Sort by straight-line distance from landmark
  filtered.sort((a, b) => (a.distKm || 0) - (b.distKm || 0));

  return filtered;
}

export interface ExtractedPlaceContext {
  cleanPlaceName: string;
  localityContext?: string;
  categoryHint?: string;
  originalQuery: string;
  isNearMe?: boolean;
}

/**
 * Separates place identity from geographic context and descriptive wording.
 * e.g. "Laxmi Narayan Mandir in Malviya Nagar" -> name: "Laxmi Narayan Mandir", locality: "Malviya Nagar"
 * e.g. "मुझे मालवीय नगर के लक्ष्मी नारायण मंदिर ले चलो" -> name: "लक्ष्मी नारायण मंदिर", locality: "मालवीय नगर"
 */
export function extractPlaceContext(rawQuery: string): ExtractedPlaceContext {
  const original = (rawQuery || '').trim();
  let clean = original;
  let prev = '';

  // Clean conversational prefixes & suffixes iteratively
  while (prev !== clean) {
    prev = clean;
    clean = clean
      .replace(/^(?:take\s+me\s+to|navigate\s+to|drive\s+to|go\s+to|set\s+destination\s+to|find|search\s+(?:for)?|look\s+(?:for)?|show\s+me|chalo|mujhe|humko|kripya|please|mala|aamhi|bhai|dhoondo|dhundo|batao|मुझे|हमको|कृपया|मला|बताओ|ढूंढो)\s+/gi, '')
      .replace(/\s+(?:le\s+chalo|le\s+jao|jaana\s+hai|chalo|chalein|jayache\s+aahe|lagu\s+karo|pahije|karo|chuno|banao|ले\s+चलो|ले\s+जाओ|जाना\s+है|चलो|पाहिजे)$/gi, '')
      .trim();
  }

  let localityContext: string | undefined = undefined;
  let categoryHint: string | undefined = undefined;

  // Infer category hint
  if (/mandir|temple|masjid|gurudwara|church|मंदिर/i.test(clean)) categoryHint = 'place_of_worship';
  else if (/school|vidyalaya|dps|college|university|institute|स्कूल/i.test(clean)) categoryHint = 'school';
  else if (/hospital|clinic|aiims|dispensary|अस्पताल/i.test(clean)) categoryHint = 'hospital';
  else if (/hotel|resort|radisson|marriott|hyatt|taj|oberoi|होटल/i.test(clean)) categoryHint = 'lodging';
  else if (/museum|sangrahalaya|म्यूजियम|संग्रहालय/i.test(clean)) categoryHint = 'museum';
  else if (/petrol|fuel|cng|gas\s*station|पेट्रोल/i.test(clean)) categoryHint = 'gas_station';
  else if (/restaurant|cafe|dhaba|रेस्टोरेंट|ढाबा/i.test(clean)) categoryHint = 'restaurant';

  // Extract locality or geographic context
  // 1. Regional prefix: "मालवीय नगर में लक्ष्मी नारायण मंदिर", "मालवीय नगर के लक्ष्मी नारायण मंदिर"
  const regionalLocalityPrefixMatch = clean.match(/^([\u0900-\u097F\w\s]+?)\s+(?:के|में|का|की|तील|पाशी|मधील)\s+([\u0900-\u097F\w\s]+)$/i);
  // 2. Regional suffix: "लक्ष्मी नारायण मंदिर मालवीय नगर में"
  const regionalLocalitySuffixMatch = clean.match(/^([\u0900-\u097F\w\s]+?)\s+([\u0900-\u097F\w\s]+?)\s+(?:में|तील|मधील|जवळ)$/i);
  // 3. Comma-separated: "Lakshmi Narayan Mandir, Malviya Nagar" or "Le Meridien, Jaipur"
  const commaMatch = clean.match(/^([^,]+),\s*(.+)$/i);
  // 4. English in/near/at: "Lakshmi Narayan Mandir in Malviya Nagar", "Radisson Blu near airport"
  const engLocalityMatch = clean.match(/^(.+?)\s+(?:in|near|at|around|close\s+to)\s+(.+)$/i);

  if (regionalLocalityPrefixMatch) {
    localityContext = regionalLocalityPrefixMatch[1].trim();
    clean = regionalLocalityPrefixMatch[2].trim();
  } else if (regionalLocalitySuffixMatch) {
    clean = regionalLocalitySuffixMatch[1].trim();
    localityContext = regionalLocalitySuffixMatch[2].trim();
  } else if (engLocalityMatch) {
    clean = engLocalityMatch[1].trim();
    localityContext = engLocalityMatch[2].trim();
  } else if (commaMatch) {
    clean = commaMatch[1].trim();
    localityContext = commaMatch[2].trim();
  }

  // 5. Trailing city/region detection (e.g. "Le Méridien Jaipur", "Radisson Blu Delhi", "Radisson Jodhpur")
  if (!localityContext) {
    const knownCitiesPattern =
      /\s+(jaipur|delhi|new\s+delhi|gurgaon|gurugram|noida|mumbai|pune|bengaluru|bangalore|kolkata|hyderabad|chennai|ahmedabad|agra|mathura|jodhpur|lucknow|chandigarh|amritsar|dwarka|malviya\s+nagar|paschim\s+vihar|saket)$/i;
    const cityMatch = clean.match(knownCitiesPattern);
    if (cityMatch) {
      localityContext = cityMatch[1].trim();
      clean = clean.slice(0, -cityMatch[0].length).trim();
    }
  }

  // 6. Leading city detection (e.g. "Mathura Brijwasi", "Jaipur Rawat", "Delhi Haldiram")
  if (!localityContext) {
    const leadingCitiesPattern =
      /^(jaipur|delhi|new\s+delhi|gurgaon|gurugram|noida|mumbai|pune|bengaluru|bangalore|kolkata|hyderabad|chennai|ahmedabad|agra|mathura|jodhpur|lucknow|chandigarh|amritsar)\s+(.+)$/i;
    const leadMatch = clean.match(leadingCitiesPattern);
    if (leadMatch) {
      localityContext = leadMatch[1].trim();
      clean = leadMatch[2].trim();
    }
  }

  let isNearMe = false;
  if (localityContext && /^(?:me|here|my\s+location|current\s+location|paas|pass\s+mein|aas\s+paas|yahan|ikada|yethe)$/i.test(localityContext)) {
    localityContext = undefined;
    isNearMe = true;
  } else if (/\b(?:near\s+me|around\s+here|close\s+by|pass\s+mein|aas\s+paas|mere\s+paas)\b/i.test(clean)) {
    clean = clean.replace(/\b(?:near\s+me|around\s+here|close\s+by|pass\s+mein|aas\s+paas|mere\s+paas)\b/gi, '').trim();
    isNearMe = true;
  }

  return {
    cleanPlaceName: clean,
    localityContext,
    categoryHint,
    originalQuery: original,
    isNearMe,
  };
}

export type LocalityMatchStatus = 'matched' | 'conflict' | 'unverified';

/**
 * Distinguishes verified locality matches from explicit conflicts and unverified incomplete metadata.
 */
export function evaluateLocalityMatch(
  effectiveLocality: string | undefined,
  candidateName: string,
  candidateAddress: string | undefined
): LocalityMatchStatus {
  if (!effectiveLocality || effectiveLocality.trim().length <= 1) {
    return 'matched';
  }

  const locLatin = transliterateDevanagariToLatin(effectiveLocality) || '';
  const cleanLoc = stripDiacritics(`${effectiveLocality} ${locLatin}`).toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ');
  const locTokens = cleanLoc.split(/\s+/).filter((t) => t.length > 2);

  const unaccentedCandName = stripDiacritics(candidateName).toLowerCase();
  const unaccentedCandAddr = stripDiacritics(candidateAddress || '').toLowerCase();

  const genericLocalityTerms = new Set([
    'nagar', 'road', 'marg', 'colony', 'street', 'enclave', 'sector', 'phase',
    'block', 'puram', 'ward', 'city', 'area', 'town', 'village', 'gali', 'vihar',
    'circle', 'chowk', 'bazaar', 'market'
  ]);
  const distinctiveTokens = locTokens.filter((t) => !genericLocalityTerms.has(t));

  let matchedDistinctive = 0;
  let matchedTokens = 0;
  for (const tok of locTokens) {
    const phonTok = normalizeForPhoneticComparison(tok);
    const isMatch =
      unaccentedCandAddr.includes(tok) ||
      unaccentedCandName.includes(tok) ||
      (phonTok.length > 2 && (unaccentedCandAddr.includes(phonTok) || unaccentedCandName.includes(phonTok)));

    if (isMatch) {
      matchedTokens++;
      if (distinctiveTokens.includes(tok)) {
        matchedDistinctive++;
      }
    }
  }

  const isMatched = distinctiveTokens.length > 0 ? matchedDistinctive >= 1 : matchedTokens >= 1;
  if (isMatched) {
    return 'matched';
  }

  // Check if candidate explicitly belongs to another known major region/city
  const majorRegions = [
    'delhi', 'new delhi', 'jaipur', 'mumbai', 'pune', 'bengaluru', 'bangalore', 'kolkata',
    'hyderabad', 'chennai', 'ahmedabad', 'agra', 'lucknow', 'chandigarh', 'amritsar',
    'gurugram', 'gurgaon', 'noida', 'ghaziabad', 'faridabad', 'rajasthan', 'maharashtra',
    'gujarat', 'karnataka', 'tamil nadu', 'telangana', 'punjab', 'haryana', 'uttar pradesh',
    'madhya pradesh', 'bihar', 'kerala', 'goa', 'uttarakhand', 'patna', 'bhopal', 'indore',
    'varanasi', 'dwarka', 'paschim vihar', 'saket', 'rohini', 'rk puram'
  ];

  const hasConflictingRegion = majorRegions.some((reg) => {
    if (cleanLoc.includes(reg)) return false; // not conflicting, user asked for it
    return unaccentedCandAddr.includes(reg) || unaccentedCandName.includes(reg);
  });

  if (hasConflictingRegion) {
    return 'conflict';
  }

  // If candidate has no address or an address without city metadata, it is unverified (incomplete)
  const addrClean = unaccentedCandAddr.replace(/[^a-z0-9\s]/g, ' ').trim();
  const addrTokens = addrClean.split(/\s+/).filter((t) => t.length > 2);
  if (addrTokens.length < 5 || !addrClean.includes('india')) {
    return 'unverified';
  }

  return 'conflict';
}

/**
 * Normalizes and scores place relevance to prevent selecting unrelated apartments, gyms,
 * or places in conflicting localities/cities.
 * Cross-references transliterated variants and canonical names so Devanagari and regional queries
 * match valid English-script Google Places results.
 * Strips diacritics and enforces strict locality compliance when explicit locality context is provided.
 */
export function scoreCandidatePlace(
  cleanQuery: string,
  candidate: PlaceResult,
  explicitLocalityHint?: string
): number {
  if (!candidate || !candidate.name) return 0;

  const { cleanPlaceName, localityContext: extractedLocality, categoryHint } = extractPlaceContext(cleanQuery);
  const effectiveLocality = explicitLocalityHint || extractedLocality;

  const rawVariants = generatePlaceSearchVariants(cleanPlaceName);
  if (!rawVariants.includes(cleanPlaceName)) {
    rawVariants.unshift(cleanPlaceName);
  }
  // Include full query variant as well
  if (cleanQuery !== cleanPlaceName && !rawVariants.includes(cleanQuery)) {
    rawVariants.push(cleanQuery);
  }

  let bestVariantScore = 0;

  // Evaluate candidate address against explicit locality context
  const localityStatus: LocalityMatchStatus = effectiveLocality
    ? evaluateLocalityMatch(effectiveLocality, candidate.name, candidate.address)
    : 'matched';

  const isLocalityConflict = localityStatus === 'conflict';
  const isLocalityMatched = localityStatus === 'matched';

  for (const variant of rawVariants) {
    const unaccentedQ = stripDiacritics(variant);
    const unaccentedName = stripDiacritics(candidate.name);
    const unaccentedAddr = stripDiacritics(candidate.address || '');

    const normQ = unaccentedQ.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const normName = unaccentedName.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const normAddr = unaccentedAddr.toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const types = candidate.types || [];
    const primaryType = (candidate.primaryType || '').toLowerCase();

    const expand = (str: string) =>
      str
        .replace(/\bdps\b/gi, 'delhi public school dps')
        .replace(/\brk\b/gi, 'rama krishna r k rk')
        .replace(/\biit\b/gi, 'indian institute of technology iit')
        .replace(/\bgtbit\b/gi, 'guru tegh bahadur institute of technology gtbit')
        .replace(/\baiims\b/gi, 'all india institute of medical sciences aiims');

    const expQ = expand(normQ);
    const expName = expand(normName);

    // Exact string match
    if (normName === normQ || expName === expQ) {
      if (isLocalityConflict) {
        // Disallow exact name match if candidate is in an explicitly conflicting locality
        bestVariantScore = Math.max(bestVariantScore, GEOGRAPHIC_MISMATCH_SCORE_CAP);
      } else if (localityStatus === 'unverified') {
        // Incomplete locality info: high candidate score, but subject to ambiguity verification
        bestVariantScore = Math.max(bestVariantScore, 0.78);
      } else {
        bestVariantScore = Math.max(bestVariantScore, 1.0);
        continue;
      }
    }

    // Phonetic normalization match (e.g. "hava mahal" <-> "hawa mahal", "somanath" <-> "somnath")
    const phonQ = normalizeForPhoneticComparison(expQ);
    const phonName = normalizeForPhoneticComparison(expName);
    const phonAddr = normalizeForPhoneticComparison(normAddr);

    if (phonQ && phonName && phonQ === phonName) {
      if (isLocalityConflict) {
        bestVariantScore = Math.max(bestVariantScore, GEOGRAPHIC_MISMATCH_SCORE_CAP);
      } else if (localityStatus === 'unverified') {
        bestVariantScore = Math.max(bestVariantScore, 0.78);
      } else {
        bestVariantScore = Math.max(bestVariantScore, 0.95);
        continue;
      }
    }

    const isLocalityType = types.some((t) =>
      ['sublocality', 'sublocality_level_1', 'sublocality_level_2', 'locality', 'neighborhood', 'political', 'administrative_area_level_2'].includes(t)
    );
    const isCommercialStoreOrGym = types.some((t) =>
      ['gym', 'fitness_center', 'spa', 'beauty_salon', 'hair_care', 'store', 'clothing_store', 'car_repair', 'department_store'].includes(t)
    );
    const isSchoolOrEducation = types.some((t) =>
      ['school', 'educational_institution', 'university', 'college', 'primary_school', 'secondary_school'].includes(t)
    );

    const queryMentionsCommercial = /gym|fitness|salon|spa|bakery|store|shop|repair|mall|market/i.test(normQ);
    const queryMentionsSchool = /school|dps|public school|vidyalaya|college|university|institute/i.test(expQ);

    // Locality Query Protection: (e.g. "Rajouri Garden")
    // Prefer the actual locality result over a gym or store located in that area
    if (!queryMentionsCommercial && !queryMentionsSchool) {
      if (isLocalityType && (normName.includes(normQ) || normQ.includes(normName) || (phonName.length > 3 && phonQ.includes(phonName)))) {
        bestVariantScore = Math.max(bestVariantScore, 0.98);
        continue;
      }
      if (isCommercialStoreOrGym && !normName.startsWith(normQ)) {
        bestVariantScore = Math.max(bestVariantScore, 0.20);
        continue;
      }
    }

    // School / Institution Protection: (e.g. "DPS RK Puram")
    // Do not select an apartment or shop that merely contains "RK Puram" in address
    if (queryMentionsSchool) {
      if (!isSchoolOrEducation && !expName.includes('school') && !expName.includes('institute') && !expName.includes('dps')) {
        bestVariantScore = Math.max(bestVariantScore, 0.15);
        continue;
      }
    }

    const qTokens = expQ.split(' ').filter((t) => t.length > 1);
    if (qTokens.length === 0) {
      bestVariantScore = Math.max(bestVariantScore, 0.5);
      continue;
    }

    let nameMatchCount = 0;
    for (const token of qTokens) {
      const phonTok = normalizeForPhoneticComparison(token);
      if (expName.includes(token) || (phonTok.length > 2 && phonName.includes(phonTok))) {
        nameMatchCount++;
      }
    }
    const nameScore = nameMatchCount / qTokens.length;

    // Secondary amenity detection (parking lots, ticket counters, gates)
    const isSecondaryAmenity =
      types.some((t) => ['parking', 'parking_lot'].includes(t)) ||
      (/\b(?:parking|ticket counter|gate \d|exit \d)\b/i.test(normName) && !/\b(?:parking|ticket counter|gate|exit)\b/i.test(normQ));

    // Official listing prefix / suffix match:
    // e.g. "Le Méridien Jaipur" matching "Le Méridien Jaipur Resort & Spa"
    // e.g. "Taj Mahal Hotel" matching "The Taj Mahal Palace, Mumbai"
    if (!isSecondaryAmenity && qTokens.length >= 2 && nameMatchCount === qTokens.length) {
      if (isLocalityConflict) {
        bestVariantScore = Math.max(bestVariantScore, GEOGRAPHIC_MISMATCH_SCORE_CAP);
      } else if (localityStatus === 'unverified') {
        bestVariantScore = Math.max(bestVariantScore, 0.78);
      } else {
        const isOfficialHeadListing = normName.startsWith(normQ) || expName.startsWith(normQ) || normName.startsWith('the ' + normQ);
        bestVariantScore = Math.max(bestVariantScore, isOfficialHeadListing ? CANONICAL_SUFFIX_MATCH_SCORE : 0.82);
        continue;
      }
    }

    let addrMatchCount = 0;
    for (const token of qTokens) {
      const phonTok = normalizeForPhoneticComparison(token);
      if (normAddr.includes(token) || (phonTok.length > 2 && phonAddr.includes(phonTok))) {
        addrMatchCount++;
      }
    }
    const addrScore = addrMatchCount / qTokens.length;

    // Locality context check (e.g. "Malviya Nagar" / "Prabhas Patan" / "Jaipur" matched in address)
    let localityScore = 0;
    if (effectiveLocality) {
      localityScore = isLocalityMatched ? 1.0 : (localityStatus === 'unverified' ? 0.5 : 0.0);
    }

    let finalScore = effectiveLocality
      ? nameScore * 0.65 + localityScore * 0.30 + addrScore * 0.05
      : nameScore * 0.80 + addrScore * 0.20;

    const isOfficialHeadListing = normName.startsWith(normQ) || expName.startsWith(normQ) || normName.startsWith('the ' + normQ);
    if (isOfficialHeadListing && nameMatchCount >= 1 && (nameMatchCount + addrMatchCount) >= qTokens.length && !isLocalityConflict) {
      finalScore = Math.max(finalScore, 0.90);
    }

    // Strict cap on geographic conflict
    if (isLocalityConflict) {
      finalScore = Math.min(finalScore, GEOGRAPHIC_MISMATCH_SCORE_CAP);
    } else if (localityStatus === 'unverified') {
      finalScore = Math.min(finalScore, 0.78);
    }

    // Category type compatibility bonus
    if (categoryHint) {
      if (
        (categoryHint === 'place_of_worship' && (types.includes('hindu_temple') || types.includes('place_of_worship'))) ||
        (categoryHint === 'school' && isSchoolOrEducation) ||
        (categoryHint === 'hospital' && (types.includes('hospital') || types.includes('health'))) ||
        (categoryHint === 'lodging' && (types.includes('lodging') || types.includes('hotel') || types.includes('resort_hotel'))) ||
        (categoryHint === 'gas_station' && types.includes('gas_station'))
      ) {
        finalScore += 0.10;
      }
    }

    // Secondary amenity penalty: penalize parking lots, gardens, gates if user didn't ask for them
    if (isSecondaryAmenity) {
      finalScore -= 0.35;
    }

    // Preferences: prioritize main institution campus over gates/parking
    if (queryMentionsSchool && isSchoolOrEducation) {
      finalScore += 0.15;
      if (primaryType === 'school' && !normName.includes('parking') && !normName.includes('gate')) {
        finalScore += 0.1;
      }
    }
    if (isLocalityType && normName.includes(normQ)) {
      finalScore += 0.15;
    }

    bestVariantScore = Math.max(bestVariantScore, Math.max(0, Math.min(1.0, finalScore)));
  }

  return bestVariantScore;
}

/**
 * Detailed Place Resolution returning structured resolution status,
 * candidates, confidence scores, and diagnostic info.
 */
export async function resolvePlaceDetailed(
  query: string,
  biasCenter?: LatLng,
  category?: any,
  normalizedName?: string,
  localityContextHint?: string
): Promise<PlaceResolutionResult> {
  const clean = query
    .replace(/^(?:add\s+(?:an?\s+)?(?:intermediate\s+)?stop\s+(?:at|in|near)?\s*|stop\s+(?:at|in|near)?\s*|at\s+|in\s+|near\s+|par\s+|pe\s+|ko\s+)/i, '')
    .replace(/(?:\s+as\s+(?:an?\s+)?(?:intermediate\s+)?stop|\s+as\s+a\s+stop|\s+to\s+my\s+route|\s+to\s+route|\s+in\s+route|\s+stop|\s+waala|\s+wala)$/i, '')
    .trim();

  if (!clean) {
    return {
      status: 'not_found',
      waypoint: null,
      candidates: [],
      confidenceScore: 0,
      clarificationMessage: 'No place name was provided.',
    };
  }

  const { cleanPlaceName, localityContext, isNearMe } = extractPlaceContext(clean);
  const effectiveLocality = localityContext || localityContextHint;

  // "Near me" safety handling:
  // Requires current-location context to be available and authorized.
  // If GPS / current location is unavailable, trigger clarification rather than an unsafe automatic selection.
  if (isNearMe && !biasCenter) {
    return {
      status: 'ambiguous',
      waypoint: null,
      candidates: [],
      confidenceScore: 0,
      clarificationMessage: 'Current location is unavailable. Please enable location permissions or specify a city or neighborhood.',
    };
  }

  const variants = generatePlaceSearchVariants(cleanPlaceName);
  if (normalizedName && !variants.includes(normalizedName)) {
    variants.unshift(normalizedName);
  }

  const allCandidates: PlaceResult[] = [];
  const seenIds = new Set<string>();

  // Determine query string for primary search
  // If an explicit locality is present, format as "Place, Locality" to guide Google Places
  const primarySearchQuery =
    effectiveLocality && !clean.toLowerCase().includes(effectiveLocality.toLowerCase())
      ? `${cleanPlaceName}, ${effectiveLocality}`
      : clean;

  // When an explicit locality is given, do NOT restrict search with a tight location bias
  // (the user may be in Jaipur querying a place in Malviya Nagar Delhi, or in Delhi querying Jaipur)
  const primaryBias = effectiveLocality
    ? undefined
    : (isNearMe && biasCenter ? { center: biasCenter, radius: 10000 } : (biasCenter ? { center: biasCenter, radius: 25000 } : undefined));

  // 1. Search Places API with primary query
  const primaryResults = await searchPlaces(primarySearchQuery, primaryBias);
  for (const c of primaryResults) {
    if (c.id && !seenIds.has(c.id)) {
      seenIds.add(c.id);
      allCandidates.push(c);
    }
  }

  // 2. If clean query differs from primarySearchQuery, also query clean
  if (clean !== primarySearchQuery && allCandidates.length < 4) {
    const directResults = await searchPlaces(clean, primaryBias);
    for (const c of directResults) {
      if (c.id && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        allCandidates.push(c);
      }
    }
  }

  // 3. If normalizedName is available or cleanPlaceName differs, search that as well
  const secondQuery = normalizedName || (cleanPlaceName !== clean ? cleanPlaceName : null);
  if (secondQuery && allCandidates.length < 4) {
    const fullSecondQuery = effectiveLocality ? `${secondQuery}, ${effectiveLocality}` : secondQuery;
    const secondResults = await searchPlaces(fullSecondQuery, primaryBias);
    for (const c of secondResults) {
      if (c.id && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        allCandidates.push(c);
      }
    }
  }

  // 4. Fallback to English/canonical variants if primary query yielded few results
  if (allCandidates.length < 2 && variants.length > 1) {
    for (const v of variants.slice(1, 3)) {
      if (v === clean || v === cleanPlaceName) continue;
      const variantQuery = effectiveLocality ? `${v}, ${effectiveLocality}` : v;
      const variantResults = await searchPlaces(variantQuery, primaryBias);
      for (const c of variantResults) {
        if (c.id && !seenIds.has(c.id)) {
          seenIds.add(c.id);
          allCandidates.push(c);
        }
      }
    }
  }

  // 5. Retry without location bias if biased search found nothing
  if (allCandidates.length === 0 && biasCenter && primaryBias) {
    const globalResults = await searchPlaces(clean);
    for (const c of globalResults) {
      if (c.id && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        allCandidates.push(c);
      }
    }
  }

  if (allCandidates.length === 0) {
    return {
      status: 'not_found',
      waypoint: null,
      candidates: [],
      confidenceScore: 0,
      clarificationMessage: `Could not find any location matching "${clean}".`,
    };
  }

  const scored = allCandidates
    .map((c) => ({
      candidate: c,
      score: Math.max(
        scoreCandidatePlace(clean, c, effectiveLocality),
        cleanPlaceName !== clean ? scoreCandidatePlace(cleanPlaceName, c, effectiveLocality) : 0,
        normalizedName ? scoreCandidatePlace(normalizedName, c, effectiveLocality) : 0
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const secondBest = scored[1];

  // If top candidate is below confidence threshold (0.60), do NOT create a fake waypoint!
  if (!best || best.score < 0.60 || !best.candidate.latLng) {
    console.warn(`[PlacesService] No confident match for "${clean}". Top score was: ${best?.score || 0}`);
    return {
      status: 'not_found',
      waypoint: null,
      candidates: scored.map((s) => ({ ...s.candidate, confidenceScore: s.score })),
      confidenceScore: best?.score || 0,
      clarificationMessage: `No confident match found for "${clean}". Please specify a more detailed location.`,
    };
  }

  // Ambiguity check:
  // Detect if top multiple candidates represent genuinely distinct establishments in different locations
  // Ensure secondBest is not merely a parking lot or garden of the best candidate!
  const highConfidenceCandidates = scored.filter((s) => s.score >= 0.70);
  const isSecondaryAmenity = (c: PlaceResult) =>
    (c.types || []).includes('parking') || /\b(?:parking|ticket counter|gate \d)\b/i.test(c.name.toLowerCase());

  const isAmbiguousCandidate =
    secondBest &&
    highConfidenceCandidates.length >= 2 &&
    best.score < 0.98 &&
    secondBest.score >= 0.75 &&
    best.score - secondBest.score < 0.10 &&
    !isSecondaryAmenity(secondBest.candidate) &&
    (best.candidate.name.toLowerCase() !== secondBest.candidate.name.toLowerCase() ||
      (best.candidate.address && secondBest.candidate.address && best.candidate.address !== secondBest.candidate.address));

  if (isAmbiguousCandidate) {
    const topChoices = highConfidenceCandidates.slice(0, 3).map((s, idx) => ({
      index: idx + 1,
      id: s.candidate.id || `place-${idx}`,
      name: s.candidate.name,
      address: s.candidate.address,
      latLng: s.candidate.latLng,
      category: category || s.candidate.category || 'custom',
      confidenceScore: s.score,
    }));

    return {
      status: 'ambiguous',
      waypoint: {
        id: best.candidate.id || `place-${Date.now()}`,
        placeId: best.candidate.id,
        name: best.candidate.name,
        address: best.candidate.address,
        latLng: best.candidate.latLng,
        category: category || best.candidate.category || 'custom',
      },
      candidates: topChoices,
      confidenceScore: best.score,
      clarificationMessage: `Found multiple matching locations: ${topChoices.map((c) => `${c.index}) ${c.name} (${c.address})`).join(', ')}. Which one do you mean?`,
    };
  }

  return {
    status: 'resolved',
    waypoint: {
      id: best.candidate.id || `place-${Date.now()}`,
      placeId: best.candidate.id,
      name: best.candidate.name,
      address: best.candidate.address,
      latLng: best.candidate.latLng,
      category: category || best.candidate.category || 'custom',
    },
    candidates: scored.map((s) => ({ ...s.candidate, confidenceScore: s.score })),
    confidenceScore: best.score,
  };
}

export async function resolvePlaceToWaypoint(
  query: string,
  biasCenter?: LatLng,
  category?: any,
  normalizedName?: string,
  localityContext?: string
): Promise<Waypoint | null> {
  const result = await resolvePlaceDetailed(query, biasCenter, category, normalizedName, localityContext);
  return result.waypoint;
}

function mapPlaceCategory(types: string[]): any {
  if (types.includes('gas_station')) return 'gas_station';
  if (types.includes('restaurant') || types.includes('cafe')) return 'restaurant';
  if (types.includes('hospital')) return 'hospital';
  if (types.includes('pharmacy')) return 'pharmacy';
  if (types.includes('parking')) return 'parking';
  if (types.includes('electric_vehicle_charging_station')) return 'ev_charging';
  return 'custom';
}
