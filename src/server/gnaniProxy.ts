import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Request, Response } from 'express';
import { readEnvFile } from './envStorage.ts';
import {
  GNANI_LANGUAGES,
  ALL_STT_CODES,
  getLanguageConfig,
  resolveVoice,
  clampSpeed,
  validateTtsPayload,
  type TtsModel,
} from '../config/gnaniConfig.ts';

export interface GnaniStatus {
  configured: boolean;
  sttEndpoint: string;
  ttsEndpoint: string;
  defaultModel: string;
  defaultVoice: string;
  supportedLanguages: string[];
  languages?: any[];
}

export const GNANI_SUPPORTED_LANGUAGES = [
  ...ALL_STT_CODES,
  'hi-en',
  'auto',
];

export function getGnaniApiKey(): string {
  const envFile = readEnvFile();
  const fileKey = (envFile.GNANI_API_KEY || '').trim();
  const processKey = (process.env.GNANI_API_KEY || '').trim();
  return fileKey || processKey;
}

export function getGnaniStatus(): GnaniStatus {
  const apiKey = getGnaniApiKey();
  const envFile = readEnvFile();
  const model = envFile.GNANI_TTS_MODEL || process.env.GNANI_TTS_MODEL || 'timbre-v2.5';
  const voice = envFile.GNANI_TTS_VOICE || process.env.GNANI_TTS_VOICE || 'Nalini';

  return {
    configured: Boolean(apiKey && apiKey.length > 5),
    sttEndpoint: 'wss://api.vachana.ai/stt/v3/stream',
    ttsEndpoint: 'wss://api.vachana.ai/api/v1/tts',
    defaultModel: model,
    defaultVoice: voice,
    supportedLanguages: GNANI_SUPPORTED_LANGUAGES,
    languages: Object.values(GNANI_LANGUAGES),
  };
}

// REST route for status & settings
export function handleGnaniStatus(_req: Request, res: Response) {
  res.json(getGnaniStatus());
}

// REST route for testing or direct synthesis
export async function handleGnaniTtsRest(req: Request, res: Response) {
  const apiKey = getGnaniApiKey();
  if (!apiKey) {
    return res.status(503).json({
      error: 'GNANI_API_KEY not configured',
      message: 'Please configure GNANI_API_KEY in settings or .env file.',
    });
  }

  const { text, language = 'hi-IN', voice, model = 'timbre-v2.5', speed = 1.0 } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required for TTS synthesis' });
  }

  const langConfig = getLanguageConfig(language);
  const validatedModel: TtsModel = model === 'timbre-v3.0' ? 'timbre-v3.0' : 'timbre-v2.5';

  const payloadValidation = validateTtsPayload({
    text: text.trim(),
    model: validatedModel,
    voice: voice || resolveVoice(langConfig.id, validatedModel),
    language: langConfig.ttsLangCode,
  });

  if (!payloadValidation.valid) {
    return res.status(400).json({ error: payloadValidation.error });
  }

  const selectedVoice = resolveVoice(langConfig.id, validatedModel, voice);
  const safeSpeed = clampSpeed(typeof speed === 'number' ? speed : 1.0);

  try {
    const response = await fetch('https://api.vachana.ai/api/v1/tts/inference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-ID': apiKey,
      },
      body: JSON.stringify({
        text: text.trim(),
        voice: selectedVoice,
        model: validatedModel,
        language: langConfig.ttsLangCode,
        speed: safeSpeed,
        speaking_rate: safeSpeed,
        audio_config: {
          sample_rate: 24000,
          encoding: 'linear_pcm',
          container: 'wav',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: 'Gnani TTS upstream error',
        details: errText,
      });
    }

    const contentType = response.headers.get('content-type') || 'audio/wav';
    const audioBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.byteLength);
    return res.send(Buffer.from(audioBuffer));
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to synthesize speech via Gnani',
      message: error?.message || 'Network error',
    });
  }
}

/**
 * Initializes WebSocket proxy handlers for Gnani STT and TTS.
 * This bridges browser WebSockets (which cannot send custom headers)
 * to Gnani's servers while securely injecting x-api-key-id server-side.
 */
function safeCloseWs(ws: WebSocket | null | undefined, code?: number, reason?: Buffer | string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  let validCode = 1000;
  if (typeof code === 'number' && Number.isInteger(code)) {
    // Valid status codes that can be transmitted in a close frame according to RFC 6455 & ws:
    // 1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, and 3000-4999.
    // 1004 (reserved), 1005 (no status code), 1006 (abnormal), 1015 (TLS handshake) are illegal to send.
    if (code >= 1000 && code <= 4999 && code !== 1004 && code !== 1005 && code !== 1006 && code !== 1015) {
      validCode = code;
    }
  }
  const cleanReason = reason ? reason.toString().slice(0, 120) : undefined;
  try {
    ws.close(validCode, cleanReason);
  } catch {
    try {
      ws.close();
    } catch {
      // Ignore fallback close errors
    }
  }
}

