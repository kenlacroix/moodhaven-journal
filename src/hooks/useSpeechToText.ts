/**
 * useSpeechToText - Hook for speech-to-text transcription
 *
 * Combines audio recording with whisper.cpp transcription.
 * All processing happens locally on the device.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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

  const settings = useSettingsStore((s) => s.settings.speechToText);
  const checkedRef = useRef(false);
  // Stores the last check result so checkAvailability can return it without
  // closing over the isAvailable state (which would add it to useCallback deps).
  const availabilityResultRef = useRef(false);

  // Reset the cached check whenever the model selection or enabled state changes
  // so the next recording attempt re-validates against the real filesystem.
  useEffect(() => {
    checkedRef.current = false;
    availabilityResultRef.current = false;
  }, [settings.model, settings.enabled]);

  // Check availability on first use (within the current model/enabled config).
  // Does NOT include isAvailable in deps — the result is tracked via ref.
  const checkAvailability = useCallback(async () => {
    if (checkedRef.current) return availabilityResultRef.current;
    checkedRef.current = true;

    if (!settings.enabled) {
      availabilityResultRef.current = false;
      return false;
    }

    try {
      const status = await checkModelStatus(settings.model);
      availabilityResultRef.current = status.downloaded;
      return status.downloaded;
    } catch {
      availabilityResultRef.current = false;
      return false;
    }
  }, [settings.enabled, settings.model]);

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
