import { cleanTranscript } from './transcriptFormatter';
import type { WhisperSegment } from './transcriptFormatter';

describe('cleanTranscript', () => {
  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns empty string for empty input', () => {
    expect(cleanTranscript('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(cleanTranscript('   ')).toBe('');
  });

  it('returns empty string for filler-only input', () => {
    // "um uh er" after filler removal becomes empty
    expect(cleanTranscript('um uh er')).toBe('');
  });

  // ── Filler removal ─────────────────────────────────────────────────────────

  it('removes standalone filler words', () => {
    expect(cleanTranscript('I um went to the store')).toBe('I went to the store');
  });

  it('removes uh', () => {
    expect(cleanTranscript('uh I think so')).toBe('I think so');
  });

  it('removes hmm', () => {
    expect(cleanTranscript('hmm that is interesting')).toBe('that is interesting');
  });

  it('removes "you know"', () => {
    expect(cleanTranscript('I was you know really tired')).toBe('I was really tired');
  });

  it('removes "I mean"', () => {
    expect(cleanTranscript('I mean it was great')).toBe('it was great');
  });

  it('removes "kind of"', () => {
    expect(cleanTranscript('I kind of felt good')).toBe('I felt good');
  });

  it('removes "sort of"', () => {
    expect(cleanTranscript('it was sort of okay')).toBe('it was okay');
  });

  // ── False-start collapse ───────────────────────────────────────────────────

  it('collapses false starts with 2-word repeat', () => {
    const result = cleanTranscript('I went I went to the store');
    // Should contain "I went to the store" (de-duped)
    expect(result).toContain('I went');
    expect(result).not.toMatch(/I went I went/);
  });

  // ── Consecutive repetition ─────────────────────────────────────────────────

  it('collapses consecutive word repetitions', () => {
    const result = cleanTranscript('I I I went');
    expect(result).not.toMatch(/I I/);
    expect(result).toContain('I');
    expect(result).toContain('went');
  });

  it('collapses double word repetition', () => {
    const result = cleanTranscript('the the cat sat');
    expect(result).not.toMatch(/the the/);
  });

  // ── Paragraph breaks from segments ────────────────────────────────────────

  it('inserts paragraph break where segment gap exceeds 2 seconds', () => {
    const segments: WhisperSegment[] = [
      { text: 'First sentence here.', start: 0, end: 2 },
      { text: 'Second paragraph here.', start: 4.5, end: 6.5 }, // 2.5s gap
    ];
    const result = cleanTranscript('First sentence here. Second paragraph here.', segments);
    expect(result).toContain('\n\n');
    const parts = result.split('\n\n');
    expect(parts.length).toBe(2);
  });

  it('does NOT insert paragraph break for gap <= 2 seconds', () => {
    const segments: WhisperSegment[] = [
      { text: 'Hello there.', start: 0, end: 1 },
      { text: 'How are you.', start: 2.8, end: 4 }, // 1.8s gap — under threshold
    ];
    const result = cleanTranscript('Hello there. How are you.', segments);
    expect(result).not.toContain('\n\n');
  });

  it('handles no segments — just text cleanup, no paragraph detection', () => {
    const result = cleanTranscript('um hello uh world');
    expect(result).not.toContain('\n');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('handles empty segments array — just text cleanup', () => {
    const result = cleanTranscript('um hello uh world', []);
    expect(result).toContain('hello');
    expect(result).toContain('world');
    expect(result).not.toContain('\n\n');
  });

  // ── Meaning preservation ───────────────────────────────────────────────────

  it('preserves meaningful words while removing fillers', () => {
    const input = 'Today was um a really good day I mean the weather was great';
    const result = cleanTranscript(input);
    expect(result).toContain('Today');
    expect(result).toContain('good day');
    expect(result).toContain('weather');
    expect(result).not.toContain(' um ');
  });
});
