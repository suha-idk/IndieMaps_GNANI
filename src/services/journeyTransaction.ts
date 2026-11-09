import {
  AtomicAction,
  DetourCandidate,
  JourneyState,
  LatLng,
  Waypoint,
} from '../types/navigation';
import { conversationContext, PendingClarification, ClarificationCandidate } from './conversationContext';
import { resolveSearchAnchor } from './anchorService';
import { findLowestDetourStop } from './detourService';
import {
  resolvePlaceDetailed,
  resolvePlaceToWaypoint,
  searchPlacesNearLandmark,
  haversineDistanceKm,
} from './placesService';

export interface TransactionContext {
  userLocation?: LatLng | null;
  activeRoutePath?: LatLng[];
  responseLanguage?: string;
  originalCommand?: string;
}

export interface JourneyTransactionResult {
  success: boolean;
  nextJourney: JourneyState;
  appliedDescriptions: string[];
  spokenResponse?: string;
  clarificationMessage?: string;
  errorMessage?: string;
  pendingClarification?: PendingClarification | null;
  detourCandidates?: DetourCandidate[];
}

/**
 * Executes a set of atomic actions as a single consolidated journey mutation transaction.
 * Pure logic: does not depend on React hooks, can be called by JourneyContext or automated test suites.
 */
