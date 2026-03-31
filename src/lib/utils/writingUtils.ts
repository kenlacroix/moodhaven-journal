/**
 * Writing-specific utility functions — extracted from WritingView for testability.
 */

export const MILESTONES = [50, 100, 200, 500] as const;

/**
 * Returns a "X min read" label when wordCount >= 200, null otherwise.
 * Uses average reading speed of 200 wpm with Math.ceil so even one word
 * past a threshold rounds up (e.g. 201 words → "2 min read").
 */
export function getReadingTime(wordCount: number): string | null {
  if (wordCount < 200) return null;
  return `${Math.ceil(wordCount / 200)} min read`;
}

/**
 * Returns true if the word count crossed a milestone boundary (prev < milestone <= current).
 * Does NOT fire again once a milestone has been passed.
 */
export function didHitMilestone(prev: number, current: number): boolean {
  return MILESTONES.some((m) => prev < m && current >= m);
}
