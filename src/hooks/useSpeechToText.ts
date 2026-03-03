/**
 * useSpeechToText - Hook for speech-to-text transcription
 *
 * Combines audio recording with whisper.cpp transcription.
 * All processing happens locally on the device.
 */

import { useState, useCallback, useRef } from 'react';
import { useAudioRecorder, type RecordingState } from './useAudioRecorder';
import { transcribeAudio, checkModelStatus } from '../lib/speechToTextService';
import { useSettingsStore } from '../stores/settingsStore';

export type STTState = RecordingState | 'transcribing';

interface UseSpeechToTextResult {
  state: STTState;
  error: string | null;
  isAvailable: boolean;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancel: () => void;
}

export function useSpeechToText(): UseSpeechToTextResult {
  const { state: recorderState, error: recorderError, startRecording: startAudioRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  const settings = useSettingsStore((s) => s.settings.speechToText);
  const checkedRef = useRef(false);

  // Check availability on first use
  const checkAvailability = useCallback(async () => {
    if (checkedRef.current) return isAvailable;
    checkedRef.current = true;

    if (!settings.enabled) {
      setIsAvailable(false);
      return false;
    }

    try {
      const status = await checkModelStatus(settings.model);
      setIsAvailable(status.downloaded);
      return status.downloaded;
    } catch {
      setIsAvailable(false);
      return false;
    }
  }, [settings.enabled, settings.model, isAvailable]);

  const startRecording = useCallback(async () => {
    setTranscribeError(null);

    const available = await checkAvailability();
    if (!available) {
      setTranscribeError('Speech-to-text model not downloaded. Please download it in Settings.');
      return;
    }

    await startAudioRecording();
  }, [checkAvailability, startAudioRecording]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const audioBuffer = await stopRecording();

    if (!audioBuffer) {
      return null;
    }

    setIsTranscribing(true);
    setTranscribeError(null);

    try {
      const result = await transcribeAudio(audioBuffer, settings.model);
      setIsTranscribing(false);
      return result.text;
    } catch (err) {
      setIsTranscribing(false);
      const message = err instanceof Error ? err.message : 'Transcription failed';
      setTranscribeError(message);
      return null;
    }
  }, [stopRecording, settings.model]);

  const cancel = useCallback(() => {
    cancelRecording();
    setIsTranscribing(false);
    setTranscribeError(null);
  }, [cancelRecording]);

  // Compute combined state
  let state: STTState = recorderState;
  if (isTranscribing) {
    state = 'transcribing';
  }

  return {
    state,
    error: transcribeError || recorderError,
    isAvailable: settings.enabled && settings.modelDownloaded,
    startRecording,
    stopAndTranscribe,
    cancel,
  };
}
