import React from 'react';
import { useJourney } from '../../context/JourneyContext';
import { IndieMapsLogo } from '../Brand/IndieMapsLogo';
import {
  Navigation,
  Car,
  Bike,
  ShieldCheck,
  ShieldAlert,
  Play,
  Square,
  Sun,
  Moon,
} from 'lucide-react';

interface RouteSummaryProps {
  onOpenTestModal?: () => void;
}

export const RouteSummary: React.FC<RouteSummaryProps> = () => {
  const {
    journey,
    activeRoute,
    routeLoading,
    toggleAvoidTolls,
    setTravelMode,
    theme,
    toggleTheme,
    navigationState,
    startNavigation,
    endNavigation,
  } = useJourney();

  const isNavReady = Boolean(activeRoute && !activeRoute.isStale && journey.origin && journey.destination);

  return (
    <header
      className={`border-b px-3 sm:px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs transition-colors z-20 ${
        theme === 'dark'
          ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
          : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
      }`}
    >
      {/* Brand & App Info with Original Map-Inspired Logo */}
      <div className="flex items-center justify-between">
        <IndieMapsLogo theme={theme} size={30} />

        {/* Mobile Action Controls */}
        <div className="flex items-center gap-1.5 md:hidden">
          {/* Start / End Navigation Button for Mobile */}
          {navigationState.isActive ? (
            <button
              onClick={endNavigation}
              className="flex items-center gap-1 text-xs font-bold bg-[#DC2626] text-white px-3 py-1.5 rounded-xl active:scale-95 shadow-sm transition"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>End</span>
            </button>
          ) : (
            <button
              onClick={startNavigation}
              disabled={!isNavReady}
              className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 shadow-sm transition ${
                isNavReady
                  ? 'bg-[#183D35] hover:bg-[#286B57] text-[#D8F36A]'
                  : 'bg-[#E3E7E0] dark:bg-[#1A332E] text-[#68736D] dark:text-[#8E9E96] cursor-not-allowed opacity-60'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start</span>
            </button>
          )}

          {/* Theme Toggle Mobile */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-xl border transition ${
              theme === 'dark'
                ? 'bg-[#162B25] border-[#233D35] text-[#D8F36A]'
                : 'bg-[#F7F5EF] border-[#E3E7E0] text-[#183D35]'
            }`}
            title="Toggle Dark/Light Theme"
            aria-label="Toggle dark/bright theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#D8F36A]" /> : <Moon className="w-4 h-4 text-[#183D35]" />}
          </button>
        </div>
      </div>

      {/* Active Route Metrics (Real ETA, Distance & Via Road) */}
      {activeRoute ? (
        <div
          className={`flex items-center gap-4 px-3.5 py-1.5 rounded-xl border transition ${
            theme === 'dark'
              ? 'bg-[#162B25] border-[#233D35]'
              : 'bg-[#F7F5EF] border-[#E3E7E0]'
          }`}
        >
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-[#68736D] dark:text-[#8E9E96]">
              ETA / Time
            </div>
            <div className="text-sm font-extrabold text-[#286B57] dark:text-[#D8F36A]">
              {activeRoute.durationFormatted}
            </div>
          </div>
          <div className="w-px h-6 bg-[#E3E7E0] dark:bg-[#233D35]" />
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-[#68736D] dark:text-[#8E9E96]">
              Distance
            </div>
            <div className="text-sm font-extrabold text-[#183D35] dark:text-[#F5F7F2]">
              {activeRoute.distanceKm}
            </div>
          </div>
          {activeRoute.description && (
            <>
              <div className="w-px h-6 bg-[#E3E7E0] dark:bg-[#233D35]" />
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase font-bold tracking-wider text-[#68736D] dark:text-[#8E9E96]">
                  Via
                </div>
                <div className="text-xs font-semibold text-[#68736D] dark:text-[#DCE9DE] truncate max-w-[150px]">
                  {activeRoute.description}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="text-xs text-[#68736D] dark:text-[#8E9E96] flex items-center gap-1.5 py-1">
          <Navigation className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
          <span>Speak or type destination to compute live route</span>
        </div>
      )}

      {/* Desktop Controls: Start Nav, Travel Mode, Avoid Tolls, Theme */}
      <div className="hidden md:flex items-center gap-2">
        {/* START / END TRIP NAVIGATION BUTTON (Desktop) */}
        {navigationState.isActive ? (
          <button
            onClick={endNavigation}
            className="flex items-center gap-1.5 text-xs font-bold bg-[#DC2626] hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95"
            title="End active navigation trip"
          >
            <Square className="w-3.5 h-3.5 fill-white" />
            <span>End Navigation</span>
          </button>
        ) : (
          <button
            onClick={startNavigation}
            disabled={!isNavReady}
            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition active:scale-95 ${
              isNavReady
                ? 'bg-[#183D35] hover:bg-[#286B57] text-[#D8F36A]'
                : 'bg-[#E3E7E0] dark:bg-[#162B25] text-[#68736D] dark:text-[#8E9E96] border border-[#E3E7E0] dark:border-[#233D35] cursor-not-allowed opacity-60'
            }`}
            title={isNavReady ? 'Start active turn-by-turn guidance' : 'Calculate a valid route first to start navigation'}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Navigation</span>
          </button>
        )}

        {/* Car / Two-Wheeler Segmented Toggle */}
        <div
          className={`flex items-center p-0.5 rounded-xl border ${
            theme === 'dark' ? 'bg-[#162B25] border-[#233D35]' : 'bg-[#F7F5EF] border-[#E3E7E0]'
          }`}
        >
          <button
            onClick={() => setTravelMode('DRIVE')}
            className={`p-1.5 rounded-lg text-xs font-medium transition ${
              journey.travelMode === 'DRIVE'
                ? 'bg-[#286B57] text-white shadow-xs'
                : 'text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2]'
            }`}
            title="Car Navigation (Routes via major highways)"
            aria-label="Car mode"
          >
            <Car className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTravelMode('TWO_WHEELER')}
            className={`p-1.5 rounded-lg text-xs font-medium transition ${
              journey.travelMode === 'TWO_WHEELER'
                ? 'bg-[#286B57] text-white shadow-xs'
                : 'text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2]'
            }`}
            title="Two-Wheeler Navigation (Routes avoiding restricted expressways)"
            aria-label="Two-wheeler mode"
          >
            <Bike className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toll Avoidance Button */}
        <button
          onClick={toggleAvoidTolls}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
            journey.avoidTolls
              ? 'bg-[#DCE9DE] dark:bg-[#1F362F] border-[#286B57] text-[#183D35] dark:text-[#D8F36A]'
              : theme === 'dark'
              ? 'bg-[#162B25] border-[#233D35] text-[#8E9E96] hover:text-[#F5F7F2]'
              : 'bg-[#F7F5EF] border-[#E3E7E0] text-[#68736D] hover:text-[#202824]'
          }`}
          title="Toggle avoid tolls"
        >
          {journey.avoidTolls ? (
            <ShieldAlert className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-current opacity-70" />
          )}
          <span>Avoid Tolls</span>
        </button>

        {/* Theme Toggle Button (Dark/Bright) */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl border transition ${
            theme === 'dark'
              ? 'bg-[#162B25] border-[#233D35] text-[#D8F36A] hover:bg-[#1A332E]'
              : 'bg-[#F7F5EF] border-[#E3E7E0] text-[#183D35] hover:bg-[#EEF5F0]'
          }`}
          title={theme === 'dark' ? 'Switch to Bright Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle dark/bright theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-[#D8F36A]" /> : <Moon className="w-4 h-4 text-[#183D35]" />}
        </button>
      </div>
    </header>
  );
};
