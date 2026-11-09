import React from 'react';

interface IndieMapsLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  theme?: 'dark' | 'light';
}

export const IndieMapsLogo: React.FC<IndieMapsLogoProps> = ({
  size = 32,
  showWordmark = true,
  className = '',
  theme = 'dark',
}) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Original Indie Maps Pin & Route Emblem */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform hover:scale-105"
        aria-label="Indie Maps Logo"
        role="img"
      >
        {/* Soft drop shadow */}
        <defs>
          <filter id="indie-pin-shadow" x="2" y="2" width="32" height="34" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#183D35" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Outer Pin Body in Deep Forest Green */}
        <path
          d="M18 3C11.3726 3 6 8.37258 6 15C6 24 18 33 18 33C18 33 30 24 30 15C30 8.37258 24.6274 3 18 3Z"
          fill="#183D35"
          filter="url(#indie-pin-shadow)"
        />

        {/* Inner Curved Route / Path motif in Primary Green */}
        <path
          d="M13 18.5C13 14 15.5 10.5 18 10.5C20.5 10.5 23 14 23 18.5"
          stroke="#286B57"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Inner Waypoint Core Circle in Sage */}
        <circle cx="18" cy="14" r="5.5" fill="#DCE9DE" />

        {/* Destination Waypoint Node in Lime Accent */}
        <circle cx="18" cy="14" r="3" fill="#D8F36A" />

        {/* Route Path Indicator Line */}
        <path
          d="M14 24C15.2 25.5 16.6 27 18 28.5"
          stroke="#D8F36A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <div className="flex flex-col leading-tight select-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-extrabold text-base tracking-tight ${
                theme === 'dark' ? 'text-white' : 'text-[#183D35]'
              }`}
            >
              Indie Maps
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D8F36A] text-[#183D35] tracking-wide">
              VOICE
            </span>
          </div>
          <span
            className={`text-[10px] tracking-normal font-medium ${
              theme === 'dark' ? 'text-[#8E9E96]' : 'text-[#68736D]'
            }`}
          >
            Smart Navigation
          </span>
        </div>
      )}
    </div>
  );
};
