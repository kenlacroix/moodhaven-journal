/**
 * useVoiceMemoDrafts tests
 *
 * Covers:
 *   - Initial load calls list_pending_drafts IPC command
 *   - refresh() swallows errors without throwing
 *   - publishDraft() calls publish command and removes draft from state
 *   - discardDraft() calls discard command and removes from state
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useVoiceMemoDrafts } from './useVoiceMemoDrafts';
import type { VoiceMemo } from '../lib/services/voiceMemoService';
import type { JournalEntry } from '../types/journal';

vi.mock('../lib/services/crypto', () => ({
  encrypt: vi.fn(),
}));

import { encrypt } from '../lib/services/crypto';

const mockInvoke = vi.mocked(invoke);
const mockEncrypt = vi.mocked(encrypt);

function makeDraft(overrides: Partial<VoiceMemo> = {}): VoiceMemo {
  return {
    id: 'draft-1',
    timestamp: '2026-05-31T09:00:00Z',
    duration_ms: 15_000,
    health_json: null,
    file_path: 'voice_memos/draft-1.m4a',
    transcription: 'Hello world from the watch',
    rawTranscription: 'Hello world from the watch',
    entry_id: null,
    source: 'watch',
    created_at: '2026-05-31T09:00:00Z',
    book_id: 'default',
    reviewed: 0,
    ...overrides,
  };
}

const fakeEntry: JournalEntry = {
  id: 'entry-new',
  content: '',
  mood: 4,
  privacy_mode: 0,
  location_weather: null,
  book_id: 'default',
  pinned: false,
  created_at: '2026-05-31T09:01:00Z',
  updated_at: '2026-05-31T09:01:00Z',
  tags: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: encrypt succeeds
  mockEncrypt.mockResolvedValue({
    success: true,
    data: { iv: 'iv', data: 'data', salt: 'salt' },
    error: null,
  });
});

// ── Initial load ──────────────────────────────────────────────────────────────

describe('initial load', () => {
  it('calls list_pending_drafts on mount', async () => {
    mockInvoke.mockResolvedValue([]);
    renderHook(() => useVoiceMemoDrafts());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: null })
    );
  });

  it('populates drafts state from IPC response', async () => {
    const draft = makeDraft();
    mockInvoke.mockResolvedValue([draft]);
    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    expect(result.current.drafts[0].id).toBe('draft-1');
  });

  it('handles undefined/null return from IPC gracefully', async () => {
    mockInvoke.mockResolvedValue(null);
    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: null })
    );
    // null returned → setDrafts(null ?? []) → drafts = []
    expect(result.current.drafts).toEqual([]);
  });
});

// ── refresh() ────────────────────────────────────────────────────────────────

describe('refresh()', () => {
  it('re-fetches the draft list', async () => {
    mockInvoke.mockResolvedValue([]);
    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: null })
    );
    const callsBefore = mockInvoke.mock.calls.length;

    await act(async () => { await result.current.refresh(); });

    expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockInvoke).toHaveBeenLastCalledWith('list_pending_drafts', { limit: null });
  });

  it('swallows errors without throwing', async () => {
    mockInvoke.mockResolvedValueOnce([]); // initial load succeeds
    mockInvoke.mockRejectedValueOnce(new Error('DB error')); // refresh fails

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: null })
    );

    // Should not throw
    await expect(
      act(async () => { await result.current.refresh(); })
    ).resolves.not.toThrow();

    // State should remain unchanged after the failed refresh
    expect(result.current.drafts).toEqual([]);
  });
});

// ── publishDraft() ────────────────────────────────────────────────────────────

describe('publishDraft()', () => {
  it('calls publish_voice_memo_draft IPC command', async () => {
    const draft = makeDraft({ id: 'draft-pub' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(fakeEntry); // publish_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await act(async () => {
      await result.current.publishDraft('draft-pub', 'Hello world', 4, 'default', 0, 'password');
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'publish_voice_memo_draft',
      expect.objectContaining({ id: 'draft-pub', mood: 4, bookId: 'default', privacyMode: 0 })
    );
  });

  it('removes the draft from state after publish', async () => {
    const draft = makeDraft({ id: 'draft-remove' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(fakeEntry); // publish_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await act(async () => {
      await result.current.publishDraft('draft-remove', 'content', 3, 'default', 0, 'pw');
    });

    expect(result.current.drafts.find((d) => d.id === 'draft-remove')).toBeUndefined();
  });

  it('encrypts content before sending to IPC', async () => {
    const draft = makeDraft({ id: 'draft-enc' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(fakeEntry); // publish_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await act(async () => {
      await result.current.publishDraft('draft-enc', 'secret content', 4, 'default', 0, 'mypassword');
    });

    expect(mockEncrypt).toHaveBeenCalledWith('secret content', 'mypassword');
  });

  it('throws when encryption fails', async () => {
    const draft = makeDraft({ id: 'draft-enc-fail' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockEncrypt.mockResolvedValueOnce({ success: false, data: null, error: 'Bad key' });

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await expect(
      act(async () => {
        await result.current.publishDraft('draft-enc-fail', 'content', 3, 'default', 0, 'pw');
      })
    ).rejects.toThrow('Bad key');
  });

  it('returns the created journal entry', async () => {
    const draft = makeDraft({ id: 'draft-ret' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(fakeEntry); // publish_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    let returnedEntry!: JournalEntry;
    await act(async () => {
      returnedEntry = await result.current.publishDraft('draft-ret', 'text', 4, 'default', 0, 'pw');
    });

    expect(returnedEntry.id).toBe('entry-new');
  });
});

// ── discardDraft() ────────────────────────────────────────────────────────────

describe('discardDraft()', () => {
  it('calls discard_voice_memo_draft IPC command with correct id', async () => {
    const draft = makeDraft({ id: 'draft-discard' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(undefined); // discard_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await act(async () => {
      await result.current.discardDraft('draft-discard');
    });

    expect(mockInvoke).toHaveBeenCalledWith('discard_voice_memo_draft', { id: 'draft-discard' });
  });

  it('removes the discarded draft from state', async () => {
    const draft = makeDraft({ id: 'draft-gone' });
    mockInvoke.mockResolvedValueOnce([draft]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(undefined); // discard_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));

    await act(async () => {
      await result.current.discardDraft('draft-gone');
    });

    expect(result.current.drafts.find((d) => d.id === 'draft-gone')).toBeUndefined();
  });

  it('does not remove other drafts when discarding one', async () => {
    const draft1 = makeDraft({ id: 'draft-keep' });
    const draft2 = makeDraft({ id: 'draft-gone2' });
    mockInvoke.mockResolvedValueOnce([draft1, draft2]); // list_pending_drafts
    mockInvoke.mockResolvedValueOnce(undefined); // discard_voice_memo_draft

    const { result } = renderHook(() => useVoiceMemoDrafts());
    await waitFor(() => expect(result.current.drafts).toHaveLength(2));

    await act(async () => {
      await result.current.discardDraft('draft-gone2');
    });

    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].id).toBe('draft-keep');
  });
});