export function setupGnaniWebSocketServers() {
  const sttWss = new WebSocketServer({ noServer: true });
  const ttsWss = new WebSocketServer({ noServer: true });

  // 1. Realtime STT WebSocket Proxy
  sttWss.on('connection', (clientWs: WebSocket, req: IncomingMessage) => {
    const apiKey = getGnaniApiKey();
    if (!apiKey) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'GNANI_NOT_CONFIGURED',
          message: 'GNANI_API_KEY is not configured on the server. Falling back to browser speech.',
        })
      );
      clientWs.close(1008, 'API Key missing');
      return;
    }

    // Extract query parameters: e.g. /api/stt-stream?lang=hi-IN&vad_timeout=1200
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const rawLang = urlObj.searchParams.get('lang') || 'hi-IN';
    const langConfig = getLanguageConfig(rawLang);
    const langCode = langConfig.sttCode;

    // Connect upstream to Gnani STT
    const upstreamUrl = 'wss://api.vachana.ai/stt/v3/stream';
    let upstreamWs: WebSocket | null = null;

    try {
      upstreamWs = new WebSocket(upstreamUrl, {
        headers: {
          'x-api-key-id': apiKey,
          lang_code: langCode,
        },
      });
    } catch (err: any) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'UPSTREAM_CONNECT_FAILED',
          message: err?.message || 'Failed to connect to Gnani STT service',
        })
      );
      clientWs.close(1011, 'Upstream connect error');
      return;
    }

    // Forward messages from upstream Gnani to client browser
    upstreamWs.on('open', () => {
      // Ready to stream PCM audio
    });

    upstreamWs.on('message', (data: any, isBinary: boolean) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    upstreamWs.on('error', (err: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            code: 'UPSTREAM_ERROR',
            message: err?.message || 'Gnani STT connection error',
          })
        );
      }
    });

    upstreamWs.on('close', (code: number, reason: Buffer) => {
      safeCloseWs(clientWs, code, reason);
    });

    // Forward binary PCM frames from client browser to upstream Gnani STT
    clientWs.on('message', (data: any, isBinary: boolean) => {
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data, { binary: isBinary });
      }
    });

    clientWs.on('close', () => {
      if (upstreamWs && (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING)) {
        upstreamWs.close();
      }
    });

    clientWs.on('error', () => {
      if (upstreamWs) {
        upstreamWs.close();
      }
    });
  });

  // 2. Realtime TTS WebSocket Proxy
  ttsWss.on('connection', (clientWs: WebSocket, _req: IncomingMessage) => {
    const apiKey = getGnaniApiKey();
    if (!apiKey) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'GNANI_NOT_CONFIGURED',
          message: 'GNANI_API_KEY is not configured on the server.',
        })
      );
      clientWs.close(1008, 'API Key missing');
      return;
    }

    // Connect upstream to Gnani TTS WebSocket
    const upstreamUrl = 'wss://api.vachana.ai/api/v1/tts';
    let upstreamWs: WebSocket | null = null;

    try {
      upstreamWs = new WebSocket(upstreamUrl, {
        headers: {
          'X-API-Key-ID': apiKey,
        },
      });
    } catch (err: any) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          code: 'UPSTREAM_CONNECT_FAILED',
          message: err?.message || 'Failed to connect to Gnani TTS service',
        })
      );
      clientWs.close(1011, 'Upstream connect error');
      return;
    }

    upstreamWs.on('open', () => {
      // Upstream TTS ready
    });

    // Forward synthesized chunks from upstream Gnani to client
    upstreamWs.on('message', (data: any, isBinary: boolean) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    upstreamWs.on('error', (err: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            code: 'UPSTREAM_ERROR',
            message: err?.message || 'Gnani TTS connection error',
          })
        );
      }
    });

    upstreamWs.on('close', (code: number, reason: Buffer) => {
      safeCloseWs(clientWs, code, reason);
    });

    // Client sends synthesis request JSON
    clientWs.on('message', (data: any, isBinary: boolean) => {
      let payloadToSend = data;

      if (!isBinary) {
        try {
          const raw = typeof data === 'string' ? data : data.toString();
          const parsed = JSON.parse(raw);
          if (parsed && parsed.text) {
            const targetLang = getLanguageConfig(parsed.language || 'hi-IN');
            const targetModel: TtsModel = parsed.model === 'timbre-v3.0' ? 'timbre-v3.0' : 'timbre-v2.5';

            const payloadValidation = validateTtsPayload({
              text: parsed.text.trim(),
              model: targetModel,
              voice: parsed.voice || resolveVoice(targetLang.id, targetModel),
              language: targetLang.ttsLangCode,
            });

            if (!payloadValidation.valid) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  code: 'INVALID_TTS_PAYLOAD',
                  message: payloadValidation.error,
                })
              );
              return;
            }

            const targetVoice = resolveVoice(targetLang.id, targetModel, parsed.voice);
            const safeSpeed = clampSpeed(parsed.speed ?? parsed.speaking_rate ?? 1.0);

            const enrichedPayload = {
              text: parsed.text.trim(),
              voice: targetVoice,
              model: targetModel,
              language: targetLang.ttsLangCode,
              speed: safeSpeed,
              speaking_rate: safeSpeed,
              audio_config: parsed.audio_config || {
                sample_rate: 24000,
                encoding: 'linear_pcm',
                container: 'wav',
              },
            };
            payloadToSend = JSON.stringify(enrichedPayload);
          }
        } catch {
          // If not valid JSON, send as-is
        }
      }

      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(payloadToSend, { binary: isBinary });
      } else if (upstreamWs && upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.once('open', () => {
          upstreamWs?.send(payloadToSend, { binary: isBinary });
        });
      }
    });

    clientWs.on('close', () => {
      if (upstreamWs && (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING)) {
        upstreamWs.close();
      }
    });

    clientWs.on('error', () => {
      if (upstreamWs) {
        upstreamWs.close();
      }
    });
  });

  return { sttWss, ttsWss };
}
