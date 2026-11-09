// Unified Speech Provider Service for Raahi: Gnani AI Realtime (Vachana) with Browser Fallback

import { gnaniSttClient } from './gnaniSttClient.ts';
import { gnaniTtsClient } from './gnaniTtsClient.ts';
import {
  getLanguageConfig,
  resolveVoice,
  clampSpeed,
  DEFAULT_TTS_MODEL,
  TtsModel,
} from '../config/gnaniConfig.ts';

interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export type SupportedSpeechLang =
  | 'hi-IN'
  | 'en-IN'
  | 'mr-IN'
  | 'te-IN'
  | 'ta-IN'
  | 'bn-IN'
  | 'gu-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'pa-IN'
  | 'en-US';

export type SpeechProviderType = 'gnani' | 'browser';

export interface SpeechListenerCallbacks {
  onStart?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export type MicLifecycleState = 'OFF' | 'STARTING' | 'LISTENING' | 'STOPPING' | 'ERROR';

class SpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private micState: MicLifecycleState = 'OFF';
  private silenceTimer: any = null;
  private inactivityTimer: any = null;
  public inactivityTimeoutMs: number = 6500; // 6.5s inactivity timeout
  private sessionId: number = 0;
  private micStateListeners: Set<(state: MicLifecycleState) => void> = new Set();

  private currentLanguage: SupportedSpeechLang = 'hi-IN';
  private recognitionLanguage: string = 'hi-IN';
  private responseLanguage: string = 'hi-IN';
  private synthesisVoice: SpeechSynthesisVoice | null = null;
  public isMuted: boolean = false;
  public forceBrowserMode: boolean = false;

  private provider: SpeechProviderType = 'browser';
  public gnaniAvailable: boolean = false;
  public elevenLabsAvailable: boolean = false; // backwards compatibility alias
  public sttAvailable: boolean = false;
  public ttsAvailable: boolean = false;
  public voiceId: string = 'Nalini';
  public model: string = 'timbre-v2.5';
  public speed: number = 1.0;
  public voiceAccessible: boolean = false;
  public authStatus: string = 'not_configured';
  public authMessage: string = '';
  public isPersisted: boolean = false;
  public persistedSource: string = 'none';

  // Per-language and per-model user voice preferences: { [langId]: { [model]: voiceId } }
  private voicePreferences: Record<string, Record<string, string>> = {};

  private submissionLock: boolean = false;
  private isCancelled: boolean = false;

  constructor() {
    this.loadSavedPreferences();
    this.initBrowserRecognition();
    this.initBrowserVoices();
    this.checkServerSpeechConfig();
  }

  private loadSavedPreferences() {
    if (typeof window === 'undefined') return;
    try {
      const savedPref = localStorage.getItem('raahi_voice_preferences');
      if (savedPref) {
        this.voicePreferences = JSON.parse(savedPref);
      }
      const savedRecog = localStorage.getItem('raahi_recognition_language');
      if (savedRecog) {
        this.recognitionLanguage = savedRecog;
        this.currentLanguage = savedRecog as SupportedSpeechLang;
      }
      const savedResp = localStorage.getItem('raahi_response_language');
      if (savedResp) {
        this.responseLanguage = savedResp;
      }
      const savedModel = localStorage.getItem('raahi_tts_model');
      if (savedModel && (savedModel === 'timbre-v3.0' || savedModel === 'timbre-v2.5')) {
        this.model = savedModel;
      } else {
        this.model = DEFAULT_TTS_MODEL;
      }
      const savedSpeed = localStorage.getItem('raahi_speech_speed');
      if (savedSpeed) {
        this.speed = clampSpeed(parseFloat(savedSpeed));
      }
      // Re-resolve active voice
      this.voiceId = this.getVoiceForLanguage(this.responseLanguage, this.model as TtsModel);
    } catch {
      // ignore storage errors
    }
  }

  public getRecognitionLanguage(): string {
    return this.recognitionLanguage;
  }

