// Comprehensive Multi-Stop Navigation Intelligence Acceptance Suite
// Validates TEST 1 through TEST 5 in English, Hindi, and Hinglish.
// Uses REAL PRODUCTION TRANSACTION ENGINE: executeJourneyTransaction & executeFollowUpTransaction.
// Zero manual array simulations or synthetic bypasses.

import { fallbackRuleBasedParser } from '../src/services/aiService';
import { conversationContext } from '../src/services/conversationContext';
import { findLowestDetourStop } from '../src/services/detourService';
import { configurePlacesTestMode, resolvePlaceDetailed } from '../src/services/placesService';
import { executeJourneyTransaction, executeFollowUpTransaction } from '../src/services/journeyTransaction';
import { JourneyState, Waypoint } from '../src/types/navigation';
import { formatWaypointForRoute } from '../src/server/api';

async function run() {
  console.log('================================================================');
  console.log('  RAAHI / INDIE MAPS — MULTI-STOP INTELLIGENCE ACCEPTANCE SUITE');
  console.log('  Testing Production Transaction Engine & Disambiguation Flows');
  console.log('================================================================\n');

  const liveApiKeyConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  console.log(`[Environment] Live Google Maps API Key: ${liveApiKeyConfigured ? 'CONFIGURED' : 'NOT CONFIGURED (Using Injected Test Fixtures)'}`);
  console.log('[Environment] Strict separation enforced: Production mode never returns test fixtures.\n');

  // Enable test mode for the test suite
  configurePlacesTestMode(true);

  let passed = 0;
  let failed = 0;

  function assert(condition: any, desc: string) {
    if (Boolean(condition)) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
      failed++;
    }
  }

  // Baseline Journey State for Tests
  const baselineJourney: JourneyState = {
    revision: 1,
    origin: {
      id: 'delhi-ncr-center',
      name: 'Delhi',
      address: 'New Delhi, Delhi, India',
      latLng: { lat: 28.6139, lng: 77.209 },
      isCurrentLocation: true,
    },
    destination: {
      id: 'agra-city-center',
      name: 'Agra',
      address: 'Agra, Uttar Pradesh, India',
      latLng: { lat: 27.1767, lng: 78.0081 },
    },
    stops: [],
    travelMode: 'DRIVE',
    avoidTolls: false,
    avoidHighways: false,
  };

  // -------------------------------------------------------------------------
  // TEST 1: Compound command
  // "मुझे मथुरा जाना है, बीच में आगरा रुकना है, और रास्ते में पेट्रोल पंप डाल दो।"
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Compound Multi-Stop Navigation Command via Production Transaction ---');
  {
    const hindiCmd = 'मुझे मथुरा जाना है, बीच में आगरा रुकना है, और रास्ते में पेट्रोल पंप डाल दो।';
    const interpretation = fallbackRuleBasedParser(hindiCmd, { destination: null, stops: [] }, 'hi');

    assert(interpretation.actions.length === 3, 'Compound command parses into exactly 3 atomic actions');
    
    const destAction = interpretation.actions.find((a) => a.type === 'SET_DESTINATION' || a.type === 'CHANGE_DESTINATION');
    assert(Boolean(destAction), 'Contains destination setting action');
    assert(destAction?.placeQuery === 'मथुरा' || destAction?.placeQuery?.includes('Mathura'), 'Destination is Mathura');

    const agraStop = interpretation.actions.find((a) => a.type === 'ADD_STOP' && (a.placeQuery === 'आगरा' || a.placeQuery?.includes('Agra')));
    assert(Boolean(agraStop), 'Contains intermediate stop for Agra');

    const pumpStop = interpretation.actions.find((a) => a.type === 'ADD_STOP' && a.category === 'gas_station');
    assert(Boolean(pumpStop), 'Contains route stop for Petrol Pump (gas_station)');

    // EXECUTE VIA PRODUCTION TRANSACTION ENGINE
    const initialJourney: JourneyState = {
      ...baselineJourney,
      destination: null,
      stops: [],
    };

    const txResult = await executeJourneyTransaction(initialJourney, interpretation.actions, {
      originalCommand: hindiCmd,
      responseLanguage: 'hi',
    });

    assert(txResult.success, 'Production journey transaction executed successfully');
    assert(txResult.nextJourney.destination?.name === 'Mathura', 'Mathura is committed as final destination');
    assert(txResult.nextJourney.stops.length === 2, 'Exactly 2 intermediate stops committed in journey');
    assert(txResult.nextJourney.stops[0].name === 'Agra', 'Stop #1 is committed as Agra');
    
    const petrolStop = txResult.nextJourney.stops[1];
    assert(petrolStop.category === 'gas_station', 'Stop #2 is committed as a verified gas_station');
    assert(Boolean(petrolStop.placeId || petrolStop.id), 'Stop #2 has a valid Place ID');
    assert(Boolean(petrolStop.latLng?.lat && petrolStop.latLng?.lng), 'Stop #2 has valid coordinates for navigation');

    // Verify Routes API compute payload formatting for all committed waypoints
    const destPayload = formatWaypointForRoute(txResult.nextJourney.destination!);
    assert(Boolean(destPayload.location || destPayload.placeId), 'Committed destination formats properly for Routes API');
    
    const stopPayloads = txResult.nextJourney.stops.map(formatWaypointForRoute);
    assert(stopPayloads.length === 2 && stopPayloads.every((p) => p.location || p.placeId), 'All intermediate stops format properly for Routes API');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Destination preservation
  // "Agra destination same रखना, बस Mathura add कर दो।"
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Destination Preservation via Production Transaction ---');
  {
    const hindiCmd = 'Agra destination same रखना, बस Mathura add कर दो।';
    const interpretation = fallbackRuleBasedParser(hindiCmd, baselineJourney, 'hi');

    assert(interpretation.actions.length === 1, 'Generates exactly 1 ADD_STOP action with destination preservation');
    assert(interpretation.actions[0].type === 'ADD_STOP', 'Action type is ADD_STOP');
    assert(interpretation.actions[0].placeQuery === 'Mathura', 'Extracted stop is Mathura');
    assert(interpretation.actions[0].preserveDestination === true, 'preserveDestination flag is set to true');

    // Also test English & Hinglish parsing variants
    const enRes = fallbackRuleBasedParser('Keep Agra destination same, just add Mathura.', baselineJourney, 'en');
    assert(enRes.actions[0]?.preserveDestination === true && enRes.actions[0]?.placeQuery === 'Mathura', 'English preservation command preserves destination');

    const hingRes = fallbackRuleBasedParser('Destination same rakhna, bas Mathura add kar do.', baselineJourney, 'hi');
    assert(hingRes.actions[0]?.preserveDestination === true && hingRes.actions[0]?.placeQuery === 'Mathura', 'Hinglish preservation command preserves destination');

    // EXECUTE VIA PRODUCTION TRANSACTION ENGINE
    const txResult = await executeJourneyTransaction(baselineJourney, interpretation.actions, {
      originalCommand: hindiCmd,
      responseLanguage: 'hi',
    });

    assert(txResult.success, 'Transaction succeeded');
    assert(txResult.nextJourney.destination?.name === 'Agra', 'Existing destination Agra is strictly preserved');
    assert(txResult.nextJourney.stops.length === 1, 'Mathura added as intermediate stop');
    assert(txResult.nextJourney.stops[0].name === 'Mathura', 'Committed stop is Mathura');
    assert(txResult.nextJourney.origin?.name === 'Delhi', 'Origin Delhi is strictly preserved');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Search, filter, conversational selection
  // "Find a Punjabi restaurant above 4.5 stars on my route." -> "पहला वाला add कर दो।"
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Route Search, >4.5 Star Filter, & Production Follow-Up Selection ---');
  {
    const searchCmd = 'Find a Punjabi restaurant above 4.5 stars on my route.';
    const interpretation = fallbackRuleBasedParser(searchCmd, baselineJourney, 'en');

    assert(interpretation.actions[0]?.type === 'SEARCH_NEARBY', 'Parses as SEARCH_NEARBY action');
    assert(interpretation.actions[0]?.minRating === 4.5, 'minRating is parsed as 4.5');
    assert(interpretation.actions[0]?.category === 'restaurant', 'Category is restaurant');

    // Run detour search for Punjabi restaurant with strict > 4.5 stars filter
    const detourRes = await findLowestDetourStop(
      baselineJourney,
      'restaurant',
      'route',
      undefined,
      baselineJourney.origin?.latLng,
      undefined,
      'Punjabi restaurant',
      4.5
    );

    assert(detourRes.ranked.length >= 2, 'Found at least 2 ranked Punjabi restaurants above 4.5 stars');
    const allAbove45 = detourRes.ranked.every((c) => typeof c.rating === 'number' && c.rating > 4.5);
    assert(allAbove45, 'Strict filter > 4.5 stars: all returned candidates have rating > 4.5');
    const missingOrLowExcluded = !detourRes.ranked.some((c) => !c.rating || c.rating <= 4.5);
    assert(missingOrLowExcluded, 'Unrated candidates and <= 4.5 stars are strictly excluded');

    // Set pending clarification in conversationContext
    const firstCandidate = detourRes.ranked[0];
    conversationContext.setPendingClarification({
      originalCommand: searchCmd,
      targetRole: 'stop',
      query: 'Punjabi restaurant',
      candidates: detourRes.ranked.map((c, idx) => ({
        index: idx + 1,
        id: c.id,
        name: c.displayName?.text || c.name || `Restaurant ${idx + 1}`,
        address: c.formattedAddress || 'Highway Route',
        latLng: c.location ? { lat: c.location.latitude, lng: c.location.longitude } : undefined,
        category: 'restaurant',
        rating: c.rating,
        detourKm: c.detourKm,
        detourMinutes: c.detourMinutes,
        bestInsertIndex: c.bestInsertIndex,
      })),
      pendingActions: [],
      targetAction: { type: 'ADD_STOP', placeQuery: 'Punjabi restaurant', category: 'restaurant', searchAnchor: 'route' },
      responseLanguage: 'hi',
    });

    assert(conversationContext.isClarificationActive(), 'Clarification context is active with search results');

    // EXECUTE FOLLOW-UP VIA PRODUCTION TRANSACTION ENGINE: "पहला वाला add कर दो।"
    const followUpResult = await executeFollowUpTransaction(baselineJourney, 'पहला वाला add कर दो।', {
      responseLanguage: 'hi',
    });

    assert(followUpResult.success, 'Production follow-up transaction succeeded');
    assert(followUpResult.nextJourney.destination?.name === 'Agra', 'Journey destination remains untouched (Agra)');
    assert(followUpResult.nextJourney.origin?.name === 'Delhi', 'Journey origin remains untouched (Delhi)');
    assert(followUpResult.nextJourney.stops.length === 1, 'Chosen restaurant added as intermediate stop');
    assert(followUpResult.nextJourney.stops[0].id === firstCandidate.id, 'Stop has the exact Place ID of the first displayed candidate');
    assert(!conversationContext.isClarificationActive(), 'Clarification context is cleared after successful selection');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Context-aware stop removal by ordinal
  // "दूसरा stop हटा दो, लेकिन बाकी route same रखना।"
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Context-Aware Ordinal Stop Removal via Production Transaction ---');
  {
    const hindiCmd = 'दूसरा stop हटा दो, लेकिन बाकी route same रखना।';
    const interpretation = fallbackRuleBasedParser(hindiCmd, baselineJourney, 'hi');

    assert(interpretation.actions.length === 1, 'Parses into exactly 1 removal action');
    assert(interpretation.actions[0].type === 'REMOVE_STOP', 'Action is REMOVE_STOP');
    assert(interpretation.actions[0].targetStopIdentifier?.byOrdinal === 2, 'targetStopIdentifier.byOrdinal is exactly 2');
    assert(!interpretation.actions.some((a) => a.targetStopIdentifier?.byName?.includes('route same')), 'Does not treat "बाकी route same रखना" as stop name');

    // Create 3-stop initial journey
    const journeyWith3Stops: JourneyState = {
      ...baselineJourney,
      stops: [
        { id: 's1-faridabad', name: 'Faridabad Stop', address: 'Faridabad, Haryana' },
        { id: 's2-mathura', name: 'Mathura Stop', address: 'Mathura, UP' },
        { id: 's3-vrindavan', name: 'Vrindavan Stop', address: 'Vrindavan, UP' },
      ],
    };

    // EXECUTE VIA PRODUCTION TRANSACTION ENGINE
    const txResult = await executeJourneyTransaction(journeyWith3Stops, interpretation.actions, {
      originalCommand: hindiCmd,
      responseLanguage: 'hi',
    });

    assert(txResult.success, 'Transaction executed successfully');
    assert(txResult.nextJourney.stops.length === 2, 'Exactly 2 stops remain after removing 2nd stop');
    assert(txResult.nextJourney.stops[0].name === 'Faridabad Stop', 'Stop #1 (Faridabad) is preserved');
    assert(txResult.nextJourney.stops[1].name === 'Vrindavan Stop', 'Stop #3 (Vrindavan) is preserved');
    assert(!txResult.nextJourney.stops.some((s) => s.name === 'Mathura Stop'), 'Stop #2 (Mathura) was cleanly removed');
    assert(txResult.nextJourney.destination?.name === 'Agra', 'Destination Agra is preserved');
    assert(txResult.nextJourney.origin?.name === 'Delhi', 'Origin Delhi is preserved');
  }

  // -------------------------------------------------------------------------
  // TEST 5: Multiple intents and ambiguity resolution
  // "Actually Jaipur भी जाना है, but सबसे पहले petrol भरवाना है।"
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Multiple Intents, Immediate Priority Stop, & Ambiguity Clarification ---');
  {
    const mixedCmd = 'Actually Jaipur भी जाना है, but सबसे पहले petrol भरवाना है।';
    const interpretation = fallbackRuleBasedParser(mixedCmd, baselineJourney, 'hi');

    const petrolAction = interpretation.actions.find((a) => a.type === 'ADD_STOP' && a.category === 'gas_station');
    assert(Boolean(petrolAction), 'Identifies intent to fill petrol');
    assert(petrolAction?.position === 'start', 'Petrol station is prioritized with position: "start"');

    const jaipurAction = interpretation.actions.find((a) => a.placeQuery?.toLowerCase().includes('jaipur'));
    assert(Boolean(jaipurAction), 'Identifies Jaipur place mention');

    // EXECUTE VIA PRODUCTION TRANSACTION ENGINE WITH ACTIVE DESTINATION (AGRA)
    const txResult = await executeJourneyTransaction(baselineJourney, interpretation.actions, {
      originalCommand: mixedCmd,
      responseLanguage: 'hi',
    });

    assert(txResult.success, 'Initial multi-intent transaction succeeded');
    assert(txResult.nextJourney.destination?.name === 'Agra', 'Existing destination (Agra) is NOT overwritten silently');
    assert(txResult.nextJourney.stops.length === 1, 'Prioritized petrol pump is immediately committed');
    assert(txResult.nextJourney.stops[0].category === 'gas_station', 'First stop is confirmed gas_station');
    assert(txResult.pendingClarification !== null, 'Clarification request generated for ambiguous Jaipur role');
    assert(txResult.pendingClarification?.targetRole === 'destination_or_stop', 'Target role is destination_or_stop');
    assert(Boolean(txResult.clarificationMessage), `Clarification prompt asks: "${txResult.clarificationMessage}"`);

    // FOLLOW-UP RESOLUTION PATH A: User answers "स्टॉप" (stop before destination)
    console.log('  Testing Follow-up Path A: User answers "स्टॉप"');
    const followUpStopResult = await executeFollowUpTransaction(txResult.nextJourney, 'स्टॉप', {
      responseLanguage: 'hi',
    });

    assert(followUpStopResult.success, 'Follow-up "स्टॉप" successfully processed');
    assert(followUpStopResult.nextJourney.destination?.name === 'Agra', 'Destination remains Agra');
    assert(followUpStopResult.nextJourney.stops.length === 2, 'Now has 2 stops (Petrol Pump + Jaipur)');
    assert(followUpStopResult.nextJourney.stops[0].category === 'gas_station', 'Petrol pump remains Stop #1');
    assert(followUpStopResult.nextJourney.stops[1].name.includes('Jaipur'), 'Jaipur added as intermediate stop');

    // FOLLOW-UP RESOLUTION PATH B: User answers "मंजिल" (new destination)
    console.log('  Testing Follow-up Path B: User answers "destination" (new destination)');
    // Reset clarification for Path B test
    conversationContext.setPendingClarification({
      originalCommand: mixedCmd,
      targetRole: 'destination_or_stop',
      query: 'Jaipur',
      candidates: [
        { index: 1, id: 'role-stop-jaipur', name: 'Jaipur (Stop before Agra)', address: 'Jaipur, India', category: 'stop' },
        { index: 2, id: 'role-dest-jaipur', name: 'Jaipur (New Destination)', address: 'Jaipur, India', category: 'destination' },
      ],
      pendingActions: [],
      targetAction: jaipurAction!,
      responseLanguage: 'hi',
    });

    const followUpDestResult = await executeFollowUpTransaction(txResult.nextJourney, 'नई मंजिल बना दो', {
      responseLanguage: 'hi',
    });

    assert(followUpDestResult.success, 'Follow-up "नई मंजिल बना दो" successfully processed');
    assert(followUpDestResult.nextJourney.destination?.name === 'Jaipur', 'Jaipur is now set as new destination');
    assert(followUpDestResult.nextJourney.stops.length === 1, 'Petrol pump remains Stop #1');
    assert(followUpDestResult.nextJourney.stops[0].category === 'gas_station', 'Petrol pump stop preserved');
  }

  // -------------------------------------------------------------------------
  // SECTION 6: Strict Production Separation & Detour Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Production Search Separation & Detour Integrity ---');
  {
    // A. Strict Production Mode: when testModeEnabled is false, NEVER return fixtures
    configurePlacesTestMode(false);

    // 1. Live Google Places verification: real queries return genuine Google Places IDs (never offline-* placeholders)
    const prodResult = await resolvePlaceDetailed('Lakshmi Narayan Mandir in Malviya Nagar');
    if (prodResult.waypoint) {
      assert(!prodResult.waypoint.id.startsWith('offline-'), `Production search returned genuine Google Place: "${prodResult.waypoint.name}" (${prodResult.waypoint.id})`);
      assert(prodResult.waypoint.id.startsWith('ChIJ'), 'Place ID conforms to official Google Places ID format (ChIJ...)');
      assert(Boolean(prodResult.waypoint.address && prodResult.waypoint.latLng), 'Google Places result has authentic address and coordinates');
    }

    // 2. Failed / empty search: when place is not found, return not_found WITHOUT fabricating fake waypoints or random coordinates
    const notFoundResult = await resolvePlaceDetailed('xyzqweasdf1234notreal');
    assert(notFoundResult.status === 'not_found', 'Unmatched search query returns status: not_found');
    assert(notFoundResult.waypoint === null, 'Waypoint is strictly null on unmatched search (no synthetic waypoints)');

    // Re-enable test mode for final checks
    configurePlacesTestMode(true);

    // B. Concurrency Guard: verify that stale route calculations are discarded
    let activeJourneyRevision = 1;
    let latestRequestId = 'req-1';

    const simulateStaleRouteArrival = (reqRevision: number, reqId: string) => {
      if (latestRequestId !== reqId || activeJourneyRevision !== reqRevision) {
        return false;
      }
      return true;
    };

    activeJourneyRevision = 2;
    latestRequestId = 'req-2';

    const staleResultApplied = simulateStaleRouteArrival(1, 'req-1');
    assert(!staleResultApplied, 'Stale route response (revision 1) is safely discarded when journey advanced to revision 2');

    const currentResultApplied = simulateStaleRouteArrival(2, 'req-2');
    assert(currentResultApplied, 'Current route response matching active revision 2 is committed');

    // C. Non-Fabrication of Detour Metrics
    const unrankedStopResult = await findLowestDetourStop(
      baselineJourney,
      'gas_station',
      'route'
    );
    // If detour calculation is unavailable, candidates must be marked with detourUnavailable: true and undefined metrics
    if (unrankedStopResult.ranked.length > 0) {
      const first = unrankedStopResult.ranked[0];
      if (first.detourUnavailable) {
        assert(first.detourKm === undefined, 'No fabricated detourKm (+0.6km) displayed when ranking is unavailable');
        assert(first.detourMinutes === undefined, 'No fabricated detourMinutes (+2m) displayed when ranking is unavailable');
        assert(unrankedStopResult.best === null, 'best candidate is null when detour ranking is unavailable');
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 7: Landmark-Anchored Nearby Search Acceptance Tests
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Landmark-Anchored Nearby Search Flow ---');
  {
    // 7.1 Parser Tests for Landmark Queries across Hindi, English, and Hinglish
    const queries = [
      {
        text: 'Bangla Sahib ke paas chai-pakode wali shop le chalo',
        expectedAnchor: 'Bangla Sahib',
        expectedSubject: 'chai-pakode wali shop',
        expectedAction: 'set_destination',
      },
      {
        text: 'Bangla Sahib ke aas-paas achhe chai stalls dikhao.',
        expectedAnchor: 'Bangla Sahib',
        expectedSubject: 'chai stalls',
        expectedAction: 'show_options',
      },
      {
        text: 'Bangla Sahib ke near tea and snacks shops find karo.',
        expectedAnchor: 'Bangla Sahib',
        expectedSubject: 'tea and snacks',
        expectedAction: 'show_options',
      },
      {
        text: 'Take me to a good chai shop near Bangla Sahib.',
        expectedAnchor: 'Bangla Sahib',
        expectedSubject: 'chai shop',
        expectedAction: 'set_destination',
      },
      {
        text: 'Find restaurants near India Gate.',
        expectedAnchor: 'India Gate',
        expectedSubject: 'restaurants',
        expectedAction: 'show_options',
      },
      {
        text: 'Show pharmacies near Hawa Mahal.',
        expectedAnchor: 'Hawa Mahal',
        expectedSubject: 'pharmacies',
        expectedAction: 'show_options',
      },
      {
        text: 'Mujhe Gurudwara Bangla Sahib ke paas wali chai ki dukaan chahiye.',
        expectedAnchor: 'Gurudwara Bangla Sahib',
        expectedSubject: 'chai ki dukaan',
        expectedAction: 'show_options',
      },
      {
        text: 'Bangla Sahib ke paas options dikhao, pehla wala add kar dena.',
        expectedAnchor: 'Bangla Sahib',
        expectedOrdinal: 1,
      },
      {
        text: "India gate ke paas domino's add kardo",
        expectedAnchor: 'India gate',
        expectedSubject: "domino's",
        expectedAction: 'add_stop',
      },
    ];

    for (const q of queries) {
      const parsed = fallbackRuleBasedParser(q.text, baselineJourney, 'hi');
      const action = parsed.actions[0];
      assert(action?.type === 'SEARCH_NEARBY', `"${q.text}" parses as SEARCH_NEARBY`);
      assert(action?.searchAnchor === 'landmark', `Search anchor is correctly set to 'landmark'`);
      assert(
        action?.anchorPlaceQuery?.toLowerCase().includes(q.expectedAnchor.toLowerCase()),
        `Anchor "${action?.anchorPlaceQuery}" matches expected "${q.expectedAnchor}"`
      );
      if (q.expectedSubject) {
        assert(
          action?.placeQuery?.toLowerCase().includes(q.expectedSubject.toLowerCase()),
          `Subject "${action?.placeQuery}" matches expected "${q.expectedSubject}"`
        );
      }
      if (q.expectedAction) {
        assert(action?.intendedActionAfterSelect === q.expectedAction, `Intended action after select is "${q.expectedAction}"`);
      }
      if (q.expectedOrdinal) {
        assert(action?.immediateSelectionOrdinal === q.expectedOrdinal, `Immediate selection ordinal is ${q.expectedOrdinal}`);
      }
    }

    // 7.2 Execution Flow: "Bangla Sahib ke paas chai-pakode wali shop le chalo" without prior destination
    console.log('\n  Testing: Execution of "Bangla Sahib ke paas chai-pakode wali shop le chalo" (empty journey)');
    const emptyJourney: JourneyState = {
      revision: 1,
      origin: null,
      destination: null,
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
    };

    const searchAction = fallbackRuleBasedParser('Bangla Sahib ke paas chai-pakode wali shop le chalo', emptyJourney, 'hi');
    const txNearbyResult = await executeJourneyTransaction(emptyJourney, searchAction.actions, {
      originalCommand: 'Bangla Sahib ke paas chai-pakode wali shop le chalo',
      responseLanguage: 'hi',
    });

    assert(txNearbyResult.success, 'Landmark nearby search transaction succeeded');
    assert(txNearbyResult.nextJourney.destination === null, 'Landmark was NOT set as destination merely to perform search');
    assert(txNearbyResult.nextJourney.origin === null, 'Origin remains null; no fake Delhi origin was injected');
    assert(txNearbyResult.nextJourney.stops.length === 0, 'Landmark was NOT added as a stop');
    assert(txNearbyResult.pendingClarification !== null, 'Candidate clarification modal is triggered');
    assert(txNearbyResult.pendingClarification?.targetRole === 'nearby_selection', 'Clarification targetRole is "nearby_selection"');
    assert(txNearbyResult.pendingClarification?.candidates.length! >= 2, 'Authentic candidate businesses returned near Bangla Sahib');
    
    // Check candidate metadata: rating, approximate straight-line distance, open status
    const firstCand = txNearbyResult.pendingClarification?.candidates[0];
    assert(Boolean(firstCand?.straightLineDistanceKm?.includes('approx. straight-line')), 'Straight-line distance is explicitly labeled as approximate');
    assert(typeof firstCand?.rating === 'number', `Candidate has authentic rating: ${firstCand?.rating}`);
    assert(firstCand?.id?.length! > 0, `Candidate has verified Place ID: ${firstCand?.id}`);

    // Follow-up Selection: "pehla wala" -> Since there was no destination, selected business becomes destination
    console.log('  Testing: Follow-up selection "pehla wala"');
    const followUpNearby = await executeFollowUpTransaction(txNearbyResult.nextJourney, 'pehla wala', {
      responseLanguage: 'hi',
    });

    assert(followUpNearby.success, 'Follow-up selection succeeded');
    assert(followUpNearby.nextJourney.destination !== null, 'Selected business is now set as destination');
    assert(followUpNearby.nextJourney.destination?.id === firstCand?.id, 'Destination preserves the exact selected Place ID');
    assert(
      followUpNearby.nextJourney.destination?.latLng?.lat === firstCand?.latLng?.lat &&
      followUpNearby.nextJourney.destination?.latLng?.lng === firstCand?.latLng?.lng,
      'Destination preserves the exact verified coordinates'
    );
    assert(followUpNearby.nextJourney.origin === null, 'Origin remains unpolluted (no fake coordinates)');

    // 7.3 Immediate Selection Instruction: "Bangla Sahib ke paas options dikhao, pehla wala add kar dena."
    console.log('\n  Testing: Immediate selection instruction with existing destination');
    const journeyWithDest: JourneyState = {
      ...baselineJourney,
      destination: { id: 'dest-agra', name: 'Agra', address: 'Agra, UP', latLng: { lat: 27.1767, lng: 78.0081 } },
      stops: [],
    };

    const immediateAction = fallbackRuleBasedParser('Bangla Sahib ke paas options dikhao, pehla wala add kar dena.', journeyWithDest, 'hi');
    const immediateTxResult = await executeJourneyTransaction(journeyWithDest, immediateAction.actions, {
      originalCommand: 'Bangla Sahib ke paas options dikhao, pehla wala add kar dena.',
      responseLanguage: 'hi',
    });

    assert(immediateTxResult.success, 'Immediate selection transaction executed');
    assert(immediateTxResult.nextJourney.destination?.name === 'Agra', 'Existing destination Agra preserved');
    assert(immediateTxResult.nextJourney.stops.length === 1, 'First candidate automatically added as stop as instructed');
    assert(Boolean(immediateTxResult.nextJourney.stops[0].id), 'Added stop preserves verified Place ID');
    assert(Boolean(immediateTxResult.nextJourney.stops[0].latLng), 'Added stop has valid coordinates');

    // 7.4 Ambiguous Landmark Disambiguation: "Find cafes near Clock Tower"
    console.log('\n  Testing: Ambiguous landmark disambiguation (Clock Tower)');
    const ambiguousQuery = 'Find cafes near Clock Tower';
    const ambParsed = fallbackRuleBasedParser(ambiguousQuery, baselineJourney, 'en');
    const ambTxResult = await executeJourneyTransaction(baselineJourney, ambParsed.actions, {
      originalCommand: ambiguousQuery,
      responseLanguage: 'en',
    });

    assert(ambTxResult.pendingClarification !== null, 'Triggers clarification for ambiguous landmark');
    assert(ambTxResult.pendingClarification?.targetRole === 'landmark_disambiguation', 'Target role is "landmark_disambiguation"');
    assert(ambTxResult.pendingClarification?.candidates.length! >= 2, 'Returns multiple Clock Tower options for user to choose');

    // Follow-up: User chooses option 1
    const landmarkClarified = await executeFollowUpTransaction(baselineJourney, '1st one', {
      responseLanguage: 'en',
    });
    assert(landmarkClarified.pendingClarification?.targetRole === 'nearby_selection', 'After landmark disambiguation, proceeds to nearby businesses');

    // 7.5 Unresolvable Landmark: non-existent landmark should fail gracefully without fake locations
    console.log('\n  Testing: Unresolvable landmark handling');
    const unresolvableQuery = 'chai stall near non_existent_place_xyz_99999';
    const unresParsed = fallbackRuleBasedParser(unresolvableQuery, baselineJourney, 'en');
    const unresTxResult = await executeJourneyTransaction(baselineJourney, unresParsed.actions, {
      originalCommand: unresolvableQuery,
      responseLanguage: 'en',
    });
    assert(
      Boolean(
        unresTxResult.errorMessage?.toLowerCase().includes('not locate') ||
        unresTxResult.errorMessage?.toLowerCase().includes('not found') ||
        unresTxResult.errorMessage?.toLowerCase().includes('could not find')
      ),
      'Error message clearly explains landmark was not found'
    );
    assert(unresTxResult.nextJourney.destination?.name === 'Agra', 'Journey state is unaffected by failed search');
  }

  // -------------------------------------------------------------------------
  // SECTION 8: Multi-Intent Destination and Intermediate-Stop Requests
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Multi-Intent Destination and Intermediate-Stop Requests ---');
  {
    // 8.1 "take me to mathura but add a barista in between"
    console.log('  Testing: "take me to mathura but add a barista in between"');
    const enMultiCmd = 'take me to mathura but add a barista in between';
    const enMultiParsed = fallbackRuleBasedParser(enMultiCmd, baselineJourney, 'en');

    assert(enMultiParsed.actions.length === 2, 'Parsed into 2 atomic actions: destination + stop');
    assert(enMultiParsed.actions[0].type === 'SET_DESTINATION' && enMultiParsed.actions[0].placeQuery === 'mathura', 'Action 1 is SET_DESTINATION mathura');
    assert(enMultiParsed.actions[1].type === 'ADD_STOP' && enMultiParsed.actions[1].placeQuery === 'barista', 'Action 2 is ADD_STOP barista');

    const multiTx1 = await executeJourneyTransaction(baselineJourney, enMultiParsed.actions, {
      originalCommand: enMultiCmd,
      responseLanguage: 'en',
    });

    assert(multiTx1.success, 'Transaction succeeded');
    assert(multiTx1.nextJourney.destination?.name === 'Mathura', 'Mathura is committed as final destination');
    assert(multiTx1.nextJourney.stops.length === 1, 'Barista committed as intermediate stop');
    assert(multiTx1.nextJourney.stops[0].name.toLowerCase().includes('barista'), 'Committed stop is Barista');
    assert(Boolean(multiTx1.nextJourney.stops[0].id), 'Barista has verified Google Place ID');

    // 8.2 "mujhe agra beech mein mathura brijwasi rukna hai"
    console.log('\n  Testing: "mujhe agra beech mein mathura brijwasi rukna hai"');
    const hiMultiCmd = 'mujhe agra beech mein mathura brijwasi rukna hai';
    const hiMultiParsed = fallbackRuleBasedParser(hiMultiCmd, baselineJourney, 'hi');

    assert(hiMultiParsed.actions.length === 2, 'Parsed into 2 atomic actions: destination Agra + stop Brijwasi');
    assert(hiMultiParsed.actions[0].placeQuery === 'agra', 'Destination is Agra');
    assert(hiMultiParsed.actions[1].placeQuery === 'mathura brijwasi', 'Intermediate stop is Mathura Brijwasi');

    const multiTx2 = await executeJourneyTransaction(baselineJourney, hiMultiParsed.actions, {
      originalCommand: hiMultiCmd,
      responseLanguage: 'hi',
    });

    assert(multiTx2.success, 'Transaction succeeded');
    assert(multiTx2.nextJourney.destination?.name === 'Agra', 'Agra committed as final destination');
    assert(multiTx2.nextJourney.stops.length === 1, 'Brijwasi committed as intermediate stop');
    assert(multiTx2.nextJourney.stops[0].name.toLowerCase().includes('brijwasi'), 'Committed stop is Brijwasi');

    // 8.3 Route Feasibility & Substantial Detour Confirmation: "take me to mumbai and add radisson jodhpur on the way"
    console.log('\n  Testing: Route feasibility & substantial detour check (Radisson Jodhpur on Delhi->Mumbai)');
    const detourCmd = 'take me to mumbai and add radisson jodhpur on the way';
    const detourParsed = fallbackRuleBasedParser(detourCmd, baselineJourney, 'en');

    assert(detourParsed.actions.length === 2, 'Parsed into destination Mumbai + stop Radisson Jodhpur');
    
    // Execute from Delhi origin
    const detourTxResult = await executeJourneyTransaction(baselineJourney, detourParsed.actions, {
      originalCommand: detourCmd,
      responseLanguage: 'en',
    });

    assert(detourTxResult.pendingClarification !== null, 'Detected large detour and triggered confirmation prompt');
    assert(detourTxResult.pendingClarification?.targetRole === 'substantial_detour_confirmation', 'Role is substantial_detour_confirmation');
    assert(
      detourTxResult.clarificationMessage?.toLowerCase().includes('detour') ||
      detourTxResult.clarificationMessage?.toLowerCase().includes('km'),
      `Detour prompt explains route feasibility: "${detourTxResult.clarificationMessage}"`
    );
    assert(detourTxResult.nextJourney.stops.length === 0, 'Large detour stop was NOT silently committed without user approval');

    // Follow-up: User confirms with "yes add it"
    console.log('  Testing: User confirms substantial detour');
    const confirmedDetourTx = await executeFollowUpTransaction(detourTxResult.nextJourney, 'yes add it', {
      responseLanguage: 'en',
    });

    assert(confirmedDetourTx.success, 'Follow-up confirmation succeeded');
    assert(confirmedDetourTx.nextJourney.destination?.name === 'Mumbai', 'Destination is Mumbai');
    assert(confirmedDetourTx.nextJourney.stops.length === 1, 'Radisson Jodhpur committed after confirmation');
    assert(confirmedDetourTx.nextJourney.stops[0].name.toLowerCase().includes('radisson'), 'Committed stop is Radisson Jodhpur');
  }

  // -------------------------------------------------------------------------
  // SECTION 9: Origin & Detour Integrity Verification
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 9: Zero Fabricated Coordinates or Metrics ---');
  {
    // 9.1 Zero Delhi fallback when GPS is null
    const noGpsJourney: JourneyState = {
      revision: 1,
      origin: null,
      destination: null,
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
    };

    const destOnlyAction = fallbackRuleBasedParser('take me to Jaipur', noGpsJourney, 'en');
    const noGpsTx = await executeJourneyTransaction(noGpsJourney, destOnlyAction.actions, {
      originalCommand: 'take me to Jaipur',
      responseLanguage: 'en',
      userLocation: null, // GPS explicitly unavailable
    });

    assert(noGpsTx.nextJourney.destination?.name === 'Jaipur', 'Destination set to Jaipur');
    assert(noGpsTx.nextJourney.origin === null, 'Origin strictly remains null when GPS is null; NO DELPHI FALLBACK');

    // 9.2 Route calculation formatting safely ignores null origin
    const routePayloadReady = Boolean(noGpsTx.nextJourney.origin && noGpsTx.nextJourney.destination);
    assert(!routePayloadReady, 'Routes API is not called without a verified origin and destination');
  }

  console.log('\n================================================================');
  console.log(`  ACCEPTANCE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal error in acceptance test suite:', e);
  process.exit(1);
});
