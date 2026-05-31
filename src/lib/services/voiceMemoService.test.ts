import {
  storeVoiceMemo,
  listVoiceMemos,
  getVoiceMemo,
  deleteVoiceMemo,
  patchVoiceMemoTranscription,
  patchVoiceMemoMood,
  transcribeVoiceMemo,
  linkVoiceMemoToEntry,
  publishVoiceMemoDraft,
  discardVoiceMemoDraft,
  listPendingDrafts,
  formatDuration,
  suggestHashtags,
  type VoiceMemo,
} from './voiceMemoService';

import { invoke } from '@tauri-apps/api/core';
import type { EncryptedData } from './crypto';
import type { JournalEntry } from '../../types/journal';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Shared fixtures ───────────────────────────────────────────────────────────

const fakeMemo: VoiceMemo = {
  id: 'memo-1',
  timestamp: '2026-05-31T10:00:00Z',
  duration_ms: 12_000,
  health_json: null,
  file_path: 'voice_memos/memo-1.m4a',
  transcription: null,
  rawTranscription: null,
  entry_id: null,
  source: 'watch',
  created_at: '2026-05-31T10:00:00Z',
  book_id: 'default',
  reviewed: 0,
};

const fakeEncryptedData: EncryptedData = {
  iv: 'aaaaaa',
  data: 'bbbbbb',
  salt: 'cccccc',
};

// ── IPC wrappers ──────────────────────────────────────────────────────────────

describe('storeVoiceMemo', () => {
  it('invokes store_voice_memo with the correct payload', async () => {
    mockInvoke.mockResolvedValue(fakeMemo);
    const params = {
      id: 'memo-1',
      timestamp: '2026-05-31T10:00:00Z',
      durationMs: 12_000,
      healthJson: null,
      incomingFile: 'incoming-1.m4a',
    };
    const result = await storeVoiceMemo(params);
    expect(mockInvoke).toHaveBeenCalledWith('store_voice_memo', params);
    expect(result).toEqual(fakeMemo);
  });

  it('passes healthJson when provided', async () => {
    mockInvoke.mockResolvedValue(fakeMemo);
    const params = {
      id: 'memo-2',
      timestamp: '2026-05-31T11:00:00Z',
      durationMs: 5_000,
      healthJson: '{"hr":72}',
      incomingFile: 'incoming-2.m4a',
    };
    await storeVoiceMemo(params);
    expect(mockInvoke).toHaveBeenCalledWith('store_voice_memo', params);
  });
});

describe('listVoiceMemos', () => {
  it('invokes list_voice_memos with limit null when omitted', async () => {
    mockInvoke.mockResolvedValue([fakeMemo]);
    const result = await listVoiceMemos();
    expect(mockInvoke).toHaveBeenCalledWith('list_voice_memos', { limit: null });
    expect(result).toEqual([fakeMemo]);
  });

  it('passes explicit limit when provided', async () => {
    mockInvoke.mockResolvedValue([]);
    await listVoiceMemos(10);
    expect(mockInvoke).toHaveBeenCalledWith('list_voice_memos', { limit: 10 });
  });

  it('returns empty array when no memos exist', async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await listVoiceMemos();
    expect(result).toEqual([]);
  });
});

describe('getVoiceMemo', () => {
  it('invokes get_voice_memo with the correct id', async () => {
    mockInvoke.mockResolvedValue(fakeMemo);
    const result = await getVoiceMemo('memo-1');
    expect(mockInvoke).toHaveBeenCalledWith('get_voice_memo', { id: 'memo-1' });
    expect(result).toEqual(fakeMemo);
  });

  it('returns null when memo is not found', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await getVoiceMemo('missing-id');
    expect(result).toBeNull();
  });
});

describe('deleteVoiceMemo', () => {
  it('invokes delete_voice_memo with the correct id', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteVoiceMemo('memo-1');
    expect(mockInvoke).toHaveBeenCalledWith('delete_voice_memo', { id: 'memo-1' });
  });
});

describe('patchVoiceMemoTranscription', () => {
  it('invokes patch_voice_memo_transcription with id and transcription text', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await patchVoiceMemoTranscription('memo-1', 'Hello world');
    expect(mockInvoke).toHaveBeenCalledWith('patch_voice_memo_transcription', {
      id: 'memo-1',
      transcription: 'Hello world',
    });
  });
});

describe('patchVoiceMemoMood', () => {
  it('invokes patch_voice_memo_mood with id and inferredMood', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await patchVoiceMemoMood('memo-1', 4);
    expect(mockInvoke).toHaveBeenCalledWith('patch_voice_memo_mood', {
      id: 'memo-1',
      inferredMood: 4,
    });
  });
});