  public setRecognitionLanguage(lang: string) {
    const cfg = getLanguageConfig(lang);
    this.recognitionLanguage = cfg.sttCode;
    this.currentLanguage = cfg.sttCode as SupportedSpeechLang;
    if (this.recognition) {
      this.recognition.lang = cfg.sttCode;
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('raahi_recognition_language', this.recognitionLanguage);
      } catch {
        // ignore
      }
    }
  }

  public getResponseLanguage(): string {
    return this.responseLanguage;
  }

  public setResponseLanguage(lang: string) {
    const cfg = getLanguageConfig(lang);
    this.responseLanguage = cfg.ttsLangCode;
    this.voiceId = this.getVoiceForLanguage(this.responseLanguage, this.model as TtsModel);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('raahi_response_language', this.responseLanguage);
      } catch {
        // ignore
      }
    }
  }

  public getVoiceForLanguage(langOrCode: string, model: TtsModel = (this.model as TtsModel) || DEFAULT_TTS_MODEL): string {
    const cfg = getLanguageConfig(langOrCode);
    const saved = this.voicePreferences[cfg.id]?.[model];
    return resolveVoice(cfg.id, model, saved);
  }

  public setVoiceForLanguage(langOrCode: string, voiceId: string, model: TtsModel = (this.model as TtsModel) || DEFAULT_TTS_MODEL) {
    const cfg = getLanguageConfig(langOrCode);
    if (!this.voicePreferences[cfg.id]) {
      this.voicePreferences[cfg.id] = {};
    }
    this.voicePreferences[cfg.id][model] = voiceId;

    const currentRespCfg = getLanguageConfig(this.responseLanguage);
    if (currentRespCfg.id === cfg.id && this.model === model) {
      this.voiceId = voiceId;
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('raahi_voice_preferences', JSON.stringify(this.voicePreferences));
      } catch {
        // ignore
      }
    }
  }

  public getModel(): TtsModel {
    return (this.model as TtsModel) || DEFAULT_TTS_MODEL;
  }

  public setModel(m: TtsModel) {
    this.model = m;
    this.voiceId = this.getVoiceForLanguage(this.responseLanguage, m);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('raahi_tts_model', m);
      } catch {
        // ignore
      }
    }
  }

  public getSpeed(): number {
    return this.speed;
  }

  public setSpeed(s: number) {
    this.speed = clampSpeed(s);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('raahi_speech_speed', this.speed.toString());
      } catch {
        // ignore
      }
    }
  }

  public getMicState(): MicLifecycleState {
    return this.micState;
  }

  public onMicStateChange(listener: (state: MicLifecycleState) => void): () => void {
    this.micStateListeners.add(listener);
    listener(this.micState);
    return () => this.micStateListeners.delete(listener);
  }

  private setMicState(next: MicLifecycleState) {
    if (this.micState === next) return;
    this.micState = next;
    this.isListening = next === 'LISTENING';
    this.micStateListeners.forEach((fn) => {
      try {
        fn(next);
      } catch (err) {
        console.warn('Mic listener error:', err);
      }
    });
  }

  // 1. Check Server Capabilities for Gnani Speech AI
  public async checkServerSpeechConfig(forceRefresh = false): Promise<boolean> {
    try {
      const url = forceRefresh ? '/api/speech/config?refresh=true' : '/api/speech/config';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.gnaniAvailable = Boolean(data.gnaniAvailable);
        this.elevenLabsAvailable = this.gnaniAvailable; // backwards compatibility alias
        this.sttAvailable = Boolean(data.sttAvailable);
        this.ttsAvailable = Boolean(data.ttsAvailable);
        const savedModel = typeof window !== 'undefined' ? localStorage.getItem('raahi_tts_model') : null;
        if (savedModel && (savedModel === 'timbre-v3.0' || savedModel === 'timbre-v2.5')) {
          this.model = savedModel;
        } else {
          this.model = data.defaultModel || DEFAULT_TTS_MODEL;
        }
        this.voiceId = this.getVoiceForLanguage(this.responseLanguage, this.model as TtsModel);
        this.voiceAccessible = this.gnaniAvailable;
        this.authStatus = data.authStatus || 'not_configured';
        this.authMessage = data.authMessage || '';
        this.isPersisted = Boolean(data.persisted);
        this.persistedSource = data.source || 'none';

        if (!this.forceBrowserMode && this.gnaniAvailable && (this.sttAvailable || this.ttsAvailable)) {
          this.provider = 'gnani';
        } else {
          this.provider = 'browser';
        }
        return this.gnaniAvailable;
      }
    } catch {
      this.gnaniAvailable = false;
      this.elevenLabsAvailable = false;
      this.sttAvailable = false;
      this.ttsAvailable = false;
      this.isPersisted = false;
      this.provider = 'browser';
    }
    return false;
  }

  public getProvider(): SpeechProviderType {
    if (this.forceBrowserMode) return 'browser';
    return this.provider;
  }

  public setProvider(p: SpeechProviderType) {
    if (p === 'gnani') {
      this.forceBrowserMode = false;
      if (!this.gnaniAvailable) {
        this.provider = 'browser';
        return;
      }
      this.provider = 'gnani';
      return;
    }
    this.provider = p;
  }

  public setForceBrowserMode(force: boolean) {
    this.forceBrowserMode = force;
    if (force) {
      this.provider = 'browser';
    } else if (this.gnaniAvailable) {
      this.provider = 'gnani';
    }
  }

  public isGnaniConfigured(): boolean {
    return !this.forceBrowserMode && this.gnaniAvailable && (this.sttAvailable || this.ttsAvailable);
  }

  // Runtime settings update to server (never exposes key in client storage)
  public async saveSettings(params: {
    apiKey?: string;
    voiceId?: string;
    model?: string;
    resetToEnv?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    status?: any;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/speech/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.status) {
          this.gnaniAvailable = Boolean(data.status.authenticated);
          this.elevenLabsAvailable = this.gnaniAvailable;
          this.sttAvailable = Boolean(data.status.sttAvailable);
          this.ttsAvailable = Boolean(data.status.ttsAvailable);
          this.voiceId = data.status.voiceId || this.voiceId;
          this.model = data.status.model || this.model;
          this.voiceAccessible = this.gnaniAvailable;
          this.authStatus = data.status.status || 'authenticated';
          this.authMessage = data.status.message || '';
          if (!this.forceBrowserMode && this.gnaniAvailable) {
            this.provider = 'gnani';
          }
        }
        return { success: true, message: data.message || 'Credentials saved successfully', status: data.status };
      } else {
        return {
          success: false,
          message: data.error || data.message || 'Authentication failed',
          error: data.error,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'Could not connect to settings server: ' + (err?.message || 'Network error'),
        error: err?.message,
      };
    }
  }

  // Audio preview test of selected voice
  public async testVoice(
    voiceId?: string,
    text?: string,
    language?: string,
    model?: string,
    speed?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.stopSpeaking();
      const targetLang = language || this.responseLanguage;
      const targetModel = (model || this.model) as TtsModel;
      const voiceToUse = voiceId || this.getVoiceForLanguage(targetLang, targetModel);
      const targetSpeed = speed !== undefined ? clampSpeed(speed) : this.speed;
      const langConfig = getLanguageConfig(targetLang);
      const testText = text || langConfig.sampleText || 'नमस्ते! यह राही का वॉयस टेस्ट है। Raahi voice test is working.';

      // Try Gnani synthesis
      const result = await gnaniTtsClient.speak(testText, {
        language: targetLang,
        voice: voiceToUse,
        model: targetModel,
        speed: targetSpeed,
      });

      if (result.success) {
        return { success: true };
      }

      // If Gnani test failed, test with browser voice and report the failure clearly
      this.speakWithBrowser(testText);
      return {
        success: false,
        error: result.error ? `Gnani TTS failed: ${result.error}. (Played browser speech fallback)` : 'Gnani TTS failed',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to play voice test preview',
      };
    }
  }

  // 2. Browser Speech Init
  private initBrowserRecognition() {
    if (typeof window === 'undefined') return;
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.recognitionLanguage;
  }

  private initBrowserVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.selectVoice();
      };
      this.selectVoice();
    }
  }

  public setLanguage(lang: SupportedSpeechLang) {
    this.currentLanguage = lang;
    this.setRecognitionLanguage(lang);
    this.setResponseLanguage(lang);
    if (this.recognition) {
      this.recognition.lang = lang;
    }
    this.selectVoice();
  }

  public getLanguage(): SupportedSpeechLang {
    return this.currentLanguage;
  }

  public isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as IWindow;
    const hasMedia = Boolean(navigator?.mediaDevices?.getUserMedia);
    const hasWebSpeech = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
    return hasMedia || hasWebSpeech;
  }

  // 3. Speech to Text: Start Recording
  public async startListening(callbacks: SpeechListenerCallbacks) {
    if (this.micState === 'STARTING' || this.micState === 'STOPPING') {
      return;
    }

    this.isCancelled = false;
    this.submissionLock = false;
    this.setMicState('STARTING');

    // If Gnani is available and not in forced browser mode, use Gnani Realtime STT
    if (this.isGnaniConfigured()) {
      try {
        await gnaniSttClient.startListening(
          {
            languageCode: this.recognitionLanguage,
            silenceTimeoutMs: 1200,
            inactivityTimeoutMs: this.inactivityTimeoutMs,
          },
          {
            onStart: () => {
              this.setMicState('LISTENING');
              callbacks.onStart?.();
            },
            onInterimResult: (text) => {
              callbacks.onInterimResult?.(text);
            },
            onFinalResult: (finalText) => {
              this.setMicState('OFF');
              callbacks.onFinalResult?.(finalText);
            },
            onError: (err) => {
              console.warn('[SpeechService] Gnani STT error:', err);
              this.setMicState('ERROR');
              callbacks.onError?.(`Gnani Speech Recognition Error: ${err}`);
              this.setMicState('OFF');
            },
            onEnd: () => {
              this.setMicState('OFF');
              callbacks.onEnd?.();
            },
            onVolumeChange: (vol) => {
              callbacks.onVolumeChange?.(vol);
            },
          }
        );
        return;
      } catch (err: any) {
        console.warn('[SpeechService] Failed to start Gnani STT:', err?.message);
        this.setMicState('ERROR');
        callbacks.onError?.(`Failed to initialize Gnani STT: ${err?.message || 'Connection error'}`);
        this.setMicState('OFF');
        return;
      }
    }

    // Default Browser Web Speech Recognition
    this.fallbackToBrowserSpeech(callbacks);
  }

  private fallbackToBrowserSpeech(callbacks: SpeechListenerCallbacks) {
    if (!this.recognition) {
      this.initBrowserRecognition();
    }

    if (!this.recognition) {
      this.setMicState('ERROR');
      callbacks.onError?.('Speech recognition is not supported in this browser. Please type commands below.');
      this.setMicState('OFF');
      return;
    }

    this.recognition.lang = this.recognitionLanguage;

    const currentSession = ++this.sessionId;

    if (this.isListening) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }

    let finalTranscriptAcc = '';

    this.recognition.onstart = () => {
      if (this.sessionId !== currentSession) return;
      this.setMicState('LISTENING');
      this.resetInactivityTimer(callbacks);
      callbacks.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      if (this.sessionId !== currentSession || this.micState !== 'LISTENING') return;
      clearTimeout(this.silenceTimer);
      this.resetInactivityTimer(callbacks);

      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscriptAcc += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscriptAcc + ' ' + interim).trim();
      callbacks.onInterimResult?.(activeText);

      // Auto-submit after 1200ms of silence once speech detected
      if (activeText.length > 0) {
        this.silenceTimer = setTimeout(() => {
          this.stopListening();
          if (!this.submissionLock && !this.isCancelled && this.sessionId === currentSession) {
            this.submissionLock = true;
            callbacks.onFinalResult?.(activeText);
          }
        }, 1200);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (this.sessionId !== currentSession) return;
      clearTimeout(this.silenceTimer);
      clearTimeout(this.inactivityTimer);
      this.setMicState('ERROR');
      const errorMsg = event.error === 'no-speech' ? 'No speech detected' : event.error;
      callbacks.onError?.(errorMsg);
      setTimeout(() => {
        if (this.micState === 'ERROR') {
          this.setMicState('OFF');
        }
      }, 500);
    };

    this.recognition.onend = () => {
      if (this.sessionId !== currentSession) return;
      clearTimeout(this.silenceTimer);
      clearTimeout(this.inactivityTimer);
      this.setMicState('OFF');
      callbacks.onEnd?.();
      if (!this.submissionLock && !this.isCancelled && finalTranscriptAcc.trim().length > 0) {
        this.submissionLock = true;
        callbacks.onFinalResult?.(finalTranscriptAcc.trim());
      }
    };

    try {
      this.recognition.start();
    } catch (e: any) {
      console.warn('Failed to start browser speech recognition:', e);
      this.setMicState('ERROR');
      callbacks.onError?.(e.message || 'Microphone error');
      this.setMicState('OFF');
    }
  }

  private resetInactivityTimer(callbacks?: SpeechListenerCallbacks) {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      console.info(`[SpeechService] Inactivity timeout (${this.inactivityTimeoutMs}ms reached) -> auto-stopping microphone`);
      this.stopListening();
    }, this.inactivityTimeoutMs);
  }

  // Stop listening
  public stopListening() {
    clearTimeout(this.silenceTimer);
    clearTimeout(this.inactivityTimer);

    if (this.micState === 'OFF') return;
    this.setMicState('STOPPING');

    // Stop Gnani client if active
    if (gnaniSttClient.getIsListening()) {
      gnaniSttClient.stopListening();
    }

    if (this.recognition && (this.isListening || this.micState === 'STOPPING')) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }

    this.setMicState('OFF');
  }

  // Cancel listening and discard any recorded audio
  public cancelListening() {
    this.isCancelled = true;
    this.isListening = false;
    clearTimeout(this.silenceTimer);
    clearTimeout(this.inactivityTimer);

    gnaniSttClient.cancelListening();

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }
  }

  // 4. Text to Speech: Gnani Realtime TTS with Browser Web SpeechSynthesis Fallback
  public async speak(
    text: string,
    options?: { language?: string; voice?: string; model?: string; speed?: number }
  ) {
    if (this.isMuted || !text || typeof window === 'undefined') return;

    // Cancel any ongoing audio playback immediately
    this.stopSpeaking();

    const targetLang = options?.language || this.responseLanguage;
    const targetModel = (options?.model || this.model) as TtsModel;
    const targetVoice = options?.voice || this.getVoiceForLanguage(targetLang, targetModel);
    const targetSpeed = options?.speed !== undefined ? clampSpeed(options.speed) : this.speed;

    // If Gnani is configured and not in forced browser mode, use Gnani Realtime TTS
    if (this.isGnaniConfigured()) {
      try {
        const result = await gnaniTtsClient.speak(text, {
          language: targetLang,
          voice: targetVoice,
          model: targetModel,
          speed: targetSpeed,
        });

        if (result.success) {
          return;
        }

        console.info('[SpeechService] Gnani TTS unavailable, falling back to browser speech synthesis:', result.error);
      } catch (err) {
        console.warn('[SpeechService] Gnani TTS error, falling back to browser:', err);
      }
    }

    // Fallback: Browser Web SpeechSynthesis
    this.speakWithBrowser(text);
  }

  private speakWithBrowser(text: string) {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.synthesisVoice) {
        utterance.voice = this.synthesisVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Browser speech synthesis error:', err);
    }
  }

  public stopSpeaking() {
    gnaniTtsClient.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private selectVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();

    const indianVoice =
      voices.find((v) => v.lang === 'hi-IN') ||
      voices.find((v) => v.lang === 'en-IN') ||
      voices.find((v) => v.name.toLowerCase().includes('india')) ||
      voices.find((v) => v.lang.startsWith('en'));

    this.synthesisVoice = indianVoice || null;
  }
}

export const speechService = new SpeechService();
