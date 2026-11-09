import { AudioCaptureEngine } from './audioCapture.ts';

export interface GnaniSttCallbacks {
  onStart?: () => void;
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export interface GnaniSttConfig {
  languageCode: string; // e.g. 'hi-IN', 'en-IN', 'mr-IN', etc.
  silenceTimeoutMs?: number; // silence delay before submitting final transcript (default 1200ms)
  inactivityTimeoutMs?: number; // max idle time before stopping (default 6500ms)
}

export interface SttDiagnostics {
  sessionId: number;
  languageCode: string;
  durationMs: number;
  framesSent: number;
  bytesSent: number;
  segmentsReceived: number;
  finalTranscript: string;
  characterCount: number;
  status: 'completed' | 'timeout' | 'error' | 'cancelled';
  errorMessage?: string;
}

export class GnaniSttClient {
  private socket: WebSocket | null = null;
  private audioCapture: AudioCaptureEngine = new AudioCaptureEngine();
  private isListening: boolean = false;
  private isCancelled: boolean = false;

  private silenceTimer: any = null;
  private inactivityTimer: any = null;
  private currentTranscript: string = '';
  private lastExecutedTranscript: string = '';
  private sessionId: number = 0;

  // Multi-segment transcript assembly to prevent multi-word sentences from being truncated on segment 1 is_final
  private finalizedSegments: Map<number, string> = new Map();
  private currentInterimText: string = '';

  // Observability diagnostics
  private framesSent: number = 0;
  private bytesSent: number = 0;
  private startTime: number = 0;
  private activeLanguageCode: string = 'hi-IN';
  private lastDiagnostics: SttDiagnostics | null = null;

  public getIsListening(): boolean {
    return this.isListening;
  }

  public getLastDiagnostics(): SttDiagnostics | null {
    return this.lastDiagnostics;
  }

