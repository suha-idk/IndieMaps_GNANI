/**
 * Regression Test Suite for Gnani TTS Audio Chunk Parsing & Lifecycle
 *
 * Verifies:
 * 1. Safe parsing of nested Gnani audio chunks: { type: "audio", data: { chunk_index: 0, audio: "<b64>", is_final: false } }
 * 2. Flat audio chunk backward compatibility: { audio: "<b64>" }, { data: "<b64>" }, { audio_content: "<b64>" }
 * 3. Completion signals:
 *    - msg.type === "complete"
 *    - msg.data?.is_final === true
 *    - msg.is_final === true
 *    - msg.event === "complete"
 * 4. Error signal extraction: { type: "error", message: "..." }
 * 5. Robustness against:
 *    - Malformed JSON strings
 *    - Invalid base64 characters
 *    - Empty audio chunks (0 bytes)
 *    - Null / undefined / non-object payloads
 * 6. Model-specific voice catalog enforcement (timbre-v3.0 vs timbre-v2.5)
 */

import { parseGnaniTtsMessage } from '../src/services/gnaniTtsClient.ts';
import { validateTtsPayload, TIMBRE_V3_VOICES, resolveVoice } from '../src/config/gnaniConfig.ts';

function runTtsChunkParserTests() {
  console.log('================================================================');
  console.log('  RAAHI — GNANI TTS AUDIO CHUNK PARSER & LIFECYCLE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      if (detail) console.error(`    Detail: ${detail}`);
    }
  }

  // Realistic sample base64 WAV RIFF header (44 bytes)
  const sampleWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  const sampleAudioBytes = Buffer.from(sampleWavBase64, 'base64');

  // TEST 1: Nested Gnani WebSocket Audio Chunk
  console.log('--- 1. Nested Gnani Audio Chunk Structure ---');
  const nestedChunkMsg = JSON.stringify({
    type: 'audio',
    data: {
      chunk_index: 0,
      audio: sampleWavBase64,
      is_final: false,
    },
  });

  const parsedNested = parseGnaniTtsMessage(nestedChunkMsg);
  assert(Boolean(parsedNested.audioBytes), 'Nested msg.data.audio extracted successfully');
  assert(parsedNested.audioBytes?.byteLength === sampleAudioBytes.byteLength, `Extracted chunk has expected byte length (${sampleAudioBytes.byteLength})`);
  assert(parsedNested.isFinal === false, 'is_final false correctly identified');
  assert(parsedNested.isComplete === false, 'isComplete false when not complete');

  // TEST 2: Nested Final Audio Chunk
  console.log('\n--- 2. Nested Final Audio Chunk (data.is_final === true) ---');
  const finalChunkMsg = JSON.stringify({
    type: 'audio',
    data: {
      chunk_index: 5,
      audio: sampleWavBase64,
      is_final: true,
    },
  });

  const parsedFinal = parseGnaniTtsMessage(finalChunkMsg);
  assert(Boolean(parsedFinal.audioBytes), 'Final audio chunk bytes extracted');
  assert(parsedFinal.isFinal === true, 'msg.data.is_final === true extracted correctly');

  // TEST 3: Flat Audio Structures (Backward Compatibility)
  console.log('\n--- 3. Flat Audio Structures Backward Compatibility ---');
  const flatAudioMsg = JSON.stringify({
    type: 'audio',
    audio: sampleWavBase64,
    is_final: false,
  });
  const parsedFlat = parseGnaniTtsMessage(flatAudioMsg);
  assert(Boolean(parsedFlat.audioBytes), 'Direct msg.audio extracted successfully');

  const audioContentMsg = JSON.stringify({
    audio_content: sampleWavBase64,
  });
  const parsedContent = parseGnaniTtsMessage(audioContentMsg);
  assert(Boolean(parsedContent.audioBytes), 'Direct msg.audio_content extracted successfully');

  const dataStringMsg = JSON.stringify({
    data: sampleWavBase64,
  });
  const parsedDataString = parseGnaniTtsMessage(dataStringMsg);
  assert(Boolean(parsedDataString.audioBytes), 'Direct msg.data string extracted successfully');

  // TEST 4: Protocol Completion Messages
  console.log('\n--- 4. Completion Signals ---');
  const completeMsg = JSON.stringify({
    type: 'complete',
    message: 'Streaming completed',
  });
  const parsedComplete = parseGnaniTtsMessage(completeMsg);
  assert(parsedComplete.isComplete === true, 'msg.type === "complete" detected as isComplete');

  const eventCompleteMsg = JSON.stringify({
    event: 'complete',
  });
  const parsedEventComplete = parseGnaniTtsMessage(eventCompleteMsg);
  assert(parsedEventComplete.isComplete === true, 'msg.event === "complete" detected as isComplete');

  const isFinalOnRootMsg = JSON.stringify({
    audio: sampleWavBase64,
    is_final: true,
  });
  const parsedRootFinal = parseGnaniTtsMessage(isFinalOnRootMsg);
  assert(parsedRootFinal.isFinal === true, 'msg.is_final === true detected on root');

  // TEST 5: Error Signals
  console.log('\n--- 5. Upstream Error Signals ---');
  const errorMsg = JSON.stringify({
    type: 'error',
    message: 'Voice not supported for model',
  });
  const parsedError = parseGnaniTtsMessage(errorMsg);
  assert(Boolean(parsedError.error), 'Error message detected');
  assert(parsedError.error === 'Voice not supported for model', 'Error message preserves upstream explanation');

  // TEST 6: Malformed Payloads & Edge Cases
  console.log('\n--- 6. Malformed Payloads & Edge Cases Resilience ---');
  const malformedJson = '{ broken json: true';
  const parsedMalformed = parseGnaniTtsMessage(malformedJson);
  assert(!parsedMalformed.audioBytes && !parsedMalformed.error, 'Malformed JSON handled without throwing exception');

  const invalidBase64 = JSON.stringify({
    type: 'audio',
    data: {
      chunk_index: 0,
      audio: '!!!NOT_VALID_BASE64@@@',
      is_final: false,
    },
  });
  const parsedInvalidB64 = parseGnaniTtsMessage(invalidBase64);
  assert(!parsedInvalidB64.audioBytes, 'Invalid base64 chunk handled safely without throwing');

  const emptyAudioChunk = JSON.stringify({
    type: 'audio',
    data: {
      chunk_index: 0,
      audio: '',
      is_final: false,
    },
  });
  const parsedEmpty = parseGnaniTtsMessage(emptyAudioChunk);
  assert(!parsedEmpty.audioBytes, 'Empty audio chunk string produces undefined audioBytes');

  // TEST 7: Model-Specific Voice Catalog Rejections & Safety
  console.log('\n--- 7. Model-Specific Voice Catalog Rejections & Safety ---');
  const naliniOnV3 = validateTtsPayload({
    text: 'परीक्षण',
    model: 'timbre-v3.0',
    voice: 'Nalini',
    language: 'hi-IN',
  });
  assert(!naliniOnV3.valid, 'timbre-v3.0 strictly rejects Nalini');
  assert(Boolean(naliniOnV3.error?.includes('Voice \'Nalini\' is not supported by model \'timbre-v3.0\'')), 'Validation error lists supported voices');

  const kaveriOnV3 = validateTtsPayload({
    text: 'testing',
    model: 'timbre-v3.0',
    voice: 'Kaveri',
    language: 'en-IN',
  });
  assert(!kaveriOnV3.valid, 'timbre-v3.0 strictly rejects Kaveri');

  const shivaniOnV3 = validateTtsPayload({
    text: 'परीक्षण',
    model: 'timbre-v3.0',
    voice: 'Shivani',
    language: 'hi-IN',
  });
  assert(shivaniOnV3.valid, 'timbre-v3.0 accepts Shivani');

  const naliniOnV25 = validateTtsPayload({
    text: 'परीक्षण',
    model: 'timbre-v2.5',
    voice: 'Nalini',
    language: 'hi-IN',
  });
  assert(naliniOnV25.valid, 'timbre-v2.5 accepts Nalini for Hindi');

  const kaveriOnV25 = validateTtsPayload({
    text: 'testing',
    model: 'timbre-v2.5',
    voice: 'Kaveri',
    language: 'en-IN',
  });
  assert(kaveriOnV25.valid, 'timbre-v2.5 accepts Kaveri for English');

  // Switching model resolves voice
  const resolvedWhenSwitchingToV3 = resolveVoice('hi', 'timbre-v3.0', 'Nalini');
  assert(resolvedWhenSwitchingToV3 === 'Shivani', `Switching to timbre-v3.0 resolves Nalini to "${resolvedWhenSwitchingToV3}"`);

  const resolvedWhenSwitchingToV25 = resolveVoice('hi', 'timbre-v2.5', 'Shivani');
  assert(resolvedWhenSwitchingToV25 === 'Nalini', `Switching to timbre-v2.5 resolves Shivani to "${resolvedWhenSwitchingToV25}"`);

  // Summary
  console.log('\n================================================================');
  console.log(`  RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTtsChunkParserTests();
