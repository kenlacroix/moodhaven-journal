import { getReadingTime, didHitMilestone } from './writingUtils';

describe('getReadingTime', () => {
  it('returns null for 0 words', () => {
    expect(getReadingTime(0)).toBeNull();
  });

  it('returns null for 199 words', () => {
    expect(getReadingTime(199)).toBeNull();
  });

  it('returns "1 min read" for exactly 200 words', () => {
    expect(getReadingTime(200)).toBe('1 min read');
  });

  it('returns "2 min read" for 201 words (Math.ceil, not floor)', () => {
    expect(getReadingTime(201)).toBe('2 min read');
  });

  it('returns "3 min read" for 600 words', () => {
    expect(getReadingTime(600)).toBe('3 min read');
  });
});

describe('didHitMilestone', () => {
  it('returns true when crossing 50 (49 → 50)', () => {
    expect(didHitMilestone(49, 50)).toBe(true);
  });

  it('returns false when already past 50 (50 → 51)', () => {
    expect(didHitMilestone(50, 51)).toBe(false);
  });

  it('returns true when crossing 100 (99 → 100)', () => {
    expect(didHitMilestone(99, 100)).toBe(true);
  });

  it('returns false when already past 100 (100 → 101)', () => {
    expect(didHitMilestone(100, 101)).toBe(false);
  });

  it('returns true when crossing multiple milestones in one jump (0 → 500)', () => {
    expect(didHitMilestone(0, 500)).toBe(true);
  });
});
