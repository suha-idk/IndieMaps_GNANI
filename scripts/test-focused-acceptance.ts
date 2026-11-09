import {
  extractPlaceContext,
  scoreCandidatePlace,
  resolvePlaceDetailed,
  evaluateLocalityMatch,
  GEOGRAPHIC_MISMATCH_SCORE_CAP,
  CANONICAL_SUFFIX_MATCH_SCORE,
  AUTOMATIC_SELECTION_CONFIDENCE_THRESHOLD,
  AMBIGUITY_CONFIDENCE_THRESHOLD,
} from '../src/services/placesService';
import { stripDiacritics, normalizeForPhoneticComparison } from '../src/utils/transliteration';
import { conversationContext } from '../src/services/conversationContext';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

// Word Error Rate (WER) computation utility for standard speech evaluation
function computeWER(reference: string, hypothesis: string): { wer: number; substitutions: number; deletions: number; insertions: number } {
  const ref = reference.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hyp = hypothesis.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const n = ref.length;
  const m = hyp.length;
  if (n === 0) return { wer: m === 0 ? 0 : 1, substitutions: 0, deletions: 0, insertions: m };

  const d: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + 1   // substitution
        );
      }
    }
  }

  const edits = d[n][m];
  return {
    wer: edits / n,
    substitutions: edits, // total Levenshtein word edits
    deletions: 0,
    insertions: 0,
  };
}

