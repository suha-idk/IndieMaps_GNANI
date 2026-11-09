import {
  getLanguageConfig,
  resolveVoice,
  clampSpeed,
  DEFAULT_TTS_MODEL,
  TtsModel,
} from '../config/gnaniConfig.ts';

export interface GnaniTtsOptions {
  language?: string;
  voice?: string;
  model?: string; // 'timbre-v2.5' | 'timbre-v3.0'
  speed?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export interface GnaniTtsParsedMessage {
  audioBytes?: Uint8Array;
  isFinal?: boolean;
  isComplete?: boolean;
  error?: string;
}

/**
 * Robust message parser for Gnani TTS WebSocket messages.
 * Safely handles:
 * - Nested audio chunk structure: { type: "audio", data: { chunk_index: 0, audio: "<b64>", is_final: false } }
 * - Direct audio string: { audio: "<b64>" } or { data: "<b64>" } or { audio_content: "<b64>" }
 * - Binary ArrayBuffer or Uint8Array frames
 * - Completion signals: msg.type === "complete", msg.event === "complete", msg.data.is_final === true, msg.is_final === true
 * - Error messages and malformed payloads
 */
export function parseGnaniTtsMessage(data: any): GnaniTtsParsedMessage {
  // 1. Direct binary frame
  if (data instanceof ArrayBuffer) {
    return { audioBytes: new Uint8Array(data) };
  }
  if (data instanceof Uint8Array) {
    return { audioBytes: data };
  }

  // 2. Decode string if received as binary-like
  let raw = '';
  if (typeof data === 'string') {
    raw = data;
  } else if (data && typeof data === 'object' && 'toString' in data) {
    try {
      if (typeof TextDecoder !== 'undefined') {
        raw = new TextDecoder().decode(data);
      } else {
        raw = data.toString();
      }
    } catch {
      raw = String(data);
    }
  } else {
    return {};
  }

  // 3. Parse JSON
  let msg: any = null;
  try {
    msg = JSON.parse(raw);
  } catch {
    // Malformed JSON string
    return {};
  }

  if (!msg || typeof msg !== 'object') {
    return {};
  }

  // 4. Error signal check
  if (msg.type === 'error' || msg.status === 'error' || msg.code === 'error') {
    return {
      error: msg.message || msg.error || 'Gnani upstream error',
    };
  }

  // 5. Extract audio base64 chunk from nested or flat structures
  let base64Chunk: string | null = null;
  if (msg.data && typeof msg.data === 'object' && typeof msg.data.audio === 'string') {
    base64Chunk = msg.data.audio;
  } else if (typeof msg.audio === 'string') {
    base64Chunk = msg.audio;
  } else if (typeof msg.audio_content === 'string') {
    base64Chunk = msg.audio_content;
  } else if (typeof msg.data === 'string') {
    base64Chunk = msg.data;
  } else if (typeof msg.audio_chunk === 'string') {
    base64Chunk = msg.audio_chunk;
  }

  let audioBytes: Uint8Array | undefined;
  if (base64Chunk && typeof base64Chunk === 'string') {
    const trimmed = base64Chunk.trim();
    if (trimmed.length > 0) {
      try {
        const binary = atob(trimmed);
        if (binary.length > 0) {
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          audioBytes = bytes;
        }
      } catch {
        // Invalid base64 chunk safely ignored
      }
    }
  }

  // 6. Completion signals
  const isFinal = Boolean(
    msg.is_final === true ||
    (msg.data && typeof msg.data === 'object' && msg.data.is_final === true)
  );

  const isComplete = Boolean(
    msg.type === 'complete' ||
    msg.event === 'complete' ||
    msg.status === 'completed'
  );

  return {
    audioBytes,
    isFinal,
    isComplete,
  };
}

export class GnaniTtsClient {
  private currentSocket: WebSocket | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private activeSessionId: number = 0;
  private isSpeaking: boolean = false;

  public isBusy(): boolean {
    return this.isSpeaking;
  }

