/**
 * VoiceDraftEditor tests.
 *
 * TipTap (useEditor / EditorContent) is mocked to a simple textarea to avoid
 * ProseMirror / DOM-mutation-observer complexity in jsdom.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceDraftEditor } from './VoiceDraftEditor';
import type { VoiceMemo } from '../../lib/services/voiceMemoService';

// ── voiceMemoService mock ─────────────────────────────────────────────────────
// Inline suggestHashtags to avoid pulling the real module (which imports
// @tauri-apps/api/core) through the factory path.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'was', 'are', 'were',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'this', 'that', 'these',
  'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'she', 'they', 'their',
]);

function suggestHashtagsImpl(transcript: string): string[] {
  if (!transcript) return [];
  return transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 12 && !STOPWORDS.has(w))
    .reduce<string[]>((acc, w) => (acc.includes(w) ? acc : [...acc, w]), [])
    .slice(0, 3)
    .map((w) => `#${w}`);
}

vi.mock('../../lib/services/voiceMemoService', () => ({
  suggestHashtags: vi.fn((t: string) => suggestHashtagsImpl(t)),
}));

// ── TipTap mock ───────────────────────────────────────────────────────────────
// useEditor returns a minimal editor-like object; EditorContent renders a textarea.

let _insertedContent = '';

vi.mock('@tiptap/react', () => {
  const insertContent = vi.fn((text: string) => { _insertedContent += text; });
  const focus = vi.fn();
  const getHTML = vi.fn(() => '<p>Mocked editor content</p>');
  const commands = { insertContent, focus };

  const useEditor = vi.fn(() => ({ commands, getHTML }));

  const EditorContent = ({ editor }: { editor: unknown }) => (
    editor ? <textarea data-testid="tiptap-editor" readOnly value="Mocked editor content" onChange={() => {}} /> : null
  );

  return { useEditor, EditorContent };
});

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: vi.fn(() => ({})) },
}));

// ── Fixture ───────────────────────────────────────────────────────────────────

const BASE_MEMO: VoiceMemo = {
  id: 'memo-2',
  timestamp: new Date('2026-05-31T10:00:00Z').toISOString(),
  duration_ms: 90000,
  health_json: null,
  file_path: 'voice_memos/memo-2.m4a',
  transcription: 'Today I went for a morning run and felt great.',
  rawTranscription: null,
  entry_id: null,
  source: 'watch',
  created_at: new Date('2026-05-31T10:00:00Z').toISOString(),
  context: undefined,
  inferred_mood: 4,
  book_id: 'default',
  reviewed: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  _insertedContent = '';
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('VoiceDraftEditor — close', () => {
  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /close editor/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={vi.fn()}
        onClose={onClose}
      />,
    );
    // The outermost div is the backdrop
    const backdrop = container.firstChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Publish behaviour ─────────────────────────────────────────────────────────

describe('VoiceDraftEditor — publish', () => {
  it('calls onPublish then onClose on success', async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={onPublish}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(onPublish).toHaveBeenCalledTimes(1);
    });
    expect(onPublish).toHaveBeenCalledWith(
      'memo-2',
      '<p>Mocked editor content</p>',
      4,           // inferred_mood default
      'default',   // book_id fallback
      0,           // privacyMode
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when onPublish rejects', async () => {
    const onPublish = vi.fn().mockRejectedValue(new Error('Publish failed'));
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={onPublish}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByText('Publish failed')).toBeInTheDocument();
    });
  });

  it('does not call onClose when onPublish rejects', async () => {
    const onClose = vi.fn();
    const onPublish = vi.fn().mockRejectedValue(new Error('Oops'));
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={onPublish}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses activeBookId over memo.book_id when provided', async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceDraftEditor
        memo={{ ...BASE_MEMO, book_id: 'my-book' }}
        onPublish={onPublish}
        onClose={vi.fn()}
        activeBookId="active-book"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    await waitFor(() => {
      expect(onPublish).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        'active-book',
        0,
      );
    });
  });
});

// ── Hashtag pills ─────────────────────────────────────────────────────────────

describe('VoiceDraftEditor — hashtag suggestion pills', () => {
  it('renders hashtag pills derived from the transcript', () => {
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const pills = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.startsWith('#'),
    );
    expect(pills.length).toBeGreaterThan(0);
  });

  it('clicking a hashtag pill inserts its text into the editor', async () => {
    render(
      <VoiceDraftEditor
        memo={BASE_MEMO}
        onPublish={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const pills = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.startsWith('#'),
    );
    expect(pills.length).toBeGreaterThan(0);

    await userEvent.click(pills[0]);

    // insertContent receives " #tag " — verify it was called with a hashtag
    expect(_insertedContent).toContain('#');
  });

  it('does not render any hashtag pills when transcript is empty', () => {
    render(
      <VoiceDraftEditor
        memo={{ ...BASE_MEMO, transcription: '' }}
        onPublish={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const pills = screen.queryAllByRole('button').filter((btn) =>
      btn.textContent?.startsWith('#'),
    );
    expect(pills.length).toBe(0);
  });
});

// ── Null transcription safety ─────────────────────────────────────────────────

describe('VoiceDraftEditor — null transcription', () => {
  it('renders without crashing when transcription is null', () => {
    expect(() =>
      render(
        <VoiceDraftEditor
          memo={{ ...BASE_MEMO, transcription: null }}
          onPublish={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });

  it('shows the editor area even when transcription is null', () => {
    render(
      <VoiceDraftEditor
        memo={{ ...BASE_MEMO, transcription: null }}
        onPublish={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
  });

  it('does not render hashtag pills when transcription is null', () => {
    render(
      <VoiceDraftEditor
        memo={{ ...BASE_MEMO, transcription: null }}
        onPublish={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const pills = screen.queryAllByRole('button').filter((btn) =>
      btn.textContent?.startsWith('#'),
    );
    expect(pills.length).toBe(0);
  });
});
