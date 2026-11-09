import { extractPlaceContext, scoreCandidatePlace, resolvePlaceDetailed, configurePlacesTestMode } from '../src/services/placesService';
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

async function runTests() {
  configurePlacesTestMode(true);
  console.log('\n======================================================');
  console.log('DESTINATION INTELLIGENCE & STT RELIABILITY REGRESSION');
  console.log('======================================================\n');

  // WORKSTREAM 1: Geographic Context & Locality Discipline
  console.log('1. Testing Locality Extraction and Locality Discipline:');
  const ctx1 = extractPlaceContext('Take me to Lakshmi Narayan Mandir in Malviya Nagar');
  assert(ctx1.cleanPlaceName.toLowerCase().includes('lakshmi narayan'), 'Extracts place name "Lakshmi Narayan Mandir"');
  assert(ctx1.localityContext?.toLowerCase() === 'malviya nagar', 'Extracts localityContext "Malviya Nagar"');

  const ctxHindi = extractPlaceContext('मालवीय नगर में लक्ष्मी नारायण मंदिर ले चलो');
  assert(ctxHindi.localityContext?.includes('मालवीय') || ctxHindi.cleanPlaceName.includes('लक्ष्मी'), 'Extracts regional locality and place name');

  const ctxComma = extractPlaceContext('Laxmi Narayan Mandir, Malviya Nagar');
  assert(ctxComma.localityContext?.toLowerCase() === 'malviya nagar', 'Extracts comma-separated locality');

  // Candidate scoring with conflicting locality
  const candMalviya = {
    id: 'cand-delhi',
    name: 'Lakshmi Narayan Mandir',
    address: 'D-Block, Malviya Nagar, New Delhi, Delhi 110017',
    latLng: { lat: 28.5325, lng: 77.2085 },
  };

  const candJaipur = {
    id: 'cand-jaipur',
    name: 'Birla Mandir (Lakshmi Narayan Temple)',
    address: 'Jawahar Lal Nehru Marg, Tilak Nagar, Jaipur, Rajasthan 302004',
    latLng: { lat: 26.8923, lng: 75.8155 },
  };

  const scoreMalviya = scoreCandidatePlace('Lakshmi Narayan Mandir in Malviya Nagar', candMalviya);
  const scoreJaipur = scoreCandidatePlace('Lakshmi Narayan Mandir in Malviya Nagar', candJaipur);

  assert(scoreMalviya >= 0.90, `Malviya Nagar candidate receives high confidence score: ${scoreMalviya}`);
  assert(scoreJaipur <= 0.35, `Conflicting Jaipur candidate receives locality penalty (score: ${scoreJaipur})`);
  assert(scoreMalviya > scoreJaipur, 'Malviya Nagar candidate clearly beats conflicting city candidate');

  const resolvedTemple = await resolvePlaceDetailed('Take me to Lakshmi Narayan Mandir in Malviya Nagar');
  assert(resolvedTemple.status === 'resolved', `Resolution status is resolved: ${resolvedTemple.status}`);
  assert(
    resolvedTemple.waypoint?.address.toLowerCase().includes('malviya nagar') === true,
    `Resolved waypoint address contains Malviya Nagar: "${resolvedTemple.waypoint?.address}"`
  );
  assert(
    !resolvedTemple.waypoint?.address.toLowerCase().includes('jaipur'),
    'Resolved waypoint does NOT pick Jaipur temple'
  );

  // WORKSTREAM 2: Place-Name Matching & Official Listings (Le Méridien)
  console.log('\n2. Testing Place-Name Matching & Accent Normalization (Le Méridien):');
  assert(stripDiacritics('Méridien') === 'Meridien', 'stripDiacritics converts "Méridien" to "Meridien"');
  assert(stripDiacritics('Café') === 'Cafe', 'stripDiacritics converts "Café" to "Cafe"');

  const candLeMeridien = {
    id: 'meridien-resort',
    name: 'Le Méridien Jaipur Resort & Spa',
    address: 'Number 1, RIICO Kukas, Jaipur, Rajasthan 302028',
    latLng: { lat: 27.0267, lng: 75.8906 },
    types: ['lodging', 'resort', 'hotel'],
    primaryType: 'resort_hotel',
  };

  const scoreMeridien = scoreCandidatePlace('Take me to Le Méridien Jaipur', candLeMeridien);
  assert(scoreMeridien >= 0.90, `Le Méridien Jaipur matches official resort listing with score: ${scoreMeridien}`);

  const resolvedMeridien = await resolvePlaceDetailed('Take me to Le Méridien Jaipur');
  assert(resolvedMeridien.status === 'resolved', `Resolved Le Méridien status: ${resolvedMeridien.status}`);
  assert(
    stripDiacritics(resolvedMeridien.waypoint?.name || '').toLowerCase().includes('meridien') === true,
    `Resolved waypoint name is Le Méridien: "${resolvedMeridien.waypoint?.name}"`
  );

  // WORKSTREAM 3: Conversational Follow-Up Corrections
  console.log('\n3. Testing Conversational Follow-Up Corrections:');
  conversationContext.setPendingClarification({
    originalCommand: 'Go to Radisson Blu',
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
    ],
    pendingActions: [],
    targetAction: { type: 'SET_DESTINATION', placeQuery: 'Radisson Blu' },
    responseLanguage: 'en-IN',
  });

  // Test "No, the one in Dwarka" (must NOT be treated as cancellation!)
  const corr1 = conversationContext.resolveFollowUpReference('No, the one in Dwarka');
  assert(corr1.type === 'select_candidate', `"No, the one in Dwarka" does not cancel (type: ${corr1.type})`);
  assert(corr1.selectedCandidate?.index === 1, `Selected option #1 (Dwarka): ${corr1.selectedCandidate?.name}`);

  // Test "Actually the second one"
  const corr2 = conversationContext.resolveFollowUpReference('Actually the second one');
  assert(corr2.type === 'select_candidate' && corr2.selectedCandidate?.index === 2, 'Selects candidate #2 on "Actually the second one"');

  // Test "Nahi, Paschim Vihar wala"
  const corr3 = conversationContext.resolveFollowUpReference('Nahi, Paschim Vihar wala');
  assert(corr3.type === 'select_candidate' && corr3.selectedCandidate?.index === 2, 'Selects candidate #2 on "Nahi, Paschim Vihar wala"');

  // Test "Take me there" affirmative confirmation
  const corr4 = conversationContext.resolveFollowUpReference('Take me there');
  assert(corr4.type === 'select_candidate', 'Confirms candidate on "Take me there"');

  // Test genuine cancellation
  const cancelTest = conversationContext.resolveFollowUpReference('cancel');
  assert(cancelTest.type === 'cancel', 'Pure "cancel" cancels selection');

  const cancelHindi = conversationContext.resolveFollowUpReference('nahi rehne do');
  assert(cancelHindi.type === 'cancel', '"nahi rehne do" cancels selection');

  conversationContext.clearPendingClarification();

  console.log('\n------------------------------------------------------');
  console.log(`Destination Intelligence Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
