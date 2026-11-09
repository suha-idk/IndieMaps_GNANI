import React, { useEffect } from 'react';
import { GNANI_LANGUAGES, LanguageConfig, LanguageId } from '../../config/gnaniConfig';
import { speechService } from '../../services/speechService';
import { Languages, Check, X, Globe2 } from 'lucide-react';

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLangCode: string;
  onSelectLanguage: (langConfig: LanguageConfig) => void;
  theme?: 'dark' | 'light';
}

export const LanguageSelectorModal: React.FC<LanguageSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedLangCode,
  onSelectLanguage,
  theme = 'dark',
}) => {
  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const languages = Object.values(GNANI_LANGUAGES);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#183D35]/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lang-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-xl rounded-2xl shadow-2xl border flex flex-col max-h-[85vh] overflow-hidden transition-all ${
          theme === 'dark'
            ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
            : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#E3E7E0] dark:border-[#233D35] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#DCE9DE] dark:bg-[#1F362F] flex items-center justify-center text-[#183D35] dark:text-[#D8F36A] shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="lang-modal-title" className="text-base sm:text-lg font-bold tracking-tight">
                Select Navigation Language
              </h2>
              <p className="text-xs text-[#68736D] dark:text-[#8E9E96]">
                Voice recognition and speech responses in your language
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-white hover:bg-[#F7F5EF] dark:hover:bg-[#1A332E] transition shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Grid */}
        <div className="p-3 sm:p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
          {languages.map((lang) => {
            const isSelected =
              selectedLangCode === lang.sttCode ||
              selectedLangCode === lang.ttsLangCode ||
              selectedLangCode === lang.id;

            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => {
                  onSelectLanguage(lang);
                  onClose();
                }}
                className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#EEF5F0] dark:bg-[#1F362F] border-[#286B57] dark:border-[#D8F36A] ring-2 ring-[#286B57]/30 dark:ring-[#D8F36A]/30 shadow-xs'
                    : 'bg-[#F7F5EF]/60 dark:bg-[#162B25]/60 hover:bg-[#EEF5F0] dark:hover:bg-[#1A332E] border-[#E3E7E0] dark:border-[#233D35] hover:border-[#286B57]'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-bold text-sm text-[#183D35] dark:text-[#F5F7F2]">
                    {lang.name}
                  </span>
                  <span className="text-xs font-medium text-[#286B57] dark:text-[#D8F36A] mt-0.5">
                    {lang.nativeName}
                  </span>
                  <span className="text-[10px] text-[#68736D] dark:text-[#8E9E96] mt-0.5 font-mono">
                    STT: {lang.sttCode} · TTS: {lang.ttsLangCode}
                  </span>
                </div>

                {isSelected ? (
                  <div className="w-6 h-6 rounded-full bg-[#286B57] dark:bg-[#D8F36A] text-white dark:text-[#183D35] flex items-center justify-center shrink-0 shadow-xs">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border border-[#E3E7E0] dark:border-[#233D35] shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-[#F7F5EF] dark:bg-[#0E1A17] border-t border-[#E3E7E0] dark:border-[#233D35] flex items-center justify-between text-xs text-[#68736D] dark:text-[#8E9E96] shrink-0">
          <span>Supported across all 11 official regional speech engines</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] text-[#202824] dark:text-[#F5F7F2] hover:bg-[#E3E7E0]/50 dark:hover:bg-[#1A332E] font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