  /**
   * Synthesizes and plays text using Gnani Realtime WebSocket (with HTTP fallback).
   * Prevents overlapping audio by immediately cancelling any prior playback.
   */
  public async speak(text: string, options: GnaniTtsOptions = {}): Promise<{ success: boolean; error?: string }> {
    const cleanText = text.trim();
    if (!cleanText || typeof window === 'undefined') {
      return { success: false, error: 'Empty text' };
    }

    // Cancel any previous playback session immediately
    this.stop();

    const sessionId = ++this.activeSessionId;
    this.isSpeaking = true;
    options.onStart?.();

    const langConfig = getLanguageConfig(options.language || 'hi-IN');
    const model: TtsModel = options.model === 'timbre-v3.0' ? 'timbre-v3.0' : DEFAULT_TTS_MODEL;
    const voice = resolveVoice(langConfig.id, model, options.voice);
    const speed = clampSpeed(options.speed);
    const language = langConfig.ttsLangCode;

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      // Step A: Attempt WebSocket Streaming first
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/tts-stream`;

      let socket: WebSocket | null = null;
      let playbackTriggered = false;
      let completionTimer: ReturnType<typeof setTimeout> | null = null;
      const audioChunks: Uint8Array[] = [];

      const cleanupSocket = () => {
        if (socket) {
          try {
            socket.close();
          } catch {
            // ignore
          }
          socket = null;
        }
      };

      const triggerPlayback = () => {
        if (playbackTriggered) return;
        playbackTriggered = true;
        if (completionTimer) {
          clearTimeout(completionTimer);
          completionTimer = null;
        }
        cleanupSocket();

        if (this.activeSessionId !== sessionId) {
          return;
        }

        if (audioChunks.length > 0) {
          this.playCollectedChunks(audioChunks, sessionId, options, resolve);
        } else {
          // Do not report successful playback when no valid audio was received; fallback to REST
          this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
        }
      };

      try {
        socket = new WebSocket(wsUrl);
        this.currentSocket = socket;

        const connectionTimeout = setTimeout(() => {
          if (audioChunks.length === 0 && this.activeSessionId === sessionId && !playbackTriggered) {
            playbackTriggered = true;
            cleanupSocket();
            // Fallback to REST synthesis
            this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
          }
        }, 3500);

        socket.onopen = () => {
          if (this.activeSessionId !== sessionId) {
            cleanupSocket();
            return;
          }

          const synthesisPayload = {
            text: cleanText,
            voice,
            model,
            language,
            speed,
            speaking_rate: speed,
            audio_config: {
              sample_rate: 24000,
              encoding: 'linear_pcm',
              container: 'wav',
            },
          };

          socket?.send(JSON.stringify(synthesisPayload));
        };

        socket.onmessage = (event: MessageEvent) => {
          if (this.activeSessionId !== sessionId) {
            cleanupSocket();
            return;
          }

          clearTimeout(connectionTimeout);

          try {
            const parsed = parseGnaniTtsMessage(event.data);

            if (parsed.error) {
              if (!playbackTriggered) {
                playbackTriggered = true;
                cleanupSocket();
                this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
              }
              return;
            }

            // Append valid audio chunk
            if (parsed.audioBytes && parsed.audioBytes.byteLength > 0) {
              audioChunks.push(parsed.audioBytes);
            }

            // Completion signal handling
            if (parsed.isComplete) {
              triggerPlayback();
            } else if (parsed.isFinal) {
              // Final audio chunk received. Upstream may still send complete message or close connection.
              // Wait briefly (50ms) to allow protocol complete message to arrive without prematurely ending stream.
              if (!completionTimer && !playbackTriggered) {
                completionTimer = setTimeout(() => {
                  triggerPlayback();
                }, 50);
              }
            }
          } catch (err: any) {
            console.warn('[GnaniTts] Message processing error:', err);
          }
        };

        socket.onerror = () => {
          clearTimeout(connectionTimeout);
          if (completionTimer) {
            clearTimeout(completionTimer);
            completionTimer = null;
          }
          cleanupSocket();
          if (!playbackTriggered && this.activeSessionId === sessionId) {
            if (audioChunks.length > 0) {
              triggerPlayback();
            } else {
              playbackTriggered = true;
              this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
            }
          }
        };

        socket.onclose = () => {
          clearTimeout(connectionTimeout);
          if (completionTimer) {
            clearTimeout(completionTimer);
            completionTimer = null;
          }
          if (!playbackTriggered && this.activeSessionId === sessionId) {
            if (audioChunks.length > 0) {
              triggerPlayback();
            } else {
              playbackTriggered = true;
              this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
            }
          }
        };
      } catch {
        cleanupSocket();
        this.speakViaRest(cleanText, { language, voice, model, speed }, sessionId, options, resolve);
      }
    });
  }

  /**
   * Helper to play collected audio chunks via HTMLAudioElement.
   */
  private playCollectedChunks(
    chunks: Uint8Array[],
    sessionId: number,
    options: GnaniTtsOptions,
    resolve: (res: { success: boolean; error?: string }) => void
  ) {
    if (this.activeSessionId !== sessionId || chunks.length === 0) {
      this.isSpeaking = false;
      options.onError?.('Empty audio chunks');
      resolve({ success: false, error: 'Session superseded or empty audio' });
      return;
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    if (totalLength === 0) {
      this.isSpeaking = false;
      options.onError?.('Zero byte audio');
      resolve({ success: false, error: 'Zero byte audio' });
      return;
    }

    // Merge chunks into a single ArrayBuffer
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const blob = new Blob([merged], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    this.currentAudioUrl = url;

    const audio = new Audio(url);
    this.currentAudio = audio;

    let hasEnded = false;

    audio.onended = () => {
      if (!hasEnded && this.activeSessionId === sessionId) {
        hasEnded = true;
        this.cleanupAudio();
        this.isSpeaking = false;
        options.onEnd?.();
        resolve({ success: true });
      }
    };

    audio.onerror = () => {
      if (!hasEnded && this.activeSessionId === sessionId) {
        hasEnded = true;
        this.cleanupAudio();
        this.isSpeaking = false;
        options.onError?.('Audio element playback error');
        resolve({ success: false, error: 'Audio element playback error' });
      }
    };

    audio.play().catch((playErr) => {
      if (!hasEnded && this.activeSessionId === sessionId) {
        hasEnded = true;
        this.cleanupAudio();
        this.isSpeaking = false;
        options.onError?.(playErr?.message || 'Autoplay prevented');
        resolve({ success: false, error: playErr?.message });
      }
    });
  }

  /**
   * Seamless REST fallback synthesis when WebSocket streaming is interrupted or unavailable.
   */
  private async speakViaRest(
    text: string,
    params: { language: string; voice: string; model: string; speed: number },
    sessionId: number,
    options: GnaniTtsOptions,
    resolve: (res: { success: boolean; error?: string }) => void
  ) {
    if (this.activeSessionId !== sessionId) {
      resolve({ success: false, error: 'Session superseded' });
      return;
    }

    try {
      const res = await fetch('/api/gnani/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: params.language,
          voice: params.voice,
          model: params.model,
          speed: params.speed,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        this.isSpeaking = false;
        options.onError?.(errJson.error || 'Gnani TTS synthesis failed');
        resolve({ success: false, error: errJson.error || 'Gnani TTS synthesis failed' });
        return;
      }

      const blob = await res.blob();
      if (this.activeSessionId !== sessionId) {
        resolve({ success: false, error: 'Session superseded' });
        return;
      }

      if (blob.size === 0) {
        this.isSpeaking = false;
        options.onError?.('Empty audio received from REST TTS');
        resolve({ success: false, error: 'Empty audio received from REST TTS' });
        return;
      }

      const url = URL.createObjectURL(blob);
      this.currentAudioUrl = url;

      const audio = new Audio(url);
      this.currentAudio = audio;

      let hasEnded = false;
      audio.onended = () => {
        if (!hasEnded && this.activeSessionId === sessionId) {
          hasEnded = true;
          this.cleanupAudio();
          this.isSpeaking = false;
          options.onEnd?.();
          resolve({ success: true });
        }
      };

      audio.onerror = () => {
        if (!hasEnded && this.activeSessionId === sessionId) {
          hasEnded = true;
          this.cleanupAudio();
          this.isSpeaking = false;
          options.onError?.('Audio playback failed');
          resolve({ success: false, error: 'Audio playback failed' });
        }
      };

      await audio.play().catch((playErr) => {
        if (!hasEnded && this.activeSessionId === sessionId) {
          hasEnded = true;
          this.cleanupAudio();
          this.isSpeaking = false;
          options.onError?.(playErr?.message || 'Autoplay prevented');
          resolve({ success: false, error: playErr?.message });
        }
      });
    } catch (err: any) {
      this.cleanupAudio();
      this.isSpeaking = false;
      options.onError?.(err?.message || 'Network error');
      resolve({ success: false, error: err?.message || 'Network error' });
    }
  }

  /**
   * Instantly stops audio playback and closes any active WebSocket connection.
   * Cancels ongoing speech announcements immediately.
   */
  public stop(): void {
    this.activeSessionId++;
    this.isSpeaking = false;

    if (this.currentSocket) {
      try {
        this.currentSocket.close();
      } catch {
        // ignore
      }
      this.currentSocket = null;
    }

    this.cleanupAudio();
  }

  private cleanupAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }
}

export const gnaniTtsClient = new GnaniTtsClient();
