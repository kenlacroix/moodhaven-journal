/**
 * useOuraContext — pure function tests
 *
 * Only tests the two exported pure functions:
 *   - buildMergedContext
 *   - buildHealthSummary
 *
 * The hook itself (useOuraContext) is not tested here because it depends on
 * Zustand stores and Tauri IPC.
 */

import { buildMergedContext, buildHealthSummary } from './useOuraContext';
import type { OuraHealthContext } from '../types/oura';

// ============================================================================
// Fixture helper
// ============================================================================

function makeCtx(date: string, overrides: Partial<OuraHealthContext> = {}): OuraHealthContext {
  return {
    date,
    sleepScore: null,
    sleepTotalMinutes: null,
    sleepRemMinutes: null,
    sleepDeepMinutes: null,
    sleepEfficiency: null,
    readinessScore: null,
    activityScore: null,
    activeCalories: null,
    steps: null,
    stressSummary: null,
    stressHighMinutes: null,
    recoveryHighMinutes: null,
    avgSpo2: null,
    fetchedAt: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}

// ============================================================================
// Date pinning
// today = 2026-05-31, yesterday = 2026-05-30
// ============================================================================

const TODAY = '2026-05-31';
const YESTERDAY = '2026-05-30';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-31T10:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

// ============================================================================
// buildMergedContext
// ============================================================================

describe('buildMergedContext', () => {
  it('returns null for an empty history array', () => {
    expect(buildMergedContext([])).toBeNull();
  });

  it('returns today entry as base when only today is present', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 82, readinessScore: 78 });
    const result = buildMergedContext([ctx]);
    expect(result).not.toBeNull();
    expect(result!.date).toBe(TODAY);
    expect(result!.sleepScore).toBe(82);
    expect(result!.readinessScore).toBe(78);
  });

  it('preserves base activityScore when no yesterday entry exists', () => {
    const ctx = makeCtx(TODAY, { activityScore: 70, steps: 8000 });
    const result = buildMergedContext([ctx]);
    expect(result!.activityScore).toBe(70);
    expect(result!.steps).toBe(8000);
  });

  it('falls back to last array entry when today is not present', () => {
    const older = makeCtx('2026-05-29', { sleepScore: 60 });
    const result = buildMergedContext([older]);
    expect(result!.date).toBe('2026-05-29');
    expect(result!.sleepScore).toBe(60);
  });

  it('uses last entry in array as base when history has multiple non-today entries', () => {
    const a = makeCtx('2026-05-28', { sleepScore: 50 });
    const b = makeCtx('2026-05-29', { sleepScore: 75 });
    const result = buildMergedContext([a, b]);
    // b is last in array → used as base
    expect(result!.date).toBe('2026-05-29');
    expect(result!.sleepScore).toBe(75);
  });

  it('takes activityScore from yesterday when both today and yesterday are present', () => {
    const todayCtx = makeCtx(TODAY, { sleepScore: 88, activityScore: 55 });
    const prevCtx = makeCtx(YESTERDAY, { activityScore: 91 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.activityScore).toBe(91);
  });

  it('takes activeCalories from yesterday', () => {
    const todayCtx = makeCtx(TODAY, { activeCalories: 200 });
    const prevCtx = makeCtx(YESTERDAY, { activeCalories: 450 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.activeCalories).toBe(450);
  });

  it('takes steps from yesterday', () => {
    const todayCtx = makeCtx(TODAY, { steps: 3000 });
    const prevCtx = makeCtx(YESTERDAY, { steps: 12500 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.steps).toBe(12500);
  });

  it('takes stressSummary from yesterday', () => {
    const todayCtx = makeCtx(TODAY, { stressSummary: 'normal' });
    const prevCtx = makeCtx(YESTERDAY, { stressSummary: 'restored' });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.stressSummary).toBe('restored');
  });

  it('takes stressHighMinutes from yesterday', () => {
    const todayCtx = makeCtx(TODAY, { stressHighMinutes: 10 });
    const prevCtx = makeCtx(YESTERDAY, { stressHighMinutes: 45 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.stressHighMinutes).toBe(45);
  });

  it('takes recoveryHighMinutes from yesterday', () => {
    const todayCtx = makeCtx(TODAY, { recoveryHighMinutes: 30 });
    const prevCtx = makeCtx(YESTERDAY, { recoveryHighMinutes: 120 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.recoveryHighMinutes).toBe(120);
  });

  it('keeps base activityScore when yesterday activityScore is null', () => {
    const todayCtx = makeCtx(TODAY, { activityScore: 66 });
    const prevCtx = makeCtx(YESTERDAY, { activityScore: null });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.activityScore).toBe(66);
  });

  it('keeps base stressSummary when yesterday stressSummary is null', () => {
    const todayCtx = makeCtx(TODAY, { stressSummary: 'demanding' });
    const prevCtx = makeCtx(YESTERDAY, { stressSummary: null });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.stressSummary).toBe('demanding');
  });

  it('preserves sleep/readiness/SpO2 from today even when yesterday entry exists', () => {
    const todayCtx = makeCtx(TODAY, { sleepScore: 90, readinessScore: 88, avgSpo2: 98.5 });
    const prevCtx = makeCtx(YESTERDAY, { sleepScore: 60, readinessScore: 55, avgSpo2: 96.0 });
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.sleepScore).toBe(90);
    expect(result!.readinessScore).toBe(88);
    expect(result!.avgSpo2).toBe(98.5);
  });

  it('result date matches today when today is in history', () => {
    const todayCtx = makeCtx(TODAY);
    const prevCtx = makeCtx(YESTERDAY);
    const result = buildMergedContext([prevCtx, todayCtx]);
    expect(result!.date).toBe(TODAY);
  });
});