  public async startListening(config: GnaniSttConfig, callbacks: GnaniSttCallbacks): Promise<void> {
    if (this.isListening) {
      this.stopListening();
    }

    const currentSession = ++this.sessionId;
    this.isListening = true;
    this.isCancelled = false;
    this.currentTranscript = '';
    this.currentInterimText = '';
    this.finalizedSegments.clear();
    this.framesSent = 0;
    this.bytesSent = 0;
    this.startTime = Date.now();
    this.activeLanguageCode = config.languageCode || 'hi-IN';

    // 1400ms pause indicates natural end of speech without cutting off multi-segment speech
    const silenceDelay = config.silenceTimeoutMs ?? 1400;
    const inactivityDelay = config.inactivityTimeoutMs ?? 6500;

    // Build WebSocket URL to local proxy
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/stt-stream?lang=${encodeURIComponent(this.activeLanguageCode)}`;

    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      // Reset inactivity timeout
      this.resetInactivityTimer(inactivityDelay, callbacks);

      this.socket.onopen = async () => {
        if (this.sessionId !== currentSession || !this.isListening) {
          this.socket?.close();
          return;
        }

        callbacks.onStart?.();

        // Start capturing 16kHz 16-bit linear PCM in 1024-byte chunks
        try {
          await this.audioCapture.start({
            onFrame: (pcmFrame) => {
              if (this.socket && this.socket.readyState === WebSocket.OPEN && !this.isCancelled) {
                this.socket.send(pcmFrame);
                this.framesSent++;
                this.bytesSent += pcmFrame.byteLength;
              }
            },
            onVolume: (vol) => {
              callbacks.onVolumeChange?.(vol);
            },
            onError: (err) => {
              console.warn('[GnaniStt] Audio capture error:', err.message);
              this.recordDiagnostics('error', err.message);
              callbacks.onError?.(err.message || 'Microphone capture error');
              this.stopListening();
            },
          });
        } catch (captureErr: any) {
          this.recordDiagnostics('error', captureErr?.message);
          callbacks.onError?.(captureErr?.message || 'Failed to start microphone');
          this.stopListening();
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        if (this.sessionId !== currentSession || !this.isListening || this.isCancelled) return;

        try {
          const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          const data = JSON.parse(raw);

          // Gnani message handling by discriminator
          if (data.type === 'connected') {
            this.resetInactivityTimer(inactivityDelay, callbacks);
          } else if (data.type === 'speech_start') {
            this.resetInactivityTimer(inactivityDelay, callbacks);
          } else if (data.type === 'processing') {
            this.resetInactivityTimer(inactivityDelay, callbacks);
          } else if (data.type === 'complete' || data.type === 'final') {
            if (this.currentTranscript.trim()) {
              clearTimeout(this.silenceTimer);
              this.commitTranscript(this.currentTranscript, callbacks);
            }
          } else if (data.type === 'transcript') {
            const rawText = (
              data.transcript ||
              data.text ||
              (data.output && data.output.literal) ||
              (data.data && (data.data.transcript || data.data.text || (data.data.output && data.data.output.literal))) ||
              ''
            ).trim();
            if (!rawText) return;

            const segmentIndex = typeof data.segment_index === 'number'
              ? data.segment_index
              : (typeof data.data?.segment_index === 'number'
                ? data.data.segment_index
                : (this.finalizedSegments.size + 1));

            const isFinal = Boolean(data.is_final || data.final || data.data?.is_final || data.data?.final);

            // If message is marked as final for this segment, finalize it in the segment catalog
            if (isFinal) {
              this.finalizedSegments.set(segmentIndex, rawText);
              this.currentInterimText = '';
            } else {
              this.currentInterimText = rawText;
            }

            // Assemble all ordered finalized segments plus any current interim fragment
            const sortedSegments = Array.from(this.finalizedSegments.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, segText]) => segText);

            const fullTranscript = [...sortedSegments, this.currentInterimText]
              .filter(Boolean)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (!fullTranscript) return;

            this.currentTranscript = fullTranscript;
            callbacks.onInterimResult?.(fullTranscript);

            this.resetInactivityTimer(inactivityDelay, callbacks);
            clearTimeout(this.silenceTimer);

            // Crucial Reliability Fix:
            // Do NOT prematurely stop listening when segment 1 sends is_final: true!
            // Wait for silenceDelay of sustained quiet after speech to finalize multi-word utterances,
            // or commit when the user explicitly clicks the microphone button or complete message arrives.
            this.silenceTimer = setTimeout(() => {
              if (this.sessionId === currentSession && this.isListening && !this.isCancelled) {
                this.commitTranscript(this.currentTranscript, callbacks);
              }
            }, silenceDelay);
          } else if (data.type === 'error') {
            const errCode = data.code || 'STT_ERROR';
            const errMsg = data.message || 'Speech recognition error';
            this.recordDiagnostics('error', `${errCode}: ${errMsg}`);
            callbacks.onError?.(`${errCode}: ${errMsg}`);
            this.stopListening();
          }
        } catch (err) {
          console.warn('[GnaniStt] Parse message error:', err);
        }
      };

      this.socket.onerror = (_e: Event) => {
        if (this.sessionId === currentSession) {
          this.recordDiagnostics('error', 'Gnani STT connection failed');
          callbacks.onError?.('Gnani STT connection failed');
          this.stopListening();
        }
      };

      this.socket.onclose = () => {
        if (this.sessionId === currentSession && this.isListening) {
          this.isListening = false;
          clearTimeout(this.silenceTimer);
          clearTimeout(this.inactivityTimer);
          if (this.currentTranscript.trim()) {
            this.commitTranscript(this.currentTranscript, callbacks);
          } else {
            this.recordDiagnostics('completed');
            callbacks.onEnd?.();
          }
        }
      };
    } catch (err: any) {
      this.recordDiagnostics('error', err?.message);
      this.stopListening();
      callbacks.onError?.(err?.message || 'Failed to initialize STT socket');
    }
  }

  private commitTranscript(text: string, callbacks: GnaniSttCallbacks) {
    const cleanText = text.trim();
    if (!cleanText || this.isCancelled) return;

    // Deduplication check: prevent duplicate execution of the exact same transcript
    if (cleanText === this.lastExecutedTranscript) {
      return;
    }

    this.lastExecutedTranscript = cleanText;
    this.recordDiagnostics('completed', undefined, cleanText);
    this.stopListening();
    callbacks.onFinalResult?.(cleanText);
  }

  public stopListening(callbacks?: GnaniSttCallbacks): void {
    clearTimeout(this.silenceTimer);
    clearTimeout(this.inactivityTimer);
    this.isListening = false;

    // Flush remaining buffered PCM audio so word endings are sent to recognizer
    this.audioCapture.stop((flushFrame) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN && !this.isCancelled) {
        try {
          this.socket.send(flushFrame);
        } catch {
          // ignore
        }
      }
    });

    if (this.currentTranscript.trim() && callbacks) {
      this.commitTranscript(this.currentTranscript, callbacks);
    }

    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        try {
          this.socket.close();
        } catch {
          // ignore
        }
      }
      this.socket = null;
    }
  }

  public cancelListening(): void {
    this.isCancelled = true;
    this.recordDiagnostics('cancelled');
    this.currentTranscript = '';
    this.currentInterimText = '';
    this.finalizedSegments.clear();
    this.stopListening();
  }

  private resetInactivityTimer(ms: number, callbacks: GnaniSttCallbacks) {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.currentTranscript.trim()) {
        this.commitTranscript(this.currentTranscript, callbacks);
      } else {
        this.recordDiagnostics('timeout');
        this.stopListening();
        callbacks.onEnd?.();
      }
    }, ms);
  }

  private recordDiagnostics(status: SttDiagnostics['status'], errorMessage?: string, finalText?: string) {
    const transcript = finalText || this.currentTranscript;
    this.lastDiagnostics = {
      sessionId: this.sessionId,
      languageCode: this.activeLanguageCode,
      durationMs: this.startTime ? Date.now() - this.startTime : 0,
      framesSent: this.framesSent,
      bytesSent: this.bytesSent,
      segmentsReceived: this.finalizedSegments.size,
      finalTranscript: transcript,
      characterCount: transcript.length,
      status,
      errorMessage,
    };
  }
}

export const gnaniSttClient = new GnaniSttClient();
