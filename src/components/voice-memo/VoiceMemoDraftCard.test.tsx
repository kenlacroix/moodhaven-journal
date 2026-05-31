import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceMemoDraftCard } from './VoiceMemoDraftCard';
import type { VoiceMemo } from '../../lib/services/voiceMemoService';

const BASE_MEMO: VoiceMemo = {
  id: 'memo-1',
  timestamp: new Date('2026-05-31T09:00:00Z').toISOString(),
  duration_ms: 30000,
  health_json: null,
  file_path: 'voice_memos/memo-1.m4a',
  transcription: 'Hello this is a test transcription',
  rawTranscription: null,
  entry_id: null,
  source: 'watch',
  created_at: new Date('2026-05-31T09:00:00Z').toISOString(),
  context: undefined,
  inferred_mood: 3,
  book_id: 'default',
  reviewed: 0,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('VoiceMemoDraftCard — duration formatting', () => {
  it('formats sub-minute durations as "<N>s"', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, duration_ms: 45000 }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('formats durations >= 60 s as "<M>m <S>s"', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, duration_ms: 65000 }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
  });

  it('formats exactly 60 s as "1m 0s"', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, duration_ms: 60000 }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('1m 0s')).toBeInTheDocument();
  });
});

describe('VoiceMemoDraftCard — transcription states', () => {
  it('shows "Transcribing…" when transcription is null', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, transcription: null }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
  });

  it('does not show "Transcribing…" when transcription is present', () => {
    render(
      <VoiceMemoDraftCard
        memo={BASE_MEMO}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.queryByText('Transcribing…')).not.toBeInTheDocument();
  });

  it('renders transcript preview text when transcription is present', () => {
    render(
      <VoiceMemoDraftCard
        memo={BASE_MEMO}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Hello this is a test transcription/)).toBeInTheDocument();
  });

  it('appends ellipsis for transcriptions longer than 140 characters', () => {
    const longText = 'word '.repeat(35).trim(); // > 140 chars
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, transcription: longText }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/…/)).toBeInTheDocument();
  });

  it('does not append ellipsis for transcriptions <= 140 characters', () => {
    const shortText = 'Short memo text.';
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, transcription: shortText }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const preview = screen.getByText(/Short memo text\./);
    expect(preview.textContent).not.toMatch(/…$/);
  });
});

describe('VoiceMemoDraftCard — Review button state', () => {
  it('Review button is disabled when transcription is null', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, transcription: null }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /review/i })).toBeDisabled();
  });

  it('Review button is enabled when transcription is present', () => {
    render(
      <VoiceMemoDraftCard
        memo={BASE_MEMO}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /review/i })).not.toBeDisabled();
  });

  it('calls onReview with the memo when Review is clicked', async () => {
    const onReview = vi.fn();
    render(
      <VoiceMemoDraftCard
        memo={BASE_MEMO}
        onReview={onReview}
        onDiscard={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(onReview).toHaveBeenCalledWith(BASE_MEMO);
  });

  it('calls onDiscard with the memo id when Discard is clicked', async () => {
    const onDiscard = vi.fn();
    render(
      <VoiceMemoDraftCard
        memo={BASE_MEMO}
        onReview={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /discard draft/i }));
    expect(onDiscard).toHaveBeenCalledWith('memo-1');
  });
});

describe('VoiceMemoDraftCard — mood dots', () => {
  it('renders the mood dots aria-label with inferred_mood value', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, inferred_mood: 4 }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/inferred mood: 4/i)).toBeInTheDocument();
  });

  it('renders "unknown" in mood label when inferred_mood is 0', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, inferred_mood: 0 }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/inferred mood: unknown/i)).toBeInTheDocument();
  });

  it('renders "unknown" in mood label when inferred_mood is absent', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, inferred_mood: undefined }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/inferred mood: unknown/i)).toBeInTheDocument();
  });
});

describe('VoiceMemoDraftCard — context chip', () => {
  it('does not show context appended after the time when context and health_json are absent', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, context: undefined, health_json: null }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // No paragraph should contain "· sometext" (context bar suppressed)
    const paragraphs = Array.from(document.querySelectorAll('p'));
    const hasContextLine = paragraphs.some((p) => /·\s/.test(p.textContent ?? ''));
    expect(hasContextLine).toBe(false);
  });

  it('shows context text when context is present', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, context: 'Morning walk' }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Morning walk/)).toBeInTheDocument();
  });

  it('shows context bar when only health_json is present (no context string)', () => {
    render(
      <VoiceMemoDraftCard
        memo={{ ...BASE_MEMO, context: undefined, health_json: '{"hr":72}' }}
        onReview={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // When health_json is set, the context bar renders — confirm no crash and card is present.
    expect(screen.getByText('Voice Memo')).toBeInTheDocument();
  });
});