// ============================================================================
// buildHealthSummary — badges
// ============================================================================

describe('buildHealthSummary — sleep badge', () => {
  it('returns "Great" / good when sleepScore >= 85', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 90 });
    const { badges } = buildHealthSummary(ctx);
    const sleep = badges.find((b) => b.label === 'Sleep');
    expect(sleep).toBeDefined();
    expect(sleep!.value).toContain('Great');
    expect(sleep!.sentiment).toBe('good');
    expect(sleep!.icon).toBe('😴');
  });

  it('returns "Great" / good at exactly 85', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 85 });
    const { badges } = buildHealthSummary(ctx);
    const sleep = badges.find((b) => b.label === 'Sleep');
    expect(sleep!.value).toContain('Great');
    expect(sleep!.sentiment).toBe('good');
  });

  it('returns "Good" / neutral when sleepScore is 70–84', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 75 });
    const { badges } = buildHealthSummary(ctx);
    const sleep = badges.find((b) => b.label === 'Sleep');
    expect(sleep!.value).toContain('Good');
    expect(sleep!.sentiment).toBe('neutral');
  });

  it('returns "Good" / neutral at exactly 70', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 70 });
    const { badges } = buildHealthSummary(ctx);
    const sleep = badges.find((b) => b.label === 'Sleep');
    expect(sleep!.value).toContain('Good');
    expect(sleep!.sentiment).toBe('neutral');
  });

  it('returns "Restless" / low when sleepScore < 70', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 55 });
    const { badges } = buildHealthSummary(ctx);
    const sleep = badges.find((b) => b.label === 'Sleep');
    expect(sleep!.value).toContain('Restless');
    expect(sleep!.sentiment).toBe('low');
  });

  it('produces no sleep badge when sleepScore is null', () => {
    const ctx = makeCtx(TODAY, { sleepScore: null });
    const { badges } = buildHealthSummary(ctx);
    expect(badges.find((b) => b.label === 'Sleep')).toBeUndefined();
  });

  it('includes the numeric score in the badge value', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 78 });
    const { badges } = buildHealthSummary(ctx);
    expect(badges.find((b) => b.label === 'Sleep')!.value).toMatch(/78/);
  });
});

describe('buildHealthSummary — readiness badge', () => {
  it('returns "High" / good when readinessScore >= 85', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 92 });
    const { badges } = buildHealthSummary(ctx);
    const r = badges.find((b) => b.label === 'Readiness');
    expect(r!.value).toContain('High');
    expect(r!.sentiment).toBe('good');
    expect(r!.icon).toBe('⚡');
  });

  it('returns "Moderate" / neutral when readinessScore is 70–84', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 72 });
    const { badges } = buildHealthSummary(ctx);
    const r = badges.find((b) => b.label === 'Readiness');
    expect(r!.value).toContain('Moderate');
    expect(r!.sentiment).toBe('neutral');
  });

  it('returns "Low" / low when readinessScore < 70', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 58 });
    const { badges } = buildHealthSummary(ctx);
    const r = badges.find((b) => b.label === 'Readiness');
    expect(r!.value).toContain('Low');
    expect(r!.sentiment).toBe('low');
  });

  it('produces no readiness badge when readinessScore is null', () => {
    const ctx = makeCtx(TODAY, { readinessScore: null });
    const { badges } = buildHealthSummary(ctx);
    expect(badges.find((b) => b.label === 'Readiness')).toBeUndefined();
  });
});

