import React, { useState, useEffect, useMemo } from 'react';
import { speechService } from '../../services/speechService';
import {
  GNANI_LANGUAGES,
  GNANI_TTS_MODELS,
  TtsModel,
  getLanguageConfig,
  getVoicesForLanguageAndModel,
  clampSpeed,
} from '../../config/gnaniConfig';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Radio,
  Sliders,
  RefreshCw,
  Languages,
  Gauge,
  Lock,
} from 'lucide-react';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: () => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  // Language, Model & Voice configuration state
  const [recognitionLangInput, setRecognitionLangInput] = useState(speechService.getRecognitionLanguage() || 'hi-IN');
  const [responseLangInput, setResponseLangInput] = useState(speechService.getResponseLanguage() || 'hi-IN');
  const [modelInput, setModelInput] = useState<TtsModel>(speechService.getModel() || 'timbre-v2.5');
  const [voiceIdInput, setVoiceIdInput] = useState(
    speechService.getVoiceForLanguage(speechService.getResponseLanguage(), speechService.getModel()) || 'Nalini'
  );
  const [speedInput, setSpeedInput] = useState<number>(speechService.getSpeed() || 1.0);
  const [isSavingVoice, setIsSavingVoice] = useState(false);

  // Test & general state
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Live status from speechService
  const [authStatus, setAuthStatus] = useState(speechService.authStatus);
  const [authMessage, setAuthMessage] = useState(speechService.authMessage);
  const [sttAvailable, setSttAvailable] = useState(speechService.sttAvailable);
  const [ttsAvailable, setTtsAvailable] = useState(speechService.ttsAvailable);
  const [forceBrowserMode, setForceBrowserMode] = useState(speechService.forceBrowserMode);
  const [currentProvider, setCurrentProvider] = useState(speechService.getProvider());

  // Dynamic voices list filtered for current response language and model
  const availableVoices = useMemo(() => {
    return getVoicesForLanguageAndModel(responseLangInput, modelInput);
  }, [responseLangInput, modelInput]);

  const refreshStatus = () => {
    setAuthStatus(speechService.authStatus);
    setAuthMessage(speechService.authMessage);
    setSttAvailable(speechService.sttAvailable);
    setTtsAvailable(speechService.ttsAvailable);
    setForceBrowserMode(speechService.forceBrowserMode);
    setCurrentProvider(speechService.getProvider());
    setRecognitionLangInput(speechService.getRecognitionLanguage());
    setResponseLangInput(speechService.getResponseLanguage());
    setModelInput(speechService.getModel());
    setSpeedInput(speechService.getSpeed());
    setVoiceIdInput(speechService.getVoiceForLanguage(speechService.getResponseLanguage(), speechService.getModel()));
  };

  useEffect(() => {
    if (isOpen) {
      speechService.checkServerSpeechConfig(true).then(() => {
        refreshStatus();
      });
      setFeedbackMessage(null);
    }
  }, [isOpen]);

  // When response language changes, auto-select preferred or default voice for that language
  const handleResponseLangChange = (newLangCode: string) => {
    setResponseLangInput(newLangCode);
    const resolved = speechService.getVoiceForLanguage(newLangCode, modelInput);
    setVoiceIdInput(resolved);
  };

  // When model changes, ensure selected voice is valid for that model
  const handleModelChange = (newModel: TtsModel) => {
    setModelInput(newModel);
    const resolved = speechService.getVoiceForLanguage(responseLangInput, newModel);
    setVoiceIdInput(resolved);
  };

  if (!isOpen) return null;

  // Save Voice, Model, Languages & Speed (Persisted safely to localStorage)
  const handleSaveVoiceConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingVoice(true);
    setFeedbackMessage(null);

    // Apply client-side settings to speechService and localStorage
    speechService.setRecognitionLanguage(recognitionLangInput);
    speechService.setResponseLanguage(responseLangInput);
    speechService.setModel(modelInput);
    speechService.setVoiceForLanguage(responseLangInput, voiceIdInput, modelInput);
    speechService.setSpeed(speedInput);

    setIsSavingVoice(false);
    refreshStatus();
    const langConfig = getLanguageConfig(responseLangInput);
    setFeedbackMessage({
      text: `Preferences saved: ${langConfig.name} voice "${voiceIdInput}" (${modelInput}) at ${speedInput.toFixed(2)}x speed.`,
      type: 'success',
    });
    onConfigChanged?.();
  };

  // Test Voice Audio Preview using real speech pipeline
  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    setFeedbackMessage(null);

    const testResult = await speechService.testVoice(
      voiceIdInput,
      undefined,
      responseLangInput,
      modelInput,
      speedInput
    );

    setIsTestingVoice(false);
    if (testResult.success) {
      setFeedbackMessage({
        text: testResult.error || `Voice preview (${voiceIdInput}) played successfully!`,
        type: testResult.error ? 'info' : 'success',
      });
    } else {
      setFeedbackMessage({
        text: testResult.error || 'Voice test failed.',
        type: 'error',
      });
    }
  };

  // Toggle Browser Fallback Override
  const handleToggleBrowserFallback = () => {
    const nextState = !forceBrowserMode;
    speechService.setForceBrowserMode(nextState);
    setForceBrowserMode(nextState);
    setCurrentProvider(speechService.getProvider());
    setFeedbackMessage({
      text: nextState
        ? 'Switched to native browser speech fallback (Gnani bypassed).'
        : 'Restored automatic Gnani AI speech engine.',
      type: 'info',
    });
    onConfigChanged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-[#0E1A17]/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#142420] border border-[#E3E7E0] dark:border-[#233D35] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#202824] dark:text-[#F5F7F2]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E3E7E0] dark:border-[#233D35] bg-[#EEF5F0]/70 dark:bg-[#0E1A17]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#DCE9DE] dark:bg-[#183D35] border border-[#C3D9C7] dark:border-[#286B57] rounded-xl text-[#183D35] dark:text-[#D8F36A]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#183D35] dark:text-[#F5F7F2] flex items-center gap-2">
                Multilingual Speech Configuration
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#DCE9DE] dark:bg-[#183D35] text-[#183D35] dark:text-[#D8F36A] border border-[#C3D9C7] dark:border-[#286B57] font-semibold">
                  Gnani AI (Vachana)
                </span>
              </h2>
              <p className="text-[11px] text-[#68736D] dark:text-[#8E9E96]">Configure real-time STT languages, Timbre TTS voices, models & speed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68736D] hover:text-[#202824] dark:text-[#8E9E96] dark:hover:text-[#F5F7F2] hover:bg-[#EEF5F0] dark:hover:bg-[#183D35] transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Feedback & Alert Banner */}
          {feedbackMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                feedbackMessage.type === 'success'
                  ? 'bg-[#EEF5F0] dark:bg-[#183D35]/60 border-[#286B57] text-[#183D35] dark:text-[#D8F36A]'
                  : feedbackMessage.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-200'
                  : 'bg-[#EEF5F0] dark:bg-[#142420] border-[#C3D9C7] dark:border-[#286B57] text-[#183D35] dark:text-[#F5F7F2]'
              }`}
            >
              {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#286B57] dark:text-[#D8F36A] shrink-0 mt-0.5" />}
              {feedbackMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
              {feedbackMessage.type === 'info' && <AlertCircle className="w-4 h-4 text-[#286B57] dark:text-[#D8F36A] shrink-0 mt-0.5" />}
              <span className="flex-1 leading-relaxed">{feedbackMessage.text}</span>
            </div>
          )}

          {/* Service Status Dashboard */}
          <div className="bg-[#EEF5F0]/60 dark:bg-[#0E1A17]/70 border border-[#E3E7E0] dark:border-[#233D35] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#202824] dark:text-[#F5F7F2]">Active Voice Engine:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1.5 border ${
                  currentProvider === 'gnani'
                    ? 'bg-[#DCE9DE] dark:bg-[#183D35] border-[#C3D9C7] dark:border-[#286B57] text-[#183D35] dark:text-[#D8F36A]'
                    : 'bg-amber-100 dark:bg-amber-950/80 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-300'
                }`}
              >
                <Radio className="w-3 h-3" />
                {currentProvider === 'gnani' ? 'Gnani AI Realtime (Vachana)' : 'Browser Web Speech (Fallback)'}
              </span>
            </div>

            {/* Capability Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[#E3E7E0] dark:border-[#233D35] text-[11px]">
              {/* 1. API Authentication Status */}
              <div className="bg-white dark:bg-[#142420] p-2 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] flex flex-col gap-0.5">
                <span className="text-[#68736D] dark:text-[#8E9E96] text-[10px]">1. Server Auth</span>
                <div className="flex items-center gap-1 font-medium">
                  {authStatus === 'authenticated' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
                      <span className="text-[#183D35] dark:text-[#D8F36A]">Configured</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-amber-700 dark:text-amber-300">Browser Fallback</span>
                    </>
                  )}
                </div>
              </div>

              {/* 2. Speech-to-Text (STT) */}
              <div className="bg-white dark:bg-[#142420] p-2 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] flex flex-col gap-0.5">
                <span className="text-[#68736D] dark:text-[#8E9E96] text-[10px]">2. Realtime STT</span>
                <div className="flex items-center gap-1 font-medium">
                  {sttAvailable ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
                      <span className="text-[#183D35] dark:text-[#D8F36A]">16kHz PCM</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-[#68736D] dark:text-[#8E9E96]" />
                      <span className="text-[#68736D] dark:text-[#8E9E96]">Offline</span>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Text-to-Speech (TTS) */}
              <div className="bg-white dark:bg-[#142420] p-2 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] flex flex-col gap-0.5">
                <span className="text-[#68736D] dark:text-[#8E9E96] text-[10px]">3. Timbre TTS</span>
                <div className="flex items-center gap-1 font-medium">
                  {ttsAvailable ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
                      <span className="text-[#183D35] dark:text-[#D8F36A] font-semibold">{modelInput}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-[#68736D] dark:text-[#8E9E96]" />
                      <span className="text-[#68736D] dark:text-[#8E9E96]">Offline</span>
                    </>
                  )}
                </div>
              </div>

              {/* 4. Browser Speech Fallback */}
              <div className="bg-white dark:bg-[#142420] p-2 rounded-lg border border-[#E3E7E0] dark:border-[#233D35] flex flex-col gap-0.5">
                <span className="text-[#68736D] dark:text-[#8E9E96] text-[10px]">4. Fallback</span>
                <div className="flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
                  <span className="text-[#183D35] dark:text-[#F5F7F2]">{forceBrowserMode ? 'Forced' : 'Ready'}</span>
                </div>
              </div>
            </div>

            {authMessage && (
              <div className="text-[11px] text-[#68736D] dark:text-[#8E9E96] pt-1 border-t border-[#E3E7E0] dark:border-[#233D35] flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A] shrink-0 mt-0.5" />
                <span className="leading-tight">{authMessage}</span>
              </div>
            )}
          </div>

          {/* Security Notice: Server Credentials Protection */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#EEF5F0]/40 dark:bg-[#0E1A17]/40 border border-[#E3E7E0] dark:border-[#233D35] text-[11px] text-[#68736D] dark:text-[#8E9E96]">
            <Lock className="w-4 h-4 text-[#286B57] dark:text-[#D8F36A] shrink-0" />
            <span>
              Gnani API credentials are kept exclusively on the server. Non-secret voice and language preferences are stored locally in your browser.
            </span>
          </div>

          {/* Multilingual Speech, Voice, Model & Speed */}
          <div className="bg-[#EEF5F0]/40 dark:bg-[#0E1A17]/40 border border-[#E3E7E0] dark:border-[#233D35] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Languages className="w-4 h-4 text-[#183D35] dark:text-[#D8F36A]" />
                <h3 className="text-xs font-bold text-[#183D35] dark:text-[#F5F7F2]">Multilingual Speech & Voice Engine</h3>
              </div>
              <span className="text-[10px] text-[#68736D] dark:text-[#8E9E96] font-mono">
                {modelInput} / {voiceIdInput}
              </span>
            </div>

            <form onSubmit={handleSaveVoiceConfig} className="space-y-3">
              {/* Row 1: Languages */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#68736D] dark:text-[#8E9E96] block mb-1">
                    Recognition Language (Microphone / STT)
                  </label>
                  <select
                    value={recognitionLangInput}
                    onChange={(e) => setRecognitionLangInput(e.target.value)}
                    className="w-full bg-white dark:bg-[#0E1A17] border border-[#E3E7E0] dark:border-[#233D35] rounded-xl px-2.5 py-2 text-xs text-[#202824] dark:text-[#F5F7F2] focus:outline-none focus:border-[#286B57]"
                  >
                    {Object.values(GNANI_LANGUAGES).map((l) => (
                      <option key={l.id} value={l.sttCode}>
                        {l.nativeName} ({l.sttCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-[#68736D] dark:text-[#8E9E96] block mb-1">
                    Response Language (Voice / TTS)
                  </label>
                  <select
                    value={responseLangInput}
                    onChange={(e) => handleResponseLangChange(e.target.value)}
                    className="w-full bg-white dark:bg-[#0E1A17] border border-[#E3E7E0] dark:border-[#233D35] rounded-xl px-2.5 py-2 text-xs text-[#202824] dark:text-[#F5F7F2] focus:outline-none focus:border-[#286B57]"
                  >
                    {Object.values(GNANI_LANGUAGES).map((l) => (
                      <option key={l.id} value={l.ttsLangCode}>
                        {l.nativeName} ({l.ttsLangCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Model & Dynamic Voice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#68736D] dark:text-[#8E9E96] block mb-1">TTS Model</label>
                  <select
                    value={modelInput}
                    onChange={(e) => handleModelChange(e.target.value as TtsModel)}
                    className="w-full bg-white dark:bg-[#0E1A17] border border-[#E3E7E0] dark:border-[#233D35] rounded-xl px-2.5 py-2 text-xs text-[#202824] dark:text-[#F5F7F2] focus:outline-none focus:border-[#286B57]"
                  >
                    <option value="timbre-v2.5">Timbre v2.5 (Default - Regional Voices)</option>
                    <option value="timbre-v3.0">Timbre v3.0 (Unified 13-Voice Catalog)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-[#68736D] dark:text-[#8E9E96] block mb-1">
                    Voice ({availableVoices.length} available for {getLanguageConfig(responseLangInput).name})
                  </label>
                  <select
                    value={voiceIdInput}
                    onChange={(e) => setVoiceIdInput(e.target.value)}
                    className="w-full bg-white dark:bg-[#0E1A17] border border-[#E3E7E0] dark:border-[#233D35] rounded-xl px-2.5 py-2 text-xs text-[#202824] dark:text-[#F5F7F2] focus:outline-none focus:border-[#286B57] font-medium"
                  >
                    {availableVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Speaking Speed Slider */}
              <div className="bg-white dark:bg-[#142420] border border-[#E3E7E0] dark:border-[#233D35] p-2.5 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#202824] dark:text-[#F5F7F2] font-medium">
                    <Gauge className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
                    <span>Speaking Speed:</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#183D35] dark:text-[#D8F36A]">
                    {speedInput.toFixed(2)}x
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[#68736D] dark:text-[#8E9E96]">0.85x</span>
                  <input
                    type="range"
                    min="0.85"
                    max="1.15"
                    step="0.05"
                    value={speedInput}
                    onChange={(e) => setSpeedInput(clampSpeed(parseFloat(e.target.value)))}
                    className="w-full accent-[#183D35] dark:accent-[#D8F36A] cursor-pointer"
                  />
                  <span className="text-[10px] text-[#68736D] dark:text-[#8E9E96]">1.15x</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-[#68736D] dark:text-[#8E9E96]">
                  Default voice for {getLanguageConfig(responseLangInput).name}: <strong className="text-[#202824] dark:text-[#F5F7F2]">{getLanguageConfig(responseLangInput).defaultVoices[modelInput]}</strong>
                </span>
                <button
                  type="submit"
                  disabled={isSavingVoice}
                  className="px-3.5 py-1.5 rounded-xl bg-[#183D35] hover:bg-[#286B57] text-white dark:bg-[#D8F36A] dark:hover:bg-[#cbf14e] dark:text-[#183D35] text-xs font-semibold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingVoice ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  <span>Save Voice Preferences</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Audio Preview & Fallback Controls */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestVoice}
              disabled={isTestingVoice}
              className="flex-1 py-2.5 px-3 rounded-xl bg-[#EEF5F0] hover:bg-[#DCE9DE] dark:bg-[#183D35] dark:hover:bg-[#286B57] border border-[#C3D9C7] dark:border-[#286B57] text-[#183D35] dark:text-[#F5F7F2] transition text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 shadow-xs"
            >
              {isTestingVoice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-[#183D35] dark:fill-[#D8F36A] text-[#183D35] dark:text-[#D8F36A]" />}
              <span>{isTestingVoice ? 'Playing Test Audio...' : `Test Voice (${voiceIdInput})`}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBrowserFallback}
              className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs ${
                forceBrowserMode
                  ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-200'
                  : 'bg-white dark:bg-[#142420] hover:bg-[#EEF5F0] dark:hover:bg-[#183D35] border-[#E3E7E0] dark:border-[#233D35] text-[#202824] dark:text-[#F5F7F2]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#68736D] dark:text-[#8E9E96]" />
              <span>{forceBrowserMode ? 'Restore Gnani AI' : 'Force Browser Fallback'}</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E3E7E0] dark:border-[#233D35] bg-[#EEF5F0]/70 dark:bg-[#0E1A17]/60">
          <span className="text-[11px] text-[#68736D] dark:text-[#8E9E96] flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-[#286B57] dark:text-[#D8F36A]" />
            Credentials secured server-side. Preferences saved in browser.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#183D35] hover:bg-[#286B57] text-white dark:bg-[#233D35] dark:hover:bg-[#286B57] dark:text-[#F5F7F2] text-xs font-semibold transition shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
