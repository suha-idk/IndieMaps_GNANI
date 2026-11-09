import React, { useState } from 'react';
import { useJourney } from '../../context/JourneyContext';
import { Waypoint } from '../../types/navigation';
import { searchPlaces } from '../../services/placesService';
import { ArrowUp, ArrowDown, Trash2, Plus, Flag, Search, X } from 'lucide-react';

export const ItineraryList: React.FC = () => {
  const {
    journey,
    setOrigin,
    setDestination,
    clearDestination,
    addStop,
    removeStopByOrdinal,
    reorderStops,
    clearAllStops,
    theme,
  } = useJourney();

  const [isAddingStop, setIsAddingStop] = useState(false);
  const [stopInput, setStopInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingType, setEditingType] = useState<'origin' | 'destination' | 'stop' | null>(null);

  const handleSearch = async (val: string) => {
    setStopInput(val);
    if (val.trim().length > 2) {
      setIsSearching(true);
      const res = await searchPlaces(val.trim());
      setSearchResults(res);
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectPlace = (place: any) => {
    const wp: Waypoint = {
      id: place.id || `wp-${Date.now()}`,
      name: place.name,
      address: place.address,
      latLng: place.latLng,
      category: place.category,
      addedVia: 'manual',
    };

    if (editingType === 'origin') {
      setOrigin(wp);
    } else if (editingType === 'destination') {
      setDestination(wp);
    } else {
      addStop(wp);
    }

    setEditingType(null);
    setIsAddingStop(false);
    setStopInput('');
    setSearchResults([]);
  };

  return (
    <div
      className={`border-t p-3 sm:p-4 space-y-3 transition-colors ${
        theme === 'dark'
          ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
          : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 text-[#68736D] dark:text-[#8E9E96]">
          <span>Itinerary Plan</span>
          <span className="text-[10px] bg-[#EEF5F0] dark:bg-[#162B25] text-[#286B57] dark:text-[#D8F36A] px-2 py-0.5 rounded-full font-mono">
            rev {journey.revision}
          </span>
        </h3>
        {journey.stops.length > 0 && (
          <button
            onClick={clearAllStops}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline transition"
          >
            Clear all stops
          </button>
        )}
      </div>

      {/* Itinerary Cards */}
      <div className="space-y-2">
        {/* Origin Item */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-xl border ${
            theme === 'dark' ? 'bg-[#162B25] border-[#233D35]' : 'bg-[#F7F5EF] border-[#E3E7E0]'
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-[#183D35] text-[#D8F36A] font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
              A
            </div>
            <div className="truncate">
              <div className="text-[10px] text-[#286B57] dark:text-[#D8F36A] font-bold uppercase tracking-wider">
                Origin
              </div>
              <div className="text-xs sm:text-sm font-semibold truncate">
                {journey.origin?.name || 'Current GPS Location'}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingType('origin');
              setIsAddingStop(true);
            }}
            className="text-xs text-[#286B57] dark:text-[#D8F36A] hover:underline px-2 py-1 rounded-lg shrink-0 font-medium"
          >
            Change
          </button>
        </div>

        {/* Intermediate Stops */}
        {journey.stops.map((stop, idx) => (
          <div
            key={stop.id || `stop-${idx}`}
            className={`flex items-center justify-between p-2.5 rounded-xl border-l-3 border-l-[#286B57] border ${
              theme === 'dark' ? 'bg-[#162B25]/80 border-[#233D35]' : 'bg-[#EEF5F0]/70 border-[#E3E7E0]'
            } ml-2 pl-3`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-6 h-6 rounded-full bg-[#286B57] text-white font-bold text-xs flex items-center justify-center shrink-0">
                {idx + 1}
              </div>
              <div className="truncate">
                <div className="text-[10px] text-[#286B57] dark:text-[#D8F36A] font-medium">Stop #{idx + 1}</div>
                <div className="text-xs sm:text-sm font-semibold truncate">{stop.name}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Move Up */}
              <button
                disabled={idx === 0}
                onClick={() => reorderStops(idx, idx - 1)}
                className={`p-1.5 rounded-lg text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2] ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                title="Move earlier"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              {/* Move Down */}
              <button
                disabled={idx === journey.stops.length - 1}
                onClick={() => reorderStops(idx, idx + 1)}
                className={`p-1.5 rounded-lg text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2] ${idx === journey.stops.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                title="Move later"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              {/* Remove Stop */}
              <button
                onClick={() => removeStopByOrdinal(idx + 1)}
                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 dark:hover:text-rose-300"
                title="Remove this stop"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

        {/* Destination Item */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-xl border ${
            theme === 'dark' ? 'bg-[#162B25] border-[#233D35]' : 'bg-[#F7F5EF] border-[#E3E7E0]'
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
              <Flag className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider">
                Destination
              </div>
              <div className="text-xs sm:text-sm font-semibold truncate">
                {journey.destination?.name || 'No destination set'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setEditingType('destination');
                setIsAddingStop(true);
              }}
              className="text-xs text-[#286B57] dark:text-[#D8F36A] hover:underline px-2 py-1 font-medium"
            >
              {journey.destination ? 'Change' : 'Set'}
            </button>
            {journey.destination && (
              <button
                onClick={clearDestination}
                className="p-1 text-[#68736D] hover:text-rose-600 dark:text-[#8E9E96] dark:hover:text-rose-400"
                title="Clear destination"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Stop Button */}
      {!isAddingStop && (
        <button
          onClick={() => {
            setEditingType('stop');
            setIsAddingStop(true);
          }}
          className={`w-full py-2 px-3 rounded-xl border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            theme === 'dark'
              ? 'border-[#233D35] text-[#8E9E96] hover:text-[#F5F7F2] hover:border-[#286B57]'
              : 'border-[#E3E7E0] text-[#68736D] hover:text-[#183D35] hover:border-[#286B57]'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Add Stop Manually</span>
        </button>
      )}

      {/* Search & Add Stop Inline Panel */}
      {isAddingStop && (
        <div
          className={`p-3 rounded-xl border space-y-2 ${
            theme === 'dark' ? 'bg-[#162B25] border-[#233D35]' : 'bg-[#EEF5F0] border-[#DCE9DE]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">
              {editingType === 'origin' ? 'Change Origin' : editingType === 'destination' ? 'Set Destination' : 'Add Stop'}
            </span>
            <button
              onClick={() => {
                setIsAddingStop(false);
                setStopInput('');
                setSearchResults([]);
              }}
              className="text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#68736D] dark:text-[#8E9E96] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={stopInput}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search place name, e.g. Mathura, petrol pump..."
              className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none transition ${
                theme === 'dark'
                  ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2] placeholder-[#8E9E96] focus:border-[#286B57]'
                  : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824] placeholder-[#68736D] focus:border-[#286B57]'
              }`}
              autoFocus
            />
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-[#E3E7E0] dark:divide-[#233D35]">
              {searchResults.map((place) => (
                <button
                  key={place.id}
                  onClick={() => handleSelectPlace(place)}
                  className="w-full text-left py-2 px-1 hover:bg-[#DCE9DE]/40 dark:hover:bg-[#1A332E] rounded-lg flex flex-col transition"
                >
                  <span className="text-xs font-bold text-[#183D35] dark:text-[#F5F7F2] truncate">{place.name}</span>
                  <span className="text-[11px] text-[#68736D] dark:text-[#8E9E96] truncate">{place.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
