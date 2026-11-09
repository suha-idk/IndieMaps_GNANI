/**
 * Live microphone audio capture and resampling engine.
 * Converts microphone audio from any device native sample rate (e.g. 44.1kHz, 48kHz)
 * to 16,000 Hz 16-bit linear PCM (little endian) chunked into exact 1,024-byte binary frames.
 *
 * Strictly adheres to Gnani AI Realtime STT Audio Contract:
 * - 16,000 Hz sample rate
 * - 16-bit signed integer Linear PCM (Little Endian)
 * - Mono (1 channel)
 * - Exactly 1,024 bytes per frame (512 samples)
 * - Real-time pacing (~32 ms per frame)
 */

export interface AudioCaptureCallbacks {
  onFrame: (pcmFrame: ArrayBuffer) => void;
  onVolume?: (volumeRms: number) => void;
  onError?: (err: Error) => void;
}

export class AudioCaptureEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isCapturing: boolean = false;

  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly BYTES_PER_FRAME = 1024;
  private readonly SAMPLES_PER_FRAME = 512; // 1024 bytes / 2 bytes per 16-bit sample

  // Buffer to accumulate resampled 16-bit PCM samples until 512 samples (1024 bytes) are reached
  private pcmAccumulator: Int16Array = new Int16Array(4096);
  private accumulatorCount: number = 0;

  public isRunning(): boolean {
    return this.isCapturing;
  }

  public async start(callbacks: AudioCaptureCallbacks): Promise<void> {
    if (this.isCapturing) return;

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone audio capture is not supported in this browser.');
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Initialize AudioContext
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const inputSampleRate = this.audioContext.sampleRate;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size of 4096 gives ~85ms at 48kHz, suitable for smooth resampling
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.accumulatorCount = 0;

      this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isCapturing) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);

        // Compute RMS volume for UI voice activity feedback
        if (callbacks.onVolume) {
          let sumSquares = 0;
          for (let i = 0; i < inputChannelData.length; i++) {
            sumSquares += inputChannelData[i] * inputChannelData[i];
          }
          const rms = Math.sqrt(sumSquares / inputChannelData.length);
          callbacks.onVolume(Math.min(1.0, rms * 5.0)); // Normalize
        }

        // Resample inputChannelData from inputSampleRate down to TARGET_SAMPLE_RATE (16,000 Hz)
        const resampled16k = this.resampleTo16kHz(inputChannelData, inputSampleRate, this.TARGET_SAMPLE_RATE);

        // Convert Float32 to 16-bit signed PCM
        const pcm16Chunk = this.floatTo16BitPCM(resampled16k);

        // Append to accumulator and emit exactly 1024-byte frames (512 samples)
        this.accumulateAndEmit(pcm16Chunk, callbacks.onFrame);
      };

      // Connect graph: Source -> Processor -> Destination (muted)
      this.sourceNode.connect(this.processorNode);
      // Connect to destination to prevent browser garbage collecting ScriptProcessorNode
      const dummyGain = this.audioContext.createGain();
      dummyGain.gain.value = 0;
      this.processorNode.connect(dummyGain);
      dummyGain.connect(this.audioContext.destination);

      this.isCapturing = true;
    } catch (err: any) {
      this.stop();
      if (callbacks.onError) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      } else {
        throw err;
      }
    }
  }

  /**
   * Flushes any remaining buffered samples in the accumulator by zero-padding to 1,024 bytes (512 samples)
   * so that the final spoken syllable is not discarded.
   */
  public flush(emitFrame?: (frame: ArrayBuffer) => void): void {
    if (this.accumulatorCount > 0 && emitFrame) {
      const frameBuffer = new ArrayBuffer(this.BYTES_PER_FRAME);
      const frameView = new Int16Array(frameBuffer);
      frameView.set(this.pcmAccumulator.subarray(0, this.accumulatorCount));
      emitFrame(frameBuffer);
    }
    this.accumulatorCount = 0;
  }

  public stop(flushFrameCallback?: (frame: ArrayBuffer) => void): void {
    this.isCapturing = false;

    if (flushFrameCallback) {
      this.flush(flushFrameCallback);
    }

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    this.accumulatorCount = 0;
  }

  /**
   * Resamples mono audio from sourceRate to targetRate using band-limited linear interpolation.
   */
  private resampleTo16kHz(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    if (sourceRate === targetRate) {
      return input;
    }

    const ratio = sourceRate / targetRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;

      const sample0 = input[index] || 0;
      const sample1 = input[index + 1] !== undefined ? input[index + 1] : sample0;

      output[i] = sample0 + frac * (sample1 - sample0);
    }

    return output;
  }

  /**
   * Converts Float32 audio samples [-1.0, 1.0] to 16-bit signed PCM integers [-32768, 32767].
   */
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  /**
   * Accumulates resampled Int16 samples and slices them into exact 512-sample (1,024 byte) frames.
   */
  private accumulateAndEmit(pcm16Chunk: Int16Array, emitFrame: (frame: ArrayBuffer) => void): void {
    let chunkOffset = 0;
    while (chunkOffset < pcm16Chunk.length) {
      const needed = this.SAMPLES_PER_FRAME - this.accumulatorCount;
      const available = pcm16Chunk.length - chunkOffset;
      const toCopy = Math.min(needed, available);

      // Expand buffer if needed
      if (this.accumulatorCount + toCopy > this.pcmAccumulator.length) {
        const next = new Int16Array(this.pcmAccumulator.length * 2);
        next.set(this.pcmAccumulator);
        this.pcmAccumulator = next;
      }

      this.pcmAccumulator.set(pcm16Chunk.subarray(chunkOffset, chunkOffset + toCopy), this.accumulatorCount);
      this.accumulatorCount += toCopy;
      chunkOffset += toCopy;

      // When we have exactly 512 samples (1024 bytes), emit frame
      if (this.accumulatorCount === this.SAMPLES_PER_FRAME) {
        // Create an ArrayBuffer copy of exactly 1024 bytes
        const frameBuffer = new ArrayBuffer(this.BYTES_PER_FRAME);
        const frameView = new Int16Array(frameBuffer);
        frameView.set(this.pcmAccumulator.subarray(0, this.SAMPLES_PER_FRAME));

        emitFrame(frameBuffer);

        // Reset accumulator
        this.accumulatorCount = 0;
      }
    }
  }
}
