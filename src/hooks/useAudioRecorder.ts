/**
 * useAudioRecorder - Hook for recording audio using Web Audio API
 *
 * Privacy-first approach:
 * - All audio processing happens locally
 * - Audio is encoded to WAV format for whisper.cpp compatibility
 * - No audio data leaves the device
 */

import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';
export type MicPermissionModal = 'none' | 'consent' | 'blocked';

interface UseAudioRecorderResult {
  state: RecordingState;
  error: string | null;
  permissionModal: MicPermissionModal;
  startRecording: () => Promise<void>;
  proceedAfterConsent: () => Promise<void>;
  dismissPermissionModal: () => void;
  stopRecording: () => Promise<ArrayBuffer | null>;
  cancelRecording: () => void;
}

// WAV encoding parameters for whisper.cpp compatibility
const SAMPLE_RATE = 16000; // whisper.cpp expects 16kHz
const NUM_CHANNELS = 1; // Mono audio

/**
 * Encode raw PCM samples to WAV format.
 * Throws if the audio is too long to fit in a 32-bit WAV chunk size field
 * (~2h 28min at 16kHz mono 16-bit).
 */
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  if (dataBytes > 0xFFFFFFFF - 36) {
    throw new Error('Recording is too long to encode as WAV (max ~2h 28min at 16kHz).');
  }
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  // WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, NUM_CHANNELS, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * NUM_CHANNELS * 2, true); // ByteRate
  view.setUint16(32, NUM_CHANNELS * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true); // Subchunk2Size

  // Write PCM samples as 16-bit integers
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] and convert to 16-bit signed integer
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Resample audio to target sample rate using linear interpolation
 */
function resample(
  inputBuffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputBuffer;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(inputBuffer.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Linear interpolation
    output[i] = inputBuffer[srcIndexFloor] * (1 - t) + inputBuffer[srcIndexCeil] * t;
  }

  return output;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [permissionModal, setPermissionModal] = useState<MicPermissionModal>('none');

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(() => {
    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    chunksRef.current = [];
  }, []);

  // Internal: acquires the mic stream and starts the audio capture pipeline.
  // Call only after permission has been confirmed (granted or consented).
  const doStartCapture = useCallback(async () => {
    setError(null);
    setPermissionModal('none');
    setState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: NUM_CHANNELS,
          sampleRate: { ideal: SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // ScriptProcessorNode is deprecated but AudioWorklet requires more setup
      // and may not work well in all WebView environments
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, NUM_CHANNELS, NUM_CHANNELS);
      processorRef.current = processor;

      chunksRef.current = [];

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setState('recording');
    } catch (err) {
      cleanup();
      setState('idle');

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          // User denied the OS prompt — show blocked modal
          setPermissionModal('blocked');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError(`Microphone error: ${err.message}`);
        }
      } else {
        setError('Failed to start recording. Please try again.');
      }
    }
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    setError(null);

    // Check the current permission state before calling getUserMedia.
    // - 'granted'  → proceed directly (no dialog needed)
    // - 'prompt'   → show our consent modal so the user knows why we need the mic
    // - 'denied'   → also show consent modal (NOT the blocked modal).
    //                In Tauri's embedded WebView (WebKit2GTK, WKWebView) the
    //                Permissions API may return 'denied' before the user has ever
    //                been asked, because the WebView process hasn't been granted
    //                access at the OS level yet. The only reliable signal that the
    //                user actively blocked the mic is a NotAllowedError thrown by
    //                getUserMedia() itself (handled in doStartCapture).
    // - query fails → show consent modal as a safe default
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') {
        // Skip the consent modal — we already have permission.
        await doStartCapture();
        return;
      }
      // 'prompt' or 'denied' — show consent modal and let getUserMedia decide.
      setPermissionModal('consent');
    } catch {
      // Permissions API unavailable — show consent modal as a safe default
      setPermissionModal('consent');
    }
  }, [doStartCapture]);

  // Called when the user clicks "Allow access" in the consent modal.
  const proceedAfterConsent = useCallback(async () => {
    await doStartCapture();
  }, [doStartCapture]);

  const dismissPermissionModal = useCallback(() => {
    setPermissionModal('none');
  }, []);

  const stopRecording = useCallback(async (): Promise<ArrayBuffer | null> => {
    if (state !== 'recording') {
      return null;
    }

    setState('processing');

    try {
      const chunks = chunksRef.current;
      const actualSampleRate = audioContextRef.current?.sampleRate ?? SAMPLE_RATE;

      // Cleanup streams and context
      cleanup();

      if (chunks.length === 0) {
        setState('idle');
        setError('No audio was recorded.');
        return null;
      }

      // Merge all chunks into a single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Resample to 16kHz if needed
      const resampled = resample(merged, actualSampleRate, SAMPLE_RATE);

      // Encode to WAV
      const wavBuffer = encodeWAV(resampled, SAMPLE_RATE);

      setState('idle');
      return wavBuffer;
    } catch (err) {
      cleanup();
      setState('idle');
      setError('Failed to process recording.');
      return null;
    }
  }, [state, cleanup]);

  const cancelRecording = useCallback(() => {
    cleanup();
    setState('idle');
    setError(null);
  }, [cleanup]);

  return {
    state,
    error,
    permissionModal,
    startRecording,
    proceedAfterConsent,
    dismissPermissionModal,
    stopRecording,
    cancelRecording,
  };
}
