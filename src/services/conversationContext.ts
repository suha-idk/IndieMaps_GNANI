import { AtomicAction, LatLng, Waypoint } from '../types/navigation';

export type ConversationState =
  | 'IDLE'
  | 'INTERPRETING_REQUEST'
  | 'RESOLVING_ENTITIES'
  | 'AWAITING_CLARIFICATION'
  | 'AWAITING_CONFIRMATION'
  | 'READY_TO_EXECUTE'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ClarificationCandidate {
  index: number; // 1-indexed (1, 2, 3...)
  id: string; // Google Place ID or unique ID
  name: string;
  address: string;
  latLng?: LatLng;
  category?: string;
  confidenceScore?: number;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  straightLineDistanceKm?: string;
  detourKm?: string;
  detourMinutes?: number;
  bestInsertIndex?: number;
  targetRole?: 'destination' | 'origin' | 'stop' | 'landmark' | 'nearby_selection';
}

export interface PendingClarification {
  id: string;
  originalCommand: string;
  targetRole:
    | 'destination'
    | 'origin'
    | 'stop'
    | 'destination_or_stop'
    | 'landmark_disambiguation'
    | 'nearby_selection'
    | 'substantial_detour_confirmation';
  query: string;
  anchorName?: string;
  intendedActionAfterSelect?: 'set_destination' | 'add_stop' | 'show_options' | 'ask_user';
  candidates: ClarificationCandidate[];
  pendingActions: AtomicAction[]; // actions from the compound command that wait for this clarification
  targetAction: AtomicAction;
  timestamp: number;
  responseLanguage: string;
}

export interface FollowUpResolutionResult {
  type: 'select_candidate' | 'cancel' | 'not_applicable';
  selectedCandidate?: ClarificationCandidate;
  additionalActions?: AtomicAction[];
  userMessage?: string;
}

class ConversationContextManager {
  private currentState: ConversationState = 'IDLE';
  private pendingClarification: PendingClarification | null = null;
  private clarificationTimeoutMs = 120000; // 2 minutes expiration
  private listeners: Array<() => void> = [];

  public getState(): ConversationState {
    return this.currentState;
  }