describe('buildHealthSummary — stress badge', () => {
  it('returns "Restored" / good for stressSummary=restored', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'restored' });
    const { badges } = buildHealthSummary(ctx);
    const s = badges.find((b) => b.label === 'Stress');
    expect(s!.value).toBe('Restored');
    expect(s!.sentiment).toBe('good');
    expect(s!.icon).toBe('🌿');
  });

  it('returns "Normal" / neutral for stressSummary=normal', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'normal' });
    const { badges } = buildHealthSummary(ctx);
    const s = badges.find((b) => b.label === 'Stress');
    expect(s!.value).toBe('Normal');
    expect(s!.sentiment).toBe('neutral');
  });

  it('returns "Stressful" / low for stressSummary=stressful', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'stressful' });
    const { badges } = buildHealthSummary(ctx);
    const s = badges.find((b) => b.label === 'Stress');
    expect(s!.value).toBe('Stressful');
    expect(s!.sentiment).toBe('low');
  });

  it('returns "Demanding" / low for stressSummary=demanding', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'demanding' });
    const { badges } = buildHealthSummary(ctx);
    const s = badges.find((b) => b.label === 'Stress');
    expect(s!.value).toBe('Demanding');
    expect(s!.sentiment).toBe('low');
  });

  it('returns "Engaged" / neutral for stressSummary=engaged', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'engaged' });
    const { badges } = buildHealthSummary(ctx);
    const s = badges.find((b) => b.label === 'Stress');
    expect(s!.value).toBe('Engaged');
    expect(s!.sentiment).toBe('neutral');
  });

  it('produces no stress badge when stressSummary is null', () => {
    const ctx = makeCtx(TODAY, { stressSummary: null });
    const { badges } = buildHealthSummary(ctx);
    expect(badges.find((b) => b.label === 'Stress')).toBeUndefined();
  });
});

describe('buildHealthSummary — badges array ordering and completeness', () => {
  it('returns all three badges when all scores are present', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 80, readinessScore: 80, stressSummary: 'normal' });
    const { badges } = buildHealthSummary(ctx);
    expect(badges).toHaveLength(3);
    expect(badges.map((b) => b.label)).toEqual(['Sleep', 'Readiness', 'Stress']);
  });

  it('returns empty badges array when all scores are null', () => {
    const ctx = makeCtx(TODAY);
    const { badges } = buildHealthSummary(ctx);
    expect(badges).toHaveLength(0);
  });
});

// ============================================================================
// buildHealthSummary — headline
// ============================================================================

describe('buildHealthSummary — headline', () => {
  it('starts with "High readiness" when readiness >= 85', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 88 });
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toMatch(/^High readiness/);
  });

  it('starts with "Moderate readiness" when readiness is 70–84', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 74 });
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toMatch(/^Moderate readiness/);
  });

  it('starts with "Low readiness" when readiness < 70', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 60 });
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toMatch(/^Low readiness/);
  });

  it('appends stress summary when present', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 88, stressSummary: 'normal' });
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toContain('normal stress');
  });

  it('appends sleep label instead of stress when stressSummary is null', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 88, sleepScore: 90 });
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toContain('great sleep');
  });

  it('uses "Decent sleep" label for sleep 70–84', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 75 });
    const { headline } = buildHealthSummary(ctx);
    // First (and only) part is capitalized by buildHeadline
    expect(headline).toContain('Decent sleep');
  });

  it('uses "Restless night" label for sleep < 70', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 55 });
    const { headline } = buildHealthSummary(ctx);
    // First (and only) part is capitalized by buildHeadline
    expect(headline).toContain('Restless night');
  });

  it('capitalizes first word of headline', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 88 });
    const { headline } = buildHealthSummary(ctx);
    expect(headline[0]).toBe(headline[0].toUpperCase());
  });

  it('returns "Health data available" when all relevant fields are null', () => {
    const ctx = makeCtx(TODAY);
    const { headline } = buildHealthSummary(ctx);
    expect(headline).toBe('Health data available');
  });

  it('prefers stress label over sleep label when both are present', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 90, stressSummary: 'stressful' });
    const { headline } = buildHealthSummary(ctx);
    // stressSummary is the sole part, so it is capitalized → "Stressful stress"
    expect(headline).toContain('Stressful stress');
    expect(headline).not.toContain('sleep');
  });
});

// ============================================================================
// buildHealthSummary — promptModifiers
// ============================================================================

