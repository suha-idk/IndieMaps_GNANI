import React from 'react';
import { useJourney } from '../../context/JourneyContext';
import { Check, X, AlertTriangle } from 'lucide-react';

export const ProposalModal: React.FC = () => {
  const { pendingProposal, confirmProposal, cancelProposal, theme } = useJourney();

  if (!pendingProposal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#183D35]/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-title"
    >
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border p-5 space-y-4 transition-all ${
          theme === 'dark'
            ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
            : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 id="proposal-title" className="text-base font-bold tracking-tight">
              Confirm Route Changes
            </h3>
            <p className="text-xs text-[#68736D] dark:text-[#8E9E96] mt-0.5">
              {pendingProposal.explanation}
            </p>
          </div>
        </div>

        {/* Spoken summary */}
        <div
          className={`p-3 rounded-xl border text-sm italic ${
            theme === 'dark'
              ? 'bg-[#162B25] border-[#233D35] text-[#DCE9DE]'
              : 'bg-[#F7F5EF] border-[#E3E7E0] text-[#183D35]'
          }`}
        >
          "{pendingProposal.summary}"
        </div>

        {/* Comparison Details */}
        <div className="space-y-2 text-xs">
          <div className="text-[#68736D] dark:text-[#8E9E96] font-semibold uppercase text-[11px] tracking-wide">
            Proposed Updates:
          </div>
          <div
            className={`p-3 rounded-xl border space-y-2 ${
              theme === 'dark'
                ? 'bg-[#0E1A17] border-[#233D35]'
                : 'bg-[#F7F5EF]/60 border-[#E3E7E0]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[#68736D] dark:text-[#8E9E96]">Destination:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {pendingProposal.proposedJourney.destination?.name || 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#68736D] dark:text-[#8E9E96]">Intermediate Stops:</span>
              <span className="font-semibold text-[#286B57] dark:text-[#D8F36A]">
                {pendingProposal.proposedJourney.stops.length > 0
                  ? pendingProposal.proposedJourney.stops.map((s) => s.name).join(' ➔ ')
                  : 'No stops'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={cancelProposal}
            className={`flex-1 py-2.5 px-4 rounded-xl border font-semibold text-xs transition flex items-center justify-center gap-1.5 ${
              theme === 'dark'
                ? 'border-[#233D35] bg-[#162B25] text-[#8E9E96] hover:bg-[#1A332E]'
                : 'border-[#E3E7E0] bg-[#F7F5EF] text-[#68736D] hover:bg-[#EEF5F0]'
            }`}
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
          <button
            onClick={confirmProposal}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#183D35] hover:bg-[#286B57] text-[#D8F36A] font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Confirm & Apply</span>
          </button>
        </div>
      </div>
    </div>
  );
};