describe('transcribeVoiceMemo', () => {
  it('invokes transcribe_voice_memo with id and model', async () => {
    mockInvoke.mockResolvedValue('Transcribed text');
    const result = await transcribeVoiceMemo('memo-1', 'ggml-base.en.bin');
    expect(mockInvoke).toHaveBeenCalledWith('transcribe_voice_memo', {
      id: 'memo-1',
      model: 'ggml-base.en.bin',
    });
    expect(result).toBe('Transcribed text');
  });
});

describe('linkVoiceMemoToEntry', () => {
  it('invokes link_voice_memo_to_entry with memoId and entryId', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await linkVoiceMemoToEntry('memo-1', 'entry-abc');
    expect(mockInvoke).toHaveBeenCalledWith('link_voice_memo_to_entry', {
      memoId: 'memo-1',
      entryId: 'entry-abc',
    });
  });
});

describe('publishVoiceMemoDraft', () => {
  it('invokes publish_voice_memo_draft with all required args', async () => {
    const fakeEntry = { id: 'entry-1' } as JournalEntry;
    mockInvoke.mockResolvedValue(fakeEntry);
    const result = await publishVoiceMemoDraft('memo-1', fakeEncryptedData, 4, 'default', 0);
    expect(mockInvoke).toHaveBeenCalledWith('publish_voice_memo_draft', {
      id: 'memo-1',
      encryptedContent: fakeEncryptedData,
      mood: 4,
      bookId: 'default',
      privacyMode: 0,
    });
    expect(result).toEqual(fakeEntry);
  });
});

describe('discardVoiceMemoDraft', () => {
  it('invokes discard_voice_memo_draft with the correct id', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await discardVoiceMemoDraft('memo-1');
    expect(mockInvoke).toHaveBeenCalledWith('discard_voice_memo_draft', { id: 'memo-1' });
  });
});

describe('listPendingDrafts', () => {
  it('invokes list_pending_drafts with limit null when omitted', async () => {
    mockInvoke.mockResolvedValue([fakeMemo]);
    const result = await listPendingDrafts();
    expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: null });
    expect(result).toEqual([fakeMemo]);
  });

  it('passes explicit limit when provided', async () => {
    mockInvoke.mockResolvedValue([]);
    await listPendingDrafts(5);
    expect(mockInvoke).toHaveBeenCalledWith('list_pending_drafts', { limit: 5 });
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats exactly 1 minute as 1:00', () => {
    expect(formatDuration(60_000)).toBe('1:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatDuration(90_000)).toBe('1:30');
  });

  it('formats 9 seconds with leading zero on seconds', () => {
    expect(formatDuration(9_000)).toBe('0:09');
  });

  it('formats 10 minutes as 10:00', () => {
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('truncates sub-second ms without rounding up', () => {
    expect(formatDuration(59_999)).toBe('0:59');
  });
});

// ── suggestHashtags ───────────────────────────────────────────────────────────

describe('suggestHashtags', () => {
  it('returns empty array for empty string', () => {
    expect(suggestHashtags('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(suggestHashtags('   ')).toEqual([]);
  });

  it('filters out stopwords', () => {
    const result = suggestHashtags('the morning is calm and peaceful today');
    expect(result).not.toContain('#the');
    expect(result).not.toContain('#and');
    expect(result).not.toContain('#is');
  });

  it('filters words shorter than 3 characters', () => {
    // All words in "go do it" are 2 chars or less — none should appear
    const result = suggestHashtags('go do it now');
    result.forEach((tag) => expect(tag.slice(1).length).toBeGreaterThanOrEqual(3));
  });

  it('filters words longer than 12 characters', () => {
    // "internationalization" = 20 chars — should be filtered
    const result = suggestHashtags('internationalization extraordinaire');
    expect(result).toEqual([]);
  });

  it('deduplicates repeated words', () => {
    const result = suggestHashtags('morning morning morning feels great morning');
    const morningTags = result.filter((t) => t === '#morning');
    expect(morningTags.length).toBe(1);
  });

  it('returns at most 3 hashtags', () => {
    const result = suggestHashtags(
      'running hiking cycling swimming climbing surfing skiing'
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('formats results with # prefix', () => {
    const result = suggestHashtags('morning meditation exercise');
    result.forEach((tag) => expect(tag).toMatch(/^#[a-z]+$/));
  });

  it('lowercases all output', () => {
    const result = suggestHashtags('Morning Exercise Meditation');
    result.forEach((tag) => expect(tag).toBe(tag.toLowerCase()));
  });

  it('returns first 3 qualifying words in order', () => {
    const result = suggestHashtags('calm peaceful joyful creative relaxed');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('#calm');
    expect(result[1]).toBe('#peaceful');
    expect(result[2]).toBe('#joyful');
  });

  it('handles punctuation by stripping non-alpha characters', () => {
    const result = suggestHashtags('great! amazing, wonderful.');
    expect(result).toContain('#great');
    expect(result).toContain('#amazing');
  });
});
