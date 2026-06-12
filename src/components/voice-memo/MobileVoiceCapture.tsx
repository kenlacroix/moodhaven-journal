/**
 * MobileVoiceCapture — mobile-only voice memo capture affordance for WritingView.
 *
 * On phones the inline dictation mic is hidden (whisper.cpp sidecar is desktop-only).
 * Instead, the user records a voice memo that is stored UNtranscribed. It will be
 * transcribed later on a paired desktop after peer sync. This is the phone substitute
 * for dictation.
 *
 * Flow:
 *   idle → tap "Record voice memo" → recording (elapsed time + Stop) → on stop the WAV
 *   bytes are base64-encoded and persisted via storeVoiceMemoBytes. A transient
 *   confirmation is shown and the queued list refreshes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { RecordingStrip } from '../editor/EditorRecording';
import {
  storeVoiceMemoBytes,
  listVoiceMemos,
  deleteVoiceMemo,
  type VoiceMemo,
} from '../../lib/services/voiceMemoService';
import { logger } from '../../lib/services/logger';

/**
 * Convert an ArrayBuffer to a base64 string safely for large buffers.
 * `btoa(String.fromCharCode(...new Uint8Array(buf)))` blows the call stack on
 * large arrays, so we round-trip through a Blob → FileReader data URL and strip
 * the `data:...;base64,` prefix.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: 'audio/wav' });
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio bytes'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function formatQueuedDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

export function MobileVoiceCapture() {
  const {
    state,
    error,
    permissionModal,
    elapsedSeconds,
    startRecording,
    proceedAfterConsent,
    dismissPermissionModal,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const [queued, setQueued] = useState<VoiceMemo[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const memos = await listVoiceMemos();
      setQueued(memos.filter((m) => m.transcription == null && m.reviewed === 0));
    } catch (err) {
      logger.error('MobileVoiceCapture: failed to list voice memos', { error: String(err) });
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  // Transient confirmation banner — auto-dismiss after 4s.
  const showConfirmation = useCallback((message: string) => {
    setConfirmation(message);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmation(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleStop = useCallback(async () => {
    const buf = await stopRecording();
    if (!buf) return;

    setSaving(true);
    try {
      const base64 = await arrayBufferToBase64(buf);
      const durationMs = Math.round(elapsedSeconds * 1000);
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      await storeVoiceMemoBytes(id, timestamp, durationMs, base64);
      showConfirmation("Voice memo saved — it'll transcribe on your next desktop sync.");
      await refreshQueue();
    } catch (err) {
      logger.error('MobileVoiceCapture: failed to store voice memo', { error: String(err) });
      showConfirmation('Could not save voice memo. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [stopRecording, elapsedSeconds, showConfirmation, refreshQueue]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteVoiceMemo(id);
      await refreshQueue();
    } catch (err) {
      logger.error('MobileVoiceCapture: failed to delete voice memo', { error: String(err) });
    }
  }, [refreshQueue]);

  const isRecording = state === 'recording';
  const isBusy = state === 'requesting' || state === 'processing' || saving;

  return (
    <div className="px-5 pb-3">
      {/* Active recording strip (reuses STT recording UI) */}
      {isRecording ? (
        <div className="rounded-xl overflow-hidden border border-red-100 dark:border-red-900/30">
          <RecordingStrip
            state="recording"
            elapsedSeconds={elapsedSeconds}
            onStop={() => void handleStop()}
            onCancel={() => cancelRecording()}
          />
        </div>
      ) : (
        /* Idle: record button */
        <button
          type="button"
          onClick={() => void startRecording()}
          disabled={isBusy}
          aria-label="Record voice memo"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
          {isBusy ? 'Saving…' : 'Record voice memo'}
        </button>
      )}

      {/* Mic-permission consent prompt */}
      {permissionModal === 'consent' && (
        <div className="mt-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <p className="mb-2">MoodHaven needs microphone access to record a voice memo.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void proceedAfterConsent()}
              className="px-2.5 py-1 rounded-md bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 transition-colors"
            >
              Allow access
            </button>
            <button
              type="button"
              onClick={dismissPermissionModal}
              className="px-2.5 py-1 rounded-md text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Mic blocked */}
      {permissionModal === 'blocked' && (
        <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <span className="flex-1">Microphone access is blocked. Enable it in your device settings to record voice memos.</span>
          <button
            type="button"
            onClick={dismissPermissionModal}
            className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Recorder error (e.g. no audio captured) */}
      {error && permissionModal === 'none' && !isRecording && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{error}</p>
      )}

      {/* Transient confirmation */}
      {confirmation && (
        <p
          className="mt-2 text-xs text-emerald-600 dark:text-emerald-400"
          role="status"
          aria-live="polite"
        >
          {confirmation}
        </p>
      )}

      {/* Queued (untranscribed) memos */}
      {queued.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Queued for desktop sync
          </p>
          <ul className="space-y-1.5">
            {queued.map((memo) => (
              <li
                key={memo.id}
                className="flex items-center gap-2 rounded-lg bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5 px-3 py-2"
              >
                <span className="text-sky-500 dark:text-sky-400" aria-hidden="true">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </span>
                <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">
                  {new Date(memo.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <span className="text-slate-400 dark:text-slate-500"> · {formatQueuedDuration(memo.duration_ms)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(memo.id)}
                  aria-label="Delete voice memo"
                  className="p-1 rounded-md text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
