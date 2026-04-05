/**
 * useSpeechToText - Hook for speech-to-text transcription
 *
 * Combines audio recording with whisper.cpp transcription.
 * All processing happens locally on the device.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioRecorder, type RecordingState, type MicPermissionModal } from './useAudioRecorder';
import { transcribeAudio, checkModelStatus } from '../lib/services/speechToTextService';
import { formatTranscript } from '../lib/services/aiService';
import { useSettingsStore } from '../stores/settingsStore';

export type STTState = RecordingState | 'transcribing' | 'formatting';

export interface FormattedResult {
  formatted: string;
  raw: string;
  source: 'ollama' | 'openai';
}

interface UseSpeechToTextResult {
  state: STTState;
  error: string | null;
  permissionModal: MicPermissionModal;
  isAvailable: boolean;
  quickCapture: boolean;
  toggleQuickCapture: () => void;
  formattedResult: FormattedResult | null;
  clearFormattedResult: () => void;
  startRecording: () => Promise<void>;
  proceedAfterConsent: () => Promise<void>;
  dismissPermissionModal: () => void;
  stopAndTranscribe: () => Promise<string | null>;
  cancel: () => void;
}

export function useSpeechToText(): UseSpeechToTextResult {
  const {
    state: recorderState,
    error: recorderError,
    permissionModal,
    startRecording: startAudioRecording,
    proceedAfterConsent: proceedAudioAfterConsent,
    dismissPermissionModal,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [quickCapture, setQuickCapture] = useState(false);
  const [formattedResult, setFormattedResult] = useState<FormattedResult | null>(null);

  const settings = useSettingsStore((s) => s.settings.speechToText);
  const aiSettings = useSettingsStore((s) => s.settings.ai);
  const checkedRef = useRef(false);
  // A-05: flag to abort in-flight async chains after cancel() is called
  const cancelledRef = useRef(false);
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

  // Called when the user clicks "Allow access" in the consent modal.
  // Skips the availability re-check (already passed in startRecording).
  const proceedAfterConsent = useCallback(async () => {
    setTranscribeError(null);
    await proceedAudioAfterConsent();
  }, [proceedAudioAfterConsent]);

  const toggleQuickCapture = useCallback(() => {
    setQuickCapture((prev) => !prev);
  }, []);

  const clearFormattedResult = useCallback(() => {
    setFormattedResult(null);
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    cancelledRef.current = false; // A-05: reset at start of each transcription
    const audioBuffer = await stopRecording();

    if (!audioBuffer || cancelledRef.current) {
      return null;
    }

    setIsTranscribing(true);
    setTranscribeError(null);

    let rawText: string;
    try {
      const result = await transcribeAudio(audioBuffer, settings.model);
      rawText = result.text;
      setIsTranscribing(false);
    } catch (err) {
      setIsTranscribing(false);
      const message = err instanceof Error ? err.message : 'Transcription failed';
      setTranscribeError(message);
      return null;
    }

    // A-05: bail if cancel() was called while transcribeAudio was in flight
    if (cancelledRef.current) return null;

    // Quick capture bypasses formatting — return raw text immediately
    if (quickCapture) {
      return rawText;
    }

    const formattingLayer = settings.formatting?.layer ?? 'local';

    // L1 formatting (local) — return immediately, no preview needed
    if (formattingLayer === 'local') {
      try {
        const formatResult = await formatTranscript(rawText, 'standard', {
          layer: 'local',
          cloudConsentGiven: false,
        });
        return formatResult.formatted;
      } catch {
        return rawText;
      }
    }

    // L2 / L3 formatting — show preview overlay after processing
    setIsFormatting(true);
    try {
      const formatResult = await formatTranscript(rawText, 'standard', {
        layer: formattingLayer,
        cloudConsentGiven: settings.formatting?.cloudConsentGiven ?? false,
        ollamaEndpoint: aiSettings.localAI.endpoint || undefined,
        ollamaModel: aiSettings.localAI.model || 'llama2',
        openaiKey: aiSettings.openai.apiKey ?? undefined,
      });
      setIsFormatting(false);

      // A-05: bail if cancel() was called while formatTranscript was in flight
      if (cancelledRef.current) return null;

      if (formatResult.source === 'ollama' || formatResult.source === 'openai') {
        // Store for preview overlay; caller will handle insertion
        setFormattedResult({
          formatted: formatResult.formatted,
          raw: rawText,
          source: formatResult.source,
        });
        return null;
      }

      // Fell back to local — return directly
      return formatResult.formatted;
    } catch (err) {
      setIsFormatting(false);
      if (err instanceof Error && err.message === 'CONSENT_REQUIRED') {
        setTranscribeError('Cloud formatting requires consent. Enable it in Settings → Speech to Text.');
      } else if (err instanceof Error && err.message === 'INVALID_KEY') {
        setTranscribeError('OpenAI key is invalid or revoked. Update it in Settings → Speech to Text.');
      }
      // Fall back to raw on any error
      return rawText;
    }
  }, [stopRecording, settings.model, settings.formatting, quickCapture, aiSettings]);

  const cancel = useCallback(() => {
    cancelledRef.current = true; // A-05: signal any in-flight async chain to abort
    cancelRecording();
    setIsTranscribing(false);
    setIsFormatting(false);
    setTranscribeError(null);
  }, [cancelRecording]);

  // Compute combined state
  let state: STTState = recorderState;
  if (isTranscribing) {
    state = 'transcribing';
  } else if (isFormatting) {
    state = 'formatting';
  }

  return {
    state,
    error: transcribeError || recorderError,
    permissionModal,
    isAvailable: settings.enabled && availabilityResultRef.current,
    quickCapture,
    toggleQuickCapture,
    formattedResult,
    clearFormattedResult,
    startRecording,
    proceedAfterConsent,
    dismissPermissionModal,
    stopAndTranscribe,
    cancel,
  };
}
