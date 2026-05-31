import { renderSessionTemplate, handoffToJournal } from './handoff';
import type { StillSession, StillActivationSample } from '../../lib/stillService';

function makeSession(overrides: Partial<StillSession> = {}): StillSession {
  return {
    id: 'sess-abc',
    protocol: 'general_activation',
    environment: 'underwater',
    bilateral_mode: 'audio',
    duration_seconds: 300,
    started_at: '2026-05-31T10:00:00Z',
    completed_at: '2026-05-31T10:05:00Z',
    abandoned_at: null,
    created_at: '2026-05-31T10:00:00Z',
    ...overrides,
  };
}

function makeSample(phase: 'pre' | 'post', overrides: Partial<StillActivationSample> = {}): StillActivationSample {
  return {
    id: 1,
    session_id: 'sess-abc',
    phase,
    activation: phase === 'pre' ? 7 : 4,
    hrv_manual: null,
    hrv_source: null,
    note: null,
    sampled_at: '2026-05-31T10:00:00Z',
    ...overrides,
  };
}

describe('renderSessionTemplate', () => {
  it('includes session id in hidden marker', () => {
    const html = renderSessionTemplate(makeSession(), makeSample('pre'), makeSample('post'));
    expect(html).toContain('data-still-session-id="sess-abc"');
  });

  it('formats duration in minutes', () => {
    const html = renderSessionTemplate(makeSession({ duration_seconds: 300 }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('5 minutes');
  });

  it('formats duration in seconds when < 60', () => {
    const html = renderSessionTemplate(makeSession({ duration_seconds: 45 }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('45 seconds');
  });

  it('formats mixed duration (minutes + seconds)', () => {
    const html = renderSessionTemplate(makeSession({ duration_seconds: 125 }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('2 minutes 5s');
  });

  it('shows activation delta as "down N" when post < pre', () => {
    const html = renderSessionTemplate(makeSession(), makeSample('pre', { activation: 8 }), makeSample('post', { activation: 5 }));
    expect(html).toContain('down 3');
  });

  it('shows activation delta as "up N" when post > pre', () => {
    const html = renderSessionTemplate(makeSession(), makeSample('pre', { activation: 4 }), makeSample('post', { activation: 7 }));
    expect(html).toContain('up 3');
  });

  it('shows activation delta as "unchanged" when equal', () => {
    const html = renderSessionTemplate(makeSession(), makeSample('pre', { activation: 5 }), makeSample('post', { activation: 5 }));
    expect(html).toContain('unchanged');
  });

  it('includes HRV line when post sample has hrv_manual', () => {
    const html = renderSessionTemplate(
      makeSession(),
      makeSample('pre'),
      makeSample('post', { hrv_manual: 42, hrv_source: 'manual' }),
    );
    expect(html).toContain('42 ms (manual)');
  });

  it('includes pre HRV when only pre sample has hrv', () => {
    const html = renderSessionTemplate(
      makeSession(),
      makeSample('pre', { hrv_manual: 38 }),
      makeSample('post'),
    );
    expect(html).toContain('HRV (pre)');
    expect(html).toContain('38 ms');
  });

  it('skips HRV line when neither sample has hrv', () => {
    const html = renderSessionTemplate(makeSession(), makeSample('pre'), makeSample('post'));
    expect(html).not.toContain('HRV');
  });

  it('includes note when post sample has one', () => {
    const html = renderSessionTemplate(
      makeSession(),
      makeSample('pre'),
      makeSample('post', { note: 'Felt calmer' }),
    );
    expect(html).toContain('Felt calmer');
  });

  it('escapes HTML in note', () => {
    const html = renderSessionTemplate(
      makeSession(),
      makeSample('pre'),
      makeSample('post', { note: '<script>alert("xss")</script>' }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders general_activation as "general grounding"', () => {
    const html = renderSessionTemplate(makeSession({ protocol: 'general_activation' }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('general grounding');
  });

  it('renders fake_danger as "fake danger reset"', () => {
    const html = renderSessionTemplate(makeSession({ protocol: 'fake_danger' }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('fake danger reset');
  });

  it('falls back to replacing underscores for unknown protocol', () => {
    const html = renderSessionTemplate(makeSession({ protocol: 'custom_protocol' }), makeSample('pre'), makeSample('post'));
    expect(html).toContain('custom protocol');
  });
});

describe('handoffToJournal', () => {
  it('calls setPendingHandoffHtml with rendered html', () => {
    const setCurrentView = vi.fn();
    const setPendingHandoffHtml = vi.fn();
    const bumpWritingKey = vi.fn();

    handoffToJournal({
      setCurrentView,
      setPendingHandoffHtml,
      bumpWritingKey,
      session: makeSession(),
      preSample: makeSample('pre'),
      postSample: makeSample('post'),
    });

    expect(setPendingHandoffHtml).toHaveBeenCalledWith(expect.stringContaining('StillHaven'));
    expect(bumpWritingKey).toHaveBeenCalledTimes(1);
    expect(setCurrentView).toHaveBeenCalledWith('writing');
  });

  it('sets view to writing', () => {
    const setCurrentView = vi.fn();
    handoffToJournal({
      setCurrentView,
      setPendingHandoffHtml: vi.fn(),
      bumpWritingKey: vi.fn(),
      session: makeSession(),
      preSample: makeSample('pre'),
      postSample: makeSample('post'),
    });
    expect(setCurrentView).toHaveBeenCalledWith('writing');
  });
});
