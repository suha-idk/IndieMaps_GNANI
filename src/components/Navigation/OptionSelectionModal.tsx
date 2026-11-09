import React, { useState, useEffect } from 'react';
import { useJourney } from '../../context/JourneyContext';
import { ClarificationCandidate } from '../../services/conversationContext';
import {
  MapPin,
  X,
  Navigation,
  Fuel,
  Utensils,
  Landmark,
  Check,
  Building2,
  Sparkles,
  Star,
  Clock,
} from 'lucide-react';

export const OptionSelectionModal: React.FC = () => {
  const { pendingClarification, selectClarificationCandidate, cancelClarification, theme } = useJourney();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keyboard navigation & Escape dismissal
  useEffect(() => {
    if (!pendingClarification) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelClarification();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingClarification, cancelClarification]);

  // Reset state when clarification changes
  useEffect(() => {
    setSelectedCandidateId(null);
    setIsSubmitting(false);
  }, [pendingClarification]);

  if (!pendingClarification) return null;

  const role = pendingClarification.targetRole || 'destination';
  const title =
    role === 'nearby_selection'
      ? pendingClarification.anchorName
        ? `Options near ${pendingClarification.anchorName}`
        : `Nearby options for "${pendingClarification.query}"`
      : role === 'landmark_disambiguation'
      ? `Choose Landmark for "${pendingClarification.query}"`
      : role === 'substantial_detour_confirmation'
      ? `Detour Confirmation for ${pendingClarification.query}`
      : role === 'destination'
      ? 'Choose your destination'
      : role === 'origin'
      ? 'Choose starting point'
      : role === 'destination_or_stop'
      ? `Destination or Stop for ${pendingClarification.query}`
      : 'Choose stop to add';

  const actionLabel =
    role === 'nearby_selection'
      ? 'Select'
      : role === 'substantial_detour_confirmation'
      ? 'Confirm'
      : role === 'stop'
      ? 'Add'
      : 'Choose';

  const handleSelect = async (candidate: ClarificationCandidate) => {
    if (isSubmitting) return; // Rapid repeated click guard
    setIsSubmitting(true);
    setSelectedCandidateId(candidate.id);
    try {
      await selectClarificationCandidate(candidate);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryIcon = (category?: string, name?: string) => {
    const text = `${category || ''} ${name || ''}`.toLowerCase();
    if (text.includes('petrol') || text.includes('fuel') || text.includes('gas')) {
      return <Fuel className="w-4 h-4 text-[#286B57]" />;
    }
    if (text.includes('restaurant') || text.includes('cafe') || text.includes('food') || text.includes('dhaba')) {
      return <Utensils className="w-4 h-4 text-[#286B57]" />;
    }
    if (text.includes('temple') || text.includes('monument') || text.includes('fort') || text.includes('museum') || text.includes('mahal')) {
      return <Landmark className="w-4 h-4 text-[#286B57]" />;
    }
    if (text.includes('hospital') || text.includes('school') || text.includes('station') || text.includes('airport')) {
      return <Building2 className="w-4 h-4 text-[#286B57]" />;
    }
    return <MapPin className="w-4 h-4 text-[#286B57]" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#183D35]/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="option-modal-title"
      aria-describedby="option-modal-description"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          cancelClarification();
        }
      }}
    >
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden transition-all ${
          theme === 'dark'
            ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
            : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E3E7E0] dark:border-[#233D35] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#DCE9DE] dark:bg-[#1F362F] flex items-center justify-center text-[#183D35] dark:text-[#D8F36A] shrink-0 mt-0.5">
              <Navigation className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 id="option-modal-title" className="text-base sm:text-lg font-bold tracking-tight">
                {title}
              </h2>
              <p
                id="option-modal-description"
                className="text-xs sm:text-sm mt-0.5 text-[#68736D] dark:text-[#8E9E96]"
              >
                Multiple places match{' '}
                <span className="font-semibold text-[#183D35] dark:text-[#D8F36A]">
                  "{pendingClarification.query}"
                </span>
                . Click an option or say "option 1", "option 2":
              </p>
            </div>
          </div>
          <button
            onClick={cancelClarification}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-white hover:bg-[#F7F5EF] dark:hover:bg-[#1A332E] transition shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1 min-h-[140px]">
          {pendingClarification.candidates.map((candidate, idx) => {
            const isTarget = selectedCandidateId === candidate.id;
            return (
              <div
                key={candidate.id || `candidate-${idx}`}
                className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all duration-150 ${
                  isTarget
                    ? 'bg-[#EEF5F0] dark:bg-[#1A332E] border-[#286B57] ring-2 ring-[#286B57]/30'
                    : 'bg-[#F7F5EF]/60 dark:bg-[#162B25]/60 hover:bg-[#EEF5F0] dark:hover:bg-[#1A332E] border-[#E3E7E0] dark:border-[#233D35] hover:border-[#286B57]'
                }`}
              >
                {/* Left: Index badge & place details */}
                <div className="flex items-start gap-3 min-w-0 pr-3">
                  <div className="w-6 h-6 rounded-lg bg-[#DCE9DE] dark:bg-[#1F362F] text-[#183D35] dark:text-[#D8F36A] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    {idx + 1}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getCategoryIcon(candidate.category, candidate.name)}
                      <span className="font-bold text-sm truncate text-[#183D35] dark:text-[#F5F7F2]">
                        {candidate.name}
                      </span>
                    </div>
                    {candidate.address && (
                      <p className="text-xs text-[#68736D] dark:text-[#8E9E96] line-clamp-2">
                        {candidate.address}
                      </p>
                    )}
                    {(candidate.rating !== undefined || candidate.straightLineDistanceKm || candidate.detourKm || candidate.openNow !== undefined) && (
                      <div className="flex items-center flex-wrap gap-2 pt-1 text-xs">
                        {candidate.rating !== undefined && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            <span>{candidate.rating.toFixed(1)}</span>
                            {candidate.userRatingCount !== undefined && (
                              <span className="text-[#68736D] dark:text-[#8E9E96]">({candidate.userRatingCount})</span>
                            )}
                          </span>
                        )}
                        {candidate.openNow !== undefined && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                            candidate.openNow ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40' : 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40'
                          }`}>
                            {candidate.openNow ? 'Open now' : 'Closed'}
                          </span>
                        )}
                        {candidate.straightLineDistanceKm && (
                          <span className="text-[11px] text-[#286B57] dark:text-[#8CD6BD] bg-[#E3EFEA] dark:bg-[#1E3B33] px-1.5 py-0.5 rounded font-medium">
                            {candidate.straightLineDistanceKm}
                          </span>
                        )}
                        {candidate.detourKm && (
                          <span className="text-[11px] text-[#286B57] dark:text-[#8CD6BD] bg-[#E3EFEA] dark:bg-[#1E3B33] px-1.5 py-0.5 rounded font-medium">
                            +{candidate.detourKm}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Action button */}
                <button
                  type="button"
                  onClick={() => handleSelect(candidate)}
                  disabled={isSubmitting}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                    isTarget
                      ? 'bg-[#286B57] text-white cursor-wait'
                      : 'bg-[#183D35] hover:bg-[#286B57] text-white group-hover:bg-[#286B57]'
                  } disabled:opacity-50`}
                >
                  {isTarget ? (
                    <>
                      <Check className="w-3.5 h-3.5 animate-pulse" />
                      <span>Selecting...</span>
                    </>
                  ) : (
                    <>
                      <span>{actionLabel}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-[#F7F5EF] dark:bg-[#0E1A17] border-t border-[#E3E7E0] dark:border-[#233D35] flex items-center justify-between text-xs text-[#68736D] dark:text-[#8E9E96] shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
            <span>You can click a button or speak "first option" / "second one"</span>
          </span>
          <button
            type="button"
            onClick={cancelClarification}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] text-[#202824] dark:text-[#F5F7F2] hover:bg-[#E3E7E0]/50 dark:hover:bg-[#1A332E] font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
