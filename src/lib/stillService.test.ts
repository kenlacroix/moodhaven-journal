import { invoke } from '@tauri-apps/api/core';
import {
  stillAbandonSession,
  stillCompleteSession,
  stillCreateSession,
  stillGetJournalBriefForSession,
  stillGetSessionBrief,
  stillGetSessionWithSamples,
  stillGetWellbeingContext,
  stillListSessions,
  stillRecordActivation,
  type JournalBrief,
  type StillActivationSample,
  type StillSession,
  type StillSessionBrief,
  type StillSessionWithSamples,
  type WellbeingContext,
} from './stillService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

const SESSION: StillSession = {
  id: 'sess-1',
  protocol: 'general_activation',
  environment: 'underwater',
  bilateral_mode: 'audio',
  duration_seconds: 600,
  started_at: '2026-05-31T10:00:00Z',
  completed_at: '2026-05-31T10:10:00Z',
  abandoned_at: null,
  created_at: '2026-05-31T10:00:00Z',
};

const SAMPLE: StillActivationSample = {
  id: 1,
  session_id: 'sess-1',
  phase: 'pre',
  activation: 8,
  hrv_manual: null,
  hrv_source: null,
  note: null,
  sampled_at: '2026-05-31T10:00:00Z',
};

describe('stillCreateSession', () => {
  it('invokes still_create_session with correct params', async () => {
    mockInvoke.mockResolvedValue(SESSION);
    const result = await stillCreateSession({
      id: 'sess-1',
      protocol: 'general_activation',
      environment: 'underwater',
      bilateralMode: 'audio',
      durationSeconds: 0,
      startedAt: '2026-05-31T10:00:00Z',
    });
    expect(mockInvoke).toHaveBeenCalledWith('still_create_session', expect.objectContaining({ id: 'sess-1' }));
    expect(result.id).toBe('sess-1');
  });
});

describe('stillRecordActivation', () => {
  it('invokes still_record_activation', async () => {
    mockInvoke.mockResolvedValue(SAMPLE);
    const result = await stillRecordActivation({ sessionId: 'sess-1', phase: 'pre', activation: 8 });
    expect(mockInvoke).toHaveBeenCalledWith('still_record_activation', expect.objectContaining({ sessionId: 'sess-1', activation: 8 }));
    expect(result.activation).toBe(8);
  });
});

describe('stillCompleteSession', () => {
  it('invokes still_complete_session', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await stillCompleteSession({ id: 'sess-1', completedAt: '2026-05-31T10:10:00Z', durationSeconds: 600 });
    expect(mockInvoke).toHaveBeenCalledWith('still_complete_session', expect.objectContaining({ id: 'sess-1' }));
  });
});

describe('stillAbandonSession', () => {
  it('invokes still_abandon_session', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await stillAbandonSession({ id: 'sess-1', abandonedAt: '2026-05-31T10:05:00Z' });
    expect(mockInvoke).toHaveBeenCalledWith('still_abandon_session', { id: 'sess-1', abandonedAt: '2026-05-31T10:05:00Z' });
  });
});

describe('stillListSessions', () => {
  it('returns sessions array', async () => {
    mockInvoke.mockResolvedValue([SESSION]);
    const result = await stillListSessions(10);
    expect(mockInvoke).toHaveBeenCalledWith('still_list_sessions', { limit: 10 });
    expect(result).toHaveLength(1);
  });

  it('passes undefined limit when not provided', async () => {
    mockInvoke.mockResolvedValue([]);
    await stillListSessions();
    expect(mockInvoke).toHaveBeenCalledWith('still_list_sessions', { limit: undefined });
  });
});

describe('stillGetSessionWithSamples', () => {
  it('returns session with samples', async () => {
    const payload: StillSessionWithSamples = { session: SESSION, samples: [SAMPLE] };
    mockInvoke.mockResolvedValue(payload);
    const result = await stillGetSessionWithSamples('sess-1');
    expect(mockInvoke).toHaveBeenCalledWith('still_get_session_with_samples', { id: 'sess-1' });
    expect(result?.samples).toHaveLength(1);
  });

  it('returns null when session not found', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await stillGetSessionWithSamples('missing');
    expect(result).toBeNull();
  });
});

describe('stillGetSessionBrief', () => {
  it('returns brief with activation delta', async () => {
    const brief: StillSessionBrief = {
      protocol: 'general_activation',
      duration_seconds: 600,
      pre_activation: 8,
      post_activation: 3,
    };
    mockInvoke.mockResolvedValue(brief);
    const result = await stillGetSessionBrief('sess-1');
    expect(mockInvoke).toHaveBeenCalledWith('still_get_session_brief', { sessionId: 'sess-1' });
    expect(result?.pre_activation).toBe(8);
    expect(result?.post_activation).toBe(3);
  });

  it('returns null when session not found', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await stillGetSessionBrief('missing');
    expect(result).toBeNull();
  });
});

describe('stillGetJournalBriefForSession', () => {
  it('returns journal brief when entry exists', async () => {
    const brief: JournalBrief = {
      entry_id: 'entry-1',
      mood: 3,
      word_count: 340,
      created_at: '2026-05-31T10:15:00Z',
    };
    mockInvoke.mockResolvedValue(brief);
    const result = await stillGetJournalBriefForSession('sess-1');
    expect(mockInvoke).toHaveBeenCalledWith('still_get_journal_brief_for_session', { sessionId: 'sess-1' });
    expect(result?.word_count).toBe(340);
    expect(result?.mood).toBe(3);
  });

  it('returns null when no linked entry', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await stillGetJournalBriefForSession('no-entry-session');
    expect(result).toBeNull();
  });
});

describe('stillGetWellbeingContext', () => {
  it('returns wellbeing context bundle', async () => {
    const ctx: WellbeingContext = {
      oura_readiness_today: 72,
      last_still_session_days_ago: 2,
      yesterday_mood_avg: 3.2,
      yesterday_entry_count: 2,
      streak_days: 7,
    };
    mockInvoke.mockResolvedValue(ctx);
    const result = await stillGetWellbeingContext();
    expect(mockInvoke).toHaveBeenCalledWith('still_get_wellbeing_context');
    expect(result.oura_readiness_today).toBe(72);
    expect(result.streak_days).toBe(7);
  });

  it('handles null Oura readiness when not connected', async () => {
    const ctx: WellbeingContext = {
      oura_readiness_today: null,
      last_still_session_days_ago: null,
      yesterday_mood_avg: null,
      yesterday_entry_count: 0,
      streak_days: 0,
    };
    mockInvoke.mockResolvedValue(ctx);
    const result = await stillGetWellbeingContext();
    expect(result.oura_readiness_today).toBeNull();
    expect(result.last_still_session_days_ago).toBeNull();
  });
});