  public setState(state: ConversationState): void {
    this.currentState = state;
    this.notifyListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Safe notification
      }
    }
  }

  public setPendingClarification(clarification: Omit<PendingClarification, 'id' | 'timestamp'>): PendingClarification {
    const fullClarification: PendingClarification = {
      ...clarification,
      id: `clarify-${Date.now()}`,
      timestamp: Date.now(),
    };
    this.pendingClarification = fullClarification;
    this.currentState = 'AWAITING_CLARIFICATION';
    this.notifyListeners();
    return fullClarification;
  }

  public getPendingClarification(): PendingClarification | null {
    if (!this.pendingClarification) return null;
    // Check expiration
    if (Date.now() - this.pendingClarification.timestamp > this.clarificationTimeoutMs) {
      this.clearPendingClarification();
      return null;
    }
    return this.pendingClarification;
  }

  public clearPendingClarification(): void {
    this.pendingClarification = null;
    this.currentState = 'IDLE';
    this.notifyListeners();
  }

  public isClarificationActive(): boolean {
    return this.getPendingClarification() !== null;
  }

  /**
   * Resolves follow-up user references against the active clarification context.
   * Supports English, Hindi, Hinglish, Marathi, and mixed languages.
   * Handles:
   * - Ordinals: "the first one", "second one", "3rd option", "number 2"
   * - Hindi: "पहला वाला", "दूसरा वाला", "तीसरी लोकेशन", "पहले वाली"
   * - Marathi: "पहिला", "दुसरे ठिकाण", "तिसरा पर्याय", "दुसरा"
   * - Locality & keyword disambiguation: "the one in Dwarka", "Paschim Vihar वाला", "Airport वाला"
   * - Cancellation: "cancel", "no", "rehne do", "chhod do", "radh kara"
   * - Compound follow-ups: "Choose the second one and add a petrol pump on the way"
   */
  public resolveFollowUpReference(input: string): FollowUpResolutionResult {
    const clarification = this.getPendingClarification();
    if (!clarification || clarification.candidates.length === 0) {
      return { type: 'not_applicable' };
    }

    const clean = input.trim();
    const lower = clean.toLowerCase();

    // Check for pure cancellation (do not treat "No, the one in..." as cancellation!)
    const isPureCancel =
      /^(?:no|nahin|nahi|arre|arrey)?[,\s]*(?:cancel|forget\s*it|never\s*mind|rehne\s*do|chhod\s*do|radh\s*kara|nakko|stop|mat\s*karo|dismiss)(?:\s+(?:that|it|this|selection|now|bhai|yaar))?[.!]?$/i.test(lower) ||
      /^(?:no|nahin|nahi|don't|dont)(?:\s+(?:thanks|thank\s+you|please|bhai|yaar|ji))?[.!]?$/i.test(lower);
    if (isPureCancel) {
      return { type: 'cancel', userMessage: 'Cancelled selection.' };
    }

    // Check for compound command combined with selection, e.g. "Choose the second one and add a petrol pump"
    let additionalActions: AtomicAction[] | undefined = undefined;
    if (/(?:and\s+add|aur\s+(?:ek\s+)?|aani\s+)/i.test(lower)) {
      if (/petrol|fuel|gas/i.test(lower)) {
        additionalActions = [{ type: 'ADD_STOP', placeQuery: 'petrol pump', category: 'gas_station', searchAnchor: 'route' }];
      } else if (/cng/i.test(lower)) {
        additionalActions = [{ type: 'ADD_STOP', placeQuery: 'CNG station', category: 'cng_station', searchAnchor: 'route' }];
      } else if (/restaurant|cafe|dhaba|khana/i.test(lower)) {
        additionalActions = [{ type: 'ADD_STOP', placeQuery: 'restaurant', category: 'restaurant', searchAnchor: 'route' }];
      } else if (/coffee/i.test(lower)) {
        additionalActions = [{ type: 'ADD_STOP', placeQuery: 'coffee shop', category: 'restaurant', searchAnchor: 'route' }];
      }
    }

    // Direct affirmative command ("Take me there", "Navigate there", "Go there", "Yes, take me there")
    if (/^(?:take\s+me\s+there|navigate\s+there|go\s+there|yes\s+take\s+me\s+there|yes|haan\s+chalo|chalo|le\s+chalo)[.!]?$/i.test(lower)) {
      const candidate = clarification.candidates[0];
      if (candidate) {
        return {
          type: 'select_candidate',
          selectedCandidate: candidate,
          additionalActions,
          userMessage: `Navigating to ${candidate.name}`,
        };
      }
    }

    // Strip leading conversational correction prefixes before ordinal and token matching
    // e.g. "No, the one in Dwarka" -> "the one in Dwarka"
    // e.g. "Actually the second option" -> "the second option"
    // e.g. "Nahi, Paschim Vihar wala" -> "Paschim Vihar wala"
    const strippedInput = clean
      .replace(/^(?:no|nahin|nahi|arrey|actually|i\s+meant|i\s+mean|oh\s+no|wait)[,\s]+/gi, '')
      .trim();
    const strippedLower = strippedInput.toLowerCase();

    // 0a. Substantial detour confirmation
    if (clarification.targetRole === 'substantial_detour_confirmation') {
      if (
        /^(?:yes|haan|ha|still add|add it|add kardo|add kar do|yes add it|ha add kar do|theek hai|chalega|okay|ok|continue|confirm|yep)[.!]?$/i.test(strippedLower) ||
        /(?:still add|add anyway|haan jod do|add kar do|add kardo)/i.test(strippedLower) ||
        /हाँ|हां|जोड़ दो|चलेगा|ठीक है/i.test(strippedInput)
      ) {
        const candidate = clarification.candidates[0];
        return {
          type: 'select_candidate',
          selectedCandidate: candidate,
          additionalActions,
          userMessage: `Confirmed adding ${candidate?.name || 'stop'}.`,
        };
      }
      if (
        /^(?:no|nahi|nahin|cancel|mat jodo|mat add karo|don't add|dont add|rehne do)[.!]?$/i.test(strippedLower) ||
        /नहीं|मत जोड़ो|रहने दो|रद्द/i.test(strippedInput)
      ) {
        return { type: 'cancel', userMessage: 'Cancelled stop due to substantial detour.' };
      }
    }

    // 0b. Role disambiguation for destination_or_stop clarification
    if (clarification.targetRole === 'destination_or_stop') {
      if (/(?:stop|स्टॉप|बीच का|intermediate|halt|stoppage)/i.test(strippedLower) || /स्टॉप|रुकना|बीच में/i.test(strippedInput)) {
        const candidate = clarification.candidates.find((c) => c.category === 'stop') || clarification.candidates[0];
        return {
          type: 'select_candidate',
          selectedCandidate: { ...candidate, targetRole: 'stop' as any },
          additionalActions,
          userMessage: `Adding ${clarification.query} as an intermediate stop.`,
        };
      }
      if (/(?:destination|मंजिल|गंतव्य|final|new destination)/i.test(strippedLower) || /मंजिल|गंतव्य/i.test(strippedInput)) {
        const candidate = clarification.candidates.find((c) => c.category === 'destination') || clarification.candidates[0];
        return {
          type: 'select_candidate',
          selectedCandidate: { ...candidate, targetRole: 'destination' as any },
          additionalActions,
          userMessage: `Setting ${clarification.query} as new destination.`,
        };
      }
    }

    // 1. Ordinal pattern matching
    let targetIndex: number | null = null;

    // Second / #2 (Check before single 'one' to avoid 'second one' matching 'one')
    if (
      /\b(?:second|2nd|number\s*2|two|dusra|doosra|dusara|doosri|dusri|second\s*one|second\s*option|second\s*shop|doosri\s*shop|dusri\s*shop|second\s*restaurant)\b/i.test(strippedLower) ||
      /दूसरा|दूसरी|दुसरा|दुसरे/i.test(strippedInput)
    ) {
      targetIndex = 2;
    }
    // Third / #3
    else if (
      /\b(?:third|3rd|number\s*3|three|teesra|tisra|teesri|third\s*one|third\s*option|third\s*shop)\b/i.test(strippedLower) ||
      /तीसरा|तीसरी|तिसरा|तिसरे/i.test(strippedInput)
    ) {
      targetIndex = 3;
    }
    // Fourth / #4
    else if (
      /\b(?:fourth|4th|number\s*4|four|chautha|chauthi|fourth\s*one)\b/i.test(strippedLower) ||
      /चौथा|चौथी/i.test(strippedInput)
    ) {
      targetIndex = 4;
    }
    // First / #1
    else if (
      /\b(?:first|1st|number\s*1|first\s*one|first\s*option|first\s*shop|pehli\s*shop|pehla|pahila|pehli|pahili|add\s+that\s+one|use\s+that\s+one)\b/i.test(strippedLower) ||
      (!/\b(?:second|third|fourth|2nd|3rd|4th|doosra|dusra|teesra|chautha)\b/i.test(strippedLower) && /\b(?:one|pehla|pahila)\b/i.test(strippedLower)) ||
      /पहला|पहली|पहिला|पहिले/i.test(strippedInput)
    ) {
      targetIndex = 1;
    }

    if (targetIndex !== null) {
      const candidate = clarification.candidates.find((c) => c.index === targetIndex);
      if (candidate) {
        return {
          type: 'select_candidate',
          selectedCandidate: candidate,
          additionalActions,
          userMessage: `Selected option #${targetIndex}: ${candidate.name}`,
        };
      }
    }

    // 2. Category disambiguation (e.g. "the hotel, not the restaurant", "hotel wala")
    if (/(?:hotel|resort|lodging)/i.test(strippedLower) && /(?:not|nahi|nakko|restaurant)/i.test(strippedLower)) {
      const lodgingCandidate = clarification.candidates.find(
        (c) => /hotel|resort|lodging/i.test(c.name) || (c.category && /lodging|hotel/i.test(c.category))
      );
      if (lodgingCandidate) {
        return {
          type: 'select_candidate',
          selectedCandidate: lodgingCandidate,
          additionalActions,
          userMessage: `Selected ${lodgingCandidate.name}`,
        };
      }
    }

    // 3. Locality / descriptive disambiguation matching
    // e.g. "the one in Dwarka", "Paschim Vihar वाला", "near airport"
    for (const candidate of clarification.candidates) {
      const candName = candidate.name.toLowerCase();
      const candAddr = (candidate.address || '').toLowerCase();

      // Extract significant tokens from user input (ignoring common filler words)
      const inputTokens = strippedInput
        .toLowerCase()
        .replace(/[.,!?]/g, ' ')
        .replace(/^(?:the\s+(?:one|hotel|location|place)\s+(?:in|near|at)|hotel\s+in|choose|select|i\s+meant\s+(?:the\s+one\s+in)?|meant|wala|waala|mein|me|par|pe)\s+/gi, '')
        .replace(/(?:\s+(?:वाला|वाली|वाले|wala|waala|location|stop))+$/gi, '')
        .split(/\s+/)
        .map((t) => t.replace(/^(?:वाला|वाली|वाले|wala|waala|location|stop)$/gi, '').trim())
        .filter((t) => t.length > 2 && !['the', 'one', 'and', 'with', 'stop', 'karo', 'chuno', 'option', 'hotel'].includes(t));

      if (inputTokens.length > 0) {
        const matchesAll = inputTokens.every((tok) => candName.includes(tok) || candAddr.includes(tok));
        if (matchesAll) {
          return {
            type: 'select_candidate',
            selectedCandidate: candidate,
            additionalActions,
            userMessage: `Selected ${candidate.name} based on your specification`,
          };
        }
      }
    }

    return { type: 'not_applicable' };
  }
}

export const conversationContext = new ConversationContextManager();
