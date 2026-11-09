import React from 'react';
import { useJourney } from '../../context/JourneyContext';
import { Fuel, Plus, X, Star } from 'lucide-react';

export const DetourFinder: React.FC = () => {
  const { detourCandidates, detourLoading, selectDetourCandidate, dismissDetourCandidates, theme } = useJourney();

  if (detourCandidates.length === 0 && !detourLoading) return null;

  return (
    <div
      className={`border-t p-3 sm:p-4 space-y-3 transition-colors ${
        theme === 'dark'
          ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
          : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-[#DCE9DE] dark:bg-[#1F362F] text-[#183D35] dark:text-[#D8F36A]">
            <Fuel className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold tracking-tight">Recommended Stations Along Route</h4>
            <p className="text-[11px] text-[#68736D] dark:text-[#8E9E96]">Ranked by lowest detour distance & time</p>
          </div>
        </div>
        <button
          onClick={dismissDetourCandidates}
          className="text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2] p-1 rounded-lg transition"
          title="Dismiss recommendations"
          aria-label="Dismiss recommendations"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {detourLoading && (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#286B57] dark:text-[#D8F36A] animate-pulse">
          <Fuel className="w-4 h-4 animate-bounce" />
          <span>Calculating route impact for nearby stations...</span>
        </div>
      )}

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {detourCandidates.map((cand, idx) => (
          <div
            key={cand.id || `cand-${idx}`}
            className={`flex items-center justify-between p-3 rounded-xl border transition group ${
              theme === 'dark'
                ? 'bg-[#162B25] border-[#233D35] hover:border-[#286B57]'
                : 'bg-[#F7F5EF] border-[#E3E7E0] hover:border-[#286B57]'
            }`}
          >
            <div className="space-y-1 overflow-hidden pr-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs truncate">
                  {cand.displayName?.text || cand.name || 'Petrol Station'}
                </span>
                {cand.rating && (
                  <span className="flex items-center text-[10px] text-amber-700 dark:text-amber-400 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                    <Star className="w-2.5 h-2.5 fill-current mr-0.5" />
                    {cand.rating}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#68736D] dark:text-[#8E9E96] truncate">
                {cand.formattedAddress}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#68736D] dark:text-[#8E9E96]">
                {cand.detourKm ? (
                  <>
                    <span className="text-[#286B57] dark:text-[#D8F36A] font-semibold">
                      +{cand.detourKm} km
                    </span>
                    <span>•</span>
                    <span className="text-[#286B57] dark:text-[#D8F36A] font-semibold">
                      +{cand.detourMinutes} min detour
                    </span>
                  </>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Detour estimate unavailable
                  </span>
                )}
                {cand.currentOpeningHours?.openNow !== undefined && (
                  <>
                    <span>•</span>
                    <span className={cand.currentOpeningHours.openNow ? 'text-[#286B57] dark:text-[#D8F36A] font-medium' : 'text-rose-500'}>
                      {cand.currentOpeningHours.openNow ? 'Open Now' : 'Closed'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => selectDetourCandidate(cand)}
              className="py-1.5 px-3 rounded-xl bg-[#183D35] hover:bg-[#286B57] text-[#D8F36A] font-bold text-xs shrink-0 transition flex items-center gap-1 shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stop</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