describe('buildHealthSummary — promptModifiers', () => {
  it('returns [] when history has 0 entries', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 60, readinessScore: 60 });
    const { promptModifiers } = buildHealthSummary(ctx, []);
    expect(promptModifiers).toEqual([]);
  });

  it('returns [] when history has 2 entries (below threshold)', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 60 });
    const history = [makeCtx('2026-05-29', { sleepScore: 55 }), makeCtx(YESTERDAY, { sleepScore: 58 })];
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toEqual([]);
  });

  it('returns current-state modifier for poor sleep with 3 days of history', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 55 });
    const history = Array.from({ length: 3 }, (_, i) =>
      makeCtx(`2026-05-${28 + i}`, { sleepScore: 58 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user had a restless night and may feel tired');
  });

  it('returns current-state modifier for great sleep with 3 days of history', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 88 });
    const history = Array.from({ length: 3 }, (_, i) =>
      makeCtx(`2026-05-${28 + i}`, { sleepScore: 90 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user is well rested');
  });

  it('returns current-state modifier for low energy with 3 days of history', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 60 });
    const history = Array.from({ length: 3 }, (_, i) =>
      makeCtx(`2026-05-${28 + i}`, { readinessScore: 62 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has low energy today');
  });

  it('returns current-state modifier for high energy with 3 days of history', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 90 });
    const history = Array.from({ length: 4 }, (_, i) =>
      makeCtx(`2026-05-${27 + i}`, { readinessScore: 88 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user is feeling energized');
  });

  it('returns elevated stress modifier for stressful with 4 days of history', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'stressful' });
    const history = Array.from({ length: 4 }, (_, i) =>
      makeCtx(`2026-05-${27 + i}`, { stressSummary: 'normal' })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user experienced elevated stress recently');
  });

  it('returns elevated stress modifier for demanding with 4 days of history', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'demanding' });
    const history = Array.from({ length: 4 }, (_, i) =>
      makeCtx(`2026-05-${27 + i}`, { stressSummary: 'normal' })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user experienced elevated stress recently');
  });

  it('returns restored modifier when stressSummary=restored with 3 days of history', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'restored' });
    const history = Array.from({ length: 3 }, (_, i) =>
      makeCtx(`2026-05-${28 + i}`, { stressSummary: 'normal' })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user is in a good recovery state');
  });

  it('uses trend-aware sleep modifier at 7 days when avg sleep < 70', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 60 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { sleepScore: 62 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has been sleeping poorly this week');
    expect(promptModifiers).not.toContain('the user had a restless night and may feel tired');
  });

  it('uses trend-aware sleep modifier at 7 days when avg sleep >= 85', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 90 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { sleepScore: 88 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has been sleeping well this week');
  });

  it('uses trend-aware readiness modifier at 7 days when avg readiness < 70', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 60 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { readinessScore: 62 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has had low energy levels this week');
  });

  it('uses trend-aware readiness modifier at 7 days when avg readiness >= 85', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 90 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { readinessScore: 88 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has been feeling energized this week');
  });

  it('uses "elevated stress for most of week" when >= 4 stressful/demanding days in 7-day history', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'stressful' });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, {
        stressSummary: i < 4 ? 'stressful' : 'normal',
      })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user has had elevated stress for most of this week');
  });

  it('uses "experienced elevated stress recently" when < 4 stressful days in 7-day history', () => {
    const ctx = makeCtx(TODAY, { stressSummary: 'demanding' });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, {
        stressSummary: i < 2 ? 'demanding' : 'normal',
      })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    expect(promptModifiers).toContain('the user experienced elevated stress recently');
    expect(promptModifiers).not.toContain('the user has had elevated stress for most of this week');
  });

  it('returns no sleep modifier at 7 days when avg sleep is 70–84 (mid-range, no modifier)', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 78 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { sleepScore: 76 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    const sleepMods = promptModifiers.filter((m) => m.includes('sleep'));
    expect(sleepMods).toHaveLength(0);
  });

  it('returns no readiness modifier at 7 days when avg readiness is 70–84', () => {
    const ctx = makeCtx(TODAY, { readinessScore: 75 });
    const history = Array.from({ length: 7 }, (_, i) =>
      makeCtx(`2026-05-${24 + i}`, { readinessScore: 74 })
    );
    const { promptModifiers } = buildHealthSummary(ctx, history);
    const readinessMods = promptModifiers.filter((m) => m.includes('energy'));
    expect(readinessMods).toHaveLength(0);
  });

  it('default history param produces [] promptModifiers when called with one arg', () => {
    const ctx = makeCtx(TODAY, { sleepScore: 55 });
    const { promptModifiers } = buildHealthSummary(ctx);
    expect(promptModifiers).toEqual([]);
  });
});
