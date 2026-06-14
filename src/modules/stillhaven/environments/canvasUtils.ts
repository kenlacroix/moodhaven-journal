/** Shared helpers for the 2D canvas session environments. */

export const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function formatElapsed(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
