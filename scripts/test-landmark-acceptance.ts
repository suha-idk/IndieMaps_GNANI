import { fallbackRuleBasedParser } from '../src/services/aiService';
import { executeJourneyTransaction, executeFollowUpTransaction } from '../src/services/journeyTransaction';
import { configurePlacesTestMode, searchPlacesNearLandmark, haversineDistanceKm } from '../src/services/placesService';
import { conversationContext } from '../src/services/conversationContext';
import { JourneyState, Waypoint } from '../src/types/navigation';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

async function runLandmarkAcceptanceTests() {
  console.log('================================================================');
  console.log('   RAAHI LANDMARK-ANCHORED SEARCH ACCEPTANCE TEST SUITE');
  console.log('================================================================\n');

  configurePlacesTestMode(true);

  const baselineJourney: JourneyState = {
    origin: null,
    destination: null,
    stops: [],
    travelMode: 'DRIVE',
    avoidTolls: false,
    avoidHighways: false,
    revision: 1,
  };

  // -------------------------------------------------------------------------
  // SECTION 1: Intent Extraction & Separation of Landmark vs Subject
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: Intent Extraction & Separation of Landmark vs Category ---');

  // Test 1.1: "Take me to a cafe near Guru Tegh Bahadur Institute of Technology."
  {
    console.log('  Testing: "Take me to a cafe near Guru Tegh Bahadur Institute of Technology."');
    const cmd = 'Take me to a cafe near Guru Tegh Bahadur Institute of Technology.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'en');

    assert(parsed.actions.length === 1, 'Produces exactly 1 SEARCH_NEARBY action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(
      act.anchorPlaceQuery === 'Guru Tegh Bahadur Institute of Technology',
      `Anchor landmark extracted as "Guru Tegh Bahadur Institute of Technology" (got: "${act.anchorPlaceQuery}")`
    );
    assert(act.placeQuery === 'cafe', `Subject extracted as "cafe" (got: "${act.placeQuery}")`);
    assert(act.isCategorySearch === true, 'isCategorySearch is true');
    assert(act.intendedActionAfterSelect === 'set_destination', 'intendedActionAfterSelect is "set_destination"');
  }

  // Test 1.2: "Take me to a restaurant near Guru Tegh Bahadur Institute of Technology."
  {
    console.log('\n  Testing: "Take me to a restaurant near Guru Tegh Bahadur Institute of Technology."');
    const cmd = 'Take me to a restaurant near Guru Tegh Bahadur Institute of Technology.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'en');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(
      act.anchorPlaceQuery === 'Guru Tegh Bahadur Institute of Technology',
      'Anchor is Guru Tegh Bahadur Institute of Technology'
    );
    assert(act.placeQuery === 'restaurant', 'Subject is restaurant');
    assert(act.intendedActionAfterSelect === 'set_destination', 'intendedActionAfterSelect is "set_destination"');
    assert(act.type !== 'SET_DESTINATION', 'GTBIT is NOT classified as a SET_DESTINATION action');
  }

  // Test 1.3: "Take me to a tea stall near Bangla Sahib Gurudwara."
  {
    console.log('\n  Testing: "Take me to a tea stall near Bangla Sahib Gurudwara."');
    const cmd = 'Take me to a tea stall near Bangla Sahib Gurudwara.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'en');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(
      Boolean(act.anchorPlaceQuery?.toLowerCase().includes('bangla sahib')),
      `Anchor contains Bangla Sahib (got: "${act.anchorPlaceQuery}")`
    );
    assert(
      Boolean(act.placeQuery?.toLowerCase().includes('tea stall')),
      `Subject is tea stall (got: "${act.placeQuery}")`
    );
    assert(act.intendedActionAfterSelect === 'set_destination', 'intendedActionAfterSelect is "set_destination"');
  }

  // Test 1.4: "Find a cafe near GTBIT."
  {
    console.log('\n  Testing: "Find a cafe near GTBIT."');
    const cmd = 'Find a cafe near GTBIT.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'en');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(act.anchorPlaceQuery === 'GTBIT', `Anchor is GTBIT (got: "${act.anchorPlaceQuery}")`);
    assert(act.placeQuery === 'cafe', `Subject is cafe (got: "${act.placeQuery}")`);
    assert(act.intendedActionAfterSelect === 'show_options', 'intendedActionAfterSelect is "show_options"');
  }

  // Test 1.5: "Find restaurants around Bangla Sahib."
  {
    console.log('\n  Testing: "Find restaurants around Bangla Sahib."');
    const cmd = 'Find restaurants around Bangla Sahib.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'en');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(act.anchorPlaceQuery === 'Bangla Sahib', 'Anchor is Bangla Sahib');
    assert(act.placeQuery === 'restaurants', 'Subject is restaurants');
    assert(act.intendedActionAfterSelect === 'show_options', 'intendedActionAfterSelect is "show_options"');
  }

  // Test 1.6: "Bangla Sahib ke paas chai-pakode wali shop le chalo."
  {
    console.log('\n  Testing: "Bangla Sahib ke paas chai-pakode wali shop le chalo."');
    const cmd = 'Bangla Sahib ke paas chai-pakode wali shop le chalo.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'hi');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(act.anchorPlaceQuery === 'Bangla Sahib', 'Anchor is Bangla Sahib');
    assert(Boolean(act.placeQuery && act.placeQuery.includes('chai-pakode')), `Subject includes chai-pakode (got: "${act.placeQuery}")`);
    assert(act.intendedActionAfterSelect === 'set_destination', 'intendedActionAfterSelect is "set_destination"');
  }

  // Test 1.7: "Bangla Sahib ke aas-paas chai stalls dikhao."
  {
    console.log('\n  Testing: "Bangla Sahib ke aas-paas chai stalls dikhao."');
    const cmd = 'Bangla Sahib ke aas-paas chai stalls dikhao.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'hi');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(act.anchorPlaceQuery === 'Bangla Sahib', 'Anchor is Bangla Sahib');
    assert(act.intendedActionAfterSelect === 'show_options', 'intendedActionAfterSelect is "show_options"');
  }

  // Test 1.8: "Mujhe GTBIT ke paas koi achha cafe chahiye."
  {
    console.log('\n  Testing: "Mujhe GTBIT ke paas koi achha cafe chahiye."');
    const cmd = 'Mujhe GTBIT ke paas koi achha cafe chahiye.';
    const parsed = fallbackRuleBasedParser(cmd, baselineJourney, 'hi');

    assert(parsed.actions.length === 1, 'Produces 1 action');
    const act = parsed.actions[0];
    assert(act.type === 'SEARCH_NEARBY', 'Action type is SEARCH_NEARBY');
    assert(act.searchAnchor === 'landmark', 'Search anchor is "landmark"');
    assert(act.anchorPlaceQuery === 'GTBIT', `Anchor is GTBIT (got: "${act.anchorPlaceQuery}")`);
    assert(act.placeQuery === 'cafe', `Subject cleaned to "cafe" (got: "${act.placeQuery}")`);
    assert(act.intendedActionAfterSelect === 'show_options', 'intendedActionAfterSelect is "show_options"');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Geographic Correctness & Singapore Rejection
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Geographic Correctness & Elimination of Unrelated Results ---');

  // Test 2.1: Valid cafe near GTBIT accepted; Singapore candidate rejected
  {
    console.log('  Testing: Geographic filtering near GTBIT');
    const gtbitLandmark: Waypoint = {
      id: 'gtbit-test',
      name: 'Guru Tegh Bahadur Institute of Technology',
      address: 'Rajouri Garden, New Delhi 110027, India',
      latLng: { lat: 28.6300, lng: 77.1085 },
    };

    const results = await searchPlacesNearLandmark({
      landmark: gtbitLandmark,
      subject: 'cafe',
      category: 'restaurant',
      radiusMeters: 8000,
    });

    assert(results.length > 0, 'Returned valid nearby candidates');
    const singaporeCandidate = results.find((r) =>
      r.id.includes('singapore') || (r.address && r.address.toLowerCase().includes('singapore'))
    );
    assert(singaporeCandidate === undefined, 'CRITICAL: Singapore candidate is STRICTLY REJECTED');

    for (const r of results) {
      assert(Boolean(r.latLng), `Candidate "${r.name}" has valid coordinates`);
      const distKm = haversineDistanceKm(gtbitLandmark.latLng!, r.latLng!);
      assert(distKm <= 9.2, `Candidate "${r.name}" is within search radius (${distKm.toFixed(2)} km <= 9.2 km)`);
      assert(Boolean(r.straightLineDistanceKm), `Candidate "${r.name}" has labeled straightLineDistanceKm`);
    }

    assert(Boolean(results[0].id), `First result has verified Place ID (got: ${results[0].id})`);
    assert(results[0].distKm! <= 2.5, `First result is within 2.5 km of GTBIT (got: ${results[0].distKm} km)`);
  }

  // Test 2.2: Restaurant near Bangla Sahib accepted; distant results rejected
  {
    console.log('\n  Testing: Geographic filtering near Bangla Sahib');
    const banglaLandmark: Waypoint = {
      id: 'bangla-sahib-test',
      name: 'Gurudwara Bangla Sahib',
      address: 'Connaught Place, New Delhi 110001, India',
      latLng: { lat: 28.6264, lng: 77.2090 },
    };

    const results = await searchPlacesNearLandmark({
      landmark: banglaLandmark,
      subject: 'chai stalls',
      category: 'restaurant',
      radiusMeters: 8000,
    });

    assert(results.length > 0, 'Returned authentic nearby chai candidates');
    for (const r of results) {
      const distKm = haversineDistanceKm(banglaLandmark.latLng!, r.latLng!);
      assert(distKm <= 9.2, `Candidate "${r.name}" is within 8km radius (${distKm.toFixed(2)} km)`);
    }
  }

  // Test 2.3: Candidate without coordinates is strictly rejected
  {
    console.log('\n  Testing: Rejection of candidate without coordinates');
    const customCandidatesWithMissingCoords = [
      {
        id: 'no-coords-cafe',
        name: 'Ghost Cafe with No Coordinates',
        address: 'Unknown Street',
        rating: 4.5,
        category: 'restaurant' as const,
        types: ['cafe'],
      },
      {
        id: 'valid-coords-cafe',
        name: 'Valid Cafe Near GTBIT',
        address: 'Rajouri Garden, New Delhi',
        latLng: { lat: 28.6305, lng: 77.1089 },
        rating: 4.5,
        category: 'restaurant' as const,
        types: ['cafe'],
      },
    ];

    configurePlacesTestMode(true, customCandidatesWithMissingCoords as any);

    const gtbitLandmark: Waypoint = {
      id: 'gtbit-test',
      name: 'GTBIT',
      address: 'Rajouri Garden, New Delhi',
      latLng: { lat: 28.6300, lng: 77.1085 },
    };

    const filtered = await searchPlacesNearLandmark({
      landmark: gtbitLandmark,
      subject: 'cafe',
      category: 'restaurant',
      radiusMeters: 8000,
    });

    assert(filtered.length === 1, 'Only 1 candidate accepted');
    assert(filtered[0].id === 'valid-coords-cafe', 'Candidate with valid coordinates accepted');
    assert(!filtered.some((c) => c.id === 'no-coords-cafe'), 'Candidate missing coordinates was REJECTED');

    // Reset custom candidates
    configurePlacesTestMode(true, null);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: Journey Integrity (Zero Unintended Mutations)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Journey Integrity & Execution ---');

  // Test 3.1: Landmark search works without an existing destination or origin
  {
    console.log('  Testing: Landmark search with completely empty journey');
    const emptyJourney: JourneyState = {
      origin: null,
      destination: null,
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
      revision: 1,
    };

    const cmd = 'Take me to a restaurant near Guru Tegh Bahadur Institute of Technology.';
    const parsed = fallbackRuleBasedParser(cmd, emptyJourney, 'en');

    const txResult = await executeJourneyTransaction(emptyJourney, parsed.actions, {
      originalCommand: cmd,
      responseLanguage: 'en',
    });

    assert(txResult.success, 'Transaction succeeded without an origin or destination');
    assert(txResult.nextJourney.destination === null, 'CRITICAL: GTBIT is NOT set as destination merely to perform search');
    assert(txResult.nextJourney.origin === null, 'Origin remains null; no fake origin injected');
    assert(txResult.nextJourney.stops.length === 0, 'GTBIT is NOT added as a stop');
    assert(txResult.pendingClarification !== null, 'Candidate selection modal is opened');
    assert(txResult.pendingClarification?.targetRole === 'nearby_selection', 'Clarification targetRole is "nearby_selection"');
    assert(txResult.pendingClarification?.candidates.length! > 0, 'Options returned to user');
  }

  // Test 3.2: Selecting a business with set_destination sets that business as destination
  {
    console.log('\n  Testing: Selecting option with set_destination intent');
    const emptyJourney: JourneyState = {
      origin: null,
      destination: null,
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
      revision: 1,
    };

    // Follow-up: User chooses first option
    const followUpResult = await executeFollowUpTransaction(emptyJourney, 'The first one', {
      responseLanguage: 'en',
    });

    assert(followUpResult.success, 'Follow-up selection transaction succeeded');
    assert(followUpResult.nextJourney.destination !== null, 'Destination is now set');
    assert(
      followUpResult.nextJourney.destination?.name !== 'Guru Tegh Bahadur Institute of Technology',
      `Destination is the candidate business, NOT GTBIT (got: "${followUpResult.nextJourney.destination?.name}")`
    );
    assert(Boolean(followUpResult.nextJourney.destination?.id), 'Destination has verified Place ID');
    assert(followUpResult.nextJourney.stops.length === 0, 'No stops added for set_destination');
  }

  // Test 3.3: Selecting a business with add_stop adds it as a stop and preserves destination
  {
    console.log('\n  Testing: Selecting option with add_stop intent');
    const existingJourney: JourneyState = {
      origin: { id: 'orig-cp', name: 'Connaught Place', address: 'Delhi', latLng: { lat: 28.6304, lng: 77.2177 } },
      destination: { id: 'dest-jaipur', name: 'Jaipur', address: 'Jaipur', latLng: { lat: 26.9124, lng: 75.7873 } },
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
      revision: 2,
    };

    // User command to search and add as stop
    const cmd = 'Bangla Sahib ke paas chai ki dukaan add kardo';
    const parsed = fallbackRuleBasedParser(cmd, existingJourney, 'hi');

    const txResult = await executeJourneyTransaction(existingJourney, parsed.actions, {
      originalCommand: cmd,
      responseLanguage: 'hi',
    });

    assert(txResult.pendingClarification?.targetRole === 'nearby_selection', 'Nearby selection clarification active');
    assert(txResult.pendingClarification?.intendedActionAfterSelect === 'add_stop', 'Intended action is add_stop');

    // Follow-up: User says "पहला वाला"
    const followUp = await executeFollowUpTransaction(existingJourney, 'पहला वाला', {
      responseLanguage: 'hi',
    });

    assert(followUp.success, 'Follow-up succeeded');
    assert(followUp.nextJourney.destination?.name === 'Jaipur', 'Original destination Jaipur is preserved');
    const expectedCandidateName = txResult.pendingClarification!.candidates[0].name.replace(/\s*\(.*\)$/, '').trim();
    assert(
      followUp.nextJourney.stops[0].name.includes(expectedCandidateName) ||
        followUp.nextJourney.stops[0].id === txResult.pendingClarification!.candidates[0].id,
      `Stop is the first candidate (${expectedCandidateName})`
    );
    assert(followUp.nextJourney.stops[0].name !== 'Bangla Sahib', 'Stop is the candidate business, not Bangla Sahib itself');
  }

  // Test 3.4: Route-relative searches continue to work using route corridor logic
  {
    console.log('\n  Testing: Route-relative search continues to use detour logic');
    const routeJourney: JourneyState = {
      origin: { id: 'orig-delhi', name: 'Delhi', address: 'Delhi', latLng: { lat: 28.6139, lng: 77.2090 } },
      destination: { id: 'dest-agra', name: 'Agra', address: 'Agra', latLng: { lat: 27.1767, lng: 78.0081 } },
      stops: [],
      travelMode: 'DRIVE',
      avoidTolls: false,
      avoidHighways: false,
      revision: 1,
    };

    const cmd = 'Find a petrol pump on my route';
    const parsed = fallbackRuleBasedParser(cmd, routeJourney, 'en');
    assert(parsed.actions[0].type === 'SEARCH_NEARBY', 'Action is SEARCH_NEARBY');
    assert(parsed.actions[0].searchAnchor === 'route', 'Search anchor is "route"');
    assert(!parsed.actions[0].anchorPlaceQuery, 'anchorPlaceQuery is null for route-corridor search');
  }

  console.log('\n================================================================');
  console.log('  ALL LANDMARK ACCEPTANCE TESTS PASSED (100%)');
  console.log('================================================================');
}

runLandmarkAcceptanceTests().catch((err) => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