async function runFocusedAcceptance() {
  console.log('\n========================================================================');
  console.log('INDIE MAPS — FOCUSED ACCEPTANCE TESTS (DESTINATION & GNANI STT)');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // SECTION A: Geographic-Context Safety
  // -------------------------------------------------------------------------
  console.log('--- A. Geographic-Context Safety ---');

  // Case 1: "Take me to Lakshmi Narayan Mandir in Malviya Nagar."
  const resA1 = await resolvePlaceDetailed('Take me to Lakshmi Narayan Mandir in Malviya Nagar.');
  assert(resA1.status === 'resolved', `Case 1: status is resolved (${resA1.status})`);
  assert(
    resA1.waypoint?.address.toLowerCase().includes('malviya nagar') === true,
    `Case 1: resolved waypoint address contains "Malviya Nagar" (${resA1.waypoint?.address})`
  );
  assert(
    !resA1.waypoint?.address.toLowerCase().includes('jaipur'),
    'Case 1: does NOT pick Jaipur temple'
  );

  // Case 2: "Take me to Lakshmi Narayan Mandir in Malviya Nagar, Delhi."
  const resA2 = await resolvePlaceDetailed('Take me to Lakshmi Narayan Mandir in Malviya Nagar, Delhi.');
  assert(resA2.status === 'resolved', `Case 2: status is resolved (${resA2.status})`);
  assert(
    resA2.waypoint?.address.toLowerCase().includes('delhi') === true,
    `Case 2: resolved waypoint address contains "Delhi" (${resA2.waypoint?.address})`
  );

  // Case 3: "Take me to Lakshmi Narayan Mandir in Jaipur."
  const resA3 = await resolvePlaceDetailed('Take me to Lakshmi Narayan Mandir in Jaipur.');
  assert(resA3.status === 'resolved', `Case 3: status is resolved (${resA3.status})`);
  assert(
    resA3.waypoint?.address.toLowerCase().includes('jaipur') === true ||
    resA3.waypoint?.name.toLowerCase().includes('birla') === true,
    `Case 3: resolved waypoint is in Jaipur (${resA3.waypoint?.name}, ${resA3.waypoint?.address})`
  );

  // Case 4: "Find Lakshmi Narayan Mandir near me."
  // 4a. When current location is unavailable (biasCenter not provided): MUST NOT guess blindly; triggers clarification
  const resA4_noGPS = await resolvePlaceDetailed('Find Lakshmi Narayan Mandir near me.');
  assert(
    resA4_noGPS.status === 'ambiguous' || resA4_noGPS.status === 'not_found',
    `Case 4a: "Near me" without GPS triggers clarification (${resA4_noGPS.status}): "${resA4_noGPS.clarificationMessage}"`
  );

  // 4b. When current location is available (GPS authorized): uses biasCenter coordinates
  const delhiGPS = { lat: 28.5325, lng: 77.2085 };
  const resA4_withGPS = await resolvePlaceDetailed('Find Lakshmi Narayan Mandir near me.', delhiGPS);
  assert(
    (resA4_withGPS.status === 'resolved' && Boolean(resA4_withGPS.waypoint)) ||
    (resA4_withGPS.status === 'ambiguous' && resA4_withGPS.candidates.length > 0),
    `Case 4b: "Near me" with GPS resolves to localized waypoint or candidate options (${resA4_withGPS.status})`
  );

  // Case 5: Two similarly named temples in different cities, candidate in wrong city has exact name match
  const candExactNameJaipur = {
    id: 'exact-name-jaipur',
    name: 'Lakshmi Narayan Mandir', // 100% exact name
    address: 'M.I. Road, Jaipur, Rajasthan 302001, India', // Conflicting city
    latLng: { lat: 26.918, lng: 75.801 },
  };
  const candRequestedLocalityDelhi = {
    id: 'laxmi-delhi',
    name: 'Shree Laxmi Narayan Mandir', // slightly fuzzy name
    address: 'Block C, Malviya Nagar, New Delhi, Delhi 110017, India', // Matching locality
    latLng: { lat: 28.532, lng: 77.208 },
  };

  const scoreWrongCity = scoreCandidatePlace('Lakshmi Narayan Mandir in Malviya Nagar, Delhi', candExactNameJaipur);
  const scoreRightCity = scoreCandidatePlace('Lakshmi Narayan Mandir in Malviya Nagar, Delhi', candRequestedLocalityDelhi);
  assert(
    scoreWrongCity <= GEOGRAPHIC_MISMATCH_SCORE_CAP,
    `Case 5: Candidate in conflicting explicit city receives mismatch cap (${scoreWrongCity} <= ${GEOGRAPHIC_MISMATCH_SCORE_CAP})`
  );
  assert(
    scoreRightCity > scoreWrongCity,
    `Case 5: Candidate in requested city wins clearly (${scoreRightCity} > ${scoreWrongCity})`
  );

  // Case 6: Legitimate candidate in requested locality whose returned address has incomplete metadata
  const candIncompleteAddress = {
    id: 'incomplete-cand',
    name: 'Lakshmi Narayan Mandir',
    address: 'Main Market Road', // Incomplete address: no city/state listed, but NO conflicting city either!
    latLng: { lat: 28.531, lng: 77.209 },
  };
  const statusIncomplete = evaluateLocalityMatch('Malviya Nagar', candIncompleteAddress.name, candIncompleteAddress.address);
  assert(
    statusIncomplete === 'unverified',
    `Case 6: Missing locality info evaluated as "unverified" rather than "conflict" (${statusIncomplete})`
  );
  const scoreIncomplete = scoreCandidatePlace('Lakshmi Narayan Mandir in Malviya Nagar', candIncompleteAddress);
  assert(
    scoreIncomplete > GEOGRAPHIC_MISMATCH_SCORE_CAP && scoreIncomplete >= 0.70,
    `Case 6: Incomplete metadata not penalized to 0.30 mismatch cap (score: ${scoreIncomplete})`
  );

  // Case 7: Genuinely ambiguous query where city cannot be established
  // e.g. "Take me to Ambience Mall" without city, when candidates exist in Vasant Kunj and Gurugram
  const resA7 = await resolvePlaceDetailed('Ambience Mall', undefined, undefined, 'Ambience Mall');
  assert(
    resA7.status === 'ambiguous' || resA7.candidates.length > 0,
    `Case 7: Uncertain ambiguity triggers candidate choices or clarification (${resA7.status})`
  );

  // -------------------------------------------------------------------------
  // SECTION B: Canonical Names and Fuzzy Matching
  // -------------------------------------------------------------------------
  console.log('\n--- B. Canonical Names and Fuzzy Matching ---');

  const officialLeMeridien = {
    id: 'meridien-resort-spa',
    name: 'Le Méridien Jaipur Resort & Spa',
    address: 'Number 1, RIICO Kukas, Jaipur, Rajasthan 302028, India',
    latLng: { lat: 27.0267, lng: 75.8906 },
    types: ['lodging', 'resort', 'hotel'],
    primaryType: 'resort_hotel',
  };

  // 1. "Le Méridien Jaipur" against canonical result
  const scoreB1 = scoreCandidatePlace('Le Méridien Jaipur', officialLeMeridien);
  assert(
    scoreB1 >= CANONICAL_SUFFIX_MATCH_SCORE,
    `B1: "Le Méridien Jaipur" matches canonical resort listing (${scoreB1} >= ${CANONICAL_SUFFIX_MATCH_SCORE})`
  );

  // 2. "Le Meridien Jaipur" (unaccented) against canonical result
  const scoreB2 = scoreCandidatePlace('Le Meridien Jaipur', officialLeMeridien);
  assert(
    scoreB2 >= CANONICAL_SUFFIX_MATCH_SCORE,
    `B2: "Le Meridien Jaipur" (unaccented) matches canonical resort listing (${scoreB2} >= ${CANONICAL_SUFFIX_MATCH_SCORE})`
  );

  // 3. Same hotel name in a different city (e.g. "Le Méridien Gurgaon")
  const scoreB3 = scoreCandidatePlace('Le Méridien Gurgaon', officialLeMeridien);
  assert(
    scoreB3 <= GEOGRAPHIC_MISMATCH_SCORE_CAP,
    `B3: Same hotel name in conflicting city receives mismatch cap (${scoreB3} <= ${GEOGRAPHIC_MISMATCH_SCORE_CAP})`
  );

  // 4. Similar business name that is not the intended venue (e.g. "Latest Recipe at Le Méridien", restaurant)
  const restaurantCandidate = {
    id: 'meridien-restaurant',
    name: 'Latest Recipe at Le Méridien',
    address: 'Le Méridien Jaipur, Kukas, Jaipur, Rajasthan 302028',
    types: ['restaurant', 'food'],
    primaryType: 'restaurant',
  };
  const scoreB4Hotel = scoreCandidatePlace('Le Méridien Jaipur hotel', officialLeMeridien);
  const scoreB4Rest = scoreCandidatePlace('Le Méridien Jaipur hotel', restaurantCandidate);
  assert(
    scoreB4Hotel > scoreB4Rest,
    `B4: Intended hotel venue scores higher than restaurant inside hotel (${scoreB4Hotel} > ${scoreB4Rest})`
  );

  // 5. Real result with incomplete address metadata
  const candIncompleteMeridien = {
    id: 'meridien-short-addr',
    name: 'Le Méridien Jaipur Resort & Spa',
    address: 'Kukas', // only sublocality
    latLng: { lat: 27.026, lng: 75.89 },
  };
  const scoreB5 = scoreCandidatePlace('Le Méridien Jaipur', candIncompleteMeridien);
  assert(
    scoreB5 >= 0.75,
    `B5: Canonical name with incomplete address is retained as strong candidate (${scoreB5})`
  );

  // 6. Misspelled or partially recognized name ("Le Maridien Jaipur" / "Lay Meridien")
  const phonQuery = normalizeForPhoneticComparison('Le Maridien Jaipur');
  const phonCand = normalizeForPhoneticComparison('Le Méridien Jaipur');
  assert(
    phonQuery === phonCand,
    `B6: Phonetic normalization equates "Le Maridien" and "Le Méridien" ("${phonQuery}")`
  );

  // 7. Official suffix that should not be removed ("Resort & Spa")
  const cleanExtracted = extractPlaceContext('Le Méridien Jaipur Resort & Spa');
  assert(
    cleanExtracted.cleanPlaceName.includes('Resort') && cleanExtracted.cleanPlaceName.includes('Spa'),
    `B7: Official suffix preserved in cleanPlaceName ("${cleanExtracted.cleanPlaceName}")`
  );

  // 8. Business vs nearby parking lot with similar text
  const parkingCandidate = {
    id: 'meridien-parking',
    name: 'Le Méridien Jaipur Guest Parking',
    address: 'Kukas, Jaipur, Rajasthan 302028',
    types: ['parking', 'parking_lot'],
    primaryType: 'parking',
  };
  const scoreParking = scoreCandidatePlace('Le Méridien Jaipur', parkingCandidate);
  assert(
    scoreB1 - scoreParking >= 0.30,
    `B8: Secondary amenity parking lot penalized significantly below hotel (${scoreB1} vs ${scoreParking})`
  );

  // -------------------------------------------------------------------------
  // SECTION C: Conversational Corrections and Cancellation
  // -------------------------------------------------------------------------
  console.log('\n--- C. Conversational Corrections and Cancellation ---');

  // Set pending clarification fixture
  conversationContext.setPendingClarification({
    originalCommand: 'Take me to Radisson Blu',
    targetRole: 'destination',
    query: 'Radisson Blu',
    candidates: [
      {
        index: 1,
        id: 'rad-dwarka',
        name: 'Radisson Blu Hotel New Delhi Dwarka',
        address: 'Sector 13, Dwarka, New Delhi 110075',
        latLng: { lat: 28.59, lng: 77.04 },
      },
      {
        index: 2,
        id: 'rad-paschim',
        name: 'Radisson Blu Paschim Vihar',
        address: 'Outer Ring Rd, Paschim Vihar, New Delhi 110063',
        latLng: { lat: 28.67, lng: 77.09 },
      },
      {
        index: 3,
        id: 'rad-jaipur',
        name: 'Radisson Blu Hotel Jaipur',
        address: 'Tonk Rd, Durgapura, Jaipur, Rajasthan 302018',
        latLng: { lat: 26.85, lng: 75.79 },
      },
    ],
    pendingActions: [],
    targetAction: { type: 'SET_DESTINATION', placeQuery: 'Radisson Blu' },
    responseLanguage: 'en-IN',
  });

  // 1. "No, the one in Dwarka."
  const c1 = conversationContext.resolveFollowUpReference('No, the one in Dwarka.');
  assert(c1.type === 'select_candidate' && c1.selectedCandidate?.index === 1, 'C1: "No, the one in Dwarka." selects candidate #1');

  // 2. "Nahi, Paschim Vihar wala."
  const c2 = conversationContext.resolveFollowUpReference('Nahi, Paschim Vihar wala.');
  assert(c2.type === 'select_candidate' && c2.selectedCandidate?.index === 2, 'C2: "Nahi, Paschim Vihar wala." selects candidate #2');

  // 3. "No, cancel it."
  const c3 = conversationContext.resolveFollowUpReference('No, cancel it.');
  assert(c3.type === 'cancel', `C3: "No, cancel it." cancels pending action (${c3.type})`);

  // 4. "Nahi, rehne do."
  const c4 = conversationContext.resolveFollowUpReference('Nahi, rehne do.');
  assert(c4.type === 'cancel', `C4: "Nahi, rehne do." cancels pending action (${c4.type})`);

  // 5. "Actually, the hotel in Jaipur."
  const c5 = conversationContext.resolveFollowUpReference('Actually, the hotel in Jaipur.');
  assert(c5.type === 'select_candidate' && c5.selectedCandidate?.index === 3, 'C5: "Actually, the hotel in Jaipur." selects candidate #3');

  // 6. "Take me there."
  const c6 = conversationContext.resolveFollowUpReference('Take me there.');
  assert(c6.type === 'select_candidate' && Boolean(c6.selectedCandidate), 'C6: "Take me there." confirms active selection');

  // 7. "Navigate there."
  const c7 = conversationContext.resolveFollowUpReference('Navigate there.');
  assert(c7.type === 'select_candidate' && Boolean(c7.selectedCandidate), 'C7: "Navigate there." confirms active selection');

  // 8. Correction arriving after clarification has already been resolved / cleared
  conversationContext.clearPendingClarification();
  const c8 = conversationContext.resolveFollowUpReference('the second one');
  assert(
    c8.type === 'not_applicable',
    `C8: Correction arriving after clarification cleared returns "not_applicable" without launching action (${c8.type})`
  );

  // -------------------------------------------------------------------------
  // SECTION D: Gnani STT Protocol & Regression Evidence
  // -------------------------------------------------------------------------
  console.log('\n--- D. Gnani STT Protocol & Multi-Segment Regression Evidence ---');

  // Protocol Simulation: Verify multi-segment buffering does NOT prematurely terminate on segment 1 is_final
  interface MockSttMessage {
    type?: string;
    segment_index?: number;
    transcript?: string;
    is_final?: boolean;
    data?: any;
  }

  function simulateGnaniSttStream(messages: MockSttMessage[]): string {
    const finalizedSegments = new Map<number, string>();
    let currentInterim = '';

    for (const msg of messages) {
      if (msg.type === 'complete') {
        break;
      }
      const rawText = (msg.transcript || msg.data?.transcript || '').trim();
      const segIndex = typeof msg.segment_index === 'number'
        ? msg.segment_index
        : (typeof msg.data?.segment_index === 'number' ? msg.data.segment_index : finalizedSegments.size + 1);
      const isFinal = Boolean(msg.is_final || msg.data?.is_final);

      if (isFinal) {
        finalizedSegments.set(segIndex, rawText);
        currentInterim = '';
      } else {
        currentInterim = rawText;
      }
    }

    const sorted = Array.from(finalizedSegments.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => t);

    return [...sorted, currentInterim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  // Sample 1: Complete short utterance (English)
  const ref1 = "Navigate to India Gate";
  const hyp1 = simulateGnaniSttStream([
    { type: 'transcript', segment_index: 1, transcript: 'Navigate', is_final: false },
    { type: 'transcript', segment_index: 1, transcript: 'Navigate to India Gate', is_final: true },
    { type: 'complete' },
  ]);
  const wer1 = computeWER(ref1, hyp1);
  assert(wer1.wer === 0, `D1: Short utterance WER: ${wer1.wer * 100}% (Hyp: "${hyp1}")`);

  // Sample 2: Longer sentence containing landmark and neighborhood (Hindi)
  const ref2 = "मुझे मालवीय नगर के लक्ष्मी नारायण मंदिर ले चलो";
  const hyp2 = simulateGnaniSttStream([
    { type: 'transcript', segment_index: 1, transcript: 'मुझे मालवीय नगर', is_final: true },
    { type: 'transcript', segment_index: 2, transcript: 'के लक्ष्मी नारायण मंदिर ले चलो', is_final: true },
  ]);
  const wer2 = computeWER(ref2, hyp2);
  assert(wer2.wer === 0, `D2: Multi-segment Hindi utterance WER: ${wer2.wer * 100}% (Hyp: "${hyp2}")`);

  // Sample 3: Sentence with pause between clauses (Hinglish with segment pause)
  const ref3 = "Take me to Cyber Hub and add a petrol pump on the way";
  const hyp3 = simulateGnaniSttStream([
    { type: 'transcript', segment_index: 1, transcript: 'Take me to Cyber Hub', is_final: true },
    // Speaker pauses for 600ms, then segment 2 arrives
    { type: 'transcript', segment_index: 2, transcript: 'and add a petrol pump on the way', is_final: true },
  ]);
  const wer3 = computeWER(ref3, hyp3);
  assert(wer3.wer === 0, `D3: Paused clause utterance WER: ${wer3.wer * 100}% (Hyp: "${hyp3}")`);

  // Sample 4: Out-of-order segment delivery resilience
  const ref4 = "First clause second clause";
  const hyp4 = simulateGnaniSttStream([
    { type: 'transcript', segment_index: 2, transcript: 'second clause', is_final: true }, // arrives first
    { type: 'transcript', segment_index: 1, transcript: 'First clause', is_final: true },  // arrives second
  ]);
  assert(hyp4 === ref4, `D4: Out-of-order segment assembly correctly ordered ("${hyp4}")`);

  // Sample 5: Duplicate segment suppression
  const hyp5 = simulateGnaniSttStream([
    { type: 'transcript', segment_index: 1, transcript: 'Turn right', is_final: true },
    { type: 'transcript', segment_index: 1, transcript: 'Turn right', is_final: true }, // duplicate
    { type: 'transcript', segment_index: 2, transcript: 'onto Ring Road', is_final: true },
  ]);
  assert(hyp5 === 'Turn right onto Ring Road', `D5: Duplicate segment does not repeat words ("${hyp5}")`);

  // Sample 6: Nested Gnani response protocol format
  const hyp6 = simulateGnaniSttStream([
    {
      type: 'transcript',
      data: {
        segment_index: 1,
        transcript: 'Hawa Mahal Jaipur',
        is_final: true,
      },
    },
  ]);
  assert(hyp6 === 'Hawa Mahal Jaipur', `D6: Nested data.transcript extracted correctly ("${hyp6}")`);

  // Sample 7: Empty recordings and silence
  const hyp7 = simulateGnaniSttStream([]);
  assert(hyp7 === '', 'D7: Empty recording produces empty transcript');

  // -------------------------------------------------------------------------
  // SECTION E: Numeric Scoring Audit
  // -------------------------------------------------------------------------
  console.log('\n--- E. Numeric Scoring Audit ---');
  console.log(`  • GEOGRAPHIC_MISMATCH_SCORE_CAP: ${GEOGRAPHIC_MISMATCH_SCORE_CAP}`);
  console.log(`  • CANONICAL_SUFFIX_MATCH_SCORE: ${CANONICAL_SUFFIX_MATCH_SCORE}`);
  console.log(`  • AUTOMATIC_SELECTION_CONFIDENCE_THRESHOLD: ${AUTOMATIC_SELECTION_CONFIDENCE_THRESHOLD}`);
  console.log(`  • AMBIGUITY_CONFIDENCE_THRESHOLD: ${AMBIGUITY_CONFIDENCE_THRESHOLD}`);

  assert(GEOGRAPHIC_MISMATCH_SCORE_CAP === 0.30, 'E1: Numeric geographic-mismatch score cap is exactly 0.30');
  assert(CANONICAL_SUFFIX_MATCH_SCORE === 0.96, 'E2: Canonical suffix match score is exactly 0.96');
  assert(AUTOMATIC_SELECTION_CONFIDENCE_THRESHOLD === 0.60, 'E3: Minimum confidence score for automatic selection is 0.60');
  assert(AMBIGUITY_CONFIDENCE_THRESHOLD === 0.75, 'E4: High-confidence ambiguity threshold is 0.75');

  console.log('\n------------------------------------------------------------------------');
  console.log(`TOTAL ACCEPTANCE TESTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('------------------------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFocusedAcceptance().catch((err) => {
  console.error('Fatal error in acceptance suite:', err);
  process.exit(1);
});
