/**
 * Speech-to-Text Service
 *
 * Orchestrates local speech-to-text transcription using whisper.cpp.
 * All processing happens on-device - no audio data leaves the machine.
 *
 * Architecture:
 * - Audio is recorded in the browser using Web Audio API
 * - WAV file is written to a temp directory via Tauri
 * - whisper.cpp sidecar processes the audio
 * - Transcribed text is returned
 * - Temp files are cleaned up
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { STTModel } from '../../types/settings';
import type { WhisperOutput } from '../utils/transcriptFormatter';
import { forModule } from './logger';

const log = forModule('stt');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Uint8Array to a base64 string without hitting the call-stack
 * limit that `btoa(String.fromCharCode(...bytes))` causes for large buffers.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // 32 KB
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Model file names
const MODEL_FILENAMES: Record<STTModel, string> = {
  'tiny.en': 'ggml-tiny.en.bin',
  'base.en': 'ggml-base.en.bin',
  'small.en': 'ggml-small.en.bin',
  'medium.en': 'ggml-medium.en.bin',
};

export interface ModelStatus {
  downloaded: boolean;
  path: string | null;
  size: number | null; // bytes
}

export interface DownloadProgress {
  downloaded: number; // bytes
  total: number; // bytes
  percentage: number; // 0-100
  state: string; // "connecting" | "downloading" | "complete" | "error" | "cancelled"
  speed: number; // bytes per second
  error?: string;
}

export interface TranscriptionResult {
  text: string;
  duration: number; // milliseconds
}

/**
 * Check if a specific model is downloaded and available
 */
export async function checkModelStatus(model: STTModel): Promise<ModelStatus> {
  try {
    return await invoke<ModelStatus>('stt_check_model', {
      modelName: MODEL_FILENAMES[model],
    });
  } catch (error) {
    log.error('Failed to check model status:', { error: String(error) });
    return { downloaded: false, path: null, size: null };
  }
}

/**
 * Download a whisper.cpp model.
 * Wires real progress from the Rust `stt-download-progress` Tauri event.
 */
export async function downloadModel(
  model: STTModel,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const filename = MODEL_FILENAMES[model];

  // Set up progress listener before starting the download so no events are missed.
  const unlisten = onProgress
    ? await listen<{
        state: string;
        downloaded: number;
        total: number;
        percentage: number;
        speed: number;
        error?: string;
      }>('stt-download-progress', (event) => {
        onProgress({
          downloaded: event.payload.downloaded,
          total: event.payload.total,
          percentage: event.payload.percentage,
          state: event.payload.state,
          speed: event.payload.speed,
          error: event.payload.error,
        });
      })
    : null;

  try {
    await invoke('stt_download_model', { filename });
  } catch (error) {
    log.error('Failed to download model:', { error: String(error) });
    throw new Error(`Failed to download model: ${error}`);
  } finally {
    unlisten?.();
  }
}

/**
 * Cancel an active model download.
 */
export async function cancelDownload(model: STTModel): Promise<void> {
  const filename = MODEL_FILENAMES[model];
  try {
    await invoke('stt_cancel_download', { filename });
  } catch (error) {
    // Ignore "no active download" — caller may have already completed
    log.warn('cancelDownload: no active download or already finished', { error: String(error) });
  }
}

/**
 * Delete a downloaded model to free up space
 */
export async function deleteModel(model: STTModel): Promise<void> {
  const filename = MODEL_FILENAMES[model];

  try {
    await invoke('stt_delete_model', { filename });
  } catch (error) {
    log.error('Failed to delete model:', { error: String(error) });
    throw new Error(`Failed to delete model: ${error}`);
  }
}

/**
 * Transcribe audio from a WAV buffer
 *
 * @param audioBuffer - WAV audio data as ArrayBuffer
 * @param model - The whisper model to use
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  model: STTModel
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  try {
    // Convert ArrayBuffer to base64 for transfer to Rust
    // Use chunked conversion to avoid call-stack overflow for large audio buffers
    const bytes = new Uint8Array(audioBuffer);
    const base64 = uint8ArrayToBase64(bytes);

    const text = await invoke<string>('stt_transcribe', {
      audioBase64: base64,
      modelName: MODEL_FILENAMES[model],
    });

    const duration = Date.now() - startTime;

    return {
      text: text.trim(),
      duration,
    };
  } catch (error) {
    log.error('Transcription failed:', { error: String(error) });
    throw new Error(`Transcription failed: ${error}`);
  }
}

/**
 * Check if the whisper sidecar is available
 */
export async function checkSidecarAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>('stt_check_sidecar');
  } catch {
    return false;
  }
}

/**
 * Get the models directory path
 */
export async function getModelsDirectory(): Promise<string> {
  return invoke<string>('stt_get_models_dir');
}

/**
 * Transcribe audio with timestamps using the `stt_transcribe_timestamped` Tauri command.
 * Returns a WhisperOutput containing the full text and per-segment timestamps.
 *
 * Falls back gracefully to an empty segments array if the sidecar cannot produce JSON.
 */
export async function transcribeAudioTimestamped(
  audioBuffer: ArrayBuffer,
  model: STTModel
): Promise<WhisperOutput> {
  try {
    const bytes = new Uint8Array(audioBuffer);
    const base64 = uint8ArrayToBase64(bytes);

    const result = await invoke<{ text: string; segments: Array<{ text: string; start: number; end: number }> }>(
      'stt_transcribe_timestamped',
      {
        audioBase64: base64,
        modelName: MODEL_FILENAMES[model],
      }
    );

    return {
      text: result.text.trim(),
      segments: result.segments.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
    };
  } catch (error) {
    log.error('Timestamped transcription failed:', { error: String(error) });
    throw new Error(`Timestamped transcription failed: ${error}`);
  }
}
