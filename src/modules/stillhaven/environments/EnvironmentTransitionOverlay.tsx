/**
 * EnvironmentTransitionOverlay — 2.5s transition into a session environment.
 *
 * Phase timeline:
 *   0–600ms   : page background dims; environment gradient rises from bottom
 *   600–1500ms: scene canvas mounts behind overlay (caller responsibility)
 *   1500–2500ms: overlay fades out; session is live
 *
 * Reduced-motion: collapses to a single 300ms fade.
 *
 * The gradient and orientation prose are the only per-environment differences;
 * everything else (phase timeline, layout, transitions) is shared.
 */

import React, { useEffect, useState } from 'react';
import type { EnvironmentId } from '../components/EnvironmentPicker';

const REDUCED_MOTION =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

type Phase = 'rising' | 'holding' | 'fading' | 'done';

interface OverlayVariant {
  gradient: string;
  lines: [string, string, string];
}

const VARIANTS: Record<EnvironmentId, OverlayVariant> = {
  underwater: {
    gradient: 'linear-gradient(to top, #0a3a5a 40%, #1a6478 80%, transparent 100%)',
    lines: [
      'Let the sounds guide your attention.',
      "Just notice what's present.",
      "You don't need to do anything else.",
    ],
  },
  forest: {
    gradient: 'linear-gradient(to top, #060F08 40%, #1A3A1D 80%, transparent 100%)',
    lines: [
      'Notice the quiet between sounds.',
      "You don't have to go anywhere.",
      'Just be here.',
    ],
  },
  sky: {
    gradient: 'linear-gradient(to top, #080B1A 40%, #2A1B5E 75%, #5B3B9E 100%)',
    lines: [
      'Let your gaze soften upward.',
      'Rest in the openness.',
      'Just breathing.',
    ],
  },
};

interface Props {
  environment: EnvironmentId;
  onComplete: () => void;
}

export function EnvironmentTransitionOverlay({ environment, onComplete }: Props): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>(REDUCED_MOTION ? 'fading' : 'rising');
  const [risePercent, setRisePercent] = useState(0);

  useEffect(() => {
    if (REDUCED_MOTION) {
      const t = setTimeout(() => { setPhase('done'); onComplete(); }, 300);
      return () => clearTimeout(t);
    }
    // Phase 1: gradient rises 0→100% over 600ms using rAF
    let start: number | null = null;
    let rafId = 0;
    function animateRise(ts: number): void {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / 600, 1);
      setRisePercent(progress * 100);
      if (progress < 1) { rafId = requestAnimationFrame(animateRise); }
      else { setPhase('holding'); }
    }
    rafId = requestAnimationFrame(animateRise);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'holding') return;
    const t = setTimeout(() => setPhase('fading'), 900);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const t = setTimeout(() => { setPhase('done'); onComplete(); }, 1000);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  const { gradient, lines } = VARIANTS[environment];

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }} aria-hidden>
      {/* Dimming layer over page background */}
      <div
        className="absolute inset-0 bg-[rgba(243,240,234,0.6)]"
        style={{
          opacity: phase === 'fading' ? 0 : 1,
          transition: REDUCED_MOTION ? 'opacity 300ms ease' : phase === 'fading' ? 'opacity 1000ms ease' : 'none',
        }}
      />
      {/* Rising environment gradient from bottom */}
      {!REDUCED_MOTION && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${risePercent}%`,
            background: gradient,
            opacity: phase === 'fading' ? 0 : 1,
            transition: phase === 'fading' ? 'opacity 1000ms ease' : 'none',
          }}
        />
      )}
      {/* Orientation text — appears during holding phase, fades with overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center px-8"
        style={{
          opacity: phase === 'holding' ? 1 : 0,
          transition: phase === 'holding' ? 'opacity 400ms ease' : phase === 'fading' ? 'opacity 800ms ease' : 'none',
        }}
      >
        <p className="text-white/80 text-sm text-center leading-relaxed max-w-xs font-light tracking-wide">
          {lines[0]}
          <br />
          {lines[1]}
          <br />
          {lines[2]}
        </p>
      </div>
    </div>
  );
}
