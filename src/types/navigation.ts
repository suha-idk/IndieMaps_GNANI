export interface LatLng {
  lat: number;
  lng: number;
}

export interface Waypoint {
  id: string;
  name: string;
  address: string;
  latLng?: LatLng;
  placeId?: string;
  isCurrentLocation?: boolean;
  category?: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging' | 'custom';
  addedVia?: 'voice' | 'manual' | 'detour_optimizer';
}

export interface RouteStep {
  distanceMeters?: number;
  staticDuration?: string;
  instructions?: string;
  maneuver?: string;
  startLocation?: LatLng;
  endLocation?: LatLng;
}

export interface RouteLeg {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  startLocation?: LatLng;
  endLocation?: LatLng;
  steps?: RouteStep[];
}

export interface ActiveRoute {
  requestId: string;
  revision: number;
  travelMode: 'DRIVE' | 'TWO_WHEELER';
  distanceMeters: number;
  distanceKm: string;
  durationSeconds: number;
  durationFormatted: string;
  description: string;
  polyline: string;
  path: LatLng[];
  viewport?: {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  };
  legs: RouteLeg[];
  isStale?: boolean;
  calculatedAt: string;
}

export interface JourneyState {
  revision: number;
  origin: Waypoint | null;
  destination: Waypoint | null;
  stops: Waypoint[];
  travelMode: 'DRIVE' | 'TWO_WHEELER';
  avoidTolls: boolean;
  avoidHighways: boolean;
}

export interface DetourCandidate {
  id: string;
  displayName?: { text: string };
  name?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  primaryType?: string;
  types?: string[];
  detourMeters?: number;
  detourKm?: string;
  detourMinutes?: number;
  totalDurationMinutes?: number;
  score?: number;
  anchorType?: SearchAnchor;
  bestInsertIndex?: number;
  detourUnavailable?: boolean;
  isRankedByDetour?: boolean;
  corridorApproximate?: boolean;
  straightLineDistanceKm?: string;
  openNow?: boolean;
}

export type ActionType =
  | 'SET_ORIGIN'
  | 'CHANGE_ORIGIN'
  | 'SET_DESTINATION'
  | 'CHANGE_DESTINATION'
  | 'CLEAR_DESTINATION'
  | 'ADD_STOP'
  | 'REMOVE_STOP'
  | 'REORDER_STOPS'
  | 'SEARCH_NEARBY'
  | 'ADD_SMART_STOP'
  | 'CLEAR_STOPS'
  | 'CLEAR_JOURNEY'
  | 'TOGGLE_TOLLS'
  | 'SET_TRAVEL_MODE'
  | 'SWAP_STOPS'
  | 'REQUEST_CURRENT_LOCATION';

export type SearchAnchor = 'origin' | 'destination' | 'current_location' | 'route' | 'stop' | 'landmark';

export interface AtomicAction {
  type: ActionType;
  placeQuery?: string;
  category?: 'gas_station' | 'cng_station' | 'restaurant' | 'hospital' | 'pharmacy' | 'parking' | 'ev_charging';
  searchAnchor?: SearchAnchor;
  anchorStopName?: string;
  anchorStopOrdinal?: number;
  anchorPlaceQuery?: string; // Landmark used as search anchor, e.g. "Bangla Sahib", "India Gate"
  intendedActionAfterSelect?: 'set_destination' | 'add_stop' | 'show_options' | 'ask_user';
  immediateSelectionOrdinal?: number; // 1-indexed ordinal if user instructed immediate addition e.g. "pehla wala add kar dena"
  isSubstantialDetourConfirmed?: boolean;
  detourExplanation?: string;
  targetStopIdentifier?: {
    byOrdinal?: number; // 1-indexed (e.g. 2 for 2nd stop)
    byName?: string;
  };
  position?: 'start' | 'end' | 'before' | 'after' | 'least_detour';
  relativeTo?: string | number; // name or 1-indexed ordinal
  preference?: 'min_detour' | 'nearest_me' | 'fastest';
  avoidTolls?: boolean;
  travelMode?: 'DRIVE' | 'TWO_WHEELER';
  normalizedName?: string; // Canonical or romanized entity name
  localityContext?: string; // Geographic context or locality
  isCategorySearch?: boolean; // True if searching for a generic category rather than named entity
  minRating?: number; // Minimum star rating required (e.g. 4.5)
  preserveDestination?: boolean; // When true, destination must not be replaced
  cuisine?: string; // e.g. "punjabi"
}

export interface CommandInterpretation {
  detectedLanguage: string;
  intent: string;
  actions: AtomicAction[];
  requiresConfirmation: boolean;
  spokenResponse: string;
  clarificationNeeded: string | null;
  translation?: {
    translatedText?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    preservedEntities?: string[];
  };
  nonNavigationResponse?: string;
}

export interface PendingProposal {
  id: string;
  targetRevision: number;
  summary: string;
  spokenResponse: string;
  actions: AtomicAction[];
  proposedJourney: JourneyState;
  explanation: string;
}

export interface JourneyHistoryItem {
  journey: JourneyState;
  route: ActiveRoute | null;
  description: string;
}

export type ThemeMode = 'dark' | 'light';

export interface NavigationTripState {
  isActive: boolean;
  startedAt?: string;
  currentLocation: LatLng | null;
  heading: number | null;
  speed: number | null;
  currentStepIndex: number;
  nextInstruction: string;
  distanceToNextTurn: string;
  remainingDistance: string;
  remainingDuration: string;
  isOffRoute: boolean;
}

export interface TimingMetrics {
  intentExtractionMs?: number;
  placeResolutionMs?: number;
  routeCalculationMs?: number;
  totalExecutionMs?: number;
}

export type PlaceResolutionStatus = 'resolved' | 'ambiguous' | 'not_found' | 'error';

export interface PlaceResolutionResult {
  status: PlaceResolutionStatus;
  waypoint: Waypoint | null;
  candidates: any[];
  confidenceScore: number;
  clarificationMessage?: string;
  error?: string;
}
