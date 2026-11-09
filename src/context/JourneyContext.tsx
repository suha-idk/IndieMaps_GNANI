import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  ActiveRoute,
  DetourCandidate,
  JourneyHistoryItem,
  JourneyState,
  LatLng,
  NavigationTripState,
  PendingProposal,
  ThemeMode,
  TimingMetrics,
  Waypoint,
  AtomicAction,
} from '../types/navigation';
import { computeRoute } from '../services/routesService';
import {
  resolvePlaceToWaypoint,
  resolvePlaceDetailed,
  searchPlaces,
  searchNearbyPlaces,
  searchPlacesNearLandmark,
} from '../services/placesService';
import { interpretCommand } from '../services/aiService';
import { findLowestDetourStop } from '../services/detourService';
import { resolveSearchAnchor } from '../services/anchorService';
import { speechService } from '../services/speechService';
import { conversationContext, ClarificationCandidate, PendingClarification } from '../services/conversationContext';
import { executeJourneyTransaction, executeFollowUpTransaction } from '../services/journeyTransaction';

interface JourneyContextType {
  journey: JourneyState;
  activeRoute: ActiveRoute | null;
  routeLoading: boolean;
  routeError: string | null;
  userLocation: LatLng | null;
  locationStatus: 'prompt' | 'granted' | 'denied' | 'locating';
  pendingProposal: PendingProposal | null;
  pendingClarification: PendingClarification | null;
  detourCandidates: DetourCandidate[];
  detourLoading: boolean;
  canUndo: boolean;
  lastMessage: string | null;
  isProcessingCommand: boolean;
  theme: ThemeMode;
  toggleTheme: () => void;
  navigationState: NavigationTripState;
  startNavigation: () => void;
  endNavigation: () => void;
  timings: TimingMetrics;
  lastFramedRouteId: string | null;
  setLastFramedRouteId: (id: string | null) => void;
  requestUserLocation: () => Promise<LatLng | null>;
  setOrigin: (origin: Waypoint) => void;
  setDestination: (destination: Waypoint) => void;
  clearDestination: () => void;
  clearJourney: () => void;
  addStop: (stop: Waypoint, index?: number) => void;
  removeStopByName: (name: string) => boolean;
  removeStopByOrdinal: (ordinal: number) => boolean;
  reorderStops: (fromIndex: number, toIndex: number) => void;
  insertStopRelative: (stop: Waypoint, relativeTo: string | number, position: 'before' | 'after') => boolean;
  clearAllStops: () => void;
  toggleAvoidTolls: () => void;
  setTravelMode: (mode: 'DRIVE' | 'TWO_WHEELER') => void;
  executeCommand: (commandText: string, responseLang?: string) => Promise<{ success: boolean; message: string }>;
  confirmProposal: () => void;
  cancelProposal: () => void;
  undo: () => void;
  dismissDetourCandidates: () => void;
  selectDetourCandidate: (candidate: DetourCandidate) => void;
  findSmartStop: (category?: any, anchor?: any) => Promise<void>;
  selectClarificationCandidate: (candidate: ClarificationCandidate) => Promise<void>;
  cancelClarification: () => void;
}

const defaultJourney: JourneyState = {
  revision: 1,
  origin: null,
  destination: null,
  stops: [],
  travelMode: 'DRIVE',
  avoidTolls: false,
  avoidHighways: false,
};

const initialNavState: NavigationTripState = {
  isActive: false,
  currentLocation: null,
  heading: null,
  speed: null,
  currentStepIndex: 0,
  nextInstruction: 'Follow route path',
  distanceToNextTurn: '--',
  remainingDistance: '--',
  remainingDuration: '--',
  isOffRoute: false,
};

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

