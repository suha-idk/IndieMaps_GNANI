import React, { useState, useEffect } from 'react';
import { useJourney } from '../../context/JourneyContext';
import { speechService, SupportedSpeechLang } from '../../services/speechService';
import { GNANI_LANGUAGES, getLanguageConfig, LanguageConfig } from '../../config/gnaniConfig';
import { LanguageSelectorModal } from './LanguageSelectorModal';
import { VoiceSettingsModal } from './VoiceSettingsModal';
import { Mic, MicOff, Send, Volume2, Undo2, RotateCcw, Globe, Sliders } from 'lucide-react';

export const VoiceController: React.FC = () => {
  const {
    executeCommand,
    isProcessingCommand,
    lastMessage,
    canUndo,
    undo,
    theme,
  } = useJourney();

  const [micState, setMicState] = useState(speechService.getMicState());
  const [transcript, setTranscript] = useState('');
  const [typedInput, setTypedInput] = useState('');
  const [selectedLang, setSelectedLang] = useState<SupportedSpeechLang>(
    (speechService.getRecognitionLanguage() as SupportedSpeechLang) || 'hi-IN'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);

  useEffect(() => {
    const unsub = speechService.onMicStateChange((state) => {
      setMicState(state);
    });
    return () => unsub();
  }, []);

  const currentLangConfig = getLanguageConfig(selectedLang);

  const startVoice = () => {
    setErrorMessage(null);
    setTranscript('');

    speechService.setRecognitionLanguage(selectedLang);
    speechService.startListening({
      onStart: () => {
        setErrorMessage(null);
      },
      onInterimResult: (text) => {
        setTranscript(text);
      },
      onFinalResult: (finalText) => {
        setTranscript(finalText);
        if (finalText.trim()) {
          const respLang = speechService.getResponseLanguage().split('-')[0] || 'hi';
          executeCommand(finalText.trim(), respLang);
        }
      },
      onError: (err) => {
        setErrorMessage(err);
      },
      onEnd: () => {
        // Microphone auto-off or manual off completed
      },
    });
  };

  const stopVoice = () => {
    speechService.stopListening();
  };

  const toggleVoice = () => {
    if (micState === 'STARTING' || micState === 'STOPPING') return;
    if (micState === 'LISTENING') {
      stopVoice();
    } else {
      startVoice();
    }
  };

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = (typedInput || transcript).trim();
    if (!cmd) return;
    const respLang = selectedLang.split('-')[0] || 'hi';
    executeCommand(cmd, respLang);
    setTypedInput('');
    setTranscript('');
  };

  const handleSelectLanguage = (langConfig: LanguageConfig) => {
    const code = langConfig.sttCode as SupportedSpeechLang;
    setSelectedLang(code);
    speechService.setRecognitionLanguage(langConfig.sttCode);
    speechService.setResponseLanguage(langConfig.ttsLangCode);
  };

  return (
    <div
      className={`border-t p-3 sm:p-4 space-y-2.5 transition-colors ${
        theme === 'dark'
          ? 'bg-[#142420] border-[#233D35] text-[#F5F7F2]'
          : 'bg-[#FFFFFF] border-[#E3E7E0] text-[#202824]'
      }`}
    >
      {/* Spoken Response or Error Notification Banner */}
      {(lastMessage || errorMessage) && (
        <div
          className={`flex items-center justify-between p-2.5 rounded-xl text-xs border transition ${
            errorMessage
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300'
              : theme === 'dark'
              ? 'bg-[#1A332E] border-[#233D35] text-[#DCE9DE]'
              : 'bg-[#EEF5F0] border-[#DCE9DE] text-[#183D35]'
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Volume2 className="w-4 h-4 text-[#286B57] dark:text-[#D8F36A] shrink-0" />
            <span className="truncate font-medium">{errorMessage || lastMessage}</span>
          </div>
          {lastMessage && (
            <button
              onClick={() => speechService.speak(lastMessage)}
              className="text-[#286B57] dark:text-[#D8F36A] hover:opacity-80 p-1 shrink-0 transition"
              title="Repeat audio"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Live Listening Transcript Bar */}
      {micState === 'LISTENING' && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#286B57]/15 border border-[#286B57]/40 text-xs text-[#183D35] dark:text-[#D8F36A] animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-[#286B57] dark:bg-[#D8F36A] animate-ping shrink-0" />
          <span className="font-bold">
            Listening ({currentLangConfig.nativeName || currentLangConfig.name}) [Auto-off 6.5s]:
          </span>
          <span className="italic truncate text-[#68736D] dark:text-[#DCE9DE]">
            {transcript || 'Say destination, stop, or route change...'}
          </span>
        </div>
      )}

      {/* Main Command Input & Controls */}
      <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
        {/* Large Voice Microphone Button */}
        <button
          type="button"
          onClick={toggleVoice}
          disabled={micState === 'STARTING' || micState === 'STOPPING'}
          className={`relative p-3.5 rounded-2xl shadow-md transition active:scale-95 flex items-center justify-center shrink-0 ${
            micState === 'LISTENING'
              ? 'bg-[#DC2626] text-white animate-pulse ring-4 ring-[#DC2626]/30'
              : micState === 'STARTING'
              ? 'bg-amber-600 text-white animate-pulse cursor-wait'
              : 'bg-[#183D35] hover:bg-[#286B57] text-[#D8F36A] shadow-[#183D35]/20'
          }`}
          title={
            micState === 'LISTENING'
              ? 'Tap to stop listening (Auto-off after 6.5s silence)'
              : micState === 'STARTING'
              ? 'Connecting microphone...'
              : 'Tap to speak destination or command'
          }
          aria-label={micState === 'LISTENING' ? 'Stop listening' : 'Start voice navigation input'}
        >
          {micState === 'LISTENING' ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6 stroke-[2.2]" />}
        </button>

        {/* Text Command Input Bar */}
        <div className="relative flex-1">
          <input
            type="text"
            value={typedInput || transcript}
            onChange={(e) => {
              setTypedInput(e.target.value);
              setTranscript('');
            }}
            placeholder="Speak or type place, e.g. 'Take me to Agra'..."
            className={`w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none transition ${
              theme === 'dark'
                ? 'bg-[#162B25] border-[#233D35] text-[#F5F7F2] placeholder-[#8E9E96] focus:border-[#286B57] focus:ring-1 focus:ring-[#286B57]'
                : 'bg-[#F7F5EF] border-[#E3E7E0] text-[#202824] placeholder-[#68736D] focus:border-[#286B57] focus:ring-1 focus:ring-[#286B57]'
            }`}
          />
        </div>

        {/* Submit / Send Button */}
        <button
          type="submit"
          disabled={isProcessingCommand || (!typedInput && !transcript)}
          className={`p-3.5 rounded-2xl border transition active:scale-95 shrink-0 ${
            theme === 'dark'
              ? 'bg-[#162B25] border-[#233D35] text-[#D8F36A] hover:bg-[#1A332E]'
              : 'bg-[#EEF5F0] border-[#DCE9DE] text-[#183D35] hover:bg-[#DCE9DE]'
          } ${
            isProcessingCommand || (!typedInput && !transcript) ? 'opacity-30 cursor-not-allowed' : ''
          }`}
          title="Send command"
          aria-label="Send destination or command"
        >
          <Send className="w-5 h-5 text-current" />
        </button>

        {/* Undo Button */}
        {canUndo && (
          <button
            type="button"
            onClick={undo}
            className={`p-3.5 rounded-2xl border transition active:scale-95 shrink-0 ${
              theme === 'dark'
                ? 'bg-[#162B25] border-[#233D35] text-amber-400 hover:bg-[#1A332E]'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
            title="Undo last change"
            aria-label="Undo last itinerary change"
          >
            <Undo2 className="w-5 h-5" />
          </button>
        )}
      </form>

      {/* Language Selection & Audio Preferences Bar (Clean, intentional control) */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          {/* New Compact Language Selection Button */}
          <button
            type="button"
            onClick={() => setIsLangModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition active:scale-95 shadow-xs ${
              theme === 'dark'
                ? 'bg-[#162B25] hover:bg-[#1A332E] border-[#233D35] text-[#DCE9DE]'
                : 'bg-[#F7F5EF] hover:bg-[#EEF5F0] border-[#E3E7E0] text-[#183D35]'
            }`}
            title="Change navigation and speech language"
          >
            <Globe className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
            <span>{currentLangConfig.nativeName || currentLangConfig.name}</span>
            <span className="text-[10px] opacity-60 font-mono">({currentLangConfig.sttCode})</span>
          </button>

          {/* Voice Engine & Speed Settings Icon Button */}
          <button
            type="button"
            onClick={() => setIsVoiceSettingsOpen(true)}
            className={`p-1.5 rounded-xl border text-xs transition ${
              theme === 'dark'
                ? 'bg-[#162B25] hover:bg-[#1A332E] border-[#233D35] text-[#8E9E96] hover:text-[#F5F7F2]'
                : 'bg-[#F7F5EF] hover:bg-[#EEF5F0] border-[#E3E7E0] text-[#68736D] hover:text-[#202824]'
            }`}
            title="Open Voice Engine & Speed Settings"
            aria-label="Voice settings"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[11px] text-[#68736D] dark:text-[#8E9E96]">
          Voice-driven navigation
        </div>
      </div>

      {/* Language Selection Pop-up Modal */}
      <LanguageSelectorModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        selectedLangCode={selectedLang}
        onSelectLanguage={handleSelectLanguage}
        theme={theme}
      />

      {/* Voice Settings Modal (preserved) */}
      <VoiceSettingsModal
        isOpen={isVoiceSettingsOpen}
        onClose={() => setIsVoiceSettingsOpen(false)}
      />
    </div>
  );
};
