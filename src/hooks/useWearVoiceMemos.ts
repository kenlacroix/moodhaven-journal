/**
 * useWearVoiceMemos — Voice memo storage + transcription queue hook (Phase 4)
 *
 * Manages the full lifecycle of watch-originated voice memos:
 *   1. Loads all stored memos from the DB on mount (including any that arrived
 *      while the app was in the background and weren't yet transcribed).
 *   2. Exposes `addMemo()` — call this from useWearSignals's `onVoiceMemo`
 *      callback whenever a new memo is stored so it enters the transcription queue.
 *   3. Automatically transcribes untranscribed memos using the whisper.cpp
 *      sidecar, one at a time, updating the memo list as each completes.
 *
 * Usage:
 *   const { memos, transcribing, addMemo } = useWearVoiceMemos({
 *     model: settings.sttModel ?? 'ggml-tiny.en.bin',
 *     enabled: settings.sttEnabled,
 *   });
 *
 *   // Wire into useWearSignals:
 *   useWearSignals({ ..., onVoiceMemo: addMemo });
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listVoiceMemos,
  transcribeVoiceMemo,
  type VoiceMemo,
} from '../lib/voiceMemoService';

// ── Hook options ───────────────────────────────────────────────────────────────

interface UseWearVoiceMemosOptions {
  /**
   * whisper.cpp model filename (e.g. "ggml-tiny.en.bin").
   * Must be downloaded via Settings → Speech to Text before transcription works.
   */
  model: string;
  /**
   * When false, memos are stored but NOT transcribed automatically.
   * Defaults to true.
   */
  enabled?: boolean;
  /** Called after a memo is successfully transcribed. */
  onTranscribed?: (memo: VoiceMemo) => void;
  /** Called when transcription fails for a memo. */
  onTranscriptionError?: (id: string, error: string) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWearVoiceMemos({
  model,
  enabled = true,
  onTranscribed,
  onTranscriptionError,
}: UseWearVoiceMemosOptions) {
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  /** Set of memo IDs currently being transcribed. */
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());

  const onTranscribedRef = useRef(onTranscribed);
  const onErrorRef = useRef(onTranscriptionError);
  useEffect(() => { onTranscribedRef.current = onTranscribed; }, [onTranscribed]);
  useEffect(() => { onErrorRef.current = onTranscriptionError; }, [onTranscriptionError]);

  // ── Load all memos on mount ──────────────────────────────────────────────

  useEffect(() => {
    listVoiceMemos().then(setMemos).catch(() => { /* non-critical */ });
  }, []);

  // ── Transcribe a single memo by ID ───────────────────────────────────────

  const transcribeMemo = useCallback(async (id: string) => {
    if (!model) return;

    setTranscribing((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const text = await transcribeVoiceMemo(id, model);
      setMemos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, transcription: text } : m))
      );
      // Build the updated memo object for the callback
      setMemos((prev) => {
        const updated = prev.find((m) => m.id === id);
        if (updated) onTranscribedRef.current?.(updated);
        return prev;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onErrorRef.current?.(id, msg);
    } finally {
      setTranscribing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [model]);

  // ── Auto-transcribe untranscribed memos after load ───────────────────────

  const didAutoTranscribe = useRef(false);
  useEffect(() => {
    if (!enabled || !model || didAutoTranscribe.current || memos.length === 0) return;
    didAutoTranscribe.current = true;

    const pending = memos.filter((m) => !m.transcription);
    // Sequential — one at a time to avoid hammering the sidecar
    pending.reduce(
      (chain, memo) => chain.then(() => transcribeMemo(memo.id)),
      Promise.resolve()
    );
  }, [memos, enabled, model, transcribeMemo]);

  // ── Called by useWearSignals.onVoiceMemo for newly-arrived memos ─────────

  const addMemo = useCallback(
    (memo: VoiceMemo) => {
      setMemos((prev) => [memo, ...prev]);
      if (enabled && model && !memo.transcription) {
        transcribeMemo(memo.id);
      }
    },
    [enabled, model, transcribeMemo]
  );

  return { memos, transcribing, addMemo };
}