export async function executeJourneyTransaction(
  current: JourneyState,
  actions: AtomicAction[],
  context: TransactionContext = {}
): Promise<JourneyTransactionResult> {
  const { userLocation, activeRoutePath, responseLanguage = 'hi', originalCommand = '' } = context;
  const isHindi = responseLanguage.startsWith('hi') || /[\u0900-\u097F]/.test(originalCommand);

  let updatedStops = [...current.stops];
  let updatedDestination = current.destination;
  let updatedOrigin = current.origin;
  let updatedTravelMode = current.travelMode;
  let updatedAvoidTolls = current.avoidTolls;
  const appliedDescriptions: string[] = [];
  let returnedDetourCandidates: DetourCandidate[] | undefined = undefined;

  // ---------------------------------------------------------------------------
  // Step 0: Test 5 Ambiguity Handling ("Actually Jaipur भी जाना है, but सबसे पहले petrol भरवाना है")
  // If user says "X भी जाना है" when an existing destination is already set,
  // do not silently replace destination or guess arbitrarily.
  // Prioritized stop (petrol) is applied immediately; clarification is asked for X.
  // ---------------------------------------------------------------------------
  const isAmbiguousDestinationAddition = Boolean(
    current.destination &&
    originalCommand &&
    /(?:भी जाना है|bhi jaana hai|also want to go|also go to)/i.test(originalCommand) &&
    !/(?:destination same|मंजिल मत बदलना|destination mat badalna)/i.test(originalCommand)
  );

  let ambiguousPlaceAction: AtomicAction | undefined = undefined;
  let filteredActions = actions;

  if (isAmbiguousDestinationAddition) {
    ambiguousPlaceAction = actions.find(
      (a) =>
        (a.type === 'ADD_STOP' || a.type === 'SET_DESTINATION' || a.type === 'CHANGE_DESTINATION') &&
        a.placeQuery &&
        !a.category
    );

    if (ambiguousPlaceAction) {
      // Exclude the ambiguous place from the immediate action batch so petrol can be applied first
      filteredActions = actions.filter((a) => a !== ambiguousPlaceAction);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1: REMOVALS (Ordinals processed in descending order to avoid index shifts)
  // ---------------------------------------------------------------------------
  const removalActions = filteredActions.filter((a) => a.type === 'REMOVE_STOP');
  const ordinalRemovals = removalActions
    .filter((r) => r.targetStopIdentifier?.byOrdinal)
    .sort((a, b) => b.targetStopIdentifier!.byOrdinal! - a.targetStopIdentifier!.byOrdinal!);

  for (const rem of ordinalRemovals) {
    const ordIdx = rem.targetStopIdentifier!.byOrdinal! - 1;
    if (ordIdx >= 0 && ordIdx < updatedStops.length) {
      const removedName = updatedStops[ordIdx].name;
      updatedStops = updatedStops.filter((_, i) => i !== ordIdx);
      appliedDescriptions.push(`removed stop #${ordIdx + 1} (${removedName})`);
    }
  }

  // Process named or category removals
  const namedRemovals = removalActions.filter((r) => !r.targetStopIdentifier?.byOrdinal);
  for (const rem of namedRemovals) {
    const targetName = rem.targetStopIdentifier?.byName?.toLowerCase().trim();
    const targetCategory = rem.category;

    const matchIdx = updatedStops.findIndex((s) => {
      if (targetCategory && s.category === targetCategory) return true;
      if (targetName) {
        const sName = s.name.toLowerCase();
        const sAddr = (s.address || '').toLowerCase();
        if (sName.includes(targetName) || sAddr.includes(targetName)) {
          return true;
        }
        if (targetName.includes('petrol') || targetName.includes('gas station') || targetName.includes('fuel')) {
          return s.category === 'gas_station' || /petrol|fuel|indianoil|hp|bharat|shell/i.test(sName);
        }
        if (targetName.includes('cng')) {
          return s.category === 'cng_station' || /cng/i.test(sName);
        }
        if (targetName.includes('tea') || targetName.includes('chai') || targetName.includes('food') || targetName.includes('dhaba')) {
          return s.category === 'restaurant' || /tea|chai|dhaba|restaurant|cafe/i.test(sName);
        }
      }
      return false;
    });

    if (matchIdx !== -1) {
      const removedName = updatedStops[matchIdx].name;
      updatedStops = updatedStops.filter((_, i) => i !== matchIdx);
      appliedDescriptions.push(`removed ${removedName}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: Travel Mode & Toll Avoidance
  // ---------------------------------------------------------------------------
  const modeAction = filteredActions.find((a) => a.type === 'SET_TRAVEL_MODE');
  if (modeAction?.travelMode) {
    updatedTravelMode = modeAction.travelMode;
    appliedDescriptions.push(`travel mode set to ${updatedTravelMode}`);
  }

  const tollAction = filteredActions.find((a) => a.type === 'TOGGLE_TOLLS');
  if (tollAction) {
    updatedAvoidTolls = tollAction.avoidTolls !== undefined ? tollAction.avoidTolls : !updatedAvoidTolls;
    appliedDescriptions.push(updatedAvoidTolls ? 'avoiding tolls' : 'allowing tolls');
  }

  // ---------------------------------------------------------------------------
  // Step 3: Destination and Origin updates
  // ---------------------------------------------------------------------------
  const destAction = filteredActions.find(
    (a) => a.type === 'SET_DESTINATION' || a.type === 'CHANGE_DESTINATION'
  );
  const origAction = filteredActions.find(
    (a) => a.type === 'SET_ORIGIN' || a.type === 'CHANGE_ORIGIN'
  );

  const shouldPreserveDestination = filteredActions.some((a) => a.preserveDestination);

  if (destAction?.placeQuery && !shouldPreserveDestination) {
    const bias = updatedOrigin?.latLng || userLocation || undefined;
    const destRes = await resolvePlaceDetailed(
      destAction.placeQuery,
      bias,
      destAction.category,
      destAction.normalizedName,
      destAction.localityContext
    );

    if (destRes.status === 'ambiguous' && destRes.candidates.length >= 2) {
      const pending = conversationContext.setPendingClarification({
        originalCommand,
        targetRole: 'destination',
        query: destAction.placeQuery,
        candidates: destRes.candidates.map((c, i) => ({
          index: i + 1,
          id: c.id,
          name: c.name,
          address: c.address,
          latLng: c.latLng,
          category: c.category,
          confidenceScore: c.confidenceScore,
        })),
        pendingActions: filteredActions.filter((a) => a !== destAction),
        targetAction: destAction,
        responseLanguage,
      });

      const clarifyMsg =
        destRes.clarificationMessage ||
        `Found multiple matching locations for "${destAction.placeQuery}". Which one do you mean?`;

      return {
        success: true,
        nextJourney: current,
        appliedDescriptions: [],
        clarificationMessage: clarifyMsg,
        spokenResponse: clarifyMsg,
        pendingClarification: pending,
      };
    }

    if (destRes.waypoint) {
      updatedDestination = destRes.waypoint;
      appliedDescriptions.push(`destination set to ${destRes.waypoint.name}`);
    } else {
      appliedDescriptions.push(`could not verify destination "${destAction.placeQuery}"`);
    }
  }

  if (origAction?.placeQuery) {
    if (
      origAction.placeQuery.toLowerCase().includes('current') ||
      origAction.placeQuery.toLowerCase().includes('meri location')
    ) {
      if (userLocation) {
        updatedOrigin = {
          id: 'curr-loc',
          name: 'Current Location',
          address: 'My Current GPS Location',
          latLng: userLocation,
          isCurrentLocation: true,
        };
        appliedDescriptions.push('origin set to current location');
      } else {
        appliedDescriptions.push('GPS location unavailable, please specify starting point');
      }
    } else {
      const resolvedOrig = await resolvePlaceToWaypoint(origAction.placeQuery);
      if (resolvedOrig) {
        updatedOrigin = resolvedOrig;
        appliedDescriptions.push(`origin set to ${resolvedOrig.name}`);
      } else {
        appliedDescriptions.push(`could not verify origin "${origAction.placeQuery}"`);
      }
    }
  }

  // Ensure origin exists if destination is set - NO hardcoded city fallbacks!
  if (updatedDestination && !updatedOrigin) {
    if (userLocation) {
      updatedOrigin = {
        id: 'curr-loc',
        name: 'Current Location',
        address: 'My Current GPS Location',
        latLng: userLocation,
        isCurrentLocation: true,
      };
    } else {
      // If GPS is unavailable, NEVER substitute Delhi, Jaipur, or any default city!
      // Origin remains null; route will not calculate until user sets/confirms origin.
      appliedDescriptions.push('please specify your starting location (origin)');
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3.5: Handle SEARCH_NEARBY actions (Landmark-anchored or location-based)
  // ---------------------------------------------------------------------------
  const searchNearbyActions = filteredActions.filter((a) => a.type === 'SEARCH_NEARBY');
  for (const sAct of searchNearbyActions) {
    if (sAct.searchAnchor === 'landmark' || sAct.anchorPlaceQuery) {
      const landmarkQuery = sAct.anchorPlaceQuery || '';
      const landmarkRes = await resolvePlaceDetailed(landmarkQuery);

      if (landmarkRes.status === 'not_found' || !landmarkRes.waypoint) {
        const notFoundMsg = isHindi
          ? `लैंडमार्क "${landmarkQuery}" नहीं मिला। कृपया लैंडमार्क का नाम स्पष्ट करें।`
          : `Could not locate landmark "${landmarkQuery}". Please clarify the landmark location.`;
        return {
          success: false,
          nextJourney: current,
          appliedDescriptions: [`could not locate landmark "${landmarkQuery}"`],
          spokenResponse: notFoundMsg,
          clarificationMessage: notFoundMsg,
          errorMessage: notFoundMsg,
        };
      }

      if (landmarkRes.status === 'ambiguous' && landmarkRes.candidates.length > 1) {
        const pending = conversationContext.setPendingClarification({
          originalCommand,
          targetRole: 'landmark_disambiguation',
          query: landmarkQuery,
          candidates: landmarkRes.candidates.map((c, i) => ({
            index: i + 1,
            id: c.id,
            name: c.name,
            address: c.address,
            latLng: c.latLng,
            category: 'landmark',
          })),
          pendingActions: filteredActions.filter((a) => a !== sAct),
          targetAction: sAct,
          responseLanguage,
          intendedActionAfterSelect: sAct.intendedActionAfterSelect,
        });

        const clarifyMsg = isHindi
          ? `"${landmarkQuery}" के कई स्थान मिले हैं। आप कौन सा लैंडमार्क चुनना चाहते हैं?`
          : `Found multiple locations for "${landmarkQuery}". Which landmark do you mean?`;

        return {
          success: true,
          nextJourney: current,
          appliedDescriptions: [`clarifying landmark "${landmarkQuery}"`],
          spokenResponse: clarifyMsg,
          clarificationMessage: clarifyMsg,
          pendingClarification: pending,
        };
      }

      const landmarkWp = landmarkRes.waypoint;
      const nearbyResults = await searchPlacesNearLandmark({
        landmark: landmarkWp,
        subject: sAct.placeQuery || 'places',
        category: sAct.category,
        minRating: sAct.minRating,
      });

      if (nearbyResults.length === 0) {
        const emptyMsg = isHindi
          ? `${landmarkWp.name} के पास कोई उपयुक्त विकल्प नहीं मिला।`
          : `No matching places found near ${landmarkWp.name}.`;
        return {
          success: true,
          nextJourney: current,
          appliedDescriptions: [`no results found near ${landmarkWp.name}`],
          spokenResponse: emptyMsg,
          clarificationMessage: emptyMsg,
        };
      }

      // If user instructed an immediate selection and that result exists:
      const immOrd = sAct.immediateSelectionOrdinal;
      if (typeof immOrd === 'number' && immOrd >= 1 && immOrd <= nearbyResults.length) {
        const chosenCandidate = nearbyResults[immOrd - 1];
        const chosenWp: Waypoint = {
          id: chosenCandidate.id,
          name: chosenCandidate.name,
          address: chosenCandidate.address,
          latLng: chosenCandidate.latLng,
          placeId: chosenCandidate.id,
          category: chosenCandidate.category || sAct.category || 'custom',
          addedVia: 'voice',
        };

        if (sAct.intendedActionAfterSelect === 'add_stop') {
          updatedStops.push(chosenWp);
          appliedDescriptions.push(`added ${chosenWp.name} as stop near ${landmarkWp.name}`);
        } else if (sAct.intendedActionAfterSelect === 'set_destination' || !current.destination) {
          updatedDestination = chosenWp;
          appliedDescriptions.push(`destination set to ${chosenWp.name} (near ${landmarkWp.name})`);
        } else {
          updatedStops.push(chosenWp);
          appliedDescriptions.push(`added ${chosenWp.name} near ${landmarkWp.name}`);
        }
      } else {
        // Register candidates in conversationContext for user follow-up selection
        const clarifyCandidates: ClarificationCandidate[] = nearbyResults.slice(0, 5).map((c, i) => ({
          index: i + 1,
          id: c.id,
          name: c.name,
          address: c.address,
          latLng: c.latLng,
          rating: c.rating,
          userRatingCount: c.userRatingCount,
          openNow: c.openNow,
          straightLineDistanceKm: c.straightLineDistanceKm,
          category: c.category || sAct.category,
          targetRole: 'nearby_selection',
        }));

        const pending = conversationContext.setPendingClarification({
          originalCommand,
          targetRole: 'nearby_selection',
          anchorName: landmarkWp.name,
          query: sAct.placeQuery || 'places',
          candidates: clarifyCandidates,
          pendingActions: filteredActions.filter((a) => a !== sAct),
          targetAction: sAct,
          responseLanguage,
          intendedActionAfterSelect: sAct.intendedActionAfterSelect || 'show_options',
        });

        const spokenMsg = isHindi
          ? `${landmarkWp.name} के पास ${clarifyCandidates.length} विकल्प मिले हैं। पहला वाला या दूसरा वाला कौन सा चुनना है?`
          : `Found ${clarifyCandidates.length} options near ${landmarkWp.name}. Which one would you like to choose?`;

        return {
          success: true,
          nextJourney: current, // Temporary search anchor: NEVER added as destination or stop!
          appliedDescriptions: [`displayed options near ${landmarkWp.name}`],
          spokenResponse: spokenMsg,
          clarificationMessage: spokenMsg,
          pendingClarification: pending,
          detourCandidates: clarifyCandidates as any,
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: Resolve and insert ADD_STOP actions
  // ---------------------------------------------------------------------------
  const addActions = filteredActions.filter(
    (a) => a.type === 'ADD_STOP' || a.type === 'ADD_SMART_STOP'
  );

  for (const add of addActions) {
    if (!add.placeQuery) continue;

    const resolvedAnchor = resolveSearchAnchor(
      { ...current, origin: updatedOrigin, destination: updatedDestination, stops: updatedStops },
      userLocation || null,
      add.searchAnchor,
      undefined,
      activeRoutePath
    );

    const cleanQuery = add.placeQuery;
    const biasCenter = resolvedAnchor?.coordinates || updatedOrigin?.latLng || userLocation || undefined;
    let resolvedWp: Waypoint | null = null;

    const isCategoryRouteStop = Boolean(
      add.category && (
        add.searchAnchor === 'route' ||
        add.isCategorySearch ||
        /pump|station|petrol|cng|fuel/i.test(cleanQuery)
      )
    );

    if (isCategoryRouteStop) {
      const detourRes = await findLowestDetourStop(
        { ...current, origin: updatedOrigin, destination: updatedDestination, stops: updatedStops },
        add.category,
        add.searchAnchor || 'route',
        undefined,
        userLocation || null,
        activeRoutePath,
        cleanQuery,
        add.minRating
      );

      if (detourRes.ranked.length > 0) {
        returnedDetourCandidates = detourRes.ranked;
        const best = detourRes.best || detourRes.ranked[0];
        resolvedWp = {
          id: best.id || `stop-${Date.now()}`,
          placeId: best.id,
          name: best.name || best.displayName?.text || (add.category === 'gas_station' ? 'Petrol Station' : cleanQuery),
          address: best.formattedAddress || 'Along Route',
          latLng: best.location ? { lat: best.location.latitude, lng: best.location.longitude } : (best as any).latLng,
          category: add.category,
          addedVia: 'detour_optimizer',
        };
        if (typeof best.bestInsertIndex === 'number' && !add.position) {
          (add as any).bestInsertIndex = best.bestInsertIndex;
        }
      }
    }

    if (!resolvedWp) {
      const detailedWp = await resolvePlaceDetailed(
        cleanQuery,
        biasCenter,
        add.category,
        add.normalizedName,
        add.localityContext
      );

      if (detailedWp.status === 'ambiguous' && detailedWp.candidates.length >= 2) {
        const pending = conversationContext.setPendingClarification({
          originalCommand,
          targetRole: 'stop',
          query: cleanQuery,
          candidates: detailedWp.candidates.map((c, i) => ({
            index: i + 1,
            id: c.id,
            name: c.name,
            address: c.address,
            latLng: c.latLng,
            category: c.category,
            confidenceScore: c.confidenceScore,
          })),
          pendingActions: addActions.filter((a) => a !== add),
          targetAction: add,
          responseLanguage,
        });

        const clarifyMsg =
          detailedWp.clarificationMessage ||
          `Found multiple matching locations for "${cleanQuery}". Which one do you mean?`;

        return {
          success: true,
          nextJourney: current,
          appliedDescriptions: [],
          clarificationMessage: clarifyMsg,
          spokenResponse: clarifyMsg,
          pendingClarification: pending,
        };
      }
      resolvedWp = detailedWp.waypoint;
    }

    if (resolvedWp) {
      // Check for route feasibility / large detour on explicitly requested named stops "on the way"
      const origCoord = updatedOrigin?.latLng || userLocation;
      const destCoord = updatedDestination?.latLng;
      if (
        origCoord &&
        destCoord &&
        resolvedWp.latLng &&
        !add.isSubstantialDetourConfirmed &&
        (add.searchAnchor === 'route' || !add.searchAnchor) &&
        !add.category
      ) {
        const directDist = haversineDistanceKm(origCoord, destCoord);
        const detourDist =
          haversineDistanceKm(origCoord, resolvedWp.latLng) +
          haversineDistanceKm(resolvedWp.latLng, destCoord) -
          directDist;

        if (detourDist >= 120) {
          const detourKmRounded = Math.round(detourDist);
          const confirmText = isHindi
            ? `${resolvedWp.name} को जोड़ने पर लगभग ${detourKmRounded} किमी का बड़ा चक्कर लग रहा है। क्या आप फिर भी इसे रास्ते में जोड़ना चाहते हैं?`
            : `Adding ${resolvedWp.name} creates a substantial detour of approximately ${detourKmRounded} km. Do you still want to add it as a stop on the way to ${updatedDestination?.name || 'destination'}?`;

          const pending = conversationContext.setPendingClarification({
            originalCommand,
            targetRole: 'substantial_detour_confirmation',
            query: resolvedWp.name,
            candidates: [
              {
                index: 1,
                id: resolvedWp.id,
                name: resolvedWp.name,
                address: resolvedWp.address,
                latLng: resolvedWp.latLng,
                detourKm: `${detourKmRounded} km`,
                category: 'stop',
              },
            ],
            pendingActions: addActions.filter((a) => a !== add),
            targetAction: { ...add, isSubstantialDetourConfirmed: true },
            responseLanguage,
          });

          return {
            success: true,
            nextJourney: { ...current, destination: updatedDestination, origin: updatedOrigin },
            appliedDescriptions: [
              `asked confirmation for substantial detour to ${resolvedWp.name} (${detourKmRounded} km)`,
            ],
            spokenResponse: confirmText,
            clarificationMessage: confirmText,
            pendingClarification: pending,
          };
        }
      }

      const isDuplicate = updatedStops.some(
        (s) =>
          (resolvedWp!.placeId && s.placeId === resolvedWp!.placeId) ||
          s.name.toLowerCase() === resolvedWp!.name.toLowerCase()
      );

      if (!isDuplicate) {
        if (add.position === 'start' || add.searchAnchor === 'origin') {
          updatedStops.unshift(resolvedWp);
          appliedDescriptions.push(`added ${resolvedWp.name} as stop #1`);
        } else if (add.position === 'end' || add.searchAnchor === 'destination') {
          updatedStops.push(resolvedWp);
          appliedDescriptions.push(`added ${resolvedWp.name}`);
        } else if (add.position === 'before') {
          if (add.relativeTo === 'destination' || !add.relativeTo) {
            updatedStops.push(resolvedWp);
          } else {
            const relIdx =
              typeof add.relativeTo === 'number'
                ? add.relativeTo - 1
                : updatedStops.findIndex((s) => s.name.toLowerCase().includes(String(add.relativeTo).toLowerCase()));
            if (relIdx >= 0) updatedStops.splice(relIdx, 0, resolvedWp);
            else updatedStops.push(resolvedWp);
          }
          appliedDescriptions.push(`added ${resolvedWp.name}`);
        } else if (add.position === 'after' && add.relativeTo) {
          const relIdx =
            typeof add.relativeTo === 'number'
              ? add.relativeTo - 1
              : updatedStops.findIndex((s) => s.name.toLowerCase().includes(String(add.relativeTo).toLowerCase()));
          if (relIdx >= 0) updatedStops.splice(relIdx + 1, 0, resolvedWp);
          else updatedStops.push(resolvedWp);
          appliedDescriptions.push(`added ${resolvedWp.name}`);
        } else if (typeof (add as any).bestInsertIndex === 'number') {
          const ins = (add as any).bestInsertIndex;
          if (ins >= 0 && ins <= updatedStops.length) {
            updatedStops.splice(ins, 0, resolvedWp);
          } else {
            updatedStops.push(resolvedWp);
          }
          appliedDescriptions.push(`added ${resolvedWp.name}`);
        } else {
          updatedStops.push(resolvedWp);
          appliedDescriptions.push(`added ${resolvedWp.name}`);
        }
      }
    } else {
      appliedDescriptions.push(`could not identify confident location for "${cleanQuery}"`);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5: Test 5 Post-Execution Clarification Prompt
  // If Jaipur was ambiguous with existing destination:
  // Petrol station is now committed as stop #1. Destination (Agra) remains intact.
  // Now ask clarification about Jaipur's role.
  // ---------------------------------------------------------------------------
  let pendingClarificationResult: PendingClarification | null = null;
  let clarificationMessage: string | undefined = undefined;

  if (ambiguousPlaceAction && ambiguousPlaceAction.placeQuery) {
    const rawPlaceName = ambiguousPlaceAction.placeQuery;
    const destName = updatedDestination?.name || 'current destination';

    const clarifyText = isHindi
      ? `पेट्रोल पंप जोड़ दिया गया है। क्या आप ${rawPlaceName} को नई मंजिल (destination) बनाना चाहते हैं, या ${destName} से पहले का स्टॉप?`
      : `Added petrol station as first stop. Would you like ${rawPlaceName} to be your new destination, or an intermediate stop before ${destName}?`;

    pendingClarificationResult = conversationContext.setPendingClarification({
      originalCommand,
      targetRole: 'destination_or_stop',
      query: rawPlaceName,
      candidates: [
        {
          index: 1,
          id: `role-stop-${rawPlaceName.toLowerCase()}`,
          name: `${rawPlaceName} (Intermediate Stop before ${destName})`,
          address: `${rawPlaceName}, India`,
          category: 'stop',
        },
        {
          index: 2,
          id: `role-dest-${rawPlaceName.toLowerCase()}`,
          name: `${rawPlaceName} (New Final Destination)`,
          address: `${rawPlaceName}, India`,
          category: 'destination',
        },
      ],
      pendingActions: [],
      targetAction: ambiguousPlaceAction,
      responseLanguage,
    });

    clarificationMessage = clarifyText;
    appliedDescriptions.push(`asked clarification: destination or stop for ${rawPlaceName}`);
  }

  const nextJourney: JourneyState = {
    ...current,
    revision: current.revision + 1,
    origin: updatedOrigin,
    destination: updatedDestination,
    stops: updatedStops,
    travelMode: updatedTravelMode,
    avoidTolls: updatedAvoidTolls,
  };

  const spokenResponse = clarificationMessage || (
    isHindi
      ? `रास्ता अपडेट कर दिया गया है: ${appliedDescriptions.join(', ')}.`
      : `Route updated: ${appliedDescriptions.join(', ')}.`
  );

  return {
    success: true,
    nextJourney,
    appliedDescriptions,
    spokenResponse,
    clarificationMessage,
    pendingClarification: pendingClarificationResult,
    detourCandidates: returnedDetourCandidates,
  };
}

/**
 * Resolves follow-up response when clarification is active.
 * Handles "पहला वाला add कर दो", "stop", "destination", or cancellation.
 */
export async function executeFollowUpTransaction(
  current: JourneyState,
  followUpText: string,
  context: TransactionContext = {}
): Promise<JourneyTransactionResult> {
  const { userLocation, activeRoutePath, responseLanguage = 'hi' } = context;
  const isHindi = responseLanguage.startsWith('hi') || /[\u0900-\u097F]/.test(followUpText);

  if (!conversationContext.isClarificationActive()) {
    return {
      success: false,
      nextJourney: current,
      appliedDescriptions: ['No active clarification'],
      spokenResponse: isHindi ? 'कोई सक्रिय प्रश्न नहीं है।' : 'No active question to clarify.',
    };
  }

  const followUp = conversationContext.resolveFollowUpReference(followUpText);

  if (followUp.type === 'cancel') {
    conversationContext.clearPendingClarification();
    const cancelMsg = isHindi ? 'चयन रद्द कर दिया गया।' : 'Selection cancelled.';
    return {
      success: true,
      nextJourney: current,
      appliedDescriptions: ['Selection cancelled'],
      spokenResponse: cancelMsg,
    };
  }

  if (followUp.type === 'select_candidate' && followUp.selectedCandidate) {
    const pending = conversationContext.getPendingClarification();
    conversationContext.clearPendingClarification();

    if (pending) {
      const cand = followUp.selectedCandidate;
      const effectiveRole = (cand as any).targetRole || pending.targetRole;

      let updatedDestination = current.destination;
      let updatedOrigin = current.origin;
      let updatedStops = [...current.stops];
      const appliedDescriptions: string[] = [];

      // Resolve actual waypoint for the chosen candidate
      let chosenWaypoint: Waypoint = {
        id: cand.id,
        placeId: cand.id,
        name: cand.name.replace(/\s*\(.*\)$/, '').trim(),
        address: cand.address,
        latLng: cand.latLng,
        category: (cand.category as any) || 'custom',
      };

      if (!chosenWaypoint.latLng) {
        const resolved = await resolvePlaceToWaypoint(chosenWaypoint.name);
        if (resolved) {
          chosenWaypoint = resolved;
        }
      }

      if (effectiveRole === 'nearby_selection') {
        let intended = pending.intendedActionAfterSelect || 'show_options';
        if (/(?:take\s+me\s+to|navigate\s+to|le\s+chalo|destination|मंजिल|बनाओ)/i.test(followUpText)) {
          intended = 'set_destination';
        } else if (/(?:add|jodo|जोड़|stop|स्टॉप|rukna|रुकना)/i.test(followUpText)) {
          intended = 'add_stop';
        }

        if (intended === 'add_stop') {
          updatedStops.push(chosenWaypoint);
          appliedDescriptions.push(`added ${chosenWaypoint.name} as stop`);
        } else if (intended === 'set_destination' || !current.destination) {
          updatedDestination = chosenWaypoint;
          if (!updatedOrigin && userLocation) {
            updatedOrigin = {
              id: 'curr-loc',
              name: 'Current Location',
              address: 'My Current GPS Location',
              latLng: userLocation,
              isCurrentLocation: true,
            };
          }
          appliedDescriptions.push(`destination set to ${chosenWaypoint.name}`);
        } else {
          // An active destination already exists; ask whether to add as stop or replace destination
          const roleClarifyText = isHindi
            ? `आपका वर्तमान गंतव्य ${current.destination.name} है। क्या आप ${chosenWaypoint.name} को रास्ते का स्टॉप बनाना चाहते हैं, या नई मंजिल?`
            : `Your destination is ${current.destination.name}. Would you like to add ${chosenWaypoint.name} as a stop, or replace your destination?`;

          const rolePending = conversationContext.setPendingClarification({
            originalCommand: followUpText,
            targetRole: 'destination_or_stop',
            query: chosenWaypoint.name,
            candidates: [
              {
                index: 1,
                id: chosenWaypoint.id,
                name: `${chosenWaypoint.name} (Stop before ${current.destination.name})`,
                address: chosenWaypoint.address,
                category: 'stop',
                latLng: chosenWaypoint.latLng,
              },
              {
                index: 2,
                id: `dest-${chosenWaypoint.id}`,
                name: `${chosenWaypoint.name} (New Destination)`,
                address: chosenWaypoint.address,
                category: 'destination',
                latLng: chosenWaypoint.latLng,
              },
            ],
            pendingActions: [],
            targetAction: { type: 'ADD_STOP', placeQuery: chosenWaypoint.name },
            responseLanguage,
          });

          return {
            success: true,
            nextJourney: current,
            appliedDescriptions: [`asked destination or stop for ${chosenWaypoint.name}`],
            spokenResponse: roleClarifyText,
            clarificationMessage: roleClarifyText,
            pendingClarification: rolePending,
          };
        }
      } else if (effectiveRole === 'landmark_disambiguation') {
        const landmarkWp: Waypoint = chosenWaypoint;
        const targetAct = pending.targetAction;
        const nearbyResults = await searchPlacesNearLandmark({
          landmark: landmarkWp,
          subject: targetAct?.placeQuery || 'places',
          category: targetAct?.category,
          minRating: targetAct?.minRating,
        });

        if (nearbyResults.length === 0) {
          const noResultsMsg = isHindi
            ? `${landmarkWp.name} के पास कोई उपयुक्त विकल्प नहीं मिला।`
            : `No matching places found near ${landmarkWp.name}.`;
          return {
            success: true,
            nextJourney: current,
            appliedDescriptions: [`no results found near ${landmarkWp.name}`],
            spokenResponse: noResultsMsg,
          };
        }

        const clarifyCandidates: ClarificationCandidate[] = nearbyResults.slice(0, 5).map((c, i) => ({
          index: i + 1,
          id: c.id,
          name: c.name,
          address: c.address,
          latLng: c.latLng,
          rating: c.rating,
          userRatingCount: c.userRatingCount,
          openNow: c.openNow,
          straightLineDistanceKm: c.straightLineDistanceKm,
          category: c.category || targetAct?.category,
          targetRole: 'nearby_selection',
        }));

        const nextPending = conversationContext.setPendingClarification({
          originalCommand: pending.originalCommand,
          targetRole: 'nearby_selection',
          anchorName: landmarkWp.name,
          query: targetAct?.placeQuery || 'places',
          candidates: clarifyCandidates,
          pendingActions: [],
          targetAction: targetAct,
          responseLanguage,
          intendedActionAfterSelect: targetAct?.intendedActionAfterSelect || 'show_options',
        });

        const clarifyMsg = isHindi
          ? `${landmarkWp.name} के पास ${clarifyCandidates.length} विकल्प मिले हैं। पहला वाला या दूसरा वाला कौन सा चुनना है?`
          : `Found ${clarifyCandidates.length} options near ${landmarkWp.name}. Which one would you like to choose?`;

        return {
          success: true,
          nextJourney: current,
          appliedDescriptions: [`displayed options near ${landmarkWp.name}`],
          spokenResponse: clarifyMsg,
          clarificationMessage: clarifyMsg,
          pendingClarification: nextPending,
        };
      } else if (effectiveRole === 'substantial_detour_confirmation') {
        updatedStops.push(chosenWaypoint);
        appliedDescriptions.push(`added ${chosenWaypoint.name} (confirmed detour)`);
      } else if (effectiveRole === 'destination') {
        updatedDestination = chosenWaypoint;
        if (!updatedOrigin && userLocation) {
          updatedOrigin = {
            id: 'curr-loc',
            name: 'Current Location',
            address: 'My Current GPS Location',
            latLng: userLocation,
            isCurrentLocation: true,
          };
        }
        appliedDescriptions.push(`destination set to ${chosenWaypoint.name}`);
      } else if (effectiveRole === 'origin') {
        updatedOrigin = chosenWaypoint;
        appliedDescriptions.push(`origin set to ${chosenWaypoint.name}`);
      } else {
        // Intermediate stop
        const insertAt = typeof cand.bestInsertIndex === 'number' ? cand.bestInsertIndex : undefined;
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= updatedStops.length) {
          updatedStops.splice(insertAt, 0, chosenWaypoint);
        } else {
          updatedStops.push(chosenWaypoint);
        }
        appliedDescriptions.push(`added ${chosenWaypoint.name} as stop`);
      }

      // Execute any pending actions that were queued behind this clarification
      if (pending.pendingActions && pending.pendingActions.length > 0) {
        for (const act of pending.pendingActions) {
          if (act.type === 'ADD_STOP' && act.placeQuery) {
            const addWp = await resolvePlaceToWaypoint(act.placeQuery, chosenWaypoint.latLng, act.category);
            if (addWp) {
              updatedStops.push(addWp);
              appliedDescriptions.push(`added ${addWp.name}`);
            }
          }
        }
      }

      const nextJourney: JourneyState = {
        ...current,
        revision: current.revision + 1,
        origin: updatedOrigin,
        destination: updatedDestination,
        stops: updatedStops,
      };

      const spokenResponse = isHindi
        ? `पुष्टि हो गई: ${chosenWaypoint.name}. रास्ता अपडेट कर दिया गया है.`
        : `Confirmed: ${chosenWaypoint.name}. Route updated.`;

      return {
        success: true,
        nextJourney,
        appliedDescriptions,
        spokenResponse,
      };
    }
  }

  return {
    success: false,
    nextJourney: current,
    appliedDescriptions: ['Could not understand follow-up selection'],
    spokenResponse: isHindi
      ? 'कृपया विकल्प संख्या या नाम स्पष्ट करें।'
      : 'Please specify the option number or name clearly.',
  };
}
