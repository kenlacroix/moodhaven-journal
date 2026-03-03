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
import type { STTModel } from '../types/settings';

// Model download URLs from Hugging Face (ggerganov/whisper.cpp)
const MODEL_URLS: Record<STTModel, string> = {
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
  'medium.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
};

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
    console.error('Failed to check model status:', error);
    return { downloaded: false, path: null, size: null };
  }
}

/**
 * Download a whisper.cpp model
 * Returns a function to cancel the download
 */
export async function downloadModel(
  model: STTModel,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const url = MODEL_URLS[model];
  const filename = MODEL_FILENAMES[model];

  try {
    await invoke('stt_download_model', {
      url,
      filename,
    });

    // For now, we don't have streaming progress from Rust
    // In a full implementation, we'd use Tauri events for progress updates
    onProgress?.({ downloaded: 100, total: 100, percentage: 100 });
  } catch (error) {
    console.error('Failed to download model:', error);
    throw new Error(`Failed to download model: ${error}`);
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
    console.error('Failed to delete model:', error);
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
    const bytes = new Uint8Array(audioBuffer);
    const base64 = btoa(String.fromCharCode(...bytes));

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
    console.error('Transcription failed:', error);
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