export const JourneyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [journey, setJourney] = useState<JourneyState>(defaultJourney);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied' | 'locating'>('prompt');
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [pendingClarification, setPendingClarification] = useState<PendingClarification | null>(() =>
    conversationContext.getPendingClarification()
  );

  useEffect(() => {
    const unsub = conversationContext.subscribe(() => {
      setPendingClarification(conversationContext.getPendingClarification());
    });
    return () => unsub();
  }, []);
  const [detourCandidates, setDetourCandidates] = useState<DetourCandidate[]>([]);
  const [detourLoading, setDetourLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<JourneyHistoryItem[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [isProcessingCommand, setIsProcessingCommand] = useState<boolean>(false);
  const [lastFramedRouteId, setLastFramedRouteId] = useState<string | null>(null);
  const [timings, setTimings] = useState<TimingMetrics>({});
  const [navigationState, setNavigationState] = useState<NavigationTripState>(initialNavState);

  // Theme Management
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('raahi_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('raahi_theme', next);
      }
      return next;
    });
  }, []);

  // Sync dark class on root document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  // Request ID and Concurrency Guard
  const latestRequestIdRef = useRef<string>('');
  const journeyRef = useRef<JourneyState>(journey);
  journeyRef.current = journey;
  const navWatchIdRef = useRef<number | null>(null);

  const pushHistory = (current: JourneyState, route: ActiveRoute | null, description: string) => {
    setHistory((prev) => [...prev.slice(-9), { journey: JSON.parse(JSON.stringify(current)), route, description }]);
  };

  // Recalculates route whenever origin, destination, stops, travelMode, or avoidTolls changes
  const triggerRouting = useCallback(async (stateToRoute: JourneyState) => {
    if (!stateToRoute.origin || !stateToRoute.destination) {
      setActiveRoute(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    const tStart = performance.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    latestRequestIdRef.current = requestId;
    const currentRevision = stateToRoute.revision;

    setRouteLoading(true);
    setRouteError(null);

    const { route, error } = await computeRoute(stateToRoute, requestId);

    // Stale Response Check: discard if user updated state while request was running
    if (latestRequestIdRef.current !== requestId || journeyRef.current.revision !== currentRevision) {
      console.log(`[Raahi Guard] Discarding stale route response for revision ${currentRevision}`);
      return;
    }

    const tEnd = performance.now();
    setTimings((prev) => ({ ...prev, routeCalculationMs: Math.round(tEnd - tStart) }));
    setRouteLoading(false);

    if (error) {
      const safeError = typeof error === 'string' ? error : JSON.stringify(error);
      setRouteError(safeError);
      setActiveRoute((prev) => (prev ? { ...prev, isStale: true } : null));
    } else if (route) {
      setActiveRoute(route);
      setLastFramedRouteId(route.requestId); // Auto-fit map on initial or updated route
    }
  }, []);

  // Request Device Location
  const requestUserLocation = useCallback(async (): Promise<LatLng | null> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationStatus('denied');
      return null;
    }

    setLocationStatus('locating');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLocation(coords);
          setLocationStatus('granted');

          setJourney((prev) => {
            if (!prev.origin) {
              const next: JourneyState = {
                ...prev,
                revision: prev.revision + 1,
                origin: {
                  id: 'curr-loc',
                  name: 'Current Location',
                  address: 'My Current GPS Location',
                  latLng: coords,
                  isCurrentLocation: true,
                },
              };
              triggerRouting(next);
              return next;
            }
            return prev;
          });

          resolve(coords);
        },
        (err) => {
          console.warn('Geolocation status:', err?.message || 'Permission not granted, using manual origin fallback');
          setLocationStatus('denied');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }, [triggerRouting]);

  // Initial location request on mount
  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  // Start Navigation Mode
  const startNavigation = useCallback(() => {
    if (!activeRoute || !journey.destination) {
      const msg = 'Please calculate a valid route before starting navigation.';
      setLastMessage(msg);
      speechService.speak(msg);
      return;
    }

    const firstInstruction =
      activeRoute.legs?.[0]?.steps?.[0]?.instructions ||
      `Head towards ${journey.destination.name}`;

    setNavigationState({
      isActive: true,
      startedAt: new Date().toISOString(),
      currentLocation: userLocation || journey.origin?.latLng || null,
      heading: null,
      speed: null,
      currentStepIndex: 0,
      nextInstruction: firstInstruction,
      distanceToNextTurn: activeRoute.legs?.[0]?.steps?.[0]?.distanceMeters ? `${activeRoute.legs[0].steps[0].distanceMeters} m` : '500 m',
      remainingDistance: activeRoute.distanceKm,
      remainingDuration: activeRoute.durationFormatted,
      isOffRoute: false,
    });

    const startSpeech = `Starting navigation to ${journey.destination.name}. Distance: ${activeRoute.distanceKm}, ETA: ${activeRoute.durationFormatted}.`;
    setLastMessage(startSpeech);
    speechService.speak(startSpeech);

    // Start live position tracking if available
    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        if (navWatchIdRef.current !== null) {
          navigator.geolocation.clearWatch(navWatchIdRef.current);
        }
        navWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setNavigationState((prev) => ({
              ...prev,
              currentLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude },
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            }));
          },
          (err) => console.warn('Nav watch warning:', err.message),
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
      } catch (e) {
        console.warn('Geolocation watchPosition not available:', e);
      }
    }
  }, [activeRoute, journey.destination, journey.origin?.latLng, userLocation]);

  // End Navigation Mode
  const endNavigation = useCallback(() => {
    if (navWatchIdRef.current !== null && typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(navWatchIdRef.current);
      navWatchIdRef.current = null;
    }
    setNavigationState(initialNavState);
    const endMsg = 'Navigation ended.';
    setLastMessage(endMsg);
    speechService.speak(endMsg);
  }, []);

  // Cleanup nav watch on unmount
  useEffect(() => {
    return () => {
      if (navWatchIdRef.current !== null && typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(navWatchIdRef.current);
      }
    };
  }, []);

  // Set Origin
  const setOrigin = useCallback(
    (origin: Waypoint) => {
      pushHistory(journeyRef.current, activeRoute, `Changed origin to ${origin.name}`);
      const next: JourneyState = {
        ...journeyRef.current,
        revision: journeyRef.current.revision + 1,
        origin,
      };
      setJourney(next);
      triggerRouting(next);
    },
    [activeRoute, triggerRouting]
  );

  // Set / Change Destination
  const setDestination = useCallback(
    (dest: Waypoint) => {
      pushHistory(journeyRef.current, activeRoute, `Set destination to ${dest.name}`);
      const next: JourneyState = {
        ...journeyRef.current,
        revision: journeyRef.current.revision + 1,
        destination: dest,
      };
      setJourney(next);
      triggerRouting(next);
    },
    [activeRoute, triggerRouting]
  );

  // Clear Destination
  const clearDestination = useCallback(() => {
    pushHistory(journeyRef.current, activeRoute, 'Removed destination');
    const next: JourneyState = {
      ...journeyRef.current,
      revision: journeyRef.current.revision + 1,
      destination: null,
    };
    setJourney(next);
    setActiveRoute(null);
    setRouteError(null);
    endNavigation();
  }, [activeRoute, endNavigation]);

  // Clear Entire Journey
  const clearJourney = useCallback(() => {
    pushHistory(journeyRef.current, activeRoute, 'Cleared entire journey');
    const next: JourneyState = {
      revision: journeyRef.current.revision + 1,
      origin: userLocation
        ? {
            id: 'curr-loc',
            name: 'Current Location',
            address: 'My Current GPS Location',
            latLng: userLocation,
            isCurrentLocation: true,
          }
        : null,
      destination: null,
      stops: [],
      travelMode: journeyRef.current.travelMode,
      avoidTolls: journeyRef.current.avoidTolls,
      avoidHighways: journeyRef.current.avoidHighways,
    };
    setJourney(next);
    setActiveRoute(null);
    setRouteError(null);
    endNavigation();
  }, [activeRoute, endNavigation, userLocation]);

  // Add Stop
  const addStop = useCallback(
    (stop: Waypoint, index?: number) => {
      pushHistory(journeyRef.current, activeRoute, `Added stop: ${stop.name}`);
      const updatedStops = [...journeyRef.current.stops];
      if (typeof index === 'number' && index >= 0 && index <= updatedStops.length) {
        updatedStops.splice(index, 0, stop);
      } else {
        updatedStops.push(stop);
      }

      const next: JourneyState = {
        ...journeyRef.current,
        revision: journeyRef.current.revision + 1,
        stops: updatedStops,
      };
      setJourney(next);
      triggerRouting(next);
    },
    [activeRoute, triggerRouting]
  );

  // Remove Stop By Name
  const removeStopByName = useCallback(
    (name: string): boolean => {
      const lower = name.toLowerCase().trim();
      const current = journeyRef.current;
      const index = current.stops.findIndex(
        (s) => s.name.toLowerCase().includes(lower) || (s.address && s.address.toLowerCase().includes(lower))
      );

      if (index === -1) {
        return false;
      }

      pushHistory(current, activeRoute, `Removed stop: ${current.stops[index].name}`);
      const updatedStops = current.stops.filter((_, i) => i !== index);
      const next: JourneyState = {
        ...current,
        revision: current.revision + 1,
        stops: updatedStops,
      };
      setJourney(next);
      triggerRouting(next);
      return true;
    },
    [activeRoute, triggerRouting]
  );

  // Remove Stop By Ordinal
  const removeStopByOrdinal = useCallback(
    (ordinal: number): boolean => {
      const current = journeyRef.current;
      const zeroIdx = ordinal - 1;

      if (zeroIdx < 0 || zeroIdx >= current.stops.length) {
        return false;
      }

      const removed = current.stops[zeroIdx];
      pushHistory(current, activeRoute, `Removed stop #${ordinal}: ${removed.name}`);
      const updatedStops = current.stops.filter((_, i) => i !== zeroIdx);
      const next: JourneyState = {
        ...current,
        revision: current.revision + 1,
        stops: updatedStops,
      };
      setJourney(next);
      triggerRouting(next);
      return true;
    },
    [activeRoute, triggerRouting]
  );

  // Reorder Stops
  const reorderStops = useCallback(
    (fromIndex: number, toIndex: number) => {
      const current = journeyRef.current;
      if (
        fromIndex < 0 ||
        fromIndex >= current.stops.length ||
        toIndex < 0 ||
        toIndex >= current.stops.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      pushHistory(current, activeRoute, `Reordered stops`);
      const updatedStops = [...current.stops];
      const [moved] = updatedStops.splice(fromIndex, 1);
      updatedStops.splice(toIndex, 0, moved);

      const next: JourneyState = {
        ...current,
        revision: current.revision + 1,
        stops: updatedStops,
      };
      setJourney(next);
      triggerRouting(next);
    },
    [activeRoute, triggerRouting]
  );

  // Insert Stop Relative to another stop
  const insertStopRelative = useCallback(
    (stop: Waypoint, relativeTo: string | number, position: 'before' | 'after'): boolean => {
      const current = journeyRef.current;
      let targetIndex = -1;

      if (typeof relativeTo === 'number') {
        targetIndex = relativeTo - 1;
      } else {
        const lower = relativeTo.toLowerCase();
        targetIndex = current.stops.findIndex(
          (s) => s.name.toLowerCase().includes(lower) || (s.address && s.address.toLowerCase().includes(lower))
        );
      }

      if (targetIndex < 0 || targetIndex >= current.stops.length) {
        addStop(stop);
        return false;
      }

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      addStop(stop, insertIndex);
      return true;
    },
    [addStop]
  );

  // Clear all intermediate stops
  const clearAllStops = useCallback(() => {
    const current = journeyRef.current;
    if (current.stops.length === 0) return;

    pushHistory(current, activeRoute, 'Cleared all intermediate stops');
    const next: JourneyState = {
      ...current,
      revision: current.revision + 1,
      stops: [],
    };
    setJourney(next);
    triggerRouting(next);
  }, [activeRoute, triggerRouting]);

  // Toggle Avoid Tolls
  const toggleAvoidTolls = useCallback(() => {
    const next: JourneyState = {
      ...journeyRef.current,
      revision: journeyRef.current.revision + 1,
      avoidTolls: !journeyRef.current.avoidTolls,
    };
    setJourney(next);
    triggerRouting(next);
  }, [triggerRouting]);

  // Set Travel Mode
  const setTravelMode = useCallback(
    (mode: 'DRIVE' | 'TWO_WHEELER') => {
      const next: JourneyState = {
        ...journeyRef.current,
        revision: journeyRef.current.revision + 1,
        travelMode: mode,
      };
      setJourney(next);
      triggerRouting(next);
    },
    [triggerRouting]
  );

  // Undo Last Committed Action
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const lastItem = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));

    const restoredJourney: JourneyState = {
      ...lastItem.journey,
      revision: journeyRef.current.revision + 1,
    };

    setJourney(restoredJourney);
    triggerRouting(restoredJourney);

    const undoMsg = `Undone: ${lastItem.description}`;
    setLastMessage(undoMsg);
    speechService.speak(undoMsg);
  }, [history, triggerRouting]);

  // Find smart low-detour pump and display candidates or auto-add
  const findSmartStop = useCallback(
    async (category: any = 'gas_station', anchor?: any) => {
      setDetourLoading(true);
      const { best, ranked, error } = await findLowestDetourStop(
        journeyRef.current,
        category,
        anchor || 'route',
        undefined,
        userLocation,
        activeRoute?.path
      );
      setDetourLoading(false);

      if (error || ranked.length === 0) {
        const msg = error || 'Could not find stations along this route';
        setLastMessage(msg);
        speechService.speak(msg);
        return;
      }

      setDetourCandidates(ranked);

      if (best) {
        const msg = `Found ${best.displayName?.text || 'station'} with only +${best.detourKm} km detour (+${best.detourMinutes} min).`;
        setLastMessage(msg);
        speechService.speak(msg);
      }
    },
    [activeRoute?.path, userLocation]
  );

  const selectDetourCandidate = useCallback(
    (candidate: DetourCandidate) => {
      const stopWp: Waypoint = {
        id: candidate.id || `stop-${Date.now()}`,
        placeId: candidate.id,
        name: candidate.displayName?.text || candidate.name || 'Petrol Station',
        address: candidate.formattedAddress || 'Along Route',
        latLng: candidate.location ? { lat: candidate.location.latitude, lng: candidate.location.longitude } : undefined,
        category: 'gas_station',
        addedVia: 'detour_optimizer',
      };
      const insertAt = typeof candidate.bestInsertIndex === 'number' ? candidate.bestInsertIndex : undefined;
      addStop(stopWp, insertAt);
      setDetourCandidates([]);
      const msg = `Added ${stopWp.name} (+${candidate.detourKm} km detour)`;
      setLastMessage(msg);
      speechService.speak(msg);
    },
    [addStop]
  );

  const dismissDetourCandidates = useCallback(() => {
    setDetourCandidates([]);
  }, []);

  // Main Validated Execution Pipeline: Single Unified Transaction for Combined Edits
  const executeCommand = useCallback(
    async (commandText: string, responseLang?: string): Promise<{ success: boolean; message: string }> => {
      const tStart = performance.now();
      setIsProcessingCommand(true);
      const current = journeyRef.current;

      // 0. Contextual Follow-up Clarification Check
      if (conversationContext.isClarificationActive()) {
        const followUpResult = await executeFollowUpTransaction(current, commandText, {
          userLocation,
          activeRoutePath: activeRoute?.path,
          responseLanguage: responseLang || 'hi',
        });
        if (followUpResult.success) {
          if (followUpResult.clarificationMessage) {
            // Still in multi-step clarification (e.g. landmark disambiguation -> nearby candidate presentation)
            const respMsg = followUpResult.clarificationMessage;
            setLastMessage(respMsg);
            speechService.speak(respMsg);
            setIsProcessingCommand(false);
            return { success: true, message: respMsg };
          }
          pushHistory(current, activeRoute, commandText);
          setJourney(followUpResult.nextJourney);
          await triggerRouting(followUpResult.nextJourney);
          setDetourCandidates([]);
          const respMsg = followUpResult.spokenResponse || 'Route updated.';
          setLastMessage(respMsg);
          speechService.speak(respMsg);
          setIsProcessingCommand(false);
          return { success: true, message: respMsg };
        } else if (followUpResult.spokenResponse) {
          setLastMessage(followUpResult.spokenResponse);
          speechService.speak(followUpResult.spokenResponse);
          setIsProcessingCommand(false);
          return { success: false, message: followUpResult.spokenResponse };
        }
      }

      try {
        const interpretation = await interpretCommand(commandText, current, responseLang || 'hi');
        const tIntent = performance.now();
        const intentMs = Math.round(tIntent - tStart);

        // Explicit Translation Command: distinct from navigation execution
        if (interpretation.intent === 'translate') {
          const transMsg = interpretation.spokenResponse || 'Translation complete.';
          setLastMessage(transMsg);
          const targetLang = (interpretation as any).translation?.targetLanguage || (interpretation as any).targetLanguage || responseLang || 'hi';
          speechService.speak(transMsg, { language: targetLang });
          setIsProcessingCommand(false);
          return { success: true, message: transMsg };
        }

        if (interpretation.actions?.some((a) => a.type === 'REQUEST_CURRENT_LOCATION')) {
          const location = await requestUserLocation();
          const msg = location
            ? (responseLang === 'en' ? 'Current location obtained.' : 'आपकी वर्तमान लोकेशन मिल गई है।')
            : (responseLang === 'en' ? 'Could not access your location. Check browser permission and try again.' : 'लोकेशन नहीं मिल पाई। ब्राउज़र की लोकेशन अनुमति जाँचकर फिर कोशिश करें।');
          setLastMessage(msg);
          speechService.speak(msg);
          setIsProcessingCommand(false);
          if (location && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('raahi:recenter-map', { detail: location }));
          return { success: Boolean(location), message: msg };
        }

        if (interpretation.clarificationNeeded) {
          const clarifyMsg = interpretation.spokenResponse || interpretation.clarificationNeeded;
          setLastMessage(clarifyMsg);
          speechService.speak(clarifyMsg);
          setIsProcessingCommand(false);
          return { success: true, message: clarifyMsg };
        }

        if (!interpretation.actions || interpretation.actions.length === 0) {
          const fallbackMsg = interpretation.spokenResponse || 'Could not understand command. Please try again.';
          setLastMessage(fallbackMsg);
          speechService.speak(fallbackMsg);
          setIsProcessingCommand(false);
          return { success: false, message: fallbackMsg };
        }

        // Clear any lingering pending clarification from previous interactions
        if (conversationContext.isClarificationActive()) {
          conversationContext.clearPendingClarification();
        }

        // If command requires explicit confirmation (ONLY for high-impact complete journey clears)
        if (interpretation.requiresConfirmation && interpretation.actions.some((a) => a.type === 'CLEAR_JOURNEY')) {
          const proposal: PendingProposal = {
            id: `prop-${Date.now()}`,
            targetRevision: current.revision,
            summary: interpretation.spokenResponse || 'Confirm clearing entire journey?',
            spokenResponse: interpretation.spokenResponse,
            actions: interpretation.actions,
            proposedJourney: defaultJourney,
            explanation: 'Resetting journey to start',
          };

          setPendingProposal(proposal);
          speechService.speak('Please confirm resetting your journey.');
          setIsProcessingCommand(false);
          return { success: true, message: 'Confirmation required' };
        }

        pushHistory(current, activeRoute, commandText);

        // Handle SEARCH_NEARBY: Separate the two search pipelines
        // Pipeline A: Named-Landmark Nearby Search (e.g. "Find a cafe near GTBIT", "Bangla Sahib ke paas chai-pakode wali shop")
        // -> Delegated directly to the dedicated landmark-resolution pipeline in executeJourneyTransaction!
        // Pipeline B: Route-Relative Search (e.g. "Find a petrol pump on my route", "Find restaurants along the way")
        // -> Evaluates detour corridor using findLowestDetourStop.
        const searchAction = interpretation.actions.find((a) => a.type === 'SEARCH_NEARBY');
        const isNamedLandmarkSearch = Boolean(
          searchAction && (searchAction.searchAnchor === 'landmark' || Boolean(searchAction.anchorPlaceQuery))
        );

        if (searchAction && !isNamedLandmarkSearch) {
          const query = searchAction.placeQuery || 'restaurant';
          const minRating = searchAction.minRating;
          const searchCat = searchAction.category || 'restaurant';

          // Route-relative search requires an active destination or route
          if (!current.destination && !activeRoute?.path) {
            const noRouteMsg = (responseLang || 'hi').startsWith('hi') || /[\u0900-\u097F]/.test(commandText)
              ? 'रास्ते में खोजने के लिए कृपया पहले एक मंजिल (destination) सेट करें।'
              : 'Route search requires an active route. Please set a destination first.';
            setLastMessage(noRouteMsg);
            speechService.speak(noRouteMsg);
            setIsProcessingCommand(false);
            return { success: false, message: noRouteMsg };
          }

          setDetourLoading(true);
          const { ranked } = await findLowestDetourStop(
            current,
            searchCat,
            searchAction.searchAnchor || 'route',
            undefined,
            userLocation,
            activeRoute?.path,
            query,
            minRating
          );
          setDetourLoading(false);

          let validCandidates = ranked;
          if (typeof minRating === 'number') {
            validCandidates = validCandidates.filter((c: any) => typeof c.rating === 'number' && c.rating > minRating);
          }

          if (validCandidates.length > 0) {
            setDetourCandidates(validCandidates);
            conversationContext.setPendingClarification({
              originalCommand: commandText,
              targetRole: 'stop',
              query,
              candidates: validCandidates.map((c: any, i: number) => ({
                index: i + 1,
                id: c.id,
                name: c.displayName?.text || c.name,
                address: c.formattedAddress || c.address || '',
                latLng: c.location ? { lat: c.location.latitude, lng: c.location.longitude } : c.latLng,
                category: searchCat,
                rating: c.rating,
                detourKm: c.detourKm,
                detourMinutes: c.detourMinutes,
                bestInsertIndex: c.bestInsertIndex,
              })),
              pendingActions: [],
              targetAction: {
                type: 'ADD_STOP',
                placeQuery: query,
                category: searchCat,
                searchAnchor: 'route',
                position: 'least_detour',
              },
              responseLanguage: responseLang || 'hi',
            });

            const topCands = validCandidates.slice(0, 3);
            const isHindi = (responseLang || 'hi').startsWith('hi') || /[\u0900-\u097F]/.test(commandText);
            const candListStr = topCands
              .map((c: any, i: number) => `${i + 1}. ${c.displayName?.text || c.name}${c.rating ? ` (${c.rating}★)` : ''}`)
              .join(', ');

            const respMsg = isHindi
              ? `रास्ते में ${minRating ? `${minRating} स्टार से ऊपर ` : ''}${validCandidates.length} स्थान मिले: ${candListStr}। जोड़ने के लिए कहें "पहला वाला add कर दो"।`
              : `Found ${validCandidates.length} ${query} along your route${minRating ? ` above ${minRating} stars` : ''}: ${candListStr}. Say "add the first one" to add it as a stop.`;

            setLastMessage(respMsg);
            speechService.speak(respMsg);
            setIsProcessingCommand(false);
            return { success: true, message: respMsg };
          } else {
            const noResMsg = (responseLang || 'hi').startsWith('hi') || /[\u0900-\u097F]/.test(commandText)
              ? `रास्ते में ${minRating ? `${minRating} स्टार से ऊपर ` : ''}कोई स्थान नहीं मिला।`
              : `No ${query} found${minRating ? ` with rating above ${minRating} stars` : ''} along your route.`;
            setLastMessage(noResMsg);
            speechService.speak(noResMsg);
            setIsProcessingCommand(false);
            return { success: false, message: noResMsg };
          }
        }

        // TRANSACTION EXECUTION:
        // Execute compatible operations in a single consolidated logical transaction
        const transactionResult = await executeJourneyTransaction(current, interpretation.actions, {
          userLocation,
          activeRoutePath: activeRoute?.path,
          responseLanguage: responseLang || 'hi',
          originalCommand: commandText,
        });

        if (transactionResult.detourCandidates && transactionResult.detourCandidates.length > 0) {
          setDetourCandidates(transactionResult.detourCandidates);
        }

        if (transactionResult.clarificationMessage) {
          setLastMessage(transactionResult.clarificationMessage);
          speechService.speak(transactionResult.clarificationMessage);
          setIsProcessingCommand(false);
          return { success: true, message: transactionResult.clarificationMessage };
        }

        const tPlaces = performance.now();
        const placeSearchMs = Math.round(tPlaces - tIntent);

        // Check if any genuine changes were resolved
        const hasActualChanges =
          transactionResult.nextJourney.destination !== current.destination ||
          transactionResult.nextJourney.origin !== current.origin ||
          transactionResult.nextJourney.travelMode !== current.travelMode ||
          transactionResult.nextJourney.avoidTolls !== current.avoidTolls ||
          JSON.stringify(transactionResult.nextJourney.stops.map((s) => s.id)) !==
            JSON.stringify(current.stops.map((s) => s.id));

        if (!hasActualChanges) {
          const unverifiedMsg =
            transactionResult.appliedDescriptions.find((d) => d.includes('could not')) ||
            'Could not verify requested location. Journey left unchanged.';
          setLastMessage(unverifiedMsg);
          speechService.speak(unverifiedMsg);
          setIsProcessingCommand(false);
          return { success: false, message: unverifiedMsg };
        }

        // Commit single consolidated state mutation
        setJourney(transactionResult.nextJourney);

        // Recalculate route ONCE for the entire combined batch
        await triggerRouting(transactionResult.nextJourney);

        const totalExecutionMs = Math.round(performance.now() - tStart);
        const recordedTimings: TimingMetrics = {
          intentExtractionMs: intentMs,
          placeResolutionMs: placeSearchMs,
          totalExecutionMs,
        };
        setTimings(recordedTimings);
        if (typeof window !== 'undefined') {
          (window as any).raahiTimings = recordedTimings;
        }

        const isHindi = interpretation.detectedLanguage === 'hi' || /[ऀ-ॿ]/.test(commandText);
        const successfulDescriptions = transactionResult.appliedDescriptions.filter((d) => !d.includes('could not'));
        const responseMsg =
          successfulDescriptions.length > 0
            ? (isHindi
                ? `रास्ता अपडेट हो गया है: ${successfulDescriptions.join(', ')}.`
                : `Updated route: ${successfulDescriptions.join(', ')}.`)
            : (interpretation.spokenResponse || 'No changes applied.');

                setLastMessage(responseMsg);
        speechService.speak(responseMsg, { language: responseLang || speechService.getResponseLanguage() });
        setIsProcessingCommand(false);
        return { success: true, message: responseMsg };
      } catch (err: any) {
        console.warn('executeCommand warning:', err?.message || err);
        const errMsg = 'Failed to process command. Please check network.';
        setLastMessage(errMsg);
        speechService.speak(errMsg);
        setIsProcessingCommand(false);
        return { success: false, message: errMsg };
      }
    },
    [activeRoute, triggerRouting, userLocation]
  );

  // Confirm Pending Proposal
  const confirmProposal = useCallback(() => {
    if (!pendingProposal) return;
    const current = journeyRef.current;

    if (pendingProposal.targetRevision !== current.revision) {
      setPendingProposal(null);
      const staleMsg = 'Journey changed since proposal was generated. Discarded.';
      setLastMessage(staleMsg);
      speechService.speak(staleMsg);
      return;
    }

    pushHistory(current, activeRoute, pendingProposal.summary);
    const newJourney: JourneyState = {
      ...pendingProposal.proposedJourney,
      revision: current.revision + 1,
    };

    setJourney(newJourney);
    triggerRouting(newJourney);
    setPendingProposal(null);

    const msg = `Changes applied successfully!`;
    setLastMessage(msg);
    speechService.speak(msg);
  }, [activeRoute, pendingProposal, triggerRouting]);

  // Cancel Pending Proposal
  const cancelProposal = useCallback(() => {
    setPendingProposal(null);
    const msg = 'Pending changes cancelled.';
    setLastMessage(msg);
    speechService.speak(msg);
  }, []);

  // Select clarification option directly via click
  const selectClarificationCandidate = useCallback(
    async (candidate: ClarificationCandidate) => {
      const pending = conversationContext.getPendingClarification();
      if (!pending) return;
      conversationContext.clearPendingClarification();

      const chosenWaypoint: Waypoint = {
        id: candidate.id,
        placeId: candidate.id,
        name: candidate.name,
        address: candidate.address,
        latLng: candidate.latLng,
        category: (candidate.category as any) || 'custom',
      };

      const current = journeyRef.current;
      let updatedDestination = current.destination;
      let updatedOrigin = current.origin;
      let updatedStops = [...current.stops];

      if (pending.targetRole === 'nearby_selection') {
        const intended = pending.intendedActionAfterSelect || 'show_options';
        if (intended === 'add_stop') {
          updatedStops.push(chosenWaypoint);
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
        } else {
          updatedStops.push(chosenWaypoint);
        }
      } else if (pending.targetRole === 'landmark_disambiguation') {
        const results = await searchPlacesNearLandmark({
          landmark: chosenWaypoint,
          subject: pending.targetAction?.placeQuery || 'places',
          category: pending.targetAction?.category,
          minRating: pending.targetAction?.minRating,
        });
        if (results.length > 0) {
          conversationContext.setPendingClarification({
            originalCommand: pending.originalCommand,
            targetRole: 'nearby_selection',
            anchorName: chosenWaypoint.name,
            query: pending.targetAction?.placeQuery || 'places',
            candidates: results.slice(0, 5).map((c, i) => ({
              index: i + 1,
              id: c.id,
              name: c.name,
              address: c.address,
              latLng: c.latLng,
              rating: c.rating,
              userRatingCount: c.userRatingCount,
              openNow: c.openNow,
              straightLineDistanceKm: c.straightLineDistanceKm,
              category: c.category,
              targetRole: 'nearby_selection',
            })),
            pendingActions: [],
            targetAction: pending.targetAction,
            responseLanguage: pending.responseLanguage,
            intendedActionAfterSelect: pending.intendedActionAfterSelect,
          });
          return;
        }
      } else if (pending.targetRole === 'substantial_detour_confirmation') {
        updatedStops.push(chosenWaypoint);
      } else if (pending.targetRole === 'destination') {
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
      } else if (pending.targetRole === 'origin') {
        updatedOrigin = chosenWaypoint;
      } else {
        const insertAt = typeof candidate.bestInsertIndex === 'number' ? candidate.bestInsertIndex : undefined;
        if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= updatedStops.length) {
          updatedStops.splice(insertAt, 0, chosenWaypoint);
        } else {
          updatedStops.push(chosenWaypoint);
        }
        setDetourCandidates([]);
      }

      // Execute any pending actions that were waiting on this clarification
      for (const act of pending.pendingActions) {
        if (act.type === 'ADD_STOP' && act.placeQuery) {
          const addWp = await resolvePlaceToWaypoint(act.placeQuery, chosenWaypoint.latLng, act.category);
          if (addWp) updatedStops.push(addWp);
        }
      }

      pushHistory(current, activeRoute, `Selected ${chosenWaypoint.name}`);

      const nextJourney: JourneyState = {
        ...current,
        revision: current.revision + 1,
        origin: updatedOrigin,
        destination: updatedDestination,
        stops: updatedStops,
      };
      setJourney(nextJourney);
      await triggerRouting(nextJourney);

      const isHindi = (pending.responseLanguage || 'hi').startsWith('hi');
      const respMsg = isHindi
        ? `पुष्टि हो गई: ${chosenWaypoint.name}. रास्ता अपडेट कर दिया गया है.`
        : `Confirmed: ${chosenWaypoint.name}. Route updated.`;
      setLastMessage(respMsg);
      speechService.speak(respMsg);
    },
    [activeRoute, triggerRouting, userLocation]
  );

  const cancelClarification = useCallback(() => {
    conversationContext.clearPendingClarification();
    const cancelMsg = 'Cancelled selection.';
    setLastMessage(cancelMsg);
    speechService.speak(cancelMsg);
  }, []);

  return (
    <JourneyContext.Provider
      value={{
        journey,
        activeRoute,
        routeLoading,
        routeError,
        userLocation,
        locationStatus,
        pendingProposal,
        pendingClarification,
        detourCandidates,
        detourLoading,
        canUndo: history.length > 0,
        lastMessage,
        isProcessingCommand,
        theme,
        toggleTheme,
        navigationState,
        startNavigation,
        endNavigation,
        timings,
        lastFramedRouteId,
        setLastFramedRouteId,
        requestUserLocation,
        setOrigin,
        setDestination,
        clearDestination,
        clearJourney,
        addStop,
        removeStopByName,
        removeStopByOrdinal,
        reorderStops,
        insertStopRelative,
        clearAllStops,
        toggleAvoidTolls,
        setTravelMode,
        executeCommand,
        confirmProposal,
        cancelProposal,
        undo,
        dismissDetourCandidates,
        selectDetourCandidate,
        findSmartStop,
        selectClarificationCandidate,
        cancelClarification,
      }}
    >
      {children}
    </JourneyContext.Provider>
  );
};

export const useJourney = () => {
  const context = useContext(JourneyContext);
  if (!context) {
    throw new Error('useJourney must be used within a JourneyProvider');
  }
  return context;
};
