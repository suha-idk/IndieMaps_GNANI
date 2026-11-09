import React, { useState, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { JourneyProvider } from './context/JourneyContext';
import { RaahiMap } from './components/Map/RaahiMap';
import { RouteSummary } from './components/Navigation/RouteSummary';
import { ItineraryList } from './components/Navigation/ItineraryList';
import { DetourFinder } from './components/Navigation/DetourFinder';
import { VoiceController } from './components/Voice/VoiceController';
import { ProposalModal } from './components/Navigation/ProposalModal';
import { OptionSelectionModal } from './components/Navigation/OptionSelectionModal';
import { QaTestRunner } from './components/TestModal/QaTestRunner';
import { ChevronUp, ChevronDown } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
    };

    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F7F5EF] dark:bg-[#0E1A17] text-[#202824] dark:text-[#F5F7F2] font-sans">
      {/* Mandated Quota Defense Sticky Top Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['routes', 'places', 'marker']}>
        <JourneyProvider>
          {/* Top Bar Navigation Summary & Controls */}
          <RouteSummary onOpenTestModal={() => setIsTestModalOpen(true)} />

          {/* Interactive Map Surface */}
          <div className="relative flex-1 w-full overflow-hidden flex flex-col">
            <RaahiMap />

            {/* Bottom Drawer Control Deck */}
            <div className="relative w-full max-w-3xl mx-auto z-20 flex flex-col shadow-2xl">
              {/* Expand/Collapse Itinerary Toggle Tab */}
              <div className="flex justify-center -mb-2 z-30">
                <button
                  onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                  className="bg-white dark:bg-[#142420] hover:bg-[#EEF5F0] dark:hover:bg-[#183D35] text-[#202824] dark:text-[#F5F7F2] text-[11px] font-semibold px-3 py-1 rounded-t-xl border-t border-x border-[#E3E7E0] dark:border-[#233D35] flex items-center gap-1 shadow-md transition"
                >
                  <span>{isPanelExpanded ? 'Hide Itinerary Details' : 'View Itinerary & Stops'}</span>
                  {isPanelExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#68736D] dark:text-[#8E9E96]" /> : <ChevronUp className="w-3.5 h-3.5 text-[#68736D] dark:text-[#8E9E96]" />}
                </button>
              </div>

              {/* Detour Candidate Recommendations (when active) */}
              <DetourFinder />

              {/* Expandable Itinerary List */}
              {isPanelExpanded && (
                <div className="max-h-60 overflow-y-auto">
                  <ItineraryList />
                </div>
              )}

              {/* Voice & Command Deck */}
              <VoiceController />
            </div>
          </div>

          {/* Interactive Pop-up for Destination Options & Clarifications */}
          <OptionSelectionModal />

          {/* Proposal Confirmation Dialog for compound/high-impact actions */}
          <ProposalModal />

          {/* QA Verification Suite Modal */}
          <QaTestRunner isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} />
        </JourneyProvider>
      </APIProvider>
    </div>
  );
}
