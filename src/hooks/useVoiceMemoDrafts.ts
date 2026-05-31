/**
 * useVoiceMemoDrafts — manage the pending voice memo draft queue.
 *
 * Loads transcribed-but-unreviewed memos, exposes publishDraft (encrypts +
 * promotes to journal_entries) and discardDraft.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listPendingDrafts,
  publishVoiceMemoDraft,
  discardVoiceMemoDraft,
  type VoiceMemo,
} from '../lib/services/voiceMemoService';
import { encrypt } from '../lib/services/crypto';
import type { JournalEntry } from '../types/journal';

interface UseVoiceMemoDraftsResult {
  drafts: VoiceMemo[];
  publishDraft: (
    id: string,
    content: string,
    mood: number,
    bookId: string,
    privacyMode: number,
    password: string,
  ) => Promise<JournalEntry>;
  discardDraft: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useVoiceMemoDrafts(): UseVoiceMemoDraftsResult {
  const [drafts, setDrafts] = useState<VoiceMemo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const pending = await listPendingDrafts();
      setDrafts(pending);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const publishDraft = useCallback(
    async (
      id: string,
      content: string,
      mood: number,
      bookId: string,
      privacyMode: number,
      password: string,
    ): Promise<JournalEntry> => {
      const result = await encrypt(content, password);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Encryption failed');
      }
      const entry = await publishVoiceMemoDraft(id, result.data, mood, bookId, privacyMode);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      return entry;
    },
    [],
  );

  const discardDraft = useCallback(async (id: string) => {
    await discardVoiceMemoDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { drafts, publishDraft, discardDraft, refresh };
}
