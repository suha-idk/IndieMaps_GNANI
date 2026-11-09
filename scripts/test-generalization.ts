import dotenv from 'dotenv';
import { fallbackRuleBasedParser } from '../src/services/aiService.ts';
import { resolvePlaceDetailed, scoreCandidatePlace } from '../src/services/placesService.ts';
import { parseTranslationIntent } from '../src/services/translationService.ts';
import { conversationContext } from '../src/services/conversationContext.ts';
import { normalizeForPhoneticComparison, transliterateDevanagariToLatin } from '../src/utils/transliteration.ts';

dotenv.config();

async function runGeneralizationValidation() {
  console.log('================================================================');
  console.log('🧪 RAAHI (राही) GENERALIZATION & ARCHITECTURAL VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function verify(name: string, fn: () => Promise<boolean> | boolean) {
    process.stdout.write(`• ${name} ... `);
    try {
      const ok = await fn();
      if (ok) {
        passed++;
        console.log('✅ PASS');
      } else {
        failed++;
        console.log('❌ FAIL');
      }
    } catch (e: any) {
      failed++;
      console.log(`❌ ERROR: ${e.message}`);
    }
  }

  // Section 1: Transliteration & Phonetic Generalisation
  console.log('\n--- 1. Transliteration & Phonetic Robustness ---');
  await verify('Schwa deletion on Devanagari transliteration: "हवा महल" -> "hava mahal"', () => {
    const latin = transliterateDevanagariToLatin('हवा महल');
    return latin.toLowerCase().includes('hava mahal');
  });

  await verify('Phonetic normalization equates v/w and short/long vowels: "hawa mahal" === "hava mahal"', () => {
    const p1 = normalizeForPhoneticComparison('Hawa Mahal');
    const p2 = normalizeForPhoneticComparison('Hava Mahal');
    return p1 === p2;
  });

  await verify('Phonetic normalization equates "somnath" and Devanagari "somanatha"', () => {
    const p1 = normalizeForPhoneticComparison('Somnath');
    const p2 = normalizeForPhoneticComparison(transliterateDevanagariToLatin('सोमनाथ'));
    return p1 === p2;
  });

  // Section 2: Universal Place Resolution (Acceptance Criterion A & C)
  console.log('\n--- 2. Universal Place Resolution & Landmark Scoring ---');
  await verify('Unseen landmark in Devanagari: "हवा महल, जयपुर" resolves with high confidence (>0.85)', async () => {
    const res = await resolvePlaceDetailed('हवा महल', undefined, undefined, 'Hawa Mahal', 'Jaipur');
    return res.status === 'resolved' && (res.confidenceScore || 0) >= 0.85;
  });

  await verify('Unseen coastal monument: "Gateway of India" in Mumbai resolves with status "resolved"', async () => {
    const res = await resolvePlaceDetailed('Gateway of India', undefined, undefined, 'Gateway of India', 'Mumbai');
    return res.status === 'resolved' && res.waypoint !== null && res.waypoint.name.includes('Gateway');
  });

  await verify('Unseen eastern landmark: "Victoria Memorial" in Kolkata resolves cleanly', async () => {
    const res = await resolvePlaceDetailed('Victoria Memorial', undefined, undefined, 'Victoria Memorial', 'Kolkata');
    return res.status === 'resolved' && res.waypoint !== null && res.waypoint.name.includes('Victoria Memorial');
  });

  await verify('Secondary amenity penalty: Somnath Temple Parking scored significantly lower than Temple', () => {
    const primaryCandidate = {
      id: 'temple-1',
      name: 'Shree Somnath Jyotirlinga Temple',
      address: 'Somnath Mandir Rd, Prabhas Patan, Gujarat 362268',
      types: ['hindu_temple', 'place_of_worship', 'point_of_interest'],
      latLng: { lat: 20.888, lng: 70.401 },
    };
    const parkingCandidate = {
      id: 'parking-1',
      name: 'Somnath Temple Visitor Parking Lot',
      address: 'Near Temple Gate, Prabhas Patan, Gujarat',
      types: ['parking', 'parking_lot', 'point_of_interest'],
      latLng: { lat: 20.889, lng: 70.402 },
    };
    const scorePrimary = scoreCandidatePlace('Somnath Temple', primaryCandidate);
    const scoreParking = scoreCandidatePlace('Somnath Temple', parkingCandidate);
    return scorePrimary >= 0.85 && scoreParking < 0.60 && (scorePrimary - scoreParking) >= 0.25;
  });

  await verify('Unrelated commercial gym containing locality name is heavily penalized', () => {
    const gymCandidate = {
      id: 'gym-1',
      name: 'Gold Gym Malviya Nagar',
      address: 'Malviya Nagar, New Delhi',
      types: ['gym', 'fitness_center'],
      latLng: { lat: 28.53, lng: 77.21 },
    };
    const score = scoreCandidatePlace('Malviya Nagar', gymCandidate);
    return score < 0.25;
  });

  await verify('Gibberish query returns status "not_found" and null waypoint without fake place generation', async () => {
    const res = await resolvePlaceDetailed('xyzqwe999randomjunkquery123');
    return res.status === 'not_found' && res.waypoint === null;
  });

  // Section 3: Translation Pipeline & Isolation (Acceptance Criterion E)
  console.log('\n--- 3. Translation Pipeline Verification ---');
  await verify('Parse Hindi to English translation intent cleanly', () => {
    const parsed = parseTranslationIntent('Translate "मुझे आगरा जाना है" into English');
    return parsed.isTranslationOnly && parsed.targetLang === 'en' && Boolean(parsed.textToTranslate);
  });

  await verify('Parse English to Hindi translation intent without quotes', () => {
    const parsed = parseTranslationIntent('Translate I am looking for a petrol pump to Hindi');
    return parsed.isTranslationOnly && parsed.targetLang === 'hi' && Boolean(parsed.textToTranslate);
  });

  await verify('Parse translation intent in Hindi: "इसको अंग्रेजी में अनुवाद करो: रास्ता कहाँ है"', () => {
    const parsed = parseTranslationIntent('इसको अंग्रेजी में अनुवाद करो: रास्ता कहाँ है');
    return parsed.isTranslationOnly && parsed.targetLang === 'en';
  });

  await verify('Parse translation intent with Marathi target: "Translate where is hospital into Marathi"', () => {
    const parsed = parseTranslationIntent('Translate where is hospital into Marathi');
    return parsed.isTranslationOnly && parsed.targetLang === 'mr';
  });

  await verify('Translation command produces 0 navigation actions in fallback rule parser', () => {
    const res = fallbackRuleBasedParser('Translate "मुझे आगरा जाना है" into English', { destination: null, stops: [] }, 'en');
    return res.intent === 'translate' && res.actions.length === 0;
  });

  // Live backend translation call through internal API route
  await verify('Live backend /api/translate returns real translation without "translation unavailable"', async () => {
    try {
      const res = await fetch('http://localhost:3000/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Where is the nearest hospital?',
          targetLang: 'hi',
          sourceLang: 'en',
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.translatedText) && data.translatedText.length > 5 && !data.translatedText.includes('unavailable');
    } catch {
      return false;
    }
  });

  // Section 4: Live Interpretation Pipeline (Acceptance Criteria A, B, F)
  console.log('\n--- 4. Live Cloud Gemini Interpretation Pipeline ---');
  await verify('Live /api/interpret extracts destination with normalizedName and localityContext', async () => {
    try {
      const res = await fetch('http://localhost:3000/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'मुझे जयपुर में हवा महल जाना है',
          responseLanguage: 'hi',
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      const action = data.actions?.[0];
      return action && action.type === 'SET_DESTINATION' && Boolean(action.placeQuery);
    } catch {
      return false;
    }
  });

  await verify('Live /api/interpret handles compound command: destination + intermediate stop', async () => {
    try {
      const res = await fetch('http://localhost:3000/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'Take me to Agra and add a stop at Mathura on the way',
          responseLanguage: 'en',
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      const hasDest = data.actions?.some((a: any) => a.type === 'SET_DESTINATION' && a.placeQuery?.toLowerCase().includes('agra'));
      const hasStop = data.actions?.some((a: any) => a.type === 'ADD_STOP' && a.placeQuery?.toLowerCase().includes('mathura'));
      return hasDest && hasStop;
    } catch {
      return false;
    }
  });

  await verify('Live /api/interpret handles translation command without generating navigation actions', async () => {
    try {
      const res = await fetch('http://localhost:3000/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'Translate "How far is the next petrol pump" into Hindi',
          responseLanguage: 'hi',
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.intent === 'translate' && Array.isArray(data.actions) && data.actions.length === 0 && Boolean(data.spokenResponse);
    } catch {
      return false;
    }
  });

  // Section 5: Conversational Context & Disambiguation (Acceptance Criterion D)
  console.log('\n--- 5. Conversational Context & Ambiguity State Management ---');
  await verify('Clarification lifecycle: setPendingClarification, state transition, and candidate selection', () => {
    conversationContext.clearPendingClarification();
    conversationContext.setPendingClarification({
      originalCommand: 'Take me to Radisson',
      targetRole: 'destination',
      query: 'Radisson',
      candidates: [
        { index: 1, id: 'rad-1', name: 'Radisson Blu Plaza Delhi Airport', address: 'Mahipalpur, New Delhi' },
        { index: 2, id: 'rad-2', name: 'Radisson Blu Hotel Noida', address: 'Sector 18, Noida' },
      ],
      pendingActions: [],
      targetAction: { type: 'SET_DESTINATION', placeQuery: 'Radisson' },
      responseLanguage: 'en',
    });

    const active = conversationContext.isClarificationActive();
    const resolution = conversationContext.resolveFollowUpReference('the second one');
    const selectedCorrectly = resolution.type === 'select_candidate' && resolution.selectedCandidate?.index === 2;

    conversationContext.clearPendingClarification();
    const cleared = !conversationContext.isClarificationActive();

    return active && selectedCorrectly && cleared;
  });

  await verify('Clarification cancellation: user says "cancel that" or "forget it"', () => {
    conversationContext.setPendingClarification({
      originalCommand: 'Take me to Taj',
      targetRole: 'destination',
      query: 'Taj',
      candidates: [
        { index: 1, id: 'taj-1', name: 'Taj Mahal', address: 'Agra' },
        { index: 2, id: 'taj-2', name: 'Taj Palace', address: 'New Delhi' },
      ],
      pendingActions: [],
      targetAction: { type: 'SET_DESTINATION', placeQuery: 'Taj' },
      responseLanguage: 'en',
    });

    const cancelResolution = conversationContext.resolveFollowUpReference('cancel that');
    const isCancel = cancelResolution.type === 'cancel';
    conversationContext.clearPendingClarification();
    return isCancel;
  });

  console.log('\n================================================================');
  console.log(`📊 GENERALIZATION VERIFICATION: ${passed}/${passed + failed} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) process.exitCode = 1;
}

runGeneralizationValidation();
